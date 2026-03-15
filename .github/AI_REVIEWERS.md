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

### Local Pre-PR Review

Before pushing a PR, you can run a deeper local review using Claude Code:

```
/review
```

This runs three specialized review agents:
- **falcon** -- correctness, bugs, logic errors, test quality
- **kestrel** -- architecture, SOLID principles, pattern consistency
- **sentinel** -- security vulnerabilities, auth flaws, data exposure

This is deeper than the `pokemon-reviewer` subagent and reads full project context including specs.

## Full Review Workflow

1. **Local (optional):** Run `/review` before pushing for deep pre-flight analysis
2. **Push:** `git pushreview` (pushes + triggers Claude review)
3. **CI:** Build, test, typecheck, lint must pass (required)
4. **CodeRabbit:** Auto-posts summary + inline comments (advisory)
5. **Qodo PR-Agent:** Auto-posts structured review (advisory, best-effort)
6. **Claude Code:** Posts review comment from local subagent (advisory)
7. **Human:** Review AI feedback, address anything valid, approve and merge

## Guidelines

1. **AI reviews are advisory** -- They comment but never approve. A human reviewer must approve every PR.
2. **Don't blindly fix** -- Evaluate AI suggestions critically. They can be wrong.
3. **Dismiss false positives** -- React with :thumbsdown: or reply explaining why the suggestion doesn't apply.
4. **Security findings are high priority** -- If an AI flags a security issue, investigate before dismissing.
