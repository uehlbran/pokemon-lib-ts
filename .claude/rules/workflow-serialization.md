# Workflow Serialization and Reconciliation

This repo uses fresh task worktrees, but worktrees are only safe when they are serialized and reconciled.

## Hard Rules

- Reconcile existing local task work before creating another task branch.
- Exactly one implementation slice may be active at a time.
- Exactly one PR may be active at a time.
- Merged, superseded, and discarded branches must be explicitly retired before more work starts.
- Local `PROGRESS.md` is the control ledger for the active slice and queued backlog.

## Reconciliation Statuses

Every local task branch/worktree must be classified as one of:
- `merged-equivalent`
- `superseded`
- `still-needed`
- `discard`

Any branch left `unclassified` blocks new work.

## Retirement Rule

Branches classified as `merged-equivalent`, `superseded`, or `discard` must be retired manually and recorded as retired in the reconciliation ledger before another slice begins.

## Active PR Rule

When a PR is open, no other implementation branch may start and no second PR may be created.
Finish the active PR first:
- all review threads replied to and resolved
- all top-level PR comments acknowledged
- CodeRabbit finished, or a justified bypass recorded
- CI green
- PR merged or closed
