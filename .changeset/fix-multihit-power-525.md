---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen2": patch
---

Add perHitDamage field to MoveEffectResult; implement for Triple Kick (escalating power 10/20/30) and Beat Up (per-member base Attack) in Gen 2 so each hit uses the correct damage (closes #525)
