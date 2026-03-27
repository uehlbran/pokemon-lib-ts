#!/bin/bash
# PreToolUse: Block new task branches when local backlog is unreconciled or another PR is active.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""
FIRST_LINE=$(printf '%s\n' "$COMMAND" | head -1 | sed 's/^[[:space:]]*//')
BASE="${CLAUDE_PROJECT_DIR:-.}"

if printf '%s\n' "$FIRST_LINE" | grep -qE '^git[[:space:]]+worktree[[:space:]]+add([[:space:]]|$)'; then
  if ! (cd "$BASE" && node scripts/check-reconciliation.mjs >/dev/null); then
    echo "BLOCKED: reconcile existing local task work before creating another worktree." >&2
    (cd "$BASE" && node scripts/check-reconciliation.mjs)
    exit 2
  fi

  if ! (cd "$BASE" && node scripts/check-active-pr.mjs --action start-task >/dev/null); then
    echo "BLOCKED: another PR is still active." >&2
    (cd "$BASE" && node scripts/check-active-pr.mjs --action start-task)
    exit 2
  fi
fi

if printf '%s\n' "$FIRST_LINE" | grep -qE '^git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)([[:space:]]|$)'; then
  if ! (cd "$BASE" && node scripts/check-reconciliation.mjs >/dev/null); then
    echo "BLOCKED: reconcile existing local task work before creating another branch." >&2
    (cd "$BASE" && node scripts/check-reconciliation.mjs)
    exit 2
  fi

  if ! (cd "$BASE" && node scripts/check-active-pr.mjs --action start-task >/dev/null); then
    echo "BLOCKED: another PR is still active." >&2
    (cd "$BASE" && node scripts/check-active-pr.mjs --action start-task)
    exit 2
  fi
fi

if printf '%s\n' "$FIRST_LINE" | grep -qE '^gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'; then
  if ! (cd "$BASE" && node scripts/check-active-pr.mjs --action pr-create >/dev/null); then
    echo "BLOCKED: PR serialization gate failed." >&2
    (cd "$BASE" && node scripts/check-active-pr.mjs --action pr-create)
    exit 2
  fi
fi

exit 0
