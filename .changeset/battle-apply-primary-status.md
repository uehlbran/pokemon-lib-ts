---
"@pokemon-lib-ts/battle": patch
---

Fix missing companion volatile initialization (toxic-counter, sleep-counter, just-frozen) in sendOut hazard and processItemResult status infliction paths by centralizing all status infliction through a new applyPrimaryStatus() helper
