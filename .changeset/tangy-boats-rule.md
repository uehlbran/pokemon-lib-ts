---
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

fix(gen3-9): implement Facade power doubling when user has a status condition

Facade now correctly doubles its base power (70 → 140) when the user has burn, paralysis, poison, or badly-poisoned. Sleep does not trigger the doubling. In Gen 6+, the existing burn bypass ensures Facade+burn deals full doubled damage.

Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_FacadeDoubleDmg
Source: Showdown data/moves.ts facade.onBasePower
