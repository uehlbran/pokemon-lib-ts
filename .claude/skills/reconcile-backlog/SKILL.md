---
name: reconcile-backlog
description: >
  Reconcile existing local task worktrees/branches before starting another
  task. Refreshes the shared reconciliation ledger, classifies backlog items,
  and blocks new work until stale branches are retired.
---

# Reconcile Backlog

Use this before starting another implementation slice when local task work already exists.

## Commands

1. Refresh the shared ledger:
   `node scripts/reconcile-worktrees.mjs --write`
2. Classify each remaining branch:
   `node scripts/reconcile-worktrees.mjs --classify <branch>=<status>`
3. Retire stale branches after confirmation:
   `node scripts/reconcile-worktrees.mjs --retire <branch>`

## Required Statuses

Each task branch must end up in exactly one of:
- `merged-equivalent`
- `superseded`
- `still-needed`
- `discard`

`unclassified` is only a temporary state and blocks new work.

## Exit Condition

Backlog reconciliation is complete only when:
- `node scripts/check-reconciliation.mjs` passes
- any stale branches have been retired
- the local `PROGRESS.md` ledger matches the current active slice and next allowed action
