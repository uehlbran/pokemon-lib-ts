---
"@pokemon-lib-ts/gen9": patch
---

Add explicit canonical names to the Gen 9 public API without breaking existing imports.

The root barrel now exposes explicit `applyGen9*` low-level helpers,
explicit `handleGen9*Trigger` ability-result handlers, and
`getSupremeOverlordFloatMultiplier` alongside deprecated compatibility aliases.
The Intrepid Sword and Dauntless Shield trigger handlers now use persistent
once-per-battle flags so their behavior matches the low-level helpers after
switch-out.
