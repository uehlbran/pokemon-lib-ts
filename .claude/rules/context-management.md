# Context Management for Agents

When doing research or exploration involving many files:
- Write key findings to a scratch file before moving to the next area
- If you've read 10+ files, summarize what you've found so far before continuing
- Prefer targeted searches (grep for a specific symbol) over broad directory reads

When doing implementation spanning multiple files:
- Prefer the task system and keep a local `PROGRESS.md` ledger for multi-step or
  multi-PR work — never `git add` it (it is in `.gitignore`)
- `PROGRESS.md` should record the active slice, active PR, reconciliation state,
  blocked items, and the next allowed action
- Exactly one implementation slice may be active at a time; queued work should
  be classified, not treated as implicit in-progress backlog
- Commit working code frequently rather than accumulating many uncommitted changes
- If a task needs 15+ file reads to complete, stop and return findings so the caller can split the work
