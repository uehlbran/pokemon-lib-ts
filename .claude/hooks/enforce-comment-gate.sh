#!/bin/bash
# PreToolUse: Block gh pr merge unless all unresolved review threads have been acknowledged.
#
# A thread is "acknowledged" if it is either resolved (isResolved == true) OR has at least
# one reply beyond the original comment (comments.totalCount > 1). Threads with totalCount == 1
# were never read or replied to and trigger a block.
#
# Fails open on infrastructure errors (no jq, no gh, GraphQL failure) to avoid permanently
# blocking merges due to tooling issues.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""

# Only intercept actual gh pr merge invocations (first token must be gh, not just mentioned in text)
# Extract the first line of the command to check the invocation (not commit messages etc.)
FIRST_LINE=$(printf '%s\n' "$COMMAND" | head -1 | sed 's/^[[:space:]]*//')
if ! printf '%s\n' "$FIRST_LINE" | grep -qE '^gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'; then
  exit 0
fi

# Extract PR number: scan ALL tokens in the command for a pure integer
# (handles flags like --auto, --squash, --merge appearing before or after the number)
PR_NUMBER=""
TOKENS=$(printf '%s\n' "$FIRST_LINE" | sed -E 's/^gh[[:space:]]+pr[[:space:]]+merge[[:space:]]*//')
for token in $TOKENS; do
  if [[ "$token" =~ ^[0-9]+$ ]]; then
    PR_NUMBER="$token"
    break
  fi
done

# Fallback: if no explicit number in command, infer from current branch
if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER=$(gh pr view --json number --jq '.number' 2>/dev/null)
fi

if [ -z "$PR_NUMBER" ]; then
  echo "ERROR: Could not determine PR number from command. Use: /babysit-pr <number>" >&2
  echo "  The comment gate requires a PR number to check review threads." >&2
  exit 1
fi

# Get owner/repo
REPO_NWO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
OWNER=$(echo "$REPO_NWO" | cut -d/ -f1)
REPO_NAME=$(echo "$REPO_NWO" | cut -d/ -f2)

if [ -z "$OWNER" ] || [ -z "$REPO_NAME" ]; then
  # Cannot determine repo — fail open
  exit 0
fi

# Query unresolved review threads
RESULT=$(gh api graphql -f query='
{
  repository(owner: "'"$OWNER"'", name: "'"$REPO_NAME"'") {
    pullRequest(number: '"$PR_NUMBER"') {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 2) {
            totalCount
            nodes {
              path
              author { login }
            }
          }
        }
      }
    }
  }
}' 2>/dev/null)

if [ -z "$RESULT" ]; then
  # GraphQL failed — fail open
  exit 0
fi

# Find unresolved threads with no reply (totalCount == 1 means only the original comment)
UNADDRESSED=$(echo "$RESULT" | jq -r '
  [.data.repository.pullRequest.reviewThreads.nodes[]
   | select(.isResolved == false and (.comments.totalCount <= 1))
  ] | length')

if [ -z "$UNADDRESSED" ]; then
  # jq parse failed — fail open
  exit 0
fi

if [ "$UNADDRESSED" -gt 0 ]; then
  DETAILS=$(echo "$RESULT" | jq -r '
    [.data.repository.pullRequest.reviewThreads.nodes[]
     | select(.isResolved == false and (.comments.totalCount <= 1))
     | "  \(.comments.nodes[0].author.login // "reviewer") on \(.comments.nodes[0].path // "unknown file")"]
    | .[]')

  echo "BLOCKED: $UNADDRESSED unresolved review thread(s) have no reply — they were never acknowledged." >&2
  echo "" >&2
  echo "$DETAILS" >&2
  echo "" >&2
  echo "To fix: run /babysit-pr $PR_NUMBER" >&2
  echo "  Each thread needs at least a reply (fix + resolve, or explain why it doesn't apply + resolve)." >&2
  exit 2
fi

# All threads are resolved or have replies — allow merge
exit 0
