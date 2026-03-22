---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
---

Fix pulse flag in move data for Gen 3-6 (Mega Launcher now works correctly); fix perHitDamage RNG precomputation in Gen 2 to only roll for hits that actually land; add perHitDamageFn to MoveEffectResult for lazy per-hit damage computation
