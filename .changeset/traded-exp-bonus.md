---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
---

# Traded EXP bonus

Add `isTradedPokemon` and `isInternationalTrade` to `ExpContext`; apply 1.5×/1.7× EXP bonus for traded Pokémon per gen mechanics (Gen 1–2: 1.5× only, Gen 3+: 1.5× same-language or 1.7× international).
