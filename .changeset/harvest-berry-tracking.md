---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen5": patch
---

fix(gen5): track consumed berries for Harvest ability via harvest-berry volatile

When a berry is consumed in battle, the engine now sets a "harvest-berry" volatile
on the consuming Pokemon, recording which berry was consumed. This allows the
Harvest ability to read the volatile and restore the berry at end of turn.
Previously, the volatile was never set, so Harvest always returned NO_EFFECT.
