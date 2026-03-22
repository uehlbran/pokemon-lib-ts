---
"@pokemon-lib-ts/gen4": patch
---

Fix Magic Guard not suppressing Life Orb chip-damage. The 1.3x damage boost
from Life Orb still applies (it is computed inside calculateGen4Damage), but
the on-hit recoil (floor(maxHP/10)) is now correctly skipped when the
holder's ability is magic-guard. Also adds Magic Guard gates to Black Sludge
chip-damage and Sticky Barb chip-damage for consistency. Adds 31 cross-system
interaction regression tests covering Magic Guard + Life Orb, Klutz item
suppression, Unburden volatile, Technician 60 BP boundary, Reckless, Skill Link,
type-resist berries, Focus Sash, and Lum/Chesto Berry status cures.
