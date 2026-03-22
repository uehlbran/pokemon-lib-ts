---
"@pokemon-lib-ts/battle": minor
"@pokemon-lib-ts/gen5": patch
---

Add shouldReflectMove hook to GenerationRuleset and implement Magic Bounce in Gen 5

- GenerationRuleset.MoveSystem: new optional shouldReflectMove method
- BaseRuleset: default returns null (no reflection)
- BattleEngine: calls shouldReflectMove after accuracy check, before damage
- Gen5MagicBounce: 66 reflectable moves, Mold Breaker bypass, semi-invulnerable guard
- Gen5Ruleset: overrides shouldReflectMove to delegate to shouldReflectMoveGen5
