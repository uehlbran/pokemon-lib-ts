# Changelog

All notable changes to `@pokemon-lib-ts/gen3` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-03-16

### Added
- Initial Gen 3 (Ruby/Sapphire/Emerald) battle mechanics package
- `Gen3Ruleset` extending `BaseRuleset` with all Gen 3 overrides
- Type-based physical/special split (no per-move category until Gen 4)
- Full Gen 3 damage formula with three nested floors per pokeemerald `CalculateBaseDamage`
- 17-type chart (Steel resists Ghost/Dark; no Fairy)
- Crit rate table `[16, 8, 4, 3, 2]` with 2.0x multiplier
- Burn damage at 1/8 max HP (vs Gen 7+ default of 1/16)
- Paralysis speed penalty at 0.25x (vs Gen 7+ default of 0.5x)
- Gen 3 stat formula with IVs, EVs, and natures (±10%)
- Entry hazards: Spikes only (no Stealth Rock/Toxic Spikes until Gen 4)
- Weather system: Rain, Sun, Sandstorm (1/16 chip), Hail (1/16 chip, no Blizzard accuracy boost)
- Abilities: Levitate, Wonder Guard, Huge Power/Pure Power, Thick Fat, Guts, Hustle, Flash Fire, Water/Volt Absorb, Intimidate, Natural Cure, Drizzle/Drought/Sand Stream, and more
- Held items: Leftovers, Sitrus Berry (flat 30 HP), Oran Berry, Lum Berry, Choice Band, type-boosting items, Focus Band (not consumed), King's Rock, Shell Bell, status berries
- Move effects: weather moves (5 turns), Spikes, Rapid Spin, Protect/Detect, Knock Off, recoil/drain, status infliction with type immunities, stat changes
- Complete per-gen data: 386 Pokémon, ~354 moves, 76 abilities, items, 25 natures, 17×17 type chart
- Integration tests with BattleEngine using seeded PRNG for deterministic battles
- `Quick Claw` pre-roll via `getQuickClawActivated()` hook (overriding new `BaseRuleset` hook)
- `Thick Fat` correctly halves attacker stat before formula per pokeemerald source
