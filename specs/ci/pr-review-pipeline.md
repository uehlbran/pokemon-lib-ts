# PR Review Pipeline Spec

## Overview

Multi-reviewer PR pipeline for `uehlbran/pokemon-lib-ts`. Every PR gets reviewed by 2-3 AI reviewers plus the human owner before merge. One developer (Brandon), doing 5-10+ PRs/day, working alongside Claude Code locally.

**Key design decision**: Claude reviews run locally via Claude Code using the Max 20x plan ($0 extra cost) instead of the GitHub Action ($5-50/month API). Since Brandon is the sole developer, every PR originates from his machine -- there's no need to pay for cloud-based Claude reviews.

## Reviewers

| Reviewer | Type | Trigger | Cost | Required |
|---|---|---|---|---|
| CodeRabbit | GitHub App | Automatic on PR open/sync | Free (public repo) | Yes |
| Claude Code (local) | Custom subagent + git hook | Semi-automatic on push | Free (Max plan) | Yes |
| Qodo PR-Agent | GitHub Action | Automatic, but skip if rate-limited | Teams through ~April 2026, then free tier (75/month) | No -- best-effort |
| Brandon | Human | Manual | Free | Yes |

## Architecture

```
Brandon pushes branch & opens PR
    |
    +-- CodeRabbit (GitHub App, fires automatically)
    |
    +-- Qodo (GitHub Action, best-effort, soft-fail on rate limit)
    |
    +-- git pushreview on Brandon's machine
            +-- claude --agent pokemon-reviewer (runs locally using Max plan)
                    +-- posts review comments to PR via gh CLI
```

## Files

### 1. `.claude/agents/pokemon-reviewer.md` (custom subagent)

The heart of the pipeline. A project-level subagent that knows the Pokemon monorepo architecture, reviews diffs, and posts findings to GitHub. Uses `model: sonnet` frontmatter (matching existing agents like `battle-tester.md`).

Reviews against 6 dimensions: correctness, type safety, architecture, testing, performance, security. Posts structured review comments via `gh pr review --comment`.

### 2. `scripts/push-and-review.sh` (local push wrapper)

Pushes the current branch, checks for an open PR, and runs the `pokemon-reviewer` subagent in the background if a PR exists.

Git alias: `git config alias.pushreview '!bash scripts/push-and-review.sh'`

Now `git pushreview` pushes and kicks off the Claude review automatically.

### 3. `.github/workflows/pr-review.yml` (Qodo only)

Since Claude runs locally, the GitHub Action only handles Qodo. Single job with `continue-on-error: true`. No Review Gate needed.

### 4. `.coderabbit.yaml`

CodeRabbit config with path-specific review instructions for the monorepo packages. Uses `profile: assertive`, consolidated `packages/gen*/**` entry.

### 5. `.qodo` (Qodo config)

TOML config with project-specific instructions and `num_code_suggestions = 3`.

## Repository Secrets Required

| Secret | Value | Notes |
|---|---|---|
| (none) | -- | No API keys needed! Claude runs locally via Max plan. |

`GITHUB_TOKEN` is automatic for Qodo. CodeRabbit uses its own GitHub App auth.

## Branch Protection Rules

Configure in GitHub -> Settings -> Branches -> `main`:

- **Require a pull request before merging**: Yes
- **Required approvals**: 1 (Brandon)
- **Require status checks to pass before merging**: Yes
  - `build`, `test`, `typecheck`, `lint` (CI workflow)
  - Do NOT require Qodo (best-effort) or Claude (runs locally, no CI status check)
- **Require branches to be up to date before merging**: Yes

## Cost Estimate

| Component | Estimate |
|---|---|
| Claude Code (local, Sonnet via Max plan) | $0/month (included in Max 20x) |
| CodeRabbit | Free (public repo) |
| Qodo | Free (Teams for ~1 month, then 75/month free tier) |
| GitHub Actions minutes (Qodo only) | Free tier covers this |
| **Total additional cost** | **$0/month** |

## Usage

### Daily workflow

```bash
# Make changes on a feature branch
git checkout -b feature/add-gen2-poison-mechanics
# ... write code ...
git add -A && git commit -m "Add Gen 2 poison damage mechanics"

# Open PR (first push)
gh pr create --title "Add Gen 2 poison damage" --body "..."
git pushreview

# CodeRabbit reviews automatically (within ~30 seconds)
# Qodo reviews automatically if it has quota
# Claude reviews locally via your Max plan (takes 1-3 minutes)
# All three post comments to the same PR

# After addressing feedback, push again
git pushreview

# Review comments from all reviewers, then merge
gh pr merge
```

### Manual review (without pushing)

```bash
# Review current branch's PR without pushing
claude --agent pokemon-reviewer "Review the current PR and post your findings"
```

## Workflow Behavior Summary

| Scenario | What happens |
|---|---|
| `git pushreview` with open PR | Push -> CodeRabbit auto-reviews -> Qodo auto-reviews (if quota) -> Claude reviews locally via subagent -> all post to PR |
| `git pushreview` without PR | Push only, Claude skips (no PR to review) |
| `git push` (no alias) | Push -> CodeRabbit + Qodo review, no Claude (use manual review if needed) |
| Qodo rate-limited | Qodo CI job soft-fails, CodeRabbit + Claude still review |
| Large cross-package PR | Claude uses Sonnet (configured in subagent), gives deeper review |

## Qodo Teams -> Free Tier Transition

Qodo Teams available through approximately April 2026. After that, drops to free tier (75 PRs/month). The workflow handles this gracefully -- `continue-on-error: true` means it just starts skipping silently. No action required at transition time.

## Why This Approach Over GitHub Actions

| Factor | Local Claude (this spec) | GitHub Action |
|---|---|---|
| Cost | $0 (Max plan) | ~$5-50/month (API credits) |
| Model quality | Sonnet (or Opus) | Haiku (to save cost) |
| Speed | 1-3 min on your machine | 2-5 min on GH runner |
| Works offline | No (needs GitHub API) | No |
| Works for other contributors | No | Yes |
| Persistent memory | Yes (learns your codebase) | No |
| Requires secrets setup | No | Yes (API key) |

**When to switch to GitHub Actions**: If you add other contributors who don't have Claude Code locally, add the `claude-code-action` workflow alongside the local setup.

## Future Improvements

- **`@claude` interactive mode**: Add a GitHub Action triggered by `issue_comment` so you can ask Claude follow-up questions on PRs by typing `@claude` in comments. This DOES require an API key but is low-volume.
- **Review dedup**: Pass CodeRabbit's comments as context to the Claude subagent so it doesn't repeat the same findings.
- **Post-Qodo-Teams evaluation**: After Teams expires, evaluate whether the free tier adds value or if CodeRabbit + Claude is sufficient.
