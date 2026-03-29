---
"@pokemon-lib-ts/gen7": patch
---

Fix Z-Move power calculation: add per-move overrides for 14 moves with explicit Showdown zMove.basePower entries, and fix multi-hit ×3 multiplier to only apply to variable multi-hit moves (min ≠ max range), not fixed multi-hit (scalar count). Discovered via gimmicks oracle.
