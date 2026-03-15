#!/bin/bash
# Push current branch and trigger Claude review
# Usage: git pushreview [push args]
#        git pushreview --check   (view latest review log)
set -e

LOG_DIR="$HOME/.cache/pokemon-lib/reviews"

# --check: view latest review log
if [ "$1" = "--check" ]; then
    LATEST=$(ls -t "$LOG_DIR"/review-*.log 2>/dev/null | head -1)
    if [ -z "$LATEST" ]; then
        echo "No review logs found."
        exit 1
    fi
    # Check if review process is still running
    if pgrep -f "claude.*pokemon-reviewer" > /dev/null 2>&1; then
        echo "⏳ Review still in progress..."
    else
        echo "✅ Review process complete."
    fi
    echo "=== $(basename "$LATEST") ==="
    echo ""
    cat "$LATEST"
    exit 0
fi

# Prerequisites
if ! command -v claude > /dev/null 2>&1; then
    echo "Error: claude CLI not found. Install from https://claude.ai/code"
    exit 1
fi
if ! command -v gh > /dev/null 2>&1; then
    echo "Error: gh CLI not found. Install from https://cli.github.com"
    exit 1
fi

# Push first
git push "$@"

# Check if there's a PR for this branch
BRANCH=$(git branch --show-current)
PR_NUMBER=$(gh pr view "$BRANCH" --json number --jq '.number' 2>/dev/null || echo "")

if [ -z "$PR_NUMBER" ]; then
    echo "No PR found for branch '$BRANCH'. Skipping Claude review."
    echo "Open a PR first: gh pr create"
    exit 0
fi

echo ""
echo "=== PR #$PR_NUMBER found. Starting Claude review... ==="
echo "CodeRabbit and Qodo will also review automatically."
echo ""

# Set up logging
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/review-PR${PR_NUMBER}-$(date +%Y%m%d-%H%M%S).log"

# Clean up old logs (keep last 10)
ls -t "$LOG_DIR"/review-*.log 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

# Launch the reviewer with proper backgrounding
nohup timeout 300 claude \
    --agent pokemon-reviewer \
    --print \
    --no-session-persistence \
    --allowedTools "Read" "Grep" "Glob" "Bash(gh:*)" \
    "Review PR #$PR_NUMBER on branch $BRANCH. Run gh pr diff to see changes and post your review." \
    > "$LOG_FILE" 2>&1 &
disown

echo "Claude review running in background (PID: $!)"
echo "Log: $LOG_FILE"
echo "Check status: git pushreview --check"
