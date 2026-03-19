# Branch-First Rule (Enforced by Hook)

Before editing ANY repo file, run `/start-task <branch-name>` to create a
dedicated branch and register it for this session.

The `enforce-branch-first.sh` hook BLOCKS Edit/Write calls on repo files
until `/start-task` has been run. This prevents wasted tokens from editing
on the wrong branch.

Exceptions (always allowed without `/start-task`):
- `.claude/plans/`, `.claude/rules/`, `.claude/hooks/`, `.claude/skills/`
- `.claude/settings*`, `.changeset/*`
- Files outside the project directory (memory files)

To continue work on an existing branch:
  `/start-task continue <existing-branch>`
