---
"@pokemon-lib-ts/gen2": patch
---

Add missing mechanic tests for Gen 2 (issues #360-#365, #367-#368, #373): calculateBindDamage, processPerishSong countdown/faint, shiny DV determination formula, Pursuit double power on switch-out, Thunder accuracy bypass in rain, SolarBeam power halving in rain/sand, OHKO level-based accuracy formula, Moonlight/Morning Sun/Synthesis weather-dependent healing, Bright Powder accuracy reduction, and Hidden Power physical-type category path. Also adds the `checkIsShinyByDVs` helper function to `Gen2StatCalc.ts`.
