# Agent Guide

This repository is configured around Claude Code conventions. If you are a different coding
agent, use this file as the compatibility entrypoint and then load the existing Claude docs
rather than inventing a parallel workflow.

## Start Here

1. Read [CLAUDE.md](./CLAUDE.md) before making meaningful changes.
2. If you are working inside a subtree that has its own `CLAUDE.md`, read that file before
   editing in that subtree.
3. Treat `.claude/` as the source of truth for workflow rules, review roles, and task setup.
4. Work on a normal git branch based on `origin/main`. Do not use linked worktrees for task
   execution in this repo.

## Mandatory Instruction Discipline

Agents must read repo instructions before acting, not after making a mistake.

- Before editing repo files: read the root instruction files and any relevant subtree
  `CLAUDE.md`, then re-read the rule that governs the next action.
- Before filing or editing GitHub issues: re-read
  [`.claude/rules/bug-filing.md`](./.claude/rules/bug-filing.md)
  and
  [`.claude/rules/issue-linking.md`](./.claude/rules/issue-linking.md).
- Before creating or editing a PR: re-read
  [`.claude/rules/issue-linking.md`](./.claude/rules/issue-linking.md),
  [`.claude/rules/issue-closing-syntax.md`](./.claude/rules/issue-closing-syntax.md),
  and the repo PR template.
- After creating a PR: re-read
  [`.claude/rules/pr-comment-handling.md`](./.claude/rules/pr-comment-handling.md)
  and monitor the PR until merge. Review comments must be acknowledged, validated against the
  current code, and either fixed, replied to with rationale, or converted into a follow-up
  issue if genuinely out of scope. Do not admin-bypass the comment gate.
- Do not rely on memory for repo workflow. Re-open the relevant file before the governed action.

## Required Workflow

- Use one normal git branch at a time in the main checkout.
- Local verification is authoritative: run `npm run verify:local` before PRs and other
  handoffs. Use targeted package tests or the root test-kind scripts while iterating, and use
  `npm run test:stress` only for manual soak/stability coverage.
- Respect repo safety guidance in:
  - [`.claude/rules/git-safety.md`](./.claude/rules/git-safety.md)
  - [`.claude/rules/context-management.md`](./.claude/rules/context-management.md)
  - [`.claude/rules/bug-filing.md`](./.claude/rules/bug-filing.md)

## Verification Model

- `npm run test` — the default unit + integration suite used by `verify:local` and PR CI.
- `npm run test:unit` — unit tests only.
- `npm run test:integration` — integration tests only.
- `npm run test:smoke` — smoke tests only.
- `npm run test:e2e` — e2e tests only; passes when none exist yet.
- `npm run test:stress` — stress / soak tests only.
- `npm run test:all` — full taxonomy suite: unit, integration, smoke, e2e, then stress.
- `npm run verify:local` — broader handoff gate that runs non-test checks plus plain `test`.
- `replay:*` commands remain targeted tools and should be run explicitly when relevant.
- `npm run test:slow` remains as a backwards-compatible alias to `npm run test:smoke`.

## Repo-Specific Expectations

- Architecture, testing philosophy, source hierarchy, and package boundaries live in
  [CLAUDE.md](./CLAUDE.md).
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
