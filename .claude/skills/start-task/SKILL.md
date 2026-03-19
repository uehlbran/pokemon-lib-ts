---
name: start-task
description: >
  Use at the START of any new task before editing files. Checks for uncommitted
  changes, fetches latest main, creates a dedicated branch, and declares it as
  the session branch. Required by the enforce-branch-first hook.
  Usage: /start-task <branch-name> or /start-task continue <existing-branch>
---

# Start Task

Set up a dedicated branch for this session's work. The enforce-branch-first
hook blocks Edit/Write on repo files until this is done.

## New Task (default): `/start-task <branch-name>`

1. **Check for uncommitted changes**: Run `git status --porcelain`
   - If dirty: STOP. Report the uncommitted files to the user and ask how to
     proceed (stash, commit, or discard). Do not create a branch on a dirty tree.
2. **Fetch latest**: `git fetch origin main`
3. **Create branch**: `git checkout -b <branch-name> origin/main`
4. **Declare marker**: `echo '<branch-name>' > .claude/.session-branch`
5. **Confirm**: "Branch `<branch-name>` created from origin/main. Ready to edit."

## Continue Existing: `/start-task continue <branch>`

1. Verify the branch exists: `git branch --list <branch>`
2. Verify you're on it: `git branch --show-current`
3. If not on it: `git checkout <branch>`
4. Write marker: `echo '<branch>' > .claude/.session-branch`
5. Confirm: "Continuing on branch `<branch>`. Ready to edit."

(No dirty-tree check for continue — you may have in-progress work on that branch.)

## No argument: `/start-task`

Ask the user what branch name to use, suggesting one based on the task description.

## Validation

- Branch name must not be `main` or `master`
- Branch name should follow project conventions (e.g., `fix/`, `feat/`, `docs/`, `chore/`)
