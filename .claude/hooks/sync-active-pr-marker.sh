#!/bin/bash
# PostToolUse: Keep the shared active PR marker in sync with successful PR lifecycle commands.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""
SUCCESS=$(echo "$INPUT" | jq -r '.tool_response.success // false' 2>/dev/null) || SUCCESS="false"
FIRST_LINE=$(printf '%s\n' "$COMMAND" | head -1 | sed 's/^[[:space:]]*//')
BASE="${CLAUDE_PROJECT_DIR:-.}"

if [ "$SUCCESS" != "true" ]; then
  exit 0
fi

if printf '%s\n' "$FIRST_LINE" | grep -qE '^gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'; then
  (cd "$BASE" && node scripts/sync-active-pr.mjs --event create >/dev/null 2>&1 || true)
  exit 0
fi

if printf '%s\n' "$FIRST_LINE" | grep -qE '^gh[[:space:]]+pr[[:space:]]+(merge|close)([[:space:]]|$)'; then
  (cd "$BASE" && node scripts/sync-active-pr.mjs --event finish >/dev/null 2>&1 || true)
fi

exit 0
