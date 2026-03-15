# PR Review Pipeline Spec

## Overview

Automated multi-reviewer PR pipeline for `uehlbran/pokemon-lib`. Every PR gets reviewed by 2-3 AI reviewers plus the human owner before merge. One developer (Brandon), doing 5-10 PRs/day, working alongside Claude Code locally.

## Reviewers

| Reviewer | Type | Trigger | Cost | Required |
|---|---|---|---|---|
| CodeRabbit | GitHub App (already installed) | Automatic on PR open/sync | Free (public repo) | Yes |
| Claude Code Action | GitHub Action | Automatic on PR open/sync | Anthropic API (~$0.20-0.30/day at 10 PRs) | Yes |
| Qodo PR-Agent | GitHub Action | Automatic, but skip if rate-limited | Teams tier through ~April 2026, then free tier (75/month) | No -- best-effort |
| Brandon | Human | Manual | Free | Yes |

## Architecture

```
PR opened/updated
    +-- CodeRabbit (GitHub App, runs independently)
    |
    +-- GitHub Actions workflow
            |
            +-- Job 1: qodo-review (runs first, soft-fail on rate limit)
            |       +-- outputs: qodo_ran = true/false
            |
            +-- Job 2: claude-review (waits for qodo to finish or fail)
                    +-- always runs regardless of qodo outcome
```

CodeRabbit is a separate GitHub App -- it has no workflow file and fires independently. The GitHub Actions workflow manages Qodo and Claude only.

## Files to Create

### 1. `.github/workflows/pr-review.yml`

```yaml
name: PR Review Pipeline

on:
  pull_request:
    types: [opened, synchronize, reopened]

# Limit to one review run per PR at a time
concurrency:
  group: pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  # Job 1: Qodo PR-Agent (best-effort, soft-fail)
  qodo-review:
    name: "Qodo PR-Agent (optional)"
    runs-on: ubuntu-latest
    outputs:
      ran: ${{ steps.qodo.outcome == 'success' }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Qodo PR-Agent
        id: qodo
        uses: qodo-ai/pr-agent@main
        continue-on-error: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          github_action_config.auto_review: "true"
          github_action_config.auto_describe: "true"
          github_action_config.auto_improve: "true"

      - name: Log Qodo status
        if: always()
        run: |
          if [ "${{ steps.qodo.outcome }}" == "success" ]; then
            echo "::notice::Qodo PR-Agent review completed successfully"
          else
            echo "::warning::Qodo PR-Agent skipped (likely rate-limited). Continuing with other reviewers."
          fi

  # Job 2: Claude Code Review (always runs)
  claude-review:
    name: "Claude Code Review"
    runs-on: ubuntu-latest
    needs: [qodo-review]
    if: always()
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Code Review
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review this pull request thoroughly. You have access to the full repo
            and the CLAUDE.md file which describes the project architecture.

            Focus on:
            1. Correctness -- logic bugs, off-by-one errors, wrong assumptions
            2. Type safety -- TypeScript strict mode violations, unsafe casts, missing types
            3. Architecture -- does this follow the monorepo patterns (GenerationRuleset,
               event-driven battles, discriminated unions, lowercase string literals)?
            4. Testing -- are there tests? Do they cover edge cases? Do they match the
               testing philosophy (known values from Bulbapedia/Showdown, property-based,
               determinism, snapshots)?
            5. Performance -- unnecessary allocations, O(n^2) where O(n) is possible
            6. Security -- no eval, no prototype pollution, safe data handling

            Be specific. Reference line numbers. If something looks good, say so briefly.
            Don't nitpick formatting -- Biome handles that.

            If Qodo PR-Agent also reviewed this PR, avoid repeating the same feedback.
            Focus on what Qodo might have missed: architectural fit, Pokemon-domain
            correctness, and cross-package dependency concerns.
          claude_args: "--model claude-haiku-4-5 --max-turns 5"

  # Job 3: Summary status check (for branch protection)
  review-gate:
    name: "Review Gate"
    runs-on: ubuntu-latest
    needs: [qodo-review, claude-review]
    if: always()
    steps:
      - name: Check review results
        run: |
          CLAUDE_RESULT="${{ needs.claude-review.result }}"
          QODO_RESULT="${{ needs.qodo-review.result }}"

          echo "Claude review: $CLAUDE_RESULT"
          echo "Qodo review: $QODO_RESULT"

          # Claude must succeed. Qodo is optional.
          if [ "$CLAUDE_RESULT" != "success" ]; then
            echo "::error::Claude Code review did not complete successfully."
            exit 1
          fi

          if [ "$QODO_RESULT" == "success" ]; then
            echo "::notice::All reviewers completed (CodeRabbit + Qodo + Claude)"
          else
            echo "::notice::Claude + CodeRabbit completed. Qodo was skipped (rate-limited)."
          fi
```

### 2. `.coderabbit.yaml` (repo root)

Fine-tune CodeRabbit for this project:

```yaml
language: en-US
reviews:
  profile: assertive
  request_changes_workflow: false
  high_level_summary: true
  poem: false
  collapse_walkthrough: false
  path_instructions:
    - path: "packages/core/**"
      instructions: |
        This is the zero-dependency core package. Flag any runtime dependency additions.
        All entity types must use lowercase string literals, not enums.
        Interfaces should be readonly unless explicitly mutable.
    - path: "packages/battle/**"
      instructions: |
        Battle engine must be event-driven (BattleEvent[] stream).
        All gen-specific logic must go through GenerationRuleset -- no hardcoded gen behavior.
    - path: "packages/gen*/**"
      instructions: |
        Gen 1-2 implement GenerationRuleset directly (no BaseRuleset).
        Gen 3-9 extend BaseRuleset.
        Each gen bundles complete standalone data -- no cross-gen imports.
    - path: "tools/data-importer/**"
      instructions: |
        Data pipeline transforms Showdown + PokeAPI sources into per-gen JSON.
        Generated JSON is committed to the repo. Flag any changes to generated files
        that don't come from the importer.
  auto_review:
    enabled: true
    drafts: false
chat:
  auto_reply: true
```

### 3. `.qodo` (optional Qodo config, repo root)

```toml
[pr_reviewer]
extra_instructions = """
This is a TypeScript monorepo for Pokemon game libraries.
Key patterns: GenerationRuleset interface, event-driven battles,
discriminated unions, lowercase string literals (not UPPERCASE enums),
seeded PRNG (Mulberry32). Biome handles formatting -- don't flag style.
"""
num_code_suggestions = 3
```

## Repository Secrets Required

Add these in GitHub -> Settings -> Secrets and variables -> Actions:

| Secret | Value | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key | Get from console.anthropic.com. Required for Claude. |

`GITHUB_TOKEN` is automatic -- no setup needed.

CodeRabbit uses its own GitHub App auth -- no secret needed.

Qodo free tier uses the GitHub App (already installed) or `GITHUB_TOKEN` -- no extra secret needed.

## Branch Protection Rules

Configure in GitHub -> Settings -> Branches -> `main`:

- **Require a pull request before merging**: Yes
- **Required approvals**: 1 (Brandon)
- **Require status checks to pass before merging**: Yes
  - Required checks:
    - `Review Gate` (the summary job -- ensures Claude completed)
    - `CodeRabbit` (its status check name -- verify after install)
  - Do NOT require `Qodo PR-Agent (optional)` -- it's best-effort
- **Require branches to be up to date before merging**: Yes (recommended)

## Cost Estimate

At 5-10 PRs/day using Claude Haiku:

| Component | Estimate |
|---|---|
| Anthropic API (Haiku, ~50K input + 5K output tokens/review) | ~$0.02/review |
| 10 PRs/day | ~$0.20/day |
| Monthly (weekdays only, ~22 days) | ~$5/month |
| GitHub Actions minutes (ubuntu runner) | Free tier covers this for public repos |
| CodeRabbit | Free (public repo) |
| Qodo | Teams (free for ~1 month), then free tier (75/month, then auto-skip) |

To increase review quality: change `claude-haiku-4-5` to `claude-sonnet-4-6` in the workflow (~10x more expensive, more thorough). Or use Haiku for small PRs and Sonnet for large ones by adding a step that checks diff size.

## Implementation Checklist

1. [ ] Get an Anthropic API key from console.anthropic.com
2. [ ] Add `ANTHROPIC_API_KEY` as a repository secret
3. [ ] Install the Claude GitHub App: https://github.com/apps/claude
4. [ ] Verify CodeRabbit is still installed and active on the repo
5. [ ] Verify Qodo is still installed (or install the free GitHub App)
6. [ ] Create `.github/workflows/pr-review.yml` with the workflow above
7. [ ] Create `.coderabbit.yaml` with the config above
8. [ ] Create `.qodo` with the config above (optional)
9. [ ] Set up branch protection rules on `main`
10. [ ] Open a test PR to verify all three reviewers fire
11. [ ] Verify the Review Gate check passes and blocks merge until Claude completes
12. [ ] Verify Qodo gracefully skips when rate-limited (test by opening >75th PR in a month, or just check the "continue-on-error" behavior)

## Workflow Behavior Summary

| Scenario | What happens |
|---|---|
| Normal PR, Qodo has quota | CodeRabbit reviews -> Qodo reviews -> Claude waits for Qodo, then reviews -> Review Gate passes |
| Normal PR, Qodo rate-limited | CodeRabbit reviews -> Qodo fails silently -> Claude runs immediately -> Review Gate passes |
| PR updated (new push) | Previous run cancelled (concurrency), fresh run starts |
| Draft PR | CodeRabbit skips (config), workflow still runs Qodo + Claude |

## Qodo Teams -> Free Tier Transition

Brandon has Qodo Teams for approximately one month (through ~April 2026). After that, Qodo drops back to the free tier (75 PRs/month). The workflow already handles this gracefully -- no code changes needed when Teams expires. The `continue-on-error: true` on the Qodo step means it will just start soft-failing more often once the free tier limit is hit.

While Teams is active, Qodo will have richer features (auto_improve suggestions, better context). After it expires, auto_improve may stop working but auto_review should still function within the 75/month cap.

No action required at transition time. The pipeline degrades gracefully.

## Relationship to Existing Prompts and Skills

This spec is the first concrete CI review configuration for the repo. Existing `claude-code-*.md` files in this project folder are local agent prompts (audit, context engineering, gen implementation, etc.) -- they don't overlap with this CI pipeline.

The `claude-code-context-engineering-prompt.md` mentions a `docs/CONTRIBUTING.md` that should document "PR process and review expectations." Once this pipeline is live, that CONTRIBUTING.md should be updated to describe the 3-reviewer workflow: what to expect when you open a PR, how to interact with `@claude` in PR comments, and that Qodo is optional/best-effort.

If any Claude Code skills or agents reference PR review workflows (e.g., a "babysit" agent that monitors PRs), they should be updated to reflect that CI handles automated review now. The local `/code-review` command is still useful as an optional pre-push check but is no longer the primary review mechanism.

## Future Improvements

- **Smart model selection**: Check PR diff size. Use Haiku for <100 lines, Sonnet for larger changes.
- **`@claude` interactive mode**: Add a second workflow triggered by `issue_comment` so you can ask Claude follow-up questions on PRs by typing `@claude` in comments.
- **Review dedup**: If CodeRabbit and Claude flag the same issue, Claude's prompt already tells it to avoid repetition with Qodo. Could extend this by passing CodeRabbit's comments as context to Claude (requires scripting).
- **Slack/Discord notifications**: Post a summary when all reviews are done.
- **Post-Qodo-Teams evaluation**: After Teams expires, evaluate whether the free tier is worth keeping or if CodeRabbit + Claude is sufficient as a two-reviewer setup.
