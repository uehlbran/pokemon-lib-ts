---
"@pokemon-lib-ts/gen2": patch
---

Fix incorrect move priority values for Roar and Whirlwind in Gen 2 data. These were carrying Gen 3+ Showdown priority values (-6) instead of the correct Gen 2 value (-1). Sources: Showdown data/mods/gen2/moves.ts and pret/pokecrystal effects_priorities.asm (EFFECT_FORCE_SWITCH go-last mechanic).
