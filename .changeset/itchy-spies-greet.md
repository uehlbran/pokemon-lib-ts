---
"@pokemon-lib-ts/gen1": patch
---

Fix incorrect move priority values for Counter, Bide, Roar, and Whirlwind in Gen 1 data. These were carrying Gen 3+ Showdown values instead of the correct Gen 1 cartridge values (Counter: -5→-1, Bide: 1→0, Roar: -6→0, Whirlwind: -6→0). Source: pret/pokered data/moves/moves.asm.
