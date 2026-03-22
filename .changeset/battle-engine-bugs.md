---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen5": patch
---

fix(battle): Pressure field targets, Uproar Soundproof, Sturdy survival, future attack recalc, ItemContext opponent

- Exclude foe-field and entire-field moves from Pressure PP cost (#512)
- Uproar wake-up respects Soundproof ability (#514)
- Future attack damage recalculation for Gen 5+ (#505)
- Pass opponent in ItemContext for on-damage-taken and on-hit triggers (#519)
- Sturdy survival via pre-damage capLethalDamage hook (#500)
