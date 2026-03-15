#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE "(^|;|&&|\|\|)\s*gh pr create"; then
  rm -f "${CLAUDE_PROJECT_DIR:-.}/.claude/.review-passed"
fi
exit 0
