# Pokemon Library Monorepo

## Project Overview

A TypeScript monorepo producing open-source Pokemon libraries: `@pokemon-lib/core` (entities, shared logic, zero dependencies), `@pokemon-lib/battle` (pluggable battle engine), and `@pokemon-lib/gen1` through `@pokemon-lib/gen9` (per-gen rulesets + complete standalone data). Any consumer (Phaser game, Discord bot, CLI tool) can install only the gens it needs and swap battle systems at runtime.

## Architecture

Turborepo monorepo with npm workspaces. 11 publishable packages under `packages/`. See `specs/core/00-architecture.md` for full details.

```
packages/
  core/       # @pokemon-lib/core — TypeScript interfaces, stat calc, type effectiveness, EXP curves, DataManager, SeededRandom
  battle/     # @pokemon-lib/battle — BattleEngine, GenerationRuleset interface, BaseRuleset, BattleState, BattleEvent stream, AI controllers
  gen1/       # @pokemon-lib/gen1 — Gen1Ruleset (implements GenerationRuleset directly) + complete Gen 1 data
  gen2/       # @pokemon-lib/gen2 — Gen2Ruleset (implements GenerationRuleset directly) + complete Gen 2 data
  gen3/-gen9/ # @pokemon-lib/gen3-gen9 — extend BaseRuleset + complete per-gen data
tools/
  data-importer/  # Build-time scripts that parse Showdown + PokeAPI data into per-gen JSON
```

### Dependency Graph
```
core ← battle ← genN ← consumer
```
Core has zero runtime dependencies. Battle depends on core. Each gen package depends on core + battle. Consumers install the gen packages they need.

### Key Design Patterns
- **GenerationRuleset interface**: ~20 methods (damage calc, stat calc, type chart, turn order, accuracy, move effects, etc.). Each gen implements this. The battle engine delegates all gen-specific behavior to it.
- **BaseRuleset abstract class**: Default Gen 3+ implementations. Gen 3-9 extend it. Gen 1-2 implement the interface directly (too mechanically different).
- **Event-driven battles**: BattleEngine emits a BattleEvent[] stream. No UI coupling. Consumers render events however they want.
- **Seeded PRNG**: Mulberry32. Deterministic battles for testing and replay.
- **Fully separate per-gen data**: Each gen package bundles complete pokemon.json, moves.json, abilities.json, items.json, type-chart.json, natures.json. No overlays or diffs between gens.

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

## Code Style

- Biome handles all formatting: spaces, indent width 2, line width 100
- Organize imports enabled
- Linter with recommended rules, warn on noExplicitAny
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

## PR Review

Every PR gets reviewed by two AI tools plus a human approver:

- **CodeRabbit** — inline comments, PR summary, security scan. Config: `.coderabbit.yaml`
- **Qodo Merge** — structured review with severity categories. Free tier (75 PRs/month)
- **Human** — required approval (1 reviewer). Final say on architecture and correctness

AI reviews are advisory (comments only, never formal approvals). See `.github/AI_REVIEWERS.md` for interaction commands.

Local pre-PR review: run `/review` in Claude Code (falcon/kestrel/sentinel agents).

## Implementation Phases

- **Phase 1**: Core + Battle + Gen 1 (simplest gen — no abilities, no held items, 151 Pokemon, 165 moves, 15-type chart). Ship 0.1.0.
- **Phase 2**: Gen 9 (most complex — proves architecture scales). Ship 0.2.0.
- **Phase 3+**: Remaining gens, community-driven.

## Package Versioning

Independent semantic versioning per package. A Gen 1 bug fix doesn't bump Gen 9. All packages share a minimum compatible core version via peerDependencies.
