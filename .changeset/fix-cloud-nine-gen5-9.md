---
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

Add Cloud Nine / Air Lock weather suppression for gen5-9 (#792)

**gen5-9 (patch)**: Add `isWeatherSuppressedGenN()` and `isWeatherSuppressedOnFieldGenN()` helpers and integrate into damage calc, weather damage tick, and speed calc. Matches gen3/gen4 pattern. Affected: weather power boosts, weather chip, and speed ability calc (gen5-7; gen8-9 weather-based speed not yet implemented).

Closes #792
