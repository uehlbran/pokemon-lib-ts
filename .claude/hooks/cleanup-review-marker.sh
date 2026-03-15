#!/bin/bash
# PostToolUse: Remove .review-passed marker after a successful gh pr create.

INPUT=$(cat)
# Defensive jq calls: default to empty/false if jq fails
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""
SUCCESS=$(echo "$INPUT" | jq -r '.tool_response.success // false' 2>/dev/null) || SUCCESS="false"

# Only clean up when gh pr create actually succeeded — leave the marker intact on failure
# so the agent can retry without re-running /review for the same commit
if printf '%s\n' "$COMMAND" | grep -qF 'gh pr create' && [ "$SUCCESS" = "true" ]; then
  rm -f "${CLAUDE_PROJECT_DIR:-.}/.claude/.review-passed"
fi
exit 0
