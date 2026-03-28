# Agent Guide

Read [CLAUDE.md](./CLAUDE.md) and any subtree `CLAUDE.md` before editing. See `.claude/rules/` for workflow rules (git safety, issue linking, PR comments, bug filing).

## Essentials

- Work on one git branch based on `origin/main`
- Run `npm run verify:local` before PRs
- Use Biome (NOT ESLint/Prettier)
- Core has zero runtime dependencies
- Gen-specific mechanics go in rulesets, not the battle engine

If AGENTS.md and CLAUDE.md conflict, prefer the more specific file (subtree > root > this file).
