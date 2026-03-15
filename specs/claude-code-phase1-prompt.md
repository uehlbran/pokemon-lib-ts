# Phase 1 Starter Prompt for Claude Code

Copy everything below the line into Claude Code. Run with `claude --model opusplan`.

---

## Prompt

I'm building an open-source TypeScript monorepo that produces Pokemon battle libraries. Read the CLAUDE.md at the project root for the full architecture overview, then read the spec files in `specs/` for detailed designs.

We're starting Phase 1: Core + Battle + Gen 1. Here's what I need you to build, in order:

### Step 1: Monorepo Scaffold

Set up the monorepo structure:

```
pokemon-lib-ts/
├── package.json              # Root — npm workspaces, shared dev deps
├── turbo.json                # Turborepo pipeline
├── tsconfig.base.json        # Shared TS config (strict mode)
├── biome.json                # Biome config (spaces, indent 2, line width 100, organize imports, recommended rules, warn noExplicitAny)
├── CLAUDE.md                 # Already exists — copy from specs
├── packages/
│   ├── core/                 # @pokemon-lib-ts/core
│   ├── battle/               # @pokemon-lib-ts/battle
│   └── gen1/                 # @pokemon-lib-ts/gen1
└── tools/
    └── data-importer/        # Build-time data pipeline
```

Install dev dependencies: turbo, typescript 5.4+, vitest, @biomejs/biome, tsup, @types/node. Each package gets its own package.json, tsconfig.json, vitest.config.ts, and tsup.config.ts (ESM + CJS dual output).

### Step 2: @pokemon-lib-ts/core

Implement the core package. Reference `specs/core/01-entities.md` for all TypeScript interfaces and `specs/core/02-shared-logic.md` for calculation functions.

Build in this order:
1. **Entity types** (`src/entities/`): PokemonType, StatBlock, PokemonSpeciesData, PokemonInstance, MoveData, MoveEffect, AbilityData, ItemData, NatureData, TypeChart, and all supporting types. Use readonly interfaces for data, discriminated unions for effects/actions/events, lowercase string literals not UPPERCASE enums.
2. **PRNG** (`src/prng/`): SeededRandom class using Mulberry32. Must be serializable/deserializable for battle replay. Methods: next(), nextInt(min, max), nextFloat(), chance(probability), shuffle(array), serialize(), static deserialize().
3. **Logic** (`src/logic/`): calculateHp(), calculateStat(), calculateAllStats(), getTypeEffectiveness() for single and dual types, all 6 EXP curve functions, EXP gain formula (Gen 5+ and Gen 1-4 variants), stat stage multipliers, catch rate formula.
4. **DataManager** (`src/data/`): Generic data loader that loads JSON, provides typed getters (getSpecies, getMove, getAbility, etc.), validates data on load, caches lookups.
5. **Tests**: Write tests against known values from Bulbapedia (stat calc verification table is in the spec). Property-based tests for formulas. Determinism tests for PRNG.
6. **Barrel export** (`src/index.ts`): Export everything public.

Run `npm run build && npm run test && npm run typecheck` after completing core. Fix any issues before moving on.

### Step 3: @pokemon-lib-ts/battle

Implement the battle engine. Reference `specs/battle/00-architecture.md` for the GenerationRuleset interface, BattleState, events, and API. Reference `specs/battle/01-core-engine.md` for the engine implementation.

Build in this order:
1. **GenerationRuleset interface** (`src/ruleset/`): The ~20-method contract that each gen implements. This is the most important interface in the project — get it right. Also create BaseRuleset abstract class with Gen 3+ defaults.
2. **State types** (`src/state/`): BattleState, BattleSide, ActivePokemon, VolatileStatusState, EntryHazardState, ScreenState.
3. **Action and Event types** (`src/events/`): BattleAction discriminated union (move/switch/item/run/recharge/struggle), BattleEvent union type (~35 event types).
4. **BattleEngine** (`src/engine/`): The core state machine. Constructor takes a GenerationRuleset + DataManager + config. Methods: start(), submitActions(), getState(), getEvents(), serialize/deserialize. The engine delegates ALL gen-specific behavior to the ruleset — it should not contain any generation-specific logic itself.
5. **AI controllers** (`src/ai/`): AIController interface + RandomAI (picks random valid moves).
6. **Tests**: Engine tests using a mock/stub ruleset. Verify turn flow, action validation, event emission, serialization roundtrip.

Run build + test + typecheck. Fix issues.

### Step 4: @pokemon-lib-ts/gen1 Data

Build the Gen 1 data importer. Reference `specs/core/03-data-pipeline.md` for the pipeline design.

**Primary data source**: Pokemon Showdown's data files from `smogon/pokemon-showdown` repo (MIT licensed). Clone it into `tools/repos/pokemon-showdown/`. Showdown's `data/` directory has generation-specific Pokemon data that's battle-tested.

**Secondary source**: PokeAPI `api-data` repo for species metadata (catch rates, egg groups, growth rates, evolution chains) that Showdown doesn't track.

The importer should:
1. Parse Showdown's Gen 1 data (pokemon, moves, type chart)
2. Supplement with PokeAPI species metadata
3. Transform into our entity interfaces (PokemonSpeciesData[], MoveData[], TypeChart, etc.)
4. Write to `packages/gen1/data/` as JSON files
5. Validate output (151 species, type chart is 15x15, all learnset moves exist in moves.json)

Gen 1 specifics:
- 151 Pokemon, 165 moves, 15 types (no Dark/Steel/Fairy)
- No abilities (fill with `{ normal: [], hidden: null }`)
- No natures (empty array)
- No held items
- Single "Special" stat → map to both spAttack and spDefense
- Physical/Special determined by TYPE not by move (Fire/Water/Grass/Electric/Ice/Psychic/Dragon = Special, rest = Physical)

### Step 5: Gen1Ruleset

Implement the Gen 1 battle ruleset. Reference `specs/battle/02-gen1.md` for complete Gen 1 mechanics.

Gen1Ruleset implements GenerationRuleset directly (does NOT extend BaseRuleset — Gen 1 is too mechanically different). Key Gen 1 quirks:
- Damage formula: `((((2 * Level / 5 + 2) * Power * A / D) / 50) + 2) * STAB * Type1 * Type2 * random/255`
- Critical hits use base Speed, not level. High crit moves (Slash, etc.) have Speed/64 rate.
- No abilities, no held items, no weather, no terrain
- Badge stat boosts (optional — spec has details)
- 1/256 miss glitch (moves with 100% accuracy actually have 255/256 chance)
- Focus Energy bug (divides crit rate by 4 instead of multiplying)
- Hyper Beam doesn't require recharge if it KOs
- Freeze is permanent (only thawed by specific moves)
- Sleep counter resets on switch

### Step 6: Integration Test

Write an end-to-end test that:
1. Loads Gen 1 data via Gen1's DataManager
2. Creates two teams of 6 Gen 1 Pokemon with known movesets
3. Runs a full battle with seeded PRNG
4. Verifies the battle produces a deterministic result (same seed = same events = same winner)
5. Verifies key events are emitted correctly (damage numbers, type effectiveness messages, fainting)

### Step 7: Verify Everything

Run from the monorepo root:
```bash
npm run build
npm run test
npm run typecheck
npx @biomejs/biome check .
```

All must pass. Fix any failures.

### Important Notes

- Read the spec files as reference but don't treat them as gospel. If something in the spec doesn't work in practice, deviate and document why.
- Use Pokemon Showdown's data as the primary source for Gen 1 data. It's battle-tested and MIT licensed.
- Biome handles ALL formatting. Don't add ESLint or Prettier.
- All string literals should be lowercase ('fire', 'physical', 'paralysis'), never UPPERCASE enums.
- Prefer readonly interfaces for data shapes. Use discriminated unions over class hierarchies.
- tsup should output both ESM and CJS.
- Each package gets independent semantic versioning starting at 0.1.0.
