#!/bin/bash
# PreToolUse: Remind on gh pr merge that merge approval requires a manual full-surface PR comment
# audit. This hook is intentionally non-blocking because GitHub review state is broader than any
# local script can model reliably.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""
FIRST_LINE=$(printf '%s\n' "$COMMAND" | head -1 | sed 's/^[[:space:]]*//')

if ! printf '%s\n' "$FIRST_LINE" | grep -qE '^gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'; then
  exit 0
fi

cat >&2 <<'EOF'
MANDATORY PR COMMENT AUDIT BEFORE MERGE

Do not rely on automation to decide whether review comments are fully handled.

Required checks:
1. Inspect inline review comments:
   gh api repos/{owner}/{repo}/pulls/<PR>/comments?per_page=100
2. Inspect top-level PR conversation comments:
   gh api repos/{owner}/{repo}/issues/<PR>/comments?per_page=100
3. Inspect latest review summaries / outside-diff findings:
   gh pr view <PR> --json reviews,latestReviews,comments
4. Resolve every addressed review thread, reply to every inline comment, and explicitly
   acknowledge every actionable top-level or review-summary comment.
5. Do not use admin merge or any bypass path.

See .claude/rules/pr-comment-handling.md
EOF

exit 0
