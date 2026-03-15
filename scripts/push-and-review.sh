#!/bin/bash
# Push current branch and trigger Claude review
# Usage: git pushreview [push args]
#   or:  ./scripts/push-and-review.sh [push args]

set -e

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

# Run the pokemon-reviewer subagent in the background
# Uses Max plan (no API cost)
claude --agent pokemon-reviewer --print "Review PR #$PR_NUMBER on branch $BRANCH. Run gh pr diff to see changes and post your review." &

echo "Claude review running in background (PID: $!)"
echo "Check PR comments for results."
