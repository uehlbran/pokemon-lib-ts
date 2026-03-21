---
"@pokemon-lib-ts/gen4": minor
---

feat(gen4): two-turn moves + gravity handlers (Part 8)

- Implement two-turn move charge handler (Fly, Dig, Dive, Bounce, Shadow Force, SolarBeam)
  with forcedMoveSet, volatile status mapping, and charge-turn messages
- SolarBeam in sun skips charge; Power Herb skips charge and consumes item
- Implement canHitSemiInvulnerable: Thunder/Gust/Twister/Sky Uppercut hit flying,
  Earthquake/Magnitude/Fissure hit underground, Surf/Whirlpool hit underwater,
  nothing hits shadow-force-charging, all moves hit charging (non-invulnerable)
- Implement Gravity move effect (gravitySet flag)
- Gravity accuracy boost: multiply accuracy by 5/3
- Gravity type immunity suppression: Levitate no longer blocks Ground in damage calc,
  Flying-type loses Ground immunity in damage calc
- Gravity + Arena Trap: grounded Pokemon can be trapped
- Add gravity-countdown to end-of-turn order
