# Bug Filing Rules

## When you discover a bug that is out of scope for your current task

1. **Check for duplicates first:**
   ```bash
   gh issue list --label bug --search "KEYWORD" --limit 5
   ```
2. **File a GitHub issue if no duplicate exists:**
   ```bash
   gh issue create \
     --title "bug: [concise description]" \
     --label "bug,found-by/agent" \
     --body "$(cat <<'BODY'
   ## Description
   [What is wrong]

   ## Location
   `path/to/file.ts` line ~N

   ## Expected vs Actual
   - Expected: [what spec/Showdown says]
   - Actual: [what the code does]

   ## Severity
   CRITICAL | HIGH | MEDIUM | LOW

   ## How Found
   Found during [task context — e.g., "PR #38 work on gen1 move mechanics"]

   ---
   Filed by Claude Code agent
   BODY
   )"
   ```

## Never
- Accumulate findings in local markdown files, PR descriptions, or scratch files
- Skip the dedup check — search by a distinctive keyword from the bug description

## When a PR fixes one of these issues
Include `Closes #N` in the PR body (where N is the issue number) so GitHub auto-closes
the issue when the PR merges.

## If unsure whether it's in scope
File the issue and mention it in your PR description. When in doubt, file it.
