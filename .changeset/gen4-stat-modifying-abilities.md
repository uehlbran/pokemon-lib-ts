---
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/core": patch
---

feat(gen4): stat-modifying abilities (Solar Power, Flower Gift, Scrappy, Normalize, Slow Start, Download)

- Solar Power: 1.5x SpAtk in sun (damage calc)
- Flower Gift: 1.5x Atk and 1.5x SpDef in sun (damage calc)
- Scrappy: Normal/Fighting moves hit Ghost neutrally (damage calc)
- Normalize: all moves become Normal type (damage calc)
- Slow Start: halve Attack and Speed for 5 turns (damage calc + speed calc)
- Download: compare foe Def/SpDef on switch-in, raise Atk or SpAtk (abilities)
- Added "slow-start" to VolatileStatus union in core
