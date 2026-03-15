# AI Code Review Guide

This repository uses AI-powered code review tools to supplement human review. AI reviews are **advisory only** -- they leave comments but never approve or block PRs.

## Active Reviewers

### CodeRabbit

**What it does:** Automated code review with inline comments, PR summaries, and security scanning.

**Type:** GitHub App (runs independently).

**Configuration:** `.coderabbit.yaml` in repo root.

**Interaction commands** (use in PR comments):
- `@coderabbitai review` -- trigger a re-review
- `@coderabbitai resolve` -- resolve all CodeRabbit comments
- `@coderabbitai summary` -- regenerate the PR summary
- `@coderabbitai configuration` -- show current config
- `@coderabbitai help` -- list all commands

**Dashboard:** https://app.coderabbit.ai

### Qodo PR-Agent

**What it does:** Structured code review with severity categories (critical/major/minor/suggestion), auto-generated PR description, and improvement suggestions.

**Type:** GitHub Action (`.github/workflows/pr-review.yml`). Best-effort -- soft-fails on rate limit.

**Tier:** Free for open source (75 PRs/month). Teams tier through ~April 2026.

**Configuration:** `.qodo` in repo root.

**Interaction commands** (use in PR comments):
- `/review` -- trigger a review
- `/describe` -- auto-generate PR description
- `/improve` -- get improvement suggestions
- `/ask "question"` -- ask about the PR

### Claude Code (Local)

**What it does:** Deep code review using Claude AI. Focuses on correctness, type safety, architecture compliance, testing quality, performance, and security. Knows the Pokemon monorepo architecture from CLAUDE.md.

**Type:** Local subagent via `pokemon-reviewer`. Runs on your machine using the Max plan ($0 extra cost). Posts review comments to the PR via `gh pr review`.

**How to trigger:**
- `git pushreview` -- pushes and automatically starts Claude review if a PR exists
- `claude --agent pokemon-reviewer "Review the current PR"` -- manual trigger

**Configuration:** `.claude/agents/pokemon-reviewer.md`

### Local Pre-PR Review (Required)

Before pushing any PR, run a deep local review using Claude Code:

```
/review
```

This runs three specialized review agents in parallel:
- **falcon** -- correctness, bugs, logic errors, test quality
- **kestrel** -- architecture, SOLID principles, pattern consistency
- **sentinel** -- security vulnerabilities, auth flaws, data exposure

This is the **primary review gate**. It reads full project context including specs and is deeper
than any remote AI reviewer. Do not skip it — CodeRabbit and Qodo are bonus-only and can be
rate-limited.

## Full Review Workflow

1. **Local (required):** Run `/review` — falcon + kestrel + sentinel must pass
2. **Push:** `git pushreview` (pushes + triggers Claude review comment on the PR)
3. **CI:** Build, test, typecheck, lint must pass (required)
4. **CodeRabbit:** Auto-posts summary + inline comments (advisory, bonus)
5. **Qodo PR-Agent:** Auto-posts structured review (advisory, best-effort — may be rate-limited)
6. **Human:** Review feedback, address anything valid, approve and merge

## Guidelines

1. **`/review` is required** -- Run falcon/kestrel/sentinel locally before every PR. This is not optional.
2. **AI reviews are advisory** -- Remote reviewers comment but never approve. A human reviewer must approve every PR.
3. **Don't blindly fix** -- Evaluate AI suggestions critically. They can be wrong.
4. **Dismiss false positives** -- React with :thumbsdown: or reply explaining why the suggestion doesn't apply.
5. **Security findings are high priority** -- If an AI flags a security issue, investigate before dismissing.
