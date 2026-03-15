# Architecture

## Monorepo Structure

Turborepo + npm workspaces. All publishable packages under `packages/`, build tooling under `tools/`.

```
packages/
  core/           # @pokemon-lib/core — entities, shared logic, zero dependencies
  battle/         # @pokemon-lib/battle — pluggable battle engine
  gen1/ - gen9/   # @pokemon-lib/gen1-gen9 — per-gen rulesets + data
tools/
  data-importer/  # Build-time: Showdown/PokeAPI → per-gen JSON
specs/            # Architecture and mechanic specifications
docs/             # Project documentation
```

## Dependency Graph

```
core ← battle ← genN ← consumer
```

- **core** has zero runtime dependencies
- **battle** depends on core only
- **genN** depends on core + battle
- **Consumers** install only the gen packages they need

No circular dependencies. No cross-gen dependencies. Each gen is fully standalone.

## Pluggable Ruleset System

The battle engine is generation-agnostic. All gen-specific behavior is encapsulated in the `GenerationRuleset` interface (~20 methods covering damage, stats, types, accuracy, effects, etc.).

```
GenerationRuleset (interface)
  ├── Gen1Ruleset (implements directly — too different for base class)
  ├── Gen2Ruleset (implements directly)
  └── BaseRuleset (abstract, default Gen 3+ implementations)
      ├── Gen3Ruleset (extends)
      ├── Gen4Ruleset (extends)
      └── ... Gen9Ruleset (extends)
```

**Why Gen 1-2 don't extend BaseRuleset**: Gen 1 uses DVs instead of IVs, has no abilities/items/natures, uses type-based physical/special split, and has numerous unique bugs (1/256 miss, Focus Energy bug, etc.). Gen 2 is similarly distinct. Forcing them through a Gen 3+ base class would mean overriding nearly every method.

## Event-Driven Battle Architecture

The BattleEngine emits a `BattleEvent[]` stream per turn. No UI coupling — consumers render events however they want (Phaser game, Discord bot, CLI tool, replay viewer).

Key types:
- **BattleState**: Complete battle snapshot (both sides, field, turn count, PRNG state)
- **BattleAction**: What a player chooses (`'move' | 'switch' | 'item' | 'run'`)
- **BattleEvent**: What happened (`'damage' | 'heal' | 'status' | 'faint' | 'switch'` etc.)
- **SeededRandom**: Mulberry32 PRNG for deterministic battles

## How to Add a New Generation

1. Create `packages/genN/` with standard package structure
2. Generate data: `npx tsx tools/data-importer/src/import-gen.ts --gen N`
3. Implement the ruleset:
   - Gen 1-2: Implement `GenerationRuleset` directly
   - Gen 3-9: Extend `BaseRuleset`, override gen-specific methods
4. Read the spec: `specs/battle/NN-genN.md`
5. Write tests for every gen-specific mechanic
6. Export from `packages/genN/src/index.ts`

## Data Pipeline

```
Showdown repo + PokeAPI repo (tools/repos/, gitignored)
  ↓ tools/data-importer/
  ↓ parse, transform, validate
packages/genN/data/*.json (committed, ships with npm)
```

Each gen package bundles complete, standalone data files:
- `pokemon.json` — species, base stats, types, learnsets
- `moves.json` — move definitions
- `type-chart.json` — type effectiveness matrix
- `abilities.json` — ability definitions (stub for Gen 1-2)
- `items.json` — item definitions (stub for Gen 1)
- `natures.json` — nature modifiers (stub for Gen 1-2)

No overlays or diffs between gens. Every gen package is fully self-contained.

## Tech Stack

| Tool | Purpose |
|------|---------|
| TypeScript 5.4+ | Language (strict mode) |
| tsup | Build (ESM + CJS dual output) |
| Turborepo | Monorepo orchestration |
| npm workspaces | Package management |
| Biome | Linting + formatting |
| Vitest | Testing (v8 coverage, 80% thresholds) |
