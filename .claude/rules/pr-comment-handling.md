# PR Comment Handling

GitHub already blocks merges with unresolved review threads. Do not add a separate local or CI
review-comment automation layer on top of that. The repo rule is simpler: read every review surface, reply to every
inline comment, resolve every addressed thread, and do not merge around unresolved discussion.

## Mandatory Process

1. After creating a PR, monitor review comments until the PR is merged or closed.
2. Before every merge attempt, run a full manual audit across all review surfaces:

   ```bash
   gh api repos/{owner}/{repo}/pulls/<N>/comments?per_page=100
   gh api repos/{owner}/{repo}/issues/<N>/comments?per_page=100
   gh pr view <N> --json reviews,latestReviews,comments
   ```

3. Read the latest review summaries as well as inline diff comments. Outside-diff findings still
   count.
4. `gh pr merge` is allowed only after every review thread has been resolved.
5. Every inline review comment must get a reply, even if the answer is "already fixed in commit
   <sha>" or "out of scope, filed as #<issue>".
6. Actionable top-level PR comments and review-summary findings also require a later author
   acknowledgment comment before merge.
7. Admin bypass is forbidden. Do not use admin merge, direct branch protection bypass, or any
   other path that skips unresolved comments or required acknowledgments.

## What Counts as Addressing a Comment

| Comment type | Required action |
|---|---|
| Bug report (correct) | Fix the code, reply confirming fix, resolve thread |
| Bug report (incorrect) | Reply citing source authority explaining why code is correct, resolve thread |
| Nitpick / informational | Brief reply ("Noted" or "Disagree — [reason]"), resolve thread |
| Question from reviewer | Reply with answer, resolve thread |
| Top-level PR summary finding | Post a PR conversation reply with the fix or linked follow-up issue |

Nitpicks do not require code changes, but they do require a reply. Ignoring them entirely is not acceptable.

## Bug Validation Protocol (REQUIRED before acting on any bug report)

Before fixing a reviewer-reported bug, **always validate it exists in the current code**:

```bash
grep -n "functionName\|relevant-symbol" packages/genN/src/TheFile.ts
```

Reviewer tools (CodeRabbit, Qodo) often analyze an earlier commit state. If a later fix commit
already corrected the issue, the comment is stale — do NOT re-fix. Instead:
1. Confirm the fix exists in the current code (grep, read the file)
2. Reply citing the commit that fixed it
3. Resolve the thread

If the bug IS real in the current code:
1. Fix it in a new commit
2. Reply citing the fix commit
3. If the fix is out of scope for the PR, file a GitHub issue (`gh issue create`) and reply with the issue number

## Out-of-Scope Bugs

Never ignore a real bug just because it's outside the current PR's scope. Either:
- Fix it in the current PR (if small and related) and reply confirming fix
- File a GitHub issue and reply: "Valid bug. Filed as #N for follow-up — out of scope for this PR."

## Never

- Merge a PR without doing the full review-state audit
- Merge a PR while any review thread is unresolved
- Merge a PR while any actionable top-level or review-summary comment is still unacknowledged
- Use admin privileges or any bypass path to merge around unresolved comments
- Leave CodeRabbit/Qodo threads unresolved regardless of whether you agree or disagree
- Assume a reviewer-reported bug is real without checking the current code — AI reviewers can analyze stale commits
- File a GitHub issue for a bug that is already fixed in the current code
