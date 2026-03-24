#!/bin/bash
# PreToolUse: Block gh pr create unless /review has been run on the current branch + commit.

INPUT=$(cat)
# Defensive jq call: if jq is unavailable or JSON is malformed, default to empty string
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""

# Only intercept commands that contain gh pr create (use fixed-string match to avoid bypass via
# regex anchoring tricks; err on side of blocking since false positives are safe)
if ! printf '%s\n' "$COMMAND" | grep -qF 'gh pr create'; then
  exit 0
fi

BASE="${CLAUDE_PROJECT_DIR:-.}"

if ! (cd "$BASE" && node scripts/check-review-marker.mjs >/dev/null); then
  echo "BLOCKED: review gate failed." >&2
  (cd "$BASE" && node scripts/check-review-marker.mjs)
  exit 2
fi

# Check for orphaned issue references in the --body value only.
# Extract the value after --body (handles: --body "text" and --body $'text').
# We only scan the body argument itself to avoid false positives on command descriptions.
BODY_VALUE=$(printf '%s' "$COMMAND" | sed -n "s/.*--body[[:space:]]\+'\([^']*\)'.*/\1/p")
if [ -z "$BODY_VALUE" ]; then
  BODY_VALUE=$(printf '%s' "$COMMAND" | sed -n 's/.*--body[[:space:]]\+"\([^"]*\)".*/\1/p')
fi

if [ -n "$BODY_VALUE" ]; then
  if ! (cd "$BASE" && node scripts/check-pr-body.mjs --body "$BODY_VALUE" >/dev/null); then
    echo "BLOCKED: PR body validation failed." >&2
    (cd "$BASE" && node scripts/check-pr-body.mjs --body "$BODY_VALUE")
    exit 2
  fi
fi

# Valid — allow PR creation
exit 0
