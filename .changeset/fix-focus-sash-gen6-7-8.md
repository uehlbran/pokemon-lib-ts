---
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
---

Fix Focus Sash dead code in Gen 6/7/8: move from handleOnDamageTaken (post-damage, never activates) to capLethalDamage (pre-damage hook). Add Klutz/Embargo suppression. Closes #784.
