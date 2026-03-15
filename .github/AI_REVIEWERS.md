# AI Review Setup

This repo uses three AI review tools on every PR, plus local Claude Code review before pushing.

## CodeRabbit

**What it does**: Posts a PR summary, walkthrough of changes, inline review comments, and security scan on every PR.

**Type**: GitHub App (runs independently of the Actions workflow).

**Config**: `.coderabbit.yaml` in repo root — contains path-specific review instructions (e.g., "core has zero dependencies", "gen1 uses unified Special stat").

**Interacting with it**:
- `@coderabbitai resolve` — dismiss a comment thread
- `@coderabbitai explain` — get a deeper explanation of a suggestion
- `@coderabbitai regenerate` — re-run the full review
- `@coderabbitai configuration` — show current config
- `@coderabbitai ignore` — ignore a specific file pattern going forward

**Ignoring suggestions**: Reply to the comment explaining why you disagree — CodeRabbit learns from this feedback. Or just resolve the thread.

## Qodo PR-Agent

**What it does**: Posts a structured review with categorized findings ("possible bug", "possible issue", "suggestion") and severity levels. Also generates PR descriptions and improvement suggestions.

**Type**: GitHub Action (`.github/workflows/pr-review.yml`). Runs as best-effort — soft-fails on rate limit without blocking the pipeline.

**Tier**: Teams through ~April 2026, then free tier (75 PRs/month). The pipeline handles this transition automatically via `continue-on-error`.

**Config**: `.qodo` in repo root.

**Interacting with it**:
- `@CodiumAI-Agent /review` — trigger a review on demand
- `@CodiumAI-Agent /describe` — auto-generate a PR description
- `@CodiumAI-Agent /improve` — get code improvement suggestions
- `@CodiumAI-Agent /ask <question>` — ask a question about the PR

## Claude Code Action

**What it does**: Deep code review using Claude AI. Focuses on correctness, type safety, architecture compliance, testing quality, performance, and security. Avoids duplicating Qodo feedback.

**Type**: GitHub Action (`.github/workflows/pr-review.yml`). Required — the Review Gate status check blocks merge if Claude review fails.

**Model**: `claude-haiku-4-5` (fast, cost-effective). Can be upgraded to `claude-sonnet-4-6` for deeper analysis.

**Config**: Prompt and model configured in `.github/workflows/pr-review.yml`.

**Interacting with it**: Claude posts review comments directly on the PR. Currently one-way (no `@claude` interactive mode — planned for future).

## Local Claude Code Review

**When to use**: Before pushing a PR, as a pre-flight check with full project context.

**How to run**: Use `/review` in Claude Code. This runs three specialized agents:
- **falcon** — correctness: bugs, logic errors, test quality
- **kestrel** — architecture: SOLID principles, pattern consistency
- **sentinel** — security: vulnerabilities, auth flaws, data exposure

**How it differs from CI reviewers**: Reads CLAUDE.md, specs/, and full project context. Catches Pokemon-specific issues (mechanic correctness, spec alignment) that generic AI reviewers miss. Deeper analysis than the CI Claude review (which uses Haiku for speed/cost).

## Full Review Workflow

1. **Local**: Run `/review` in Claude Code before pushing (optional, recommended for large changes)
2. **Push**: Open PR (or push to existing PR branch)
3. **CI**: Build, test, typecheck, lint must pass (required — `CI` workflow)
4. **CodeRabbit**: Auto-posts summary + inline comments (GitHub App, advisory)
5. **Qodo PR-Agent**: Auto-posts structured review (GitHub Action, best-effort/advisory)
6. **Claude Code Action**: Auto-posts deep review (GitHub Action, required — Review Gate blocks merge)
7. **Human**: Review AI feedback, address anything valid, approve and merge

## Status Checks

Two workflows run on every PR:

| Workflow | Required | Purpose |
|---|---|---|
| `CI` | Yes | Build, test, typecheck, lint |
| `PR Review Pipeline` | Yes (via `Review Gate` job) | AI code reviews (Qodo + Claude) |

The `Review Gate` job is the branch protection check. It requires Claude to succeed; Qodo is optional.

## Guidelines

1. **AI reviews are advisory** — They comment but never approve. A human reviewer must approve every PR.
2. **Don't blindly fix** — Evaluate AI suggestions critically. They can be wrong.
3. **Dismiss false positives** — React with :thumbsdown: or reply explaining why the suggestion doesn't apply.
4. **Security findings are high priority** — If an AI flags a security issue, investigate before dismissing.
