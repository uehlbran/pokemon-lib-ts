# Git Safety Rules

## Before ANY mutating git command (commit, rebase, merge, reset, checkout)
1. `git branch --show-current` — confirm correct branch
2. `git status --short` — confirm understood local state

## After ANY rebase, merge, or reset
1. `git log --oneline -5` — confirm expected result
2. `git status` — confirm no unexpected state

## If a git operation fails
1. `git status` to understand current state
2. CRLF phantom diffs: `git add --renormalize .` then retry
3. Stale rebase state: `git rebase --abort` first
4. **If 2 consecutive operations fail: STOP and report to user.**

## Never
- Commit without verifying current branch
- `git stash drop` without certainty the stash is unneeded
- Attempt more than 2 recovery strategies before stopping
