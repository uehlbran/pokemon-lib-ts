# Pokemon Library Monorepo

## Project Overview

A TypeScript monorepo producing open-source Pokemon libraries: `@pokemon-lib-ts/core` (entities, shared logic, zero dependencies), `@pokemon-lib-ts/battle` (pluggable battle engine), and `@pokemon-lib-ts/gen1` through `@pokemon-lib-ts/gen9` (per-gen rulesets + complete standalone data). Any consumer (Phaser game, Discord bot, CLI tool) can install only the gens it needs and swap battle systems at runtime.

## Architecture

Turborepo monorepo with npm workspaces. 11 publishable packages under `packages/`. See `specs/core/00-architecture.md` for full details.

```
packages/
  core/       # @pokemon-lib-ts/core — TypeScript interfaces, stat calc, type effectiveness, EXP curves, DataManager, SeededRandom
  battle/     # @pokemon-lib-ts/battle — BattleEngine, GenerationRuleset interface, BaseRuleset, BattleState, BattleEvent stream, AI controllers
  gen1/       # @pokemon-lib-ts/gen1 — Gen1Ruleset (implements GenerationRuleset directly) + complete Gen 1 data
  gen2/       # @pokemon-lib-ts/gen2 — Gen2Ruleset (implements GenerationRuleset directly) + complete Gen 2 data
  gen3/-gen9/ # @pokemon-lib-ts/gen3-gen9 — extend BaseRuleset + complete per-gen data
tools/
  data-importer/  # Build-time scripts that parse Showdown + PokeAPI data into per-gen JSON
  replay-parser/  # Showdown replay validation tool — parses replays and validates structural properties
```

### Dependency Graph
```
core ← battle ← genN ← consumer
```
Core has zero runtime dependencies. Battle depends on core. Each gen package depends on core + battle. Consumers install the gen packages they need.

### Key Design Patterns
- **GenerationRuleset interface**: ~40 methods (damage calc, stat calc, type chart, turn order, accuracy, move effects, etc.). Each gen implements this. The battle engine delegates all gen-specific behavior to it.
- **BaseRuleset abstract class**: Default Gen 3+ implementations. Gen 3-9 extend it. Gen 1-2 implement the interface directly (too mechanically different).
- **Event-driven battles**: BattleEngine emits a BattleEvent[] stream. No UI coupling. Consumers render events however they want.
- **Seeded PRNG**: Mulberry32. Deterministic battles for testing and replay.
- **Fully separate per-gen data**: Each gen package bundles complete pokemon.json, moves.json, abilities.json, items.json, type-chart.json, natures.json. No overlays or diffs between gens.

### Key Rules
- **Core has zero runtime dependencies.** This is a hard rule. If you need an external library, it doesn't belong in core.
- **The battle engine delegates ALL generation-specific behavior to the GenerationRuleset.** The engine never contains damage formulas, type charts, accuracy checks, or any mechanic that varies between generations. If you're tempted to add a gen-specific `if` statement to the engine, it belongs in the ruleset interface instead.
- **Turn flow**: `turn-start → action selection → priority sort → turn-resolve (accuracy check → move execution → damage/effects → ability triggers) → turn-end → weather/status ticks → faint-check → next turn or game over`
- **Branch-first (enforced by hook).** Before editing any repo file, run `/start-task <branch-name>`. The `enforce-branch-first.sh` hook blocks Edit/Write until a session branch is declared. See `.claude/rules/branch-first.md`.

## Tech Stack

- **Language**: TypeScript 5.4+ with strict mode
- **Build**: tsup (ESM + CJS dual output)
- **Monorepo**: Turborepo + npm workspaces
- **Linting/Formatting**: Biome (NOT ESLint/Prettier)
- **Testing**: Vitest with v8 coverage, 80% thresholds
- **Node**: 20+

## Commands

```bash
npm run build          # Build all packages (turbo)
npm run test           # Test all packages (turbo)
npm run typecheck      # Type check all packages (turbo)
npx @biomejs/biome check --write .   # Lint + format
npx vitest run         # Run tests (from package dir)
npx vitest run --coverage  # Run with coverage
```

### Biome Tips
- `npx @biomejs/biome check --changed --since=main .` — lint only changed files (`--since=main` is required; `vcs.defaultBranch` is not set in biome.json so `--changed` alone errors)
- `npx @biomejs/biome explain <ruleName>` — understand a rule and whether it has an auto-fix
- `FIXABLE` tag in diagnostic output means `--write` handles it; no tag = manual fix required
- `--write --unsafe` applies unsafe fixes (e.g. `noNonNullAssertion` rewrites `foo!` → `foo?`); always `git diff` before committing
- `noExplicitAny` has **no auto-fix** — replace `any` with a real type manually
- Test files (`packages/*/tests/**`, `tools/*/tests/**`) have `noNonNullAssertion` and `noExplicitAny` turned off; a diagnostic on those paths for those rules is a false alarm

## Code Style

- Biome handles all formatting: spaces, indent width 2, line width 100
- Organize imports enabled
- Linter with recommended rules, `noExplicitAny` is error (not warn) in this project
- No semicolons in Biome config (use Biome defaults)
- Prefer readonly interfaces for data. Mutable versions only where needed (runtime stat blocks).
- Use discriminated unions over class hierarchies (MoveEffect, BattleAction, BattleEvent)
- All entity types use lowercase string literals ('fire', 'physical', 'paralysis') not UPPERCASE enums

## Data Sources

**Primary**: Pokemon Showdown data (`@pkmn/data` / `smogon/pokemon-showdown` repo) — battle-tested, already split by generation, MIT licensed.
**Secondary**: PokeAPI `api-data` repo — for species metadata (Pokedex entries, catch rates, egg groups, growth rates, evolution chains) that Showdown doesn't track.

Data pipeline: `tools/data-importer/` transforms raw sources → per-gen JSON in `packages/genN/data/`. Generated JSON is committed to the repo and ships with npm packages.

## Spec Documents

Full architecture specs live in the `specs/` directory (originally created as `pokemon-project-planning/`):

- `specs/core/00-architecture.md` — Monorepo structure, package configs, versioning, design principles
- `specs/core/01-entities.md` — All TypeScript interfaces and types
- `specs/core/02-shared-logic.md` — Stat formulas, type effectiveness, EXP curves, catch rate
- `specs/core/03-data-pipeline.md` — PokeAPI/Showdown → per-gen JSON transformation pipeline
- `specs/battle/00-architecture.md` — GenerationRuleset, BattleState, BattleEvent, engine API
- `specs/battle/01-core-engine.md` — Engine implementation: turn resolution, move execution, end-of-turn
- `specs/battle/02-gen1.md` through `specs/battle/10-gen9.md` — Per-generation mechanics

These specs are reference material. Implementation may deviate where code reveals better approaches.

## Testing Philosophy

- Test against known values from Bulbapedia/Showdown (e.g., "level 50 Charizard with 31 HP IVs and 252 HP EVs = X HP")
- Property-based tests for formulas (stats always positive, type effectiveness in {0, 0.25, 0.5, 1, 2, 4})
- Determinism tests for PRNG (same seed = same sequence)
- Snapshot tests for imported data (correct shapes and counts)
- Validate against Showdown battle logs for battle engine correctness

## Testing Rules

These rules govern **how** tests are written. The Testing Philosophy section above governs **what** to test.

- **Provenance Requirement** — every hardcoded expected value must have a source comment explaining where it comes from (Bulbapedia article, Showdown source, pret disassembly, or an inline formula derivation). "Run the function and check what it returns" is not a valid source.
- **Triangulation Minimum** — every formula behavior needs at least 2 independent test cases with different inputs (Beck's rule: one test can be satisfied by a constant return; two cannot).
- **Testing Style by Code Type** — use output-based testing for pure functions (assert return value), state-based testing for stateful objects (assert state after action), and communication-based testing (mocks/spies) only at system boundaries (external I/O, event emission). Do not mock internal domain logic.
- **Mock Rules** — never mock domain logic (damage calc, stat calc, type chart). `MockRuleset` is for testing engine orchestration only — not for shortcuts in mechanic tests.
- **Cross-Gen Regression** — if you change a shared utility (e.g., `gen12-shared.ts`), add tests for each consuming gen (gen1 and gen2), not just the one you're working in.
- **Test Naming** — test names must describe the behavior and the scenario. Good: `"given a L50 Charizard with 31 HP IVs, when calculating HP stat, then returns 153"`. Bad: `"should work"`, `"calculates correctly"`, `"HP test"`. Prefer Given/When/Then framing.
- **No Weak Assertions for Formulas** — formula tests must use `toBe()`, `toEqual()`, or `toBeCloseTo()`. Never use `toBeTruthy()`, `toBeFalsy()`, `toBeDefined()`, or `toBeGreaterThan(0)` to assert a formula result — these can pass even when the formula is completely wrong.

## Source Authority

When implementing mechanics, use the following per-gen hierarchy (highest authority first):

**Gen 1–2:**
1. pret disassemblies (`pret/pokered`, `pret/pokecrystal`) — actual cartridge code, final word
2. Bulbapedia (when citing disassembly or verified testing)
3. Smogon / Pokemon Showdown
4. Our specs

**Gen 3 (Ruby/Sapphire/Emerald):**
1. `pret/pokeemerald` disassembly — complete, usable as ground truth
2. Pokemon Showdown (Gen 3 mod is mature and well-tested)
3. Bulbapedia
4. Our specs

**Gen 4 (Diamond/Pearl/Platinum/HeartGold/SoulSilver):**
1. `pret/pokeplatinum` or `pret/pokeheartgold` — where the specific function has been decompiled to C with a byte-perfect match. Both repos are ~75% decompiled; verify the battle-relevant function is in C (not `.s` assembly stubs) before citing.
2. Pokemon Showdown (Gen 4 mod) — primary fallback and authority for anything not yet decompiled
3. Bulbapedia (cross-reference for edge cases)
4. Smogon research threads (for disputed mechanics with cartridge testing)
5. Our specs

> **Note**: hg-engine (BluRosie/hg-engine) is a modding framework built on top of the HGSS ROM, not a disassembly. It must **never** be used as a source reference — it reflects modding conventions, not cartridge behavior.

**Gen 5–9:**
1. Pokemon Showdown — primary authority (no complete disassemblies exist)
2. Bulbapedia (cross-reference for edge cases)
3. Smogon research threads (for disputed mechanics with cartridge testing)
4. Our specs

Design intent is cartridge-accurate behavior. Exception: if cartridge behavior causes a crash or undefined behavior, handle it gracefully and document the divergence in a comment.

This hierarchy applies to mechanics and formulas. For raw data (species stats, move metadata), see the Data Sources section above.

**Ground-truth reference documents:**
- Currently exist: `specs/reference/gen1-ground-truth.md`, `specs/reference/gen2-ground-truth.md`
- Will be created per gen as implementation progresses
- Gen 3 should be sourced from `pret/pokeemerald`; Gen 4 from `pret/pokeplatinum`/`pret/pokeheartgold` (where decompiled) with Showdown fallback; Gen 5–9 primarily from Showdown with Bulbapedia cross-references

When implementing a gen-specific mechanic, check the ground-truth reference first. If none exists for that gen, fall through to the hierarchy directly.

## AI Agent Guidelines

### Before changing formulas or mechanics

1. Check `specs/reference/genN-ground-truth.md` for the gen you're working on. If it exists, it is the authoritative source — do not deviate without a comment explaining why.
2. If no ground-truth doc exists, consult the Source Authority hierarchy for that gen.
3. Do not change a formula based on a spec doc alone if it contradicts the source hierarchy. Update the spec to match the authoritative source instead.
4. Every new or modified formula must include a source comment, e.g.:
   ```typescript
   // Source: pret/pokered src/engine/battle/core.asm — damage formula
   // Source: Showdown sim/battle.ts Gen 4 damage calc
   ```

### Before changing specs

1. Verify the change against the source hierarchy — specs should reflect ground truth, not the other way around.
2. If a spec contradicts an authoritative source, the spec is wrong. Fix the spec and note the correction.
3. Do not "fix" a spec to match existing (potentially buggy) code — fix the code instead.

### Before changing code

1. Confirm you are on the correct branch for this gen/feature.
2. Run the existing tests first to establish a baseline.
3. If fixing a mechanic that affects damage output, add a regression test with a known-good value from the source hierarchy before changing anything.

### General rules

- When in doubt about a mechanic, look it up in the source hierarchy rather than guessing or extrapolating.
- If you discover a discrepancy between the spec and an authoritative source, file a GitHub issue (see Bug Reporting) before or alongside fixing it.
- Do not implement mechanics that are undocumented in both the spec and the source hierarchy — flag them for human review instead.
- Parallelizable research (checking multiple sources) should be dispatched as concurrent subagents, not done serially.
- After merging a PR that changes `packages/genN/src/` or `packages/genN/data/`, or closes a tracked bug: update `specs/reference/genN-status.md` (or `core-status.md` / `battle-status.md`) with the PR number, wave name, and any bug closures. Also update the Generation Status table in this file if the completion % or open bug count changes.

## PR Review

Every PR requires local review before push plus a human approver:

- **`/review` (required)** — runs falcon (correctness), kestrel (architecture), sentinel (security) locally. Must be run before every PR. This is the primary review gate.
- **CodeRabbit** — inline comments, PR summary, security scan (advisory, bonus). Config: `.coderabbit.yaml`
- **Qodo PR-Agent** — structured review (advisory, best-effort — may be rate-limited). GitHub Action.
- **Claude Code** — deep local review via `pokemon-reviewer` subagent. Runs on push via `git pushreview`. Posts findings to PR as comments (advisory).
- **Human** — final say on architecture and correctness. Human review is a process rule enforced via CLAUDE.md, not a branch protection setting.

AI reviews are advisory (comments only, never formal approvals). See `.github/AI_REVIEWERS.md` for interaction commands.

## How to Add a New Generation

1. Create `packages/genN/` with standard package structure
2. Generate data: `npx tsx tools/data-importer/src/import-gen.ts --gen N`
3. Implement the ruleset:
   - Gen 1-2: Implement `GenerationRuleset` directly (too mechanically different from Gen 3+ defaults)
   - Gen 3-9: Extend `BaseRuleset`, override gen-specific methods
4. Read the spec: `specs/battle/` (e.g., `02-gen1.md`, `03-gen2.md`, ... `10-gen9.md`)
5. Write tests for every gen-specific mechanic
6. Export from `packages/genN/src/index.ts`
7. Create `specs/reference/genN-status.md` to track implementation progress (waves, PRs, open bugs, test coverage)
8. Update the Generation Status table in this file

> Gen 1–2 implement `GenerationRuleset` directly. Do **not** make them extend `BaseRuleset` — they are too mechanically different. Shared Gen 1–2 formulas (`gen12FullParalysisCheck`, `gen16ConfusionSelfHitRoll`, `gen14MultiHitRoll`, `calculateStatExpContribution`) live in `packages/core/src/logic/gen12-shared.ts` — fix them there and both gens benefit automatically.

## Implementation Phases

- **Phase 1** (DONE): Core + Battle + Gen 1 (simplest gen — no abilities, no held items, 151 Pokemon, 165 moves, 15-type chart). Shipped 0.1.0.
- **Phase 2** (DONE): Gen 2 (second simplest — no abilities, adds held items, weather, Dark/Steel types, Special split). Shipped 0.2.0.
- **Phase 3** (DONE): Gen 3–6 (sequential — each extends BaseRuleset; abilities system, items system, weather, terrain, Mega Evolution).
- **Phase 4** (IN PROGRESS): Gen 7 (Z-Moves, Alolan Forms, Tapu terrain abilities, Ultra Burst).
- **Phase 5** (DONE): Gen 8 (Dynamax/Gigantamax, Galarian Forms) + Gen 9 (Terastallization, Snow, new abilities/moves).

## Generation Status

| Package | Status | Tests | Open Bugs | Key Notes |
|---------|--------|-------|-----------|-----------|
| core | 100% | 342 | 0 | All entity interfaces, stat calc, type effectiveness, PRNG |
| battle | 100% (singles) | 546 | 0 | Doubles/Triples deferred |
| gen1 | 100% | 800 | 1 (#530 badge glitch — enhancement) | All move handlers done |
| gen2 | 100% | 757 | 0 | All engine-level bugs closed |
| gen3 | 98% | 860 | 1 (#141 Plus/Minus — doubles) | Flash Fire fixed PR #591 |
| gen4 | 100% | 1,216 | 0 | All 24 audit bugs + 4 new bugs closed |
| gen5 | 100% | 1,165 | 0 | Sky Drop/Pledge doubles deferred |
| gen6 | 100% | 1,079 | 0 | All 10 waves merged, 82.6% branch coverage |
| gen7 | 100% | 1,116 | 2 | #687 Disguise non-lethal, #725 Focus Sash capLethalDamage |
| gen8 | 100% | 1,193 | 2 | #687 Disguise non-lethal, #725 Focus Sash capLethalDamage |
| gen9 | 100% | 1,031 | 8 | All 10 waves merged, 82.04% branch coverage |

Full per-gen details: `specs/reference/genN-status.md`
Ground-truth mechanical reference: `specs/reference/genN-ground-truth.md`

## Package Versioning

Uses `@changesets/cli` for collision-free versioning across concurrent agents.

**On feature branches**: Run `/version` before creating a PR. This creates a `.changeset/<name>.md` file declaring which packages changed and the bump type. Changeset files are separate files that cannot conflict between branches — no more version collision when two agents touch the same package.

**To release**: Run `npm run version-packages` on main. This consumes all pending changesets, bumps `package.json` versions, and generates `CHANGELOG.md` entries atomically.

**Agents NEVER edit `package.json` versions or `CHANGELOG.md` directly.** Changesets handles both.

Bump classification rules (used by `/version`):
- Any `src/` bug fix → patch
- Any new export in `src/index.ts` → minor
- Any breaking interface change → major (pre-1.0: treated as minor)
- Tests, docs, config, `specs/`, `.github/` only → no changeset needed
- Data file changes (`data/*.json`) → patch

## Model & Effort Strategy

### Agent Model Tiers
- **Opus**: Tasks requiring deep reasoning — correctness review (falcon), gen implementation (gen-implementer)
- **Sonnet**: General-purpose — security review (sentinel), bug finding (bug-finder), architecture review (kestrel), PR review (pokemon-reviewer), test writing (battle-tester), data validation (data-validator)
- **Haiku**: Simple checks (no current agent assignments)

### Effort Level
Effort is session-wide (no per-agent control). Default: `high` (set in `~/.claude/settings.json`).
- Complex implementation/debugging sessions: `high` (default)
- Simple config/docs/data tasks: use `/effort medium` at session start
- Effort displays in the status line — verify before starting complex work

## Agent Work Patterns

### Task Sizing
- Agent tasks should be completable within ~50% of context capacity — if a task needs 15+ file reads, split it into narrower agents
- Explore agents: give specific search targets and file paths, not open-ended "find everything about X"
- Implementation agents: one vertical slice per agent, not multiple features in one dispatch
- Front-load context in agent prompts (file paths, line numbers, method names) to reduce discovery overhead
- If an agent compacts mid-task, the fix is task sizing — break it into smaller agents, not more infrastructure

### Parallelization
- **Default to parallel.** If 2+ tasks have no data dependency between them, dispatch them as concurrent subagents in a single message — never do sequentially what can be done in parallel
- Use subagents aggressively to offload work: research, test writing, independent implementations, file exploration, code review. This protects the main context window from bloat and reduces compaction risk
- Examples of parallelizable work: writing tests for different modules, exploring separate areas of the codebase, implementing independent functions/classes, running build + test + typecheck, reviewing different files
- When implementing a plan with independent steps, dispatch those steps as parallel subagents rather than executing them sequentially in the main context
- Only serialize work when there is a true dependency (e.g., must read output of step 1 to inform step 2)

### Branch Discipline

- **Always branch from latest main**: `git fetch origin main && git checkout -b <branch> origin/main`
- **Never reuse branch names** for unrelated work — if a branch was used in a prior PR, create a new one
- **Use descriptive, unique names**: include the scope (e.g., `fix/gen1-crit-calc`, not `fix/gen1-corrections`)
- **Rebase before PR**: before opening a PR, rebase onto `origin/main` to minimize conflicts
- **Never checkout a branch owned by another worktree**: if `git checkout <branch>` fails with "already used by worktree", work in that worktree's directory instead (using `git -C <path>`) or create a new branch

### Git Safety with Worktrees

- **Verify before mutating.** Before any mutating git command (`rebase`, `reset`, `merge`, `commit`, `checkout`), run `git branch --show-current` (or `git -C <path> branch --show-current`) and confirm it matches the expected branch
- **Always use `git -C <worktree-path>`** for ALL git commands when a worktree exists for the task — even read-only commands like `log` and `status`. Never run bare `git` in the main repo for worktree work
- **Verify PR state first.** Before acting on a PR, run `gh pr view <number> --json state` to confirm it's still open
- **Post-mutation verification.** After any `rebase`/`merge`/`reset`, run `git log --oneline -5` and confirm the result matches expectations before continuing
- **Never mutate the main worktree for PR work.** If the task involves a PR and a worktree exists, all git operations happen via `git -C <worktree-path>`, period

## PR Workflow

- **Always run `/review` before creating a PR** — mandatory. Runs falcon (correctness), kestrel (architecture), and sentinel (security) locally. Do not depend on CodeRabbit/Qodo — they can be rate-limited.
- **Always run `/version` before creating a PR** — mandatory for any branch touching `packages/*/src/` or `packages/*/data/`. Creates a `.changeset/<name>.md` file; does NOT edit `package.json` or `CHANGELOG.md`. See Package Versioning above. Tests, docs, config, and `specs/` changes do not require a changeset.
- **Link issues in PR body**: if the branch fixes a GitHub issue, include `Closes #<number>` (or `Fixes #<number>`) in the PR body. **Before using `Closes: N/A`**, run `gh issue list --state open --search "KEYWORDS"` with at least 2 keyword sets — only use N/A if no matching issue is found. See `.claude/rules/issue-linking.md`. **CRITICAL SYNTAX**: `Closes #50, #80` only closes #50 — each issue needs its own keyword on its own line. See `.claude/rules/issue-closing-syntax.md`.
- **Always use `/babysit-pr <number>` after creating a PR** — mandatory. This is the ONLY sanctioned way to monitor, address comments, and merge. Do NOT run `gh pr merge` directly — the comment gate hook will block it if review threads haven't been acknowledged.
- **`/babysit-pr` auto-merges by default** and self-polls until complete — no `/loop` wrapper needed. Use `--no-merge` to require confirmation before merging.
- **Comment gate enforced by hook**: `enforce-comment-gate.sh` blocks `gh pr merge` if any unresolved review thread has zero replies. Every thread (CodeRabbit, Qodo, human) needs at minimum a reply before merge. See `.claude/rules/pr-comment-handling.md`.
- **HARD RULE — No comment may be ignored**: Every inline review comment must get a reply. Options: (1) fix the code and reply citing the commit, (2) reply explaining why the report is incorrect citing source authority, (3) reply that it's a real bug out of scope and file a GitHub issue with the issue number. There is no fourth option. A comment without a reply is a blocker — you cannot proceed to merge.
- **Validate bugs before acting**: AI reviewers (CodeRabbit, Qodo) analyze the first commit. If a later fix already addressed the issue, grep/read the current code to confirm, then reply citing the fix commit. Never re-implement a fix that is already in the code, and never file a GitHub issue for a bug that no longer exists.
- **Act autonomously.** When handling a PR, agents should:
  - Push fixes for reviewer feedback without asking permission
  - Fix CI/lint/test failures independently
  - Resolve merge conflicts
  - Re-request reviews after pushing fixes
- **Only escalate when:**
  - A reviewer requests an architectural change that conflicts with existing patterns or specs
  - You've attempted a fix 2+ times and it's still failing
  - The reviewer's feedback is ambiguous and could be interpreted multiple ways
  - A decision requires trade-offs only the user can weigh
- **Check PR state before acting**: run `gh pr view <number> --json state` before investigating review comments or doing work on a PR. If `MERGED` or `CLOSED`, stop
- **Never run `gh pr merge` directly** — use `/babysit-pr <number>` instead. If you must verify merge state after `/babysit-pr` completes, use `gh pr view <number> --json state` — `gh pr merge --auto` produces no output on success
- **CodeRabbit and Qodo are advisory only** — not required checks. Do not block merge on them. Required checks: `build`, `test`, `typecheck`, `lint`
- **`gh pr checks` exit code 8 means pending**, not failure
- **`gh pr edit` is broken for body edits** — it calls the deprecated GitHub Projects (classic) API and errors even when only updating `--body`. Use `gh api PATCH /repos/{owner}/{repo}/pulls/{number} --field body="..."` instead whenever you need to edit a PR body after creation.

### Pre-Push Validation (Mandatory)

Before every `git push`, all agents must run the following validation gate:

1. **Biome**: `npx @biomejs/biome check --write .` — auto-fixes formatting/lint. If any files are modified, stage them before pushing.
2. **Typecheck**: `npm run typecheck` — catches TypeScript errors.
3. **Tests**: `npm run test` — ensures nothing is broken.
4. **Status docs**: If the PR touches `packages/*/src/` or `packages/*/data/`, or closes a tracked bug, verify the corresponding `specs/reference/*-status.md` has been updated with the PR number and any bug closures.

If typecheck or tests fail, fix the issue and re-run before pushing. Never push failing code.

**Exception:** For docs-only changes (no files under `src/` or `data/` modified), skip typecheck and test — biome check is still required.

## Bug Reporting

When agents discover bugs outside the scope of their current task, they must file GitHub issues
rather than ignoring them or noting them in markdown files. See `.claude/rules/bug-filing.md` for
the format and dedup check procedure. Use the `bug-finder` agent for proactive scanning.

When a PR fixes a tracked issue, include `Closes #N` in the PR body so GitHub auto-closes the
issue on merge. Always link PRs to the issues they resolve.
