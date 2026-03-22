---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
---

Delegate hazard max-layer caps to GenerationRuleset.getMaxHazardLayers() instead of hardcoding in engine. Gen 2 now correctly caps Spikes at 1 layer (per pret/pokecrystal). Gen 1 returns 1 as a safe fallback. Gen 3+ defaults (spikes=3, toxic-spikes=2, others=1) live in BaseRuleset.
