---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

Fix Prankster/Gale Wings/Triage priority boost never applied to turn order (#783)

- BaseRuleset.resolveTurnOrder now calls `on-priority-check` ability trigger to compute effective priority
- Added `priorityBoost` field to AbilityResult interface for ability handlers to return boost values
- Gen 5-8 ability handlers now return `priorityBoost` instead of relying on hardcoded values
- Gen 7 resolveTurnOrder uses `result.priorityBoost` instead of duplicated ability-ID checks
- Gen 9 ability dispatcher now routes `on-priority-check` for carry-forward abilities (Prankster, Gale Wings, Triage)
