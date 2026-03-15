#!/bin/bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept PR creation commands (match at command boundary, not in strings/messages)
if ! echo "$COMMAND" | grep -qE "(^|;|&&|\|\|)\s*gh pr create"; then
  exit 0
fi

MARKER="${CLAUDE_PROJECT_DIR:-.}/.claude/.review-passed"

# Check marker exists
if [ ! -f "$MARKER" ]; then
  echo "BLOCKED: Run /review before creating a PR. falcon/kestrel/sentinel must pass first." >&2
  exit 2
fi

# Read marker and validate it matches current branch + commit
BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current)
HEAD=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --short HEAD)
MARKER_BRANCH=$(head -1 "$MARKER")
MARKER_COMMIT=$(sed -n '2p' "$MARKER")

if [ "$BRANCH" != "$MARKER_BRANCH" ]; then
  echo "BLOCKED: Review was for branch '$MARKER_BRANCH' but you're on '$BRANCH'. Run /review again." >&2
  exit 2
fi

if [ "$HEAD" != "$MARKER_COMMIT" ]; then
  echo "BLOCKED: Code changed since last review (was $MARKER_COMMIT, now $HEAD). Run /review again." >&2
  exit 2
fi

# Valid — allow PR creation
exit 0
