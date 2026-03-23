# Agent Guide

This repository is configured around Claude Code conventions. If you are a different coding
agent, use this file as the compatibility entrypoint and then load the existing Claude docs
rather than inventing a parallel workflow.

## Start Here

1. Read [CLAUDE.md](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/CLAUDE.md)
   before making meaningful changes.
2. If you are working inside a subtree that has its own `CLAUDE.md`, read that file before
   editing in that subtree.
3. Treat `.claude/` as the source of truth for workflow rules, review roles, and task setup.

## Mandatory Instruction Discipline

Agents must read repo instructions before acting, not after making a mistake.

- Before editing repo files: read the root instruction files and any relevant subtree
  `CLAUDE.md`, then re-read the rule that governs the next action.
- Before filing or editing GitHub issues: re-read
  [`.claude/rules/bug-filing.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/bug-filing.md)
  and
  [`.claude/rules/issue-linking.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/issue-linking.md).
- Before creating or editing a PR: re-read
  [`.claude/rules/issue-linking.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/issue-linking.md),
  [`.claude/rules/issue-closing-syntax.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/issue-closing-syntax.md),
  and the repo PR template.
- Do not rely on memory for repo workflow. Re-open the relevant file before the governed action.

## Required Workflow

- Branch-first is mandatory. Follow
  [`.claude/rules/branch-first.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/branch-first.md).
- Claude uses `/start-task`; non-Claude agents should perform the equivalent workflow described
  in
  [`.claude/skills/start-task/SKILL.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/skills/start-task/SKILL.md).
- Do not edit repo files until the session branch requirement has been satisfied.
- Respect repo safety guidance in:
  - [`.claude/rules/git-safety.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/git-safety.md)
  - [`.claude/rules/context-management.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/context-management.md)
  - [`.claude/rules/bug-filing.md`](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/.claude/rules/bug-filing.md)

## Repo-Specific Expectations

- Architecture, testing philosophy, source hierarchy, and package boundaries live in
  [CLAUDE.md](/home/uehlbran/projects/pokemon-lib-ts/.worktrees/chore-package-boundary-ci-guards/CLAUDE.md).
- `core` must stay dependency-free.
- Generation-specific mechanics belong in rulesets, not in the battle engine.
- Use Biome, not ESLint/Prettier.
- When changing mechanics or formulas, use the source hierarchy and ground-truth docs in
  `specs/reference/`.

## Practical Compatibility Rule

If `AGENTS.md` and `CLAUDE.md` overlap, follow both. If there is a conflict, prefer the more
specific file:

1. Nearest subtree `CLAUDE.md`
2. Root `CLAUDE.md`
3. This file

