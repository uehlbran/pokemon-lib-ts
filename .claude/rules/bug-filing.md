# Bug Filing Rules

When you discover a bug out of scope for your current task:

1. **Dedup check first:** `gh issue list --label bug --search "KEYWORD" --limit 5`
2. **File if no duplicate:** use labels `bug,found-by/agent`, include severity (CRITICAL/HIGH/MEDIUM/LOW), location, expected vs actual, and how found.
3. **Link in PRs:** include `Closes #N` in PR body when a PR fixes a filed issue.

When in doubt whether a bug is in scope, file the issue anyway.

## Never

- Accumulate findings in local markdown files, PR descriptions, or scratch files
- Skip the dedup check
