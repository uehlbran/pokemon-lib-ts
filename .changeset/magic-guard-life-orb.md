---
"@pokemon-lib-ts/gen4": patch
---

Fix Magic Guard not suppressing Life Orb chip-damage. The 1.3x damage boost
from Life Orb still applies (it is computed inside calculateGen4Damage), but
the end-of-turn recoil (floor(maxHP/10)) is now correctly skipped when the
attacker's ability is magic-guard. Adds 31 cross-system interaction regression
tests covering Magic Guard, Klutz, Unburden, Technician, Reckless, Skill Link,
type-resist berries, No Guard, Serene Grace, Choice items, Focus Sash, Sniper,
Adaptability, Iron Fist, and Lum/Chesto Berry status cure coverage.
