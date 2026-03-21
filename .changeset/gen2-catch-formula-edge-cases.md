---
"@pokemon-lib-ts/gen2": patch
---

Fix two edge-case bugs in Gen 2 BallCalc catch formula: hpFactor now correctly clamps to 1 at full HP (not floor(modifiedRate/maxHp2)), and catch roll uses <= comparison matching cartridge cp/jr z behavior.
