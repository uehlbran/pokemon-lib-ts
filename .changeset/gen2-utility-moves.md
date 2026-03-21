---
"@pokemon-lib-ts/gen2": minor
"@pokemon-lib-ts/battle": patch
---

feat(gen2): Encore/Disable, Baton Pass, Return/Frustration

- Encore handler forces target to repeat last move (2-6 turns) with failure conditions
- Disable handler prevents target from using last-used move (1-7 turns) with failure conditions
- Encore enforcement in engine getAvailableMoves
- Baton Pass volatile preservation on switch-out
- batonPass flag on MoveEffectResult
- Return/Frustration dynamic base power from friendship
