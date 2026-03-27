# Git Safety Rules

## Before ANY mutating git command (commit, rebase, merge, reset, checkout)
1. Run `git branch --show-current` and confirm it matches the branch you intend to modify
2. Run `git status --short` and confirm you understand the local state before mutating history

## After ANY rebase, merge, or reset
1. Run `git log --oneline -5` and confirm the result looks correct
2. Run `git status` and confirm no unexpected state

## If a git operation fails
1. Run `git status` to understand the current state
2. If CRLF/line-ending phantom diffs are blocking you: run `git add --renormalize .` then retry
3. If a rebase left a `.git/rebase-merge` directory: run `git rebase --abort` first
4. **If 2 consecutive git operations fail: STOP.** Do not keep trying variants. Report the issue to the user with the error output.

## Never
- Commit to a branch without verifying you're on it first
- Run `git stash drop` without being certain the stash is no longer needed
- Attempt more than 2 recovery strategies for a failed rebase before stopping
