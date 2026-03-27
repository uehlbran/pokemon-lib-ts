# PR Comment Handling (Enforced by Hook)

## Merge Gate

`enforce-comment-gate.sh` (PreToolUse) blocks `gh pr merge` if any review thread is still
unresolved or if any actionable top-level PR comment still lacks an author acknowledgment.

**A review thread is addressed only when it is resolved.** A reply without resolution is not
enough for merge.

**A top-level PR comment is addressed only when there is a later PR conversation reply from the
author** describing the fix, rationale, or linked follow-up issue.

If blocked, inspect the review threads and reply to or resolve each unaddressed thread before
retrying the merge.

## Mandatory Process

1. After creating a PR, monitor review comments until the PR is merged or closed.
2. `gh pr merge` is allowed only after every review thread has been resolved.
3. Actionable top-level PR comments also require a later author acknowledgment comment before merge.
4. Admin bypass is forbidden. Do not use admin merge, direct branch protection bypass, or any other
   path that skips the comment gate.
5. To assess comments manually:

   ```bash
   gh api repos/{owner}/{repo}/pulls/<N>/comments
   gh api repos/{owner}/{repo}/issues/<N>/comments
   ```

   Then reply to each thread, resolve addressed ones, and post a PR conversation follow-up for any
   actionable top-level comment before attempting merge.

## What Counts as Addressing a Comment

| Comment type | Required action |
|---|---|
| Bug report (correct) | Fix the code, reply confirming fix, resolve thread |
| Bug report (incorrect) | Reply citing source authority explaining why code is correct, resolve thread |
| Nitpick / informational | Brief reply ("Noted" or "Disagree — [reason]"), resolve thread |
| Question from reviewer | Reply with answer |
| Top-level PR summary finding | Post a PR conversation reply with the fix or linked follow-up issue |

Nitpicks do not require code changes, but they do require a reply. Ignoring them entirely is not acceptable.

## Bug Validation Protocol (REQUIRED before acting on any bug report)

Before fixing a reviewer-reported bug, **always validate it exists in the current code**:

```bash
grep -n "functionName\|relevant-symbol" packages/genN/src/TheFile.ts
```

Reviewer tools (CodeRabbit, Qodo) analyze the first commit of the PR. If a later fix commit already corrected the issue, the comment is stale — do NOT re-fix. Instead:
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

- Merge a PR without reading review comments
- Merge a PR while any review thread is unresolved
- Use admin privileges or any bypass path to merge around unresolved comments
- Leave CodeRabbit/Qodo threads unresolved regardless of whether you agree or disagree
- Assume a reviewer-reported bug is real without checking the current code — AI reviewers can analyze stale commits
- File a GitHub issue for a bug that is already fixed in the current code
