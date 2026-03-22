---
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
---

fix(gen5,gen6): move type resist berries from post-damage item hook to pre-damage calc

Type resist berries (Occa, Passho, Roseli, etc.) now halve super-effective damage inside
the damage calc using pokeRound(baseDamage, 2048), matching Gen 4's existing pattern.
Previously they fired via on-damage-taken (post-damage) and the damage-boost effect was
ignored by processItemResult in BattleEngine.
