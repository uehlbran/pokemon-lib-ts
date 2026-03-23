---
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

fix(gen5-9): Unaware now correctly takes priority over Simple in getEffectiveStatStage

Previously, Simple's stage-doubling was checked before Unaware's stage-zeroing, causing
Simple to incorrectly double stages (+2→+4) even when the opponent had Unaware. Unaware
should always win — it sets stages to 0 independently of any ability the attacker has.
Closes #757.
