---
"@pokemon-lib-ts/gen6": minor
---

feat(gen6): Wave 2 — Gen6Ruleset core overrides

Expands Gen6Ruleset with all BaseRuleset overrides for Gen 6 mechanics:
- capLethalDamage (Sturdy at full HP → survive at 1 HP)
- canHitSemiInvulnerable (adds Thousand Arrows for flying targets)
- rollCritical (Battle Armor / Shell Armor immunity)
- getEffectiveSpeed (paralysis 0.25x, weather abilities, items, Simple, Quick Feet, Unburden)
- resolveTurnOrder (weather context, Tailwind, Trick Room, Quick Claw hook)
- hasTerrain (true for Gen 6+)
- calculateExpGain (Gen 5/6 sqrt-based EXP formula)
- getEndOfTurnOrder (adds grassy-terrain-heal)

Includes new test files: ruleset.test.ts, status.test.ts, exp-formula.test.ts
