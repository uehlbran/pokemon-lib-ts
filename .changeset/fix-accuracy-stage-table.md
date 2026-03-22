---
"@pokemon-lib-ts/core": patch
---

Fix calculateAccuracy: use exact pokeemerald sAccuracyStageRatios ratio table instead of simplified formula, correcting stages -4 (was 42, now 43) and -5 (was 37, now 36)
