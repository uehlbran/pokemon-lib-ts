---
name: babysit-pr
description: >
  Manage an open PR from creation through merge. Verifies checks, handles all
  review threads and top-level PR comments, waits for CodeRabbit unless a
  justified bypass is needed, and only merges when the feedback gates pass.
  Usage: /babysit-pr <number> [--no-merge]
---

# Babysit PR

Use this after creating a PR. Do not open a second implementation PR while this one is active.

## Required Loop

1. Confirm the PR is still open:
   `gh pr view <number> --json state`
2. Check required CI:
   `gh pr checks <number>`
3. Inspect review threads and top-level comments:

   ```bash
   gh api repos/{owner}/{repo}/pulls/<number>/comments
   gh api repos/{owner}/{repo}/issues/<number>/comments
   ```

4. For every review thread:
   - validate whether the bug still exists in current code
   - fix or explain
   - reply
   - resolve
5. For every top-level PR comment:
   - add a later acknowledgement comment:
     `Ack comment <comment-id>: <what changed or why no action is needed>`
6. If CodeRabbit is still "review in progress", wait unless it is clearly stuck, broken, or rate-limited.
   - only then use:
     `Ack comment <comment-id>: bypass because CodeRabbit is rate-limited.`
7. Re-run verification after fixes.
8. Merge only when:
   - required checks are green
   - all review threads have replies/resolution
   - all top-level PR comments are acknowledged
   - CodeRabbit gate is satisfied or explicitly bypassed

## Notes

- `gh pr merge` is still hook-gated, so the merge should fail loudly if any feedback gate remains unresolved.
- Do not start another implementation slice until this PR is merged or closed.
