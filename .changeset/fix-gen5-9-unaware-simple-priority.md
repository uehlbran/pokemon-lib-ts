---
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

fix(gen5-9): fix Unaware/Simple priority and Mold Breaker-family bypass directionality

Previously, Simple's stage-doubling was checked before Unaware's stage-zeroing, causing
Simple to incorrectly double stages (+2→+4) when the opponent had Unaware. This patch
also corrects Mold Breaker / Teravolt / Turboblaze bypass directionality: only the active
attacker's Mold Breaker suppresses the target's breakable abilities — a defending Mold
Breaker does not suppress the attacker's abilities.
Closes #757.
