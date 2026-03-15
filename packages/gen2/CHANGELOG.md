# Changelog

All notable changes to `@pokemon-lib-ts/gen2` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-03-14

### Fixed
- Freeze thaw rate corrected to 25/256 (~9.8%) per turn (was 20% — Showdown-verified) (this PR)

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
