---
"@pokemon-lib-ts/gen9": minor
---

Narrow the Gen 9 package root to an explicit canonical public API.

The root barrel now exposes explicit `applyGen9*` low-level helpers,
explicit `handleGen9*Trigger` ability-result handlers, and only the fixed-point
`getSupremeOverlordModifier` helper. Deprecated ambiguous aliases and the
floating-point Supreme Overlord helper remain available only from their source
modules, not from the package root. The Intrepid Sword and Dauntless Shield
trigger handlers also now use persistent once-per-battle flags so their
behavior matches the low-level helpers after switch-out.
