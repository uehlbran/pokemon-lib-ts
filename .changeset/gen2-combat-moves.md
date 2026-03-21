---
"@pokemon-lib-ts/gen2": minor
"@pokemon-lib-ts/battle": minor
---

# feat(gen2): Counter/Mirror Coat, Hidden Power, Whirlwind/Roar, Hyper Beam recharge

Gen 2 combat move mechanics:
- Counter reflects 2x physical damage; Mirror Coat reflects 2x special damage
- Hidden Power type/power calculated from DVs (pret/pokecrystal formula)
- Whirlwind/Roar phazing via new forcedSwitch field on MoveEffectResult
- Hyper Beam skips recharge when target faints
- New export: calculateGen2HiddenPower
