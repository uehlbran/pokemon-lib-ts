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
MERGE_BASE=$(git -C "$BASE" merge-base HEAD origin/main 2>/dev/null) || {
  # Can't determine merge base — allow through (CI will catch it)
  exit 0
}

# Check if any packages/*/src/ or packages/*/data/ files changed since merge base
CHANGED_PACKAGES=$(git -C "$BASE" diff --name-only "$MERGE_BASE"..HEAD -- 'packages/*/src/' 'packages/*/data/' 2>/dev/null)

if [ -z "$CHANGED_PACKAGES" ]; then
  # No package source or data files changed — no changeset required
  exit 0
fi

# Check if any .changeset/*.md files (excluding config.json and README.md) exist in the diff
CHANGESETS=$(git -C "$BASE" diff --name-only "$MERGE_BASE"..HEAD -- '.changeset/' 2>/dev/null | grep -E '\.changeset/[^/]+\.md$' | grep -v 'README\.md')

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
