# AI Review Setup

This repo uses two free AI review tools on every PR, plus local Claude Code review before pushing.

## CodeRabbit

**What it does**: Posts a PR summary, walkthrough of changes, inline review comments, and security scan on every PR.

**Config**: `.coderabbit.yaml` in repo root — contains path-specific review instructions (e.g., "core has zero dependencies", "gen1 uses unified Special stat").

**Interacting with it**:
- `@coderabbitai resolve` — dismiss a comment thread
- `@coderabbitai explain` — get a deeper explanation of a suggestion
- `@coderabbitai regenerate` — re-run the full review
- `@coderabbitai configuration` — show current config
- `@coderabbitai ignore` — ignore a specific file pattern going forward

**Ignoring suggestions**: Reply to the comment explaining why you disagree — CodeRabbit learns from this feedback. Or just resolve the thread.

## Qodo Merge (PR-Agent)

**What it does**: Posts a structured review with categorized findings ("possible bug", "possible issue", "suggestion") and severity levels. Also generates PR descriptions and improvement suggestions.

**Interacting with it**:
- `@CodiumAI-Agent /review` — trigger a review on demand
- `@CodiumAI-Agent /describe` — auto-generate a PR description
- `@CodiumAI-Agent /improve` — get code improvement suggestions
- `@CodiumAI-Agent /ask <question>` — ask a question about the PR

## Local Claude Code Review

**When to use**: Before pushing a PR, as a pre-flight check with full project context.

**How to run**: Use `/review` in Claude Code. This runs three specialized agents:
- **falcon** — correctness: bugs, logic errors, test quality
- **kestrel** — architecture: SOLID principles, pattern consistency
- **sentinel** — security: vulnerabilities, auth flaws, data exposure

**How it differs from CI reviewers**: Reads CLAUDE.md, specs/, and full project context. Catches Pokemon-specific issues (mechanic correctness, spec alignment) that generic AI reviewers miss.

## Full Review Workflow

1. **Local**: Run `/review` in Claude Code before pushing
2. **Push**: Open PR (or push to existing PR branch)
3. **CI**: Build, test, typecheck, lint must pass (required)
4. **CodeRabbit**: Auto-posts summary + inline comments (advisory)
5. **Qodo Merge**: Auto-posts structured review (advisory)
6. **Human**: You review AI feedback, address anything valid, approve and merge
