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
TARGET_REPO=""
TOKENS=$(printf '%s\n' "$FIRST_LINE" | sed -E 's/^gh[[:space:]]+pr[[:space:]]+merge[[:space:]]*//')
PREV_TOKEN=""
for token in $TOKENS; do
  if [[ "$token" =~ ^[0-9]+$ ]]; then
    PR_NUMBER="$token"
  fi

  if [ "$PREV_TOKEN" = "-R" ] || [ "$PREV_TOKEN" = "--repo" ]; then
    TARGET_REPO="$token"
  fi

  case "$token" in
    -R=*|--repo=*)
      TARGET_REPO="${token#*=}"
      ;;
  esac

  PREV_TOKEN="$token"
done

# Fallback: if no explicit number in command, infer from current branch
if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER=$(gh pr view --json number --jq '.number' 2>/dev/null)
fi

if [ -z "$PR_NUMBER" ]; then
  echo "ERROR: Could not determine PR number from command. Run gh pr merge <number>." >&2
  echo "  The comment gate requires a PR number to check review threads." >&2
  exit 1
fi

# Get owner/repo
REPO_NWO="$TARGET_REPO"
if [ -z "$REPO_NWO" ]; then
  REPO_NWO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
fi
OWNER=$(echo "$REPO_NWO" | cut -d/ -f1)
REPO_NAME=$(echo "$REPO_NWO" | cut -d/ -f2)

if [ -z "$OWNER" ] || [ -z "$REPO_NAME" ]; then
  # Cannot determine repo — fail open
  exit 0
fi

# Query unresolved review threads, paginating until all pages are retrieved.
THREADS='[]'
CURSOR=""
HAS_NEXT_PAGE="true"

while [ "$HAS_NEXT_PAGE" = "true" ]; do
  if [ -n "$CURSOR" ]; then
    AFTER_ARG="-F"
    AFTER_VALUE="after=$CURSOR"
  else
    AFTER_ARG=""
    AFTER_VALUE=""
  fi

  if [ -n "$AFTER_ARG" ]; then
    RESULT=$(gh api graphql -F owner="$OWNER" -F repo="$REPO_NAME" -F prNumber="$PR_NUMBER" -F after="$CURSOR" -f query='
query($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100, after: $after) {
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
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}' 2>/dev/null)
  else
    RESULT=$(gh api graphql -F owner="$OWNER" -F repo="$REPO_NAME" -F prNumber="$PR_NUMBER" -f query='
query($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100, after: $after) {
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
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}' 2>/dev/null)
  fi

  if [ -z "$RESULT" ]; then
    # GraphQL failed — fail open
    exit 0
  fi

  THREADS=$(jq -c --argjson existing "$THREADS" '
    $existing + (.data.repository.pullRequest.reviewThreads.nodes // [])
  ' <<<"$RESULT" 2>/dev/null)

  if [ -z "$THREADS" ]; then
    exit 0
  fi

  HAS_NEXT_PAGE=$(jq -r '
    .data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage // false
  ' <<<"$RESULT" 2>/dev/null)
  CURSOR=$(jq -r '
    .data.repository.pullRequest.reviewThreads.pageInfo.endCursor // empty
  ' <<<"$RESULT" 2>/dev/null)
done

# Find unresolved threads with no reply (totalCount == 1 means only the original comment)
UNADDRESSED=$(jq -r '
  [.[] | select(.isResolved == false and (.comments.totalCount <= 1))] | length
' <<<"$THREADS" 2>/dev/null)

if [ -z "$UNADDRESSED" ]; then
  # jq parse failed — fail open
  exit 0
fi

if [ "$UNADDRESSED" -gt 0 ]; then
  DETAILS=$(jq -r '
    [.[] | select(.isResolved == false and (.comments.totalCount <= 1))
     | "  \(.comments.nodes[0].author.login // "reviewer") on \(.comments.nodes[0].path // "unknown file")"]
    | .[]
  ' <<<"$THREADS")

  echo "BLOCKED: $UNADDRESSED unresolved review thread(s) have no reply — they were never acknowledged." >&2
  echo "" >&2
  echo "$DETAILS" >&2
  echo "" >&2
  echo "To fix: reply to each unresolved thread on PR #$PR_NUMBER, then resolve the threads you addressed." >&2
  echo "  Each thread needs at least a reply (fix + resolve, or explain why it doesn't apply + resolve)." >&2
  exit 2
fi

# All threads are resolved or have replies — allow merge
exit 0
