---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen4": patch
---

Fix Present heal case (#526) and Wish delayed healing (#540).

- Add `wishSet` field to `MoveEffectResult`; engine processes it in `processEffectResult` to schedule `side.wish`
- Gen2: fix Present handler to use `defenderHealAmount` for the 20% heal-the-target outcome
- Gen4: update both Wish handlers to return `wishSet: { healAmount: floor(maxHp / 2) }`
