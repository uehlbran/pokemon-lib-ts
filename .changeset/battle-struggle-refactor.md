---
"@pokemon-lib-ts/battle": patch
---

refactor: move calculateStruggleDamage and calculateStruggleRecoil from EndOfTurnSystem to DamageSystem sub-interface — both methods are called during move execution (not end-of-turn), so DamageSystem is the correct semantic home. No runtime behavior change.
