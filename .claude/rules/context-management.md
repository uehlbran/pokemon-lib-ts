# Context Management for Agents

When doing research or exploration involving many files:
- Write key findings to a scratch file before moving to the next area
- If you've read 10+ files, summarize what you've found so far before continuing
- Prefer targeted searches (grep for a specific symbol) over broad directory reads

When doing implementation spanning multiple files:
- Prefer the task system; if needed, create a scratch `PROGRESS.md` to track done vs. remaining
- Commit working code frequently rather than accumulating many uncommitted changes
- If a task needs 15+ file reads to complete, stop and return findings so the caller can split the work
