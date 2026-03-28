#!/bin/bash
# PreToolUse: Block Agent tool calls that use isolation: "worktree".

INPUT=$(cat)
ISOLATION=$(echo "$INPUT" | jq -r '.tool_input.isolation // empty' 2>/dev/null) || ISOLATION=""

if [ "$ISOLATION" = "worktree" ]; then
  echo "BLOCKED: Worktree isolation is banned. Work on a normal branch in the main checkout." >&2
  exit 2
fi

exit 0
