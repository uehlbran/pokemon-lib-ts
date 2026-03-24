#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || FILE_PATH=""

[ -z "$FILE_PATH" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "")}"
[ -z "$PROJECT_DIR" ] && exit 0

PRIMARY_WORKTREE=$(git -C "$PROJECT_DIR" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | head -1)

# Allow edits outside the project directory (e.g. memory files in ~/.claude/)
case "$FILE_PATH" in
  "$PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

# Allow .claude/ infrastructure files — these can always be edited without a declared branch
case "$FILE_PATH" in
  "$PROJECT_DIR"/.claude/plans/*) exit 0 ;;
  "$PROJECT_DIR"/.claude/hooks/*) exit 0 ;;
  "$PROJECT_DIR"/.claude/settings*) exit 0 ;;
  "$PROJECT_DIR"/.claude/rules/*) exit 0 ;;
  "$PROJECT_DIR"/.claude/skills/*) exit 0 ;;
  "$PROJECT_DIR"/.claude/.session-branch) exit 0 ;; # skill writes this
  "$PROJECT_DIR"/.changeset/*) exit 0 ;; # changesets created by /version skill
esac

if [ -n "$PRIMARY_WORKTREE" ] && [ "$PROJECT_DIR" = "$PRIMARY_WORKTREE" ]; then
  echo "BLOCKED: The primary checkout is not for task work." >&2
  echo "" >&2
  echo "Create a fresh task-owned worktree from origin/main with /start-task <branch-name>." >&2
  echo "Leave the root checkout untouched; all new work belongs in a dedicated worktree." >&2
  exit 2
fi

MARKER="$PROJECT_DIR/.claude/.session-branch"
if [ ! -f "$MARKER" ]; then
  echo "BLOCKED: No session branch declared." >&2
  echo "" >&2
  echo "Before editing repo files, run: /start-task <branch-name>" >&2
  echo "To continue on an existing branch: /start-task continue <branch-name>" >&2
  exit 2
fi

DECLARED=$(head -1 "$MARKER" | tr -d '[:space:]')
CURRENT=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "")

if [ "$CURRENT" != "$DECLARED" ]; then
  echo "BLOCKED: Branch mismatch." >&2
  echo "  Declared in .session-branch: $DECLARED" >&2
  echo "  Actual current branch:       $CURRENT" >&2
  echo "" >&2
  echo "Switch to the declared branch or run /start-task continue <branch-name>" >&2
  exit 2
fi

exit 0
