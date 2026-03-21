---
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/battle": minor
---

Fix 6 engine-dependent Gen 4 bugs: Pressure PP cost, Gastro Acid ability restoration,
Knock Off itemKnockedOff flag with Trick/Switcheroo guard, Pain Split mutual HP mutation,
and Sucker Punch failure against status moves. Battle package adds suppressedAbility,
itemKnockedOff to ActivePokemon and defenderSelectedMove to MoveEffectContext.
