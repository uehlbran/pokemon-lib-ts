#!/usr/bin/env bash
# SessionStart hook: prints branch state into Claude's context so it knows
# whether a session branch has been declared before it attempts any edits.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "")}"
BRANCH=$(git -C "${PROJECT_DIR:-.}" branch --show-current 2>/dev/null || echo "unknown")
MARKER="${PROJECT_DIR:-.}/.claude/.session-branch"

if [ -f "$MARKER" ]; then
  DECLARED=$(head -1 "$MARKER" | tr -d '[:space:]')
  if [ "$BRANCH" = "$DECLARED" ]; then
    echo "Session branch declared: $DECLARED (matches current branch — edits allowed)"
  else
    echo "WARNING: Session branch mismatch."
    echo "  Declared in .session-branch: $DECLARED"
    echo "  Actual current branch:       $BRANCH"
    echo "Run /start-task continue <branch-name> to fix this before editing files."
  fi
else
  echo "WARNING: No session branch declared. Run /start-task <branch-name> before editing any repo files."
  echo "Current branch: $BRANCH"
fi
exit 0
