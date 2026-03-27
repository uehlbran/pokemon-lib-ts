#!/bin/bash
# PreToolUse: Block gh pr merge unless all actionable PR comments are addressed.
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

node scripts/check-pr-comments.mjs --pr "$PR_NUMBER" --repo "$REPO_NWO" --mode gate
