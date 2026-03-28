# PR Comment Handling

## Merge Gate

`enforce-comment-gate.sh` blocks `gh pr merge` if any review thread has zero replies.
A thread is acknowledged when it has a reply or is marked resolved. Every thread —
including CodeRabbit/Qodo — must be acknowledged before merge.

After creating a PR, monitor review comments until merge or close.

## Bug Validation Protocol (REQUIRED)

Before acting on any reviewer-reported bug, **always grep/read the current code first**.
CodeRabbit/Qodo analyze the first commit — later commits may already fix the issue.

- If already fixed: reply citing the fix commit, resolve thread.
- If real and in scope: fix in a new commit, reply citing commit, resolve thread.
- If real but out of scope: file a GitHub issue, reply with the issue number.

## Never

- Merge while any thread has zero replies
- Assume a reviewer-reported bug is real without checking current code
- Ignore a real bug because it's out of scope — fix it or file an issue
- File a GitHub issue for a bug already fixed in the current code
