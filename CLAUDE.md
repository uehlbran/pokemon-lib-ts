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
- **Single-branch workflow.** Do task work on one normal git branch at a time in the main checkout.

## Tech Stack

- **Language**: TypeScript 5.4+ with strict mode
- **Build**: tsup (ESM + CJS dual output)
- **Monorepo**: Turborepo + npm workspaces
- **Linting/Formatting**: Biome (NOT ESLint/Prettier)
- **Testing**: Vitest with v8 coverage, 80% thresholds
- **Node**: 20+

## Commands

```bash
npm run verify:local  # Local verification gate
npm run build          # Build all packages (turbo)
npm run test           # Unit + integration tests
npm run test:unit      # Unit tests only
npm run test:integration  # Integration tests only
npm run test:smoke     # Smoke tests only
npm run test:e2e       # E2E tests only
npm run test:stress    # Stress / soak tests only
npm run test:all       # Unit + integration + smoke + e2e + stress
npm run typecheck      # Type check all packages (turbo)
npx @biomejs/biome check --write .   # Lint + format
npx vitest run         # Run tests (from package dir)
npx vitest run --coverage  # Run with coverage
```

`npm run test` = unit + integration (CI default). `npm run verify:local` = handoff gate (non-test checks + test). `npm run test:slow` = alias for `test:smoke`.

## Code Style

Biome handles all formatting (indent 2, width 100, organize imports). Prefer readonly interfaces for data. Types use lowercase string literals (`'fire'`, `'physical'`, `'paralysis'`) in discriminated unions — no UPPERCASE enums. In source code, use the centralized constants from `core/constants/reference-ids.ts` (`CORE_STATUS_IDS`, `CORE_MOVE_CATEGORIES`, `CORE_VOLATILE_IDS`, etc.) instead of raw string comparisons. `noExplicitAny` is error in src, off in test files.

Biome tips: `npx @biomejs/biome check --changed --since=main .` for incremental lint. Test files (`packages/*/tests/**`, `tools/*/tests/**`) have `noNonNullAssertion` and `noExplicitAny` turned off.

## Data Sources

**Primary**: Pokemon Showdown (`@pkmn/data`). **Secondary**: PokeAPI `api-data` repo (species metadata Showdown doesn't track). Pipeline: `tools/data-importer/` transforms raw sources into per-gen JSON in `packages/genN/data/`.

## Source Authority

| Gen | Primary Source | Fallback |
|-----|---------------|----------|
| 1-2 | pret disassemblies (pokered, pokecrystal) | Bulbapedia -> Showdown -> specs |
| 3 | pret/pokeemerald | Showdown -> Bulbapedia -> specs |
| 4 | pret/pokeplatinum or pokeheartgold (where decompiled to C) | Showdown -> Bulbapedia -> Smogon -> specs |
| 5-9 | Pokemon Showdown | Bulbapedia -> Smogon -> specs |

Design intent: cartridge-accurate. hg-engine (BluRosie/hg-engine) is NOT a valid source.

Ground-truth refs: `specs/reference/genN-ground-truth.md`. Check before implementing any gen-specific mechanic. Every new or modified formula must include a source comment (e.g., `// Source: pret/pokered src/engine/battle/core.asm`).

## Testing

TDD is mandatory: Red (failing test), Green (minimum implementation), Refactor. No exceptions. Test against known values from Bulbapedia/Showdown with source comments. Property-based tests for formulas. Determinism tests for PRNG. Validate against Showdown battle logs. Never mock domain logic (damage calc, stat calc, type chart).

Integration tests required for every MoveEffectResult field the engine processes (attackerItemConsumed, itemTransfer, statusInflicted, etc.). Handler unit tests alone are not sufficient — they cannot detect engine contract violations. Never modify existing test assertions to match changed implementations without documented justification.

See `.claude/rules/testing-rules.md` and `.claude/rules/test-integrity.md` for detailed rules.

## Generation Status

Generation/package completion status is generated, not hand-maintained.

- Summary artifact: `tools/oracle-validation/results/completeness-status.md`
- Machine-readable artifact: `tools/oracle-validation/results/completeness-status.json`
- Full inventory: `tools/oracle-validation/results/completeness-inventory.json`

Allowed generated states:
- `incomplete`
- `verified`
- `compliant`

Full per-gen historical notes remain in `specs/reference/genN-status.md`, but those pages are not the source of truth for completion claims.

## Package Versioning

Uses `@changesets/cli`. Run `/version` before creating a PR. **Agents NEVER edit `package.json` versions or `CHANGELOG.md` directly.**

Bump rules:
- `src/` bug fix -> patch
- New export in `src/index.ts` -> minor
- Breaking interface change -> major (pre-1.0: treated as minor)
- Tests, docs, config, `specs/`, `.github/` only -> no changeset needed
- Data file changes (`data/*.json`) -> patch

## Model & Effort Strategy

- **Opus**: Deep reasoning -- correctness review (falcon)
- **Sonnet**: General-purpose -- gen-implementer, sentinel, bug-finder, kestrel, pokemon-reviewer, battle-tester, data-validator
- **Haiku**: Simple checks (no current assignments)

Default effort: `high`. Use `/effort medium` for simple config/docs/data tasks.

## PR & Git Workflow

- `npm run verify:local` before opening or updating a PR
- `/review` mandatory before PR (runs falcon + kestrel + sentinel)
- `/version` mandatory for `src/` or `data/` changes
- Pre-push gate: `npx @biomejs/biome check --write .`, `npm run typecheck`, `npm run test` (docs-only: biome only)
- Comment gate: every review thread needs a reply before merge (see `rules/pr-comment-handling.md`)
- Issue linking: `Closes #N`, one per line -- never comma-separated (see `rules/issue-closing-syntax.md`)
- Act autonomously on PR feedback; escalate only for architectural conflicts or 2+ failed fixes
- `gh pr edit` is broken for body edits -- use `gh api PATCH /repos/{owner}/{repo}/pulls/{number} --field body="..."` instead
- `gh pr checks` exit code 8 = pending, not failure
- AI reviews (CodeRabbit, Qodo) are advisory only. Validate reported bugs against current code before acting.
- File out-of-scope bugs as GitHub issues (see `rules/bug-filing.md`)

## Cartridge Compliance

Run `npm run oracle:fast` for a quick check (data + stats + ground truth, ~2 min) or `npm run compliance` for the full suite (~15 min). Results are in `tools/oracle-validation/results/`.

**Source Authority Hierarchy:**
- Gen 1-2: pret disassemblies (pokered, pokecrystal) — cartridge definitive
- Gen 3: pret C decomps (pokeemerald, pokefirered) — cartridge definitive
- Gen 4: pret WIP decomps (pokeplatinum, pokeheartgold) + Showdown — high confidence
- Gen 5-9: Showdown source + Bulbapedia — medium confidence. Showdown intentionally deviates from cartridge in some areas; prefer Bulbapedia for documented cartridge behavior.

**Oracles are sanity checks, not authorities.** `@pkmn/data`, `@smogon/calc`, and `@pkmn/sim` catch regressions and flag discrepancies. When they disagree with us, consult the hierarchy above.

**Check ERRATA before implementing anything.** `specs/ERRATA.md` documents 30 categories of errors found during implementation across all generations. Run through the checklist before implementing any gen mechanic. Common traps: paralysis speed changed in Gen 7 not Gen 5; terrain boost 1.5× in Gen 7 not 1.3×; Fairy type introduced Gen 6 not Gen 5; Dynamax HP is 1.5×-2.0× not 1.10×-1.20×.

A generation is COMPLIANT when ALL applicable suites pass: data match, damage match, mechanics match, terrain match (Gen 6+), gimmick match (Gen 6+), replay validation, damage trace, smoke tests, and ground truth.

## Agent Work Patterns

- **Parallelize** independent work as concurrent subagents. Never do sequentially what can be done in parallel.
- **One vertical slice per agent**, split at file boundaries. If a task needs 15+ file reads, split it.
- **One branch at a time**, descriptive unique names (e.g., `fix/gen1-crit-calc`), rebase onto `origin/main` before PR.
- **One PR at a time.** Never start a new branch or PR while any PR is still open. Wait for full merge confirmation before starting the next task.
- **No git worktrees.** Never use `git worktree`, `isolation: "worktree"` on Agent calls, or any worktree command. Parallel subagent work happens on the same branch split by file boundary.
- **Verify branch** before any mutating git command (see `rules/git-safety.md`).
- **Verify PR state** (`gh pr view <N> --json state`) before acting on a PR.
- After merging PRs that change `packages/*/src/` or `packages/*/data/`, update `specs/reference/*-status.md`.
