# Changelog

All notable changes to `@pokemon-lib-ts/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-03-16

### Added

- Optional `critRatio` field on `MoveData` interface — enables high-crit-ratio moves (Slash, Crabhammer, Razor Leaf, etc.) to declare their stage bonus (#126)

### Fixed

- `BaseRuleset.rollCritical()` now sums crit stage bonuses from all sources: move `critRatio`, Scope Lens/Razor Claw (+1), Leek/Stick (+2 for Farfetch'd/Sirfetch'd), Lucky Punch (+2 for Chansey), Super Luck ability (+1). Previously only Focus Energy was applied (#86)

## [0.7.0] - 2026-03-15

### Changed

- Added `"mist"` to `VolatileStatus` union — enables Gen 1 Mist status tracking in the battle engine (#92)

## [0.6.0] - 2026-03-15

### Changed

- **Breaking (pre-1.0):** `GenerationRuleset` now extends 15 named sub-interfaces (`TypeSystem`, `StatCalculator`, `DamageSystem`, `CriticalHitSystem`, `TurnOrderSystem`, `MoveSystem`, `StatusSystem`, `AbilitySystem`, `ItemSystem`, `WeatherSystem`, `TerrainSystem`, `HazardSystem`, `SwitchSystem`, `EndOfTurnSystem`, `ValidationSystem`). Consumers can type-narrow to just the slice they need (#44)
- `calculateStatExpContribution`, `gen12FullParalysisCheck`, `gen14MultiHitRoll`, `gen16ConfusionSelfHitRoll` extracted from per-gen packages to `@pokemon-lib-ts/core` as shared Gen 1–2 formulas in `gen12-shared.ts` (#44)
- `BattleEngine` constructor now throws on unknown species (no silent fallbacks) (#44)
- `getAvailableMoves` emits `EngineWarningEvent` for missing move data instead of silently including broken entries (#44)
- `BattleEngine.fromGeneration()` static factory added (#44)

## [0.5.0] - 2026-03-15

### Fixed

- Preserve `toxic-counter` in `VolatileStatus` union — it was accidentally dropped during rebase; now correctly present as a single entry alongside `sleep-counter`
- Make `teraType` and `dynamaxLevel` optional in `PokemonCreationOptions` — these are Gen 8/9-specific fields that should not be required for earlier generations

### Changed

- **Breaking (pre-1.0):** `PokemonCreationOptions.teraType` is now optional (`PokemonType?`)
- **Breaking (pre-1.0):** `PokemonCreationOptions.dynamaxLevel` is now optional (`number?`)

## [0.4.0] - 2026-03-14

### Changed
- Renamed `critRate` → `critStageBonus` on `MoveEffect` for accuracy (PR #13)
- Status mechanics (`applyStatusDamage`, `checkFreezeThaw`, etc.) delegated out of
  battle engine into `GenerationRuleset` interface — new required methods added (PR #13)

## [0.3.0] - 2025-12-01

### Changed
- Renamed npm scope `@pokemon-lib` → `@pokemon-lib-ts` across all packages (PR #8)
- Updated all internal cross-package references to use new scope

## [0.2.0] - 2025-11-15

### Added
- `GenerationRuleset` interface extended with Gen 2 methods: `checkFreezeThaw`,
  `rollSleepTurns`, `rollConfusionSelfHit`, `processSleepTurn`, `applyWeatherEffects`,
  `applyHeldItemEffect`, `canUseItem`, `processHeldItem` (PR #9)
- `BattleState` extended with weather and held-item fields (PR #9)

## [0.1.0] - 2025-10-01

### Added
- Initial release: TypeScript interfaces and types for all Pokemon entities
- `DataManager` for loading per-gen JSON data
- `SeededRandom` (Mulberry32 PRNG) for deterministic battles
- Stat calculation formulas (Gen 1 and modern)
- Type effectiveness engine
- EXP curve calculations
- Catch rate formula
