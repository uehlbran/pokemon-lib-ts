# Changelog

All notable changes to `@pokemon-lib-ts/battle` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-03-17

### Added

- `getPostAttackResidualOrder(): readonly EndOfTurnEffect[]` method to `EndOfTurnSystem` interface — enables per-Pokemon Phase 1 residual processing after each move/struggle. Gen 3+ default returns `[]` (no behavior change). Source: pokecrystal `ResidualDamage`.
- `processPostAttackResiduals(sideIndex)` in `BattleEngine` — dispatches Phase 1 effects per acting Pokemon immediately after each action in the turn loop.
- Per-side helpers: `processStatusDamageForSide`, `processLeechSeedForSide`, `processCurseForSide`, `processNightmareForSide` — extracted from their both-sides equivalents to support per-Pokemon Phase 1 dispatch.

### Changed

- `BattleEngine` action loop now calls `processPostAttackResiduals(action.side)` after each `move` or `struggle` action (no-op for Gen 1 and Gen 3+, which return `[]` from `getPostAttackResidualOrder`).

## [0.9.0] - 2026-03-15

### Added

- `calculateStruggleDamage(attacker, defender, state): number` added to `GenerationRuleset` interface — enables per-gen Struggle base damage (Gen 1: Normal-type, Ghost immune; Gen 2+: typeless) (#80)
- `BaseRuleset.calculateStruggleDamage()` default implementation: typeless 50 BP physical formula (#80)
- `BaseRuleset.getEffectiveSpeed()` protected method: applies stat stage multiplier + Gen 7+ paralysis speed halving (×0.5) (#89)
- `BaseRuleset` constructor now accepts optional `DataManager` for move priority lookups in `resolveTurnOrder()` (#85)
- `"nightmare"` added to `BaseRuleset.getEndOfTurnOrder()` array (#88)

### Changed

- **Breaking:** `BattlePhase` string literal values renamed from `SCREAMING_SNAKE_CASE` to `kebab-case` (`"BATTLE_START"` → `"battle-start"`, etc.) — update all comparisons and switch cases (#50)
- `BaseRuleset.resolveTurnOrder()` now correctly compares move priority (via `DataManager.getMove()`) before speed — was previously using a dead placeholder (#85)
- `BaseRuleset.applyStatusDamage()` badly-poisoned now escalates via `toxic-counter` volatile (1/16, 2/16, 3/16... per turn) instead of flat 1/16 (#87)
- `BattleEngine.executeStruggle()` now delegates base damage to `ruleset.calculateStruggleDamage()` instead of hardcoded `maxHp / 4` (#80)
- `BattleEngine.resolveTurn()` now enforces recharge volatile before action resolution — Pokemon with `"recharge"` volatile have their submitted action overridden with a `RechargeAction` (#104)
- Class doc comment updated: "Gen 6+/7+ defaults" clarifying which gens need to override (#49)

## [0.8.0] - 2026-03-15

### Changed

- Added `statusCuredOnly`, `selfStatusInflicted`, `selfVolatileInflicted`, `selfVolatileData`, and `typeChange` optional fields to `MoveEffectResult` — enables Gen 1 move handlers (Rest, Mist, Conversion) to return self-targeting effects and type changes (#92)
- `BattleEngine.processEffectResult()` now processes the five new `MoveEffectResult` fields: cures status without resetting stat stages, inflicts primary status on the attacker, adds volatile status to the attacker, and mutates attacker/defender types

## [0.7.2] - 2026-03-15

### Fixed

- Delegate Leech Seed drain, Curse, and Nightmare damage calculations to `GenerationRuleset` instead of using hardcoded formulas (#51, #52, #53)
- `sendOut()` now emits `slot: 0` in the `switch-in` event instead of the team roster index (#82)
- `getSideIndex()` now throws instead of silently returning `0` when an `ActivePokemon` is not found in any side (#83)
- Effectiveness and critical-hit events now emitted before the `damage` event, and fire for both direct hits and substitute hits (#81)
- Deduplicated faint events: `checkMidTurnFaints()` uses a per-turn `uid`-keyed Set to prevent double emission and double `faintCount` increment (#78)
- Turn history now records only the current turn's events (uses `eventLog.slice(turnStartIndex)` instead of `slice(-50)`) and is written on all exit paths including KO, battle end, and switch-prompt turns (#84)

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
