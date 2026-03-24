# Core Implementation Status

**Last updated:** 2026-03-21
**Overall estimate:** ~100% complete (all tracked items DONE after PR #235)
**Architecture:** Zero runtime dependencies. Foundation for all other packages. Implements shared logic used by all gen rulesets.

---

## DONE

### Entity Interfaces (16 modules — `packages/core/src/entities/`)
- `types.ts` — PokemonType (18 types), Generation, TYPES_BY_GEN, DEX_RANGE
- `stats.ts` — StatBlock, MutableStatBlock, StatName, NonHpStat, BattleStat
- `status.ts` — PrimaryStatus (6 conditions), VolatileStatus (~30+ including gen-specific ones)
- `weather.ts` — WeatherType (8 types), TerrainType (4 types)
- `field.ts` — EntryHazardType (4), ScreenType (3), HAZARD_MAX_LAYERS
- `nature.ts` — NatureId (25), NatureData, NEUTRAL_NATURES
- `experience.ts` — ExperienceGroup (6 growth rates)
- `gender.ts` — Gender
- `move.ts` — MoveCategory, MoveTarget, MoveData, MoveFlags, MoveEffect (20 variants), MoveSlot, StatChange
- `species.ts` — PokemonSpeciesData, Learnset, EvolutionData, MegaEvolutionData
- `pokemon.ts` — PokemonInstance, PokemonCreationOptions
- `ability.ts` — AbilityData, AbilityTrigger (22 triggers)
- `item.ts` — ItemData, ItemCategory, BagPocket, ItemUseEffect (10 variants), HoldEffect (14 variants)
- `trainer.ts` — TrainerData, TrainerPokemon
- `validation.ts` — DataValidationResult, DataValidationError, DataValidationWarning
- `type-chart.ts` — TypeChart

### Stat Calculation (`packages/core/src/logic/stat-calc.ts`)
- `calculateHp`, `calculateStat`, `getNatureModifier`, `calculateAllStats`
- Gen 3+ formula with Shedinja special case
- Tests: `tests/logic/stat-calc.test.ts` (14 tests, Charizard/Pikachu known values)
- Source: `pret/pokeemerald`

### Type Effectiveness (`packages/core/src/logic/type-effectiveness.ts`)
- `getTypeMultiplier`, `getTypeEffectiveness`, `classifyEffectiveness`
- Full 18×18 Gen 6+ chart in `src/constants/type-chart-data.ts`
- Property-based test: all 18×18 dual-type combinations produce valid multipliers
- Tests: `tests/logic/type-effectiveness.test.ts` (21 tests)

### EXP Curves (`packages/core/src/logic/experience.ts`)
- All 6 growth rates: medium-fast, medium-slow, fast, slow, erratic, fluctuating
- `getExpForLevel`, `getExpToNextLevel`, `calculateExpGain` (Gen 5+), `calculateExpGainClassic` (Gen 1-4)
- Level 100 totals verified; monotonicity property test
- Tests: `tests/logic/experience.test.ts` (20 tests)

### Catch Rate (`packages/core/src/logic/catch-rate.ts`)
- `STATUS_CATCH_MODIFIERS`, `calculateModifiedCatchRate`, `calculateShakeChecks`
- Tests: `tests/logic/catch-rate.test.ts` (11 tests)

### Stat Stages (`packages/core/src/logic/stat-stages.ts`)
- Separate Gen 1-2 and Gen 3+ ratio tables sourced from pret decomps
- `GEN12_STAT_STAGE_RATIOS`, `GEN3_STAT_STAGE_RATIOS`, `ACCURACY_STAGE_RATIOS`
- `getStatStageMultiplier`, `getAccuracyEvasionMultiplier`, `calculateAccuracy`
- Tests: `tests/logic/stat-stages.test.ts` (70 tests)

### Critical Hit (`packages/core/src/logic/critical-hit.ts`)
- `CRIT_RATES_GEN6`, `CRIT_RATES_GEN2`, `CRIT_RATES_GEN3_5`, `getCritRate`
- `CRIT_MULTIPLIER_MODERN` (1.5), `CRIT_MULTIPLIER_CLASSIC` (2.0)
- Tests: `tests/logic/critical-hit.test.ts` (12 tests)

### Damage Utilities (`packages/core/src/logic/damage-utils.ts`)
- `applyDamageModifier`, `applyDamageModifierChain`, `getStabModifier`, `getWeatherDamageModifier`
- Floor-truncation modifier chain matching game behavior
- Includes extreme weather modifiers (Desolate Land, Primordial Sea, Delta Stream)
- Tests: `tests/logic/damage-utils.test.ts` (31 tests)

### Pokemon Factory (`packages/core/src/logic/pokemon-factory.ts`)
- `createPokemonInstance`, `determineGender`, `getDefaultMoves`, `createMoveSlot`
- Deterministic creation via SeededRandom; gender ratios matching game
- Tests: `tests/logic/pokemon-factory.test.ts` (30 tests)

### DataManager (`packages/core/src/data/data-manager.ts`)
- `DataManager`, `DataPaths`, `RawDataObjects`
- `loadFromObjects` (sync), typed accessors for all entity types, collection accessors
- Tests: `tests/data/data-manager.test.ts` (26 tests)

### SeededRandom (`packages/core/src/prng/seeded-random.ts`)
- Mulberry32 PRNG
- `next()`, `int()`, `chance()`, `pick()`, `shuffle()`, `getState()`, `setState()`
- Tests: `tests/prng/seeded-random.test.ts` (14 tests)

### Gen 1-2 Shared Utilities (`packages/core/src/logic/gen12-shared.ts`)
- `gen1to2FullParalysisCheck` — 63/256 (~24.6%) paralysis check (pret/pokered)
- `gen1to4MultiHitRoll` — [2,2,2,3,3,3,4,5] distribution (pret/pokered)
- `gen1to6ConfusionSelfHitRoll` — 50% confusion self-hit (pret/pokered, pret/pokecrystal)
- `calculateStatExpContribution` — floor(ceil(sqrt(statExp))/4) formula (pret/pokered)
- Deprecated compatibility aliases `gen12FullParalysisCheck`, `gen14MultiHitRoll`, and `gen16ConfusionSelfHitRoll` remain source-local during the transition tracked in #1011.
- Tests: `tests/logic/gen12-shared.test.ts` (24 tests) — added PR #235

### Constants
- `src/constants/natures.ts` — ALL_NATURES (25 natures, stat modifiers, flavor)
- `src/constants/type-chart-data.ts` — GEN6_TYPE_CHART (18×18 matrix)

---

## Test Coverage

11 test files, 342 tests (as of 2026-03-22), 95%+ statement coverage, 99%+ branch coverage.

---

## STUBBED

None.

---

## MISSING / DEFERRED

None for current scope. Deferred features:
- Gen 1-2 specific stat formulas live in gen1/gen2 packages, not core (by design)

---

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| (initial) | main | Core package bootstrapped with all entity types, logic modules, DataManager, SeededRandom |
| #235 | feat/core-gen12-shared-tests | gen12-shared.ts tests — 24 tests bringing package to 100% coverage |
