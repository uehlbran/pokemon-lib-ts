---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

Extract the shared `pokeRound` fixed-point rounding helper to `@pokemon-lib-ts/core`
and update the Gen5-9 damage calculators to consume the shared implementation while
preserving their existing re-exported `pokeRound` symbol.
