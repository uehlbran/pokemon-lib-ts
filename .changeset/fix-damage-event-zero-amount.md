---
"@pokemon-lib-ts/battle": patch
---

Fix engine emitting DamageEvent with amount=0 for type-immune attacks (#1161).

When calculateDamage returns {damage: 0, effectiveness: 0}, the engine now emits
"It doesn't affect [defender]!" and returns early — no DamageEvent, no effectiveness
event. This applies to both executeMove (primary path) and executeMoveById (recursive
Mirror Move / Metronome chains). The smoke runner invariant is restored to reject
amount <= 0.
