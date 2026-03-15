# Changelog

All notable changes to `@pokemon-lib-ts/battle` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2026-03-15

### Fixed
- `BaseRuleset.calculateStats()` now correctly applies nature modifier (1.1x boosted stat, 0.9x decreased stat) — all Gen 3-9 stat calculations were missing this
- `BaseRuleset.calculateConfusionDamage()` now uses the proper 40 BP formula (Attack vs Defense) instead of the incorrect `maxHP/8` shortcut

## [0.6.1] - 2026-03-15

### Fixed

- Consolidate duplicate `TrainerDataRef` interface — single canonical definition in `state/BattleSide.ts`; `context/types.ts` now imports from state rather than re-declaring the same shape

## [0.6.0] - 2026-03-15

### Fixed

- Defrost moves (`flags.defrost = true`, e.g., Flame Wheel, Scald) now always thaw a frozen Pokémon when used, regardless of the RNG freeze-thaw roll

### Changed

- **Breaking (pre-1.0):** `TrainerRef` renamed to `TrainerDataRef` to match the name used in `BattleConfig`. Consumers importing `TrainerRef` must update to `TrainerDataRef` — shape is identical.
- `BattleSide.trainer` field type updated from `TrainerRef` to `TrainerDataRef`
- `TrainerRef` removed from public exports

## [0.5.0] - 2026-03-15

### Changed
- **Breaking (pre-1.0):** Added `lastDamageType: PokemonType | null` field to `ActivePokemon` interface — tracks the type of the last move that dealt damage, enabling gen-specific Counter/Mirror Coat mechanics

## [0.4.0] - 2026-03-14

### Changed
- `critRate` renamed to `critStageBonus` on `MoveEffect` — more accurate name (PR #13)
- Engine no longer handles status damage, freeze thaw, sleep, or confusion directly;
  all delegated to `GenerationRuleset` methods (PR #13)

## [0.3.0] - 2025-12-01

### Changed
- Renamed npm scope `@pokemon-lib` → `@pokemon-lib-ts` (PR #8)
- Updated all cross-package peer dependency references

## [0.2.0] - 2025-11-15

### Added
- `BattleEngine` extended to support Gen 2 mechanics via new `GenerationRuleset` methods:
  weather effects, held item processing, freeze thaw, sleep RNG, confusion self-hit (PR #9)

## [0.1.0] - 2025-10-01

### Added
- Initial release: `BattleEngine` with event-driven architecture
- `BattleState`, `BattleEvent` stream, `BattleAction` discriminated unions
- `GenerationRuleset` interface — engine delegates all gen-specific behavior
- `BaseRuleset` abstract class for Gen 3+ default implementations
- AI controller interface
- Turn resolution: `TURN_START → TURN_RESOLVE → TURN_END → FAINT_CHECK`
