# Changelog

All notable changes to `@pokemon-lib-ts/battle` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
