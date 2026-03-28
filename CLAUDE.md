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

TDD is mandatory: write tests before or with implementation. Test against known values from Bulbapedia/Showdown with source comments. Property-based tests for formulas. Determinism tests for PRNG. Validate against Showdown battle logs. Never mock domain logic (damage calc, stat calc, type chart).

See `.claude/rules/testing-rules.md` for detailed test authoring rules.

## Generation Status

| Package | Status | Tests | Open Bugs |
|---------|--------|-------|-----------|
| core | 100% | 342 | 0 |
| battle | 100% (singles) | 596 | 0 |
| gen1 | 100% | 800 | 1 (#530) |
| gen2 | 100% | 757 | 0 |
| gen3 | 100% | 847 | 1 (#141) |
| gen4 | 100% | 1,225 | 0 |
| gen5 | 100% | 1,225 | 0 |
| gen6 | 100% | 1,135 | 0 |
| gen7 | 100% | 1,144 | 0 |
| gen8 | 100% | 1,208 | 0 |
| gen9 | 100% | 1,053 | 0 |

Full per-gen details: `specs/reference/genN-status.md`

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

## Agent Work Patterns

- **Parallelize** independent work as concurrent subagents. Never do sequentially what can be done in parallel.
- **One vertical slice per agent**, split at file boundaries. If a task needs 15+ file reads, split it.
- **One branch at a time**, descriptive unique names (e.g., `fix/gen1-crit-calc`), rebase onto `origin/main` before PR.
- **Verify branch** before any mutating git command (see `rules/git-safety.md`).
- **Verify PR state** (`gh pr view <N> --json state`) before acting on a PR.
- After merging PRs that change `packages/*/src/` or `packages/*/data/`, update `specs/reference/*-status.md`.
