#!/usr/bin/env bash
# PreToolUse: Block gh pr create if packages/ changed but no changeset exists.
#
# Agents must run /version before creating a PR that touches packages/*/src/ or
# packages/*/data/. The /version skill creates a .changeset/*.md file which
# satisfies this gate.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""

# Only intercept gh pr create commands
if ! printf '%s\n' "$COMMAND" | grep -qF 'gh pr create'; then
  exit 0
fi

BASE="${CLAUDE_PROJECT_DIR:-.}"

# Find the merge base against origin/main
MERGE_BASE=$(git -C "$BASE" merge-base HEAD origin/main 2>/dev/null)
if [ -z "$MERGE_BASE" ]; then
  # origin/main may not be fetched — try a shallow fetch and retry
  git -C "$BASE" fetch origin main --depth=1 --quiet 2>/dev/null
  MERGE_BASE=$(git -C "$BASE" merge-base HEAD origin/main 2>/dev/null)
fi
if [ -z "$MERGE_BASE" ]; then
  echo "BLOCKED: Cannot determine merge base against origin/main." >&2
  echo "Run 'git fetch origin main' or rebase onto origin/main, then retry." >&2
  exit 2
fi

# Check if any packages/*/src/ or packages/*/data/ files changed since merge base
CHANGED_PACKAGES=$(git -C "$BASE" diff --name-only "$MERGE_BASE"..HEAD -- 'packages/*/src/' 'packages/*/data/' 2>/dev/null)

# Also check staged (not yet committed) package changes
if [ -z "$CHANGED_PACKAGES" ]; then
  CHANGED_PACKAGES=$(git -C "$BASE" diff --name-only --cached -- 'packages/*/src/' 'packages/*/data/' 2>/dev/null)
fi

if [ -z "$CHANGED_PACKAGES" ]; then
  # No package source or data files changed — no changeset required
  exit 0
fi

_changeset_grep() {
  grep -E '\.changeset/[^/]+\.md$' | grep -v 'README\.md'
}

# 1. Check committed changeset files
CHANGESETS=$(git -C "$BASE" diff --name-only "$MERGE_BASE"..HEAD -- '.changeset/' 2>/dev/null | _changeset_grep)

# 2. Fallback: check staged (cached) changeset files — /version stages but doesn't commit
if [ -z "$CHANGESETS" ]; then
  CHANGESETS=$(git -C "$BASE" diff --name-only --cached -- '.changeset/' 2>/dev/null | _changeset_grep)
fi

# 3. Fallback: check untracked changeset files in working tree
if [ -z "$CHANGESETS" ]; then
  CHANGESETS=$(git -C "$BASE" ls-files --others --exclude-standard -- '.changeset/*.md' 2>/dev/null | grep -v 'README\.md')
fi

if [ -z "$CHANGESETS" ]; then
  echo "BLOCKED: packages/ source or data files changed but no changeset found." >&2
  echo "" >&2
  echo "Run /version to create a changeset before opening a PR." >&2
  echo "" >&2
  echo "Changed packages:" >&2
  echo "$CHANGED_PACKAGES" | sed 's|^packages/\([^/]*\)/.*|  \1|' | sort -u >&2
  exit 2
fi

# Changeset present — allow PR creation
exit 0
