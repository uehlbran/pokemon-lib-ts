---
name: start-task
description: >
  Use at the START of any new task before editing files. Fetches latest main,
  creates a fresh task-owned worktree and branch from `origin/main`, and
  declares it as the session branch. Required by the enforce-branch-first hook.
  Usage: /start-task <branch-name> or /start-task continue <existing-branch>
---

# Start Task

Set up a fresh, task-owned worktree and branch for this session's work. The
root checkout is not for task work. The enforce-branch-first hook blocks
Edit/Write on repo files until this is done.

## New Task (default): `/start-task <branch-name>`

1. **Inspect the root checkout only**: `git status --porcelain`
   - If dirty: do not touch it, do not stash it, and do not ask to reuse it.
     The root checkout is treated as read-only context.
2. **Fetch latest**: `git fetch origin main`
3. **Reconcile existing local task work before branching**:
   - Run `node scripts/check-reconciliation.mjs`
   - If it fails, reconcile first with `node scripts/reconcile-worktrees.mjs --write`
4. **Confirm no other PR owns the active slot**:
   - Run `node scripts/check-active-pr.mjs --action start-task`
5. **Choose a fresh worktree path**: `WORKTREE_DIR=".worktrees/<branch-name>"`
   - If that path already exists: STOP and pick a new unique path.
6. **Create worktree and branch**:
   `git worktree add -b <branch-name> "$WORKTREE_DIR" origin/main`
7. **Declare marker inside that worktree**:
   `echo '<branch-name>' > "$WORKTREE_DIR/.claude/.session-branch"`
8. **Start or update the local `PROGRESS.md` ledger**:
   - record the new active slice and next allowed action
9. **Confirm**:
   "Branch `<branch-name>` created from `origin/main` in `<worktree-path>`. Use
   `git -C <worktree-path>` for all git commands."

## Continue Existing: `/start-task continue <branch>`

1. Find the task-owned worktree for the branch:
   `git worktree list --porcelain`
2. Verify the branch already has a matching dedicated worktree.
3. If the only matching worktree is under `.claude/worktrees/`: STOP unless the
   user explicitly told you to reuse that exact path.
4. If no safe task-owned worktree exists: STOP and create a fresh one with the
   New Task flow instead of checking out the branch in the root checkout.
5. Write marker in that worktree: `echo '<branch>' > <worktree-path>/.claude/.session-branch`
6. Confirm:
   "Continuing on branch `<branch>` in `<worktree-path>`. Use
   `git -C <worktree-path>` for all git commands."

(No dirty-tree check for continue — you may have in-progress work on that branch.)

## No argument: `/start-task`

Ask the user what branch name to use, suggesting one based on the task description.

## Validation

- Branch name must not be `main` or `master`
- Branch name should follow project conventions (e.g., `fix/`, `feat/`, `docs/`, `chore/`)
- Every new task starts in a fresh worktree from `origin/main`
- The root checkout is never used for task implementation
- Existing task work must be reconciled before another task branch is created
- Only one active PR slice may exist at a time
