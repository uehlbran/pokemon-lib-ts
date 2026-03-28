# AI Code Review Guide

AI reviews are **advisory only** -- they leave comments but never approve or block PRs.

## Active Reviewers

| Reviewer | Type | Trigger | Config |
|----------|------|---------|--------|
| **CodeRabbit** | GitHub App (auto-runs) | `@coderabbitai review` to re-trigger | `.coderabbit.yaml` |
| **Qodo PR-Agent** | Legacy hosted Action (advisory, may be rate-limited) | `/review` `/describe` `/improve` in PR comments | `.qodo` |
| **Claude Code** | Local subagent (manual only) | `claude --agent pokemon-reviewer "Review the current PR"` | `.claude/agents/pokemon-reviewer.md` |

## Required Gates

1. **`npm run verify:local`** -- build, test, typecheck, lint, contracts, changeset validation.
2. **`/review`** -- runs falcon (correctness) + kestrel (architecture) + sentinel (security) locally. Primary review gate. Do not skip.
3. **Human approval** -- final say on architecture and correctness.

## Handling AI Suggestions

- Don't blindly fix AI suggestions. Evaluate critically -- they can be wrong.
- React :thumbsdown: or reply explaining why a suggestion doesn't apply.
- Security findings are high priority -- investigate before dismissing.
