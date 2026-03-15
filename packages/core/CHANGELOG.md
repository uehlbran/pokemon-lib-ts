# Changelog

All notable changes to `@pokemon-lib-ts/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
