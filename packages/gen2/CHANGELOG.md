# Changelog

All notable changes to `@pokemon-lib-ts/gen2` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] - 2026-03-15

### Fixed
- Razor Wind removed from high-crit moves list (it is not a high-crit move in Gen 2)
- Metal Powder correctly applies only to physical Defense, not SpDefense (per pret/pokecrystal)

## [0.2.1] - 2026-03-15

### Fixed
- End-of-turn order corrected to match pret/pokecrystal ground truth: leftovers now fires before status damage, weather damage moved after curse (PR #27)
- Electric paralysis immunity removed — Electric types are NOT immune to paralysis in Gen 2 (introduced in Gen 6) (PR #27)
- Sleep duration range corrected from 1-6 to 1-7 turns (Showdown-verified) (PR #27)
- Type chart data: Water→Steel and Electric→Steel corrected from 1x to 0.5x (PR #27)
- Spec document (`specs/battle/03-gen2.md`): 32 issues corrected including stat formula, HP constant, damage calc, crit thresholds, held items, status conditions, move mechanics, and end-of-turn order (PR #27)

## [0.2.0] - 2026-03-15

### Added
- New public API exports: `calculateGen2StatusDamage`, `canInflictGen2Status` from `Gen2Status` (PR #25)

### Fixed
- Damage formula step order: item modifier before [1,997] clamp, +2 constant, then weather/STAB/type (PR #23)
- Stat overflow handling: when attack or defense ≥ 256, both wrap via `floor(x/4) % 256` (PR #23)
- Crit stat interaction: if atkStage ≤ defStage, ignore all boosts + burn; if atkStage > defStage, keep all boosts (PR #23)
- Effective stats clamped to [1, 999] (PR #23)
- Confusion self-hit: removed random factor (Showdown: `noDamageVariance`) (PR #23)
- Accuracy: converted to 0-255 scale with Gen 2 lookup tables; 255 never misses (PR #23)
- Secondary effect 1/256 failure: now only applies to secondary effects of damaging moves, not primary effects of status moves (PR #23)
- `processSleepTurn` now returns `true` on wake turn — Gen 2 can act on the turn they wake up (was returning `false`, Gen 1 behavior) (PR #24)

## [0.1.2] - 2026-03-14

### Fixed
- Freeze thaw rate corrected to 25/256 (~9.8%) per turn (was 20% — Showdown-verified) (PR #18)

## [0.1.1] - 2026-03-14

### Fixed
- Implemented `applyWeatherEffects`, `applyHeldItemEffect`, `canUseItem`,
  `processHeldItem` to satisfy updated `GenerationRuleset` interface methods added
  in the status-delegation refactor (PR #14)

## [0.1.0] - 2025-11-15

### Added
- Initial release: Gen 2 ruleset (`Gen2Ruleset`) implementing `GenerationRuleset`
- Complete Gen 2 data: 251 Pokémon, 251 moves, 17-type chart (Dark + Steel added)
- Physical/Special split determined by type (not move category)
- Held items system with `applyGen2HeldItem`
- Weather mechanics (Sunny Day, Rain Dance, Sandstorm)
- Dark and Steel type immunities
- Separate SpAttack and SpDefense stats
- Freeze thaw mechanic (unlike permanent freeze in Gen 1)
- Entry hazards: Spikes (1 layer, 1/8 HP)
- 266 tests
