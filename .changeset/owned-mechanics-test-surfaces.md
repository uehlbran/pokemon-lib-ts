---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen7": patch
---

Expose owned testing/reference surfaces for mechanic constants and weather-derived expectations.

- `@pokemon-lib-ts/core`: add shared mechanic multipliers plus missing shared reference ids for heavy rain, bare terrain ids, Salt Cure, and Sky Uppercut.
- `@pokemon-lib-ts/gen3`, `@pokemon-lib-ts/gen4`, `@pokemon-lib-ts/gen7`: export generation-owned weather damage multiplier surfaces so tests and tooling can stop duplicating rain/sun mechanic literals.
