# Context Management for Agents

When doing research or exploration involving many files:
- Write key findings to a scratch file before moving to the next area
- If you've read 10+ files, summarize what you've found so far before continuing
- Prefer targeted searches (grep for a specific symbol) over broad directory reads

When doing implementation spanning multiple files:
- Use PROGRESS.md or the task system to track what's done vs. remaining
- Commit working code frequently rather than accumulating many uncommitted changes
- If a task feels like it needs 15+ file reads to complete, stop and return what you've found so the caller can split the work
