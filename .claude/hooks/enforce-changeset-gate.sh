#!/usr/bin/env bash
# PreToolUse: Block gh pr create if packages/ changed but no changeset exists.
#
# Agents must run /version before creating a PR that touches packages/*/src/ or
# packages/*/data/. The /version skill creates a .changeset/*.md file which
# satisfies this gate.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""

# Only intercept gh pr create commands
if ! printf '%s\n' "$COMMAND" | grep -qF 'gh pr create'; then
  exit 0
fi

BASE="${CLAUDE_PROJECT_DIR:-.}"
if ! (cd "$BASE" && node scripts/check-changeset.mjs >/dev/null); then
  echo "BLOCKED: changeset gate failed." >&2
  (cd "$BASE" && node scripts/check-changeset.mjs)
  exit 2
fi

# Changeset present — allow PR creation
exit 0
