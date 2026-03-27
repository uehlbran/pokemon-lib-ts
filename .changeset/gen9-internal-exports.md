---
"@pokemon-lib-ts/gen9": minor
---

Split the Gen 9 package exports into explicit public and internal entrypoints.

- Narrow the root `@pokemon-lib-ts/gen9` barrel to the stable consumer-facing API:
  `Gen9Ruleset`, `Gen9Terastallization`, `calculateTeraStab`, and `createGen9DataManager`
- Add `@pokemon-lib-ts/gen9/data` exports for `GEN9_*_IDS`, `GEN9_TYPE_CHART`,
  `GEN9_TYPES`, and `createGen9DataManager`
- Add `@pokemon-lib-ts/gen9/internal` for the broader helper/testing surface
- Update internal tests and battle integration tests to consume the new `data`
  and `internal` entrypoints instead of the broad root barrel
