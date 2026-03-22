---
"@pokemon-lib-ts/gen7": patch
---

fix(gen7): Wave 7A review fixes -- Normalize boost, Prism Armor Mold Breaker, Magic Room, test quality

- Normalize now applies 1.2x boost unconditionally for all normalized moves including already-Normal moves
- Reckless now includes crash damage moves (Jump Kick, High Jump Kick)  
- Prism Armor no longer behind Mold Breaker gate (not bypassed per Showdown)
- Magic Room now suppresses all held items via applyGen7HeldItem gateway
