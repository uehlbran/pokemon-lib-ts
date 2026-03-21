---
"@pokemon-lib-ts/gen4": minor
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/core": patch
---

Gen 4 Wave 6A: utility moves, combat items, speed/berry mechanics

Move effects: Magnet Rise (5-turn Ground immunity), Acupressure (+2 random stat),
Power Swap, Guard Swap, Heart Swap (stat stage swapping), Curse (Ghost-type fix
with 1/2 HP cost + curse volatile), binding moves (Bind, Wrap, Fire Spin, Clamp,
Whirlpool, Sand Tomb, Magma Storm).

Items: Sticky Barb (1/8 HP EoT damage), Berry Juice (heal 20 HP at <=50%),
Grip Claw (binding moves last 7 turns).

Abilities: Gluttony (berry threshold infrastructure), Unburden (2x Speed after
item consumed/lost, triggers on berry consumption, Knock Off, and Trick/Switcheroo).

Infrastructure: Magnet Rise EoT countdown, "magnet-rise-countdown" EndOfTurnEffect,
Magnet Rise Ground immunity in damage calc, "unburden" volatile status.
