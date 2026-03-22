---
"@pokemon-lib-ts/gen6": patch
---

Fix Eviolite removable by Knock Off (endsWith('ite') false positive); type-boost items use pokeRound instead of Math.floor for 4915/4096 modifier (closes #610, closes #611)
