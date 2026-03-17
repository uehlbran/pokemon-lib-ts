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

MARKER="${CLAUDE_PROJECT_DIR:-.}/.claude/.review-passed"

# Check marker exists
if [ ! -f "$MARKER" ]; then
  echo "BLOCKED: Run /review before creating a PR. falcon/kestrel/sentinel must pass first." >&2
  exit 2
fi

# Read marker and validate it matches current branch + commit
BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null) || BRANCH=""
HEAD=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --short HEAD 2>/dev/null) || HEAD=""
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

# Check for orphaned issue references in the --body value only.
# Extract the value after --body (handles: --body "text" and --body $'text').
# We only scan the body argument itself to avoid false positives on command descriptions.
BODY_VALUE=$(printf '%s' "$COMMAND" | sed -n "s/.*--body[[:space:]]\+'\([^']*\)'.*/\1/p")
if [ -z "$BODY_VALUE" ]; then
  BODY_VALUE=$(printf '%s' "$COMMAND" | sed -n 's/.*--body[[:space:]]\+"\([^"]*\)".*/\1/p')
fi

if [ -n "$BODY_VALUE" ]; then
  # Pattern: closing keyword + #N followed by ", #M" or " #M" (orphaned ref after first).
  if printf '%s\n' "$BODY_VALUE" | grep -qiE '(closes|fixes|resolves)[[:space:]]+#[0-9]+([[:space:]]*,[[:space:]]*|[[:space:]]+)#[0-9]+'; then
    echo "BLOCKED: PR body contains orphaned issue references." >&2
    echo "" >&2
    echo "  WRONG: Closes #50, #80, #85   (only closes #50)" >&2
    echo "  WRONG: Closes #50 #80 #85     (only closes #50)" >&2
    echo "" >&2
    echo "  RIGHT: one keyword per issue, one per line:" >&2
    echo "    Closes #50" >&2
    echo "    Closes #80" >&2
    echo "    Closes #85" >&2
    exit 2
  fi
fi

# Valid — allow PR creation
exit 0
