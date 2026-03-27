#!/bin/bash
# PreToolUse: Block gh pr merge unless review threads and top-level PR comments are acknowledged.

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
  echo "  The comment gate requires a PR number to check PR feedback." >&2
  exit 1
fi

BASE="${CLAUDE_PROJECT_DIR:-.}"
if ! (cd "$BASE" && node scripts/check-pr-feedback.mjs --pr "$PR_NUMBER" >/dev/null); then
  echo "BLOCKED: PR feedback gate failed." >&2
  (cd "$BASE" && node scripts/check-pr-feedback.mjs --pr "$PR_NUMBER")
  exit 2
fi

exit 0
