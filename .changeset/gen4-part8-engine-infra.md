---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/battle": minor
---

Add two-turn move and gravity engine infrastructure (Part 8 Wave 1)

- Add semi-invulnerable volatile statuses (flying, underground, underwater, shadow-force-charging, charging) to core VolatileStatus type
- Add forcedMove field to ActivePokemon for two-turn move lock-in
- Add canHitSemiInvulnerable method to GenerationRuleset interface
- Add forcedMoveSet and gravitySet fields to MoveEffectResult
- Add gravity-countdown to EndOfTurnEffect union
- Engine: forced-move override in resolveTurn, getAvailableMoves lockout, semi-invulnerable miss/hit checks, volatile removal on execution turn, gravity activation/countdown/move blocking
