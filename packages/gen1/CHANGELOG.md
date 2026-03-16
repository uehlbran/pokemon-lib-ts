# Changelog

All notable changes to `@pokemon-lib-ts/gen1` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.3] - 2026-03-15

### Added

- Tier 1 move handlers: Splash (message only), Super Fang (halves target HP, min 1), Psywave (random damage 1–floor(level×1.5)−1 per pret/pokered), Teleport (fails with message in trainer battles) (#92)
- Tier 2 move handlers: Rest (cures status + heals to full + applies 2-turn sleep; fails at full HP with no status), Mist (permanent until switch/Haze; blocks opponent stat drops), Conversion (copies opponent's types — Gen 1 mechanic per pret/pokered) (#92)
- Mist enforcement in stat-change path: foe-targeted stat drops are blocked when the defending Pokémon has Mist active (#92)

### Fixed

- Psywave damage range corrected to `[1, floor(level×1.5)−1]` per pret/pokered (was off-by-one) (#92)
- Mist duration corrected to permanent (no turn counter) per pret/pokered — 5-turn timer is a Gen 2+ mechanic (#92)

## [0.5.1] - 2026-03-15

### Fixed
- Non-immune moves now correctly deal minimum 1 damage when the formula rounds to 0 (per pret/pokered)
- Haze now correctly clears all volatile statuses (leech-seed, focus-energy, confusion, disable, etc.) for both Pokemon via the engine's event path

## [0.3.0] - 2026-03-15

### Fixed
- Self-Destruct handler: move ID lookup was `"selfdestruct"` but data uses `"self-destruct"` — user now correctly faints after use
- Counter: now restricted to Normal and Fighting type moves only (uses new `lastDamageType` field from `@pokemon-lib-ts/battle@0.5.0`)
- Fixed-damage, level-damage, OHKO, and Counter moves now propagate their `type` into `customDamage` so `lastDamageType` is tracked correctly (Counter countability requires Normal/Fighting last hit)

### Breaking Change
- Upgrading to `@pokemon-lib-ts/battle@0.5.0` adds a required `lastDamageType: PokemonType | null` field to `ActivePokemon`; any inline `ActivePokemon` literals in tests or consumers must be updated

## [0.2.4] - 2026-03-15

### Fixed
- Focus Energy crit algorithm: rewrite to exact Showdown steps (crit/2, not crit/4; non-FE ×2 step differs for high-crit+FE combos)
- Damage formula: add 997 cap before +2 additive constant
- Damage formula: zero-damage check after type effectiveness now treats result as miss (removes incorrect `Math.max(1,…)` floor)
- Stat overflow bug: attack/defense ≥ 256 → both divided by 4 mod 256
- Explosion/Self-Destruct: halve defender's Defense in damage calc
- Reflect/Light Screen: permanent (`turnsLeft: 9999`) not 5-turn countdown
- 1/256 miss exemption: self-targeting moves get +1 accuracy threshold (no miss)
- Roar/Whirlwind: explicit "But it failed!" message (N/A in Gen 1)
- Trapping duration: weighted [2,2,2,3,3,3,4,5] instead of uniform int(2,5)
- Confusion self-hit: proper formula (40 BP, Atk/Def with stages, burn penalty applied)

## [0.2.3] - 2026-03-14

### Fixed
- Burn damage corrected to 1/16 max HP per turn (was 1/8 — Showdown-verified) (this PR)

## [0.2.2] - 2026-03-14

### Fixed
- Implemented `applyStatusDamage`, `checkFreezeThaw`, `rollSleepTurns`,
  `rollConfusionSelfHit`, and `processSleepTurn` to satisfy updated `GenerationRuleset`
  interface after status mechanics were delegated from the engine (PR #13)
- `critRate` renamed to `critStageBonus` on move effects (PR #13)

## [0.2.1] - 2025-11-15

### Fixed
- Stat formula: Gen 1 uses `floor((2 * base + iv + floor(ev/4)) * level / 100) + 5`
  (was applying wrong EV divisor) (PR #6)
- Damage calc: critical hits ignore stat stage modifiers in Gen 1 (PR #6)
- Burn: halves attack in damage calc (was not applied) (PR #6)
- Accuracy stages: correct Gen 1 multiplier table (PR #6)

## [0.2.0] - 2025-11-15

### Changed
- Renamed npm scope `@pokemon-lib` → `@pokemon-lib-ts` (PR #8)
- Updated all cross-package peer dependency references

## [0.1.1] - 2025-10-15

### Fixed
- Charizard base stats corrected (was using wrong data) (PR #1)
- 257 tests added, 80%+ coverage enforced (PR #1)

## [0.1.0] - 2025-10-01

### Added
- Initial release: Gen 1 ruleset (`Gen1Ruleset`) implementing `GenerationRuleset`
- Complete Gen 1 data: 151 Pokémon, 165 moves, 15-type chart
- Gen 1-specific damage formula, stat formula, type chart
- No abilities, no held items, no weather
