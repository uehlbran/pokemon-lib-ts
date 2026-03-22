---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
---

Fix Focus Sash activation (use capLethalDamage pre-damage hook with consumedItem support) and Leftovers double-activation (orb EOT phases now filter by held item) (closes #551, closes #600)
