---
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
---

Fix move priorities to raw pret/cartridge values for Gen 2-4

**Gen 2**: Apply full pokecrystal priority scale (BASE_PRIORITY=1).
- Normal moves: 0 → 1 (all 256 normal moves)
- Quick Attack, Mach Punch, Extreme Speed: 1 → 2 (EFFECT_QUICK_ATTACK priority 2)
- Roar, Whirlwind, Counter, Mirror Coat, Vital Throw: -1 → 0 (priority 0 on 1-based scale)
- Protect, Detect, Endure: unchanged at 3

**Gen 3**: Endure priority 4 → 3 (pokeemerald `src/data/battle_moves.h`)

**Gen 4**: Endure priority 4 → 3 (pokeplatinum `res/battle/moves/endure/data.json`)

Source: pret always wins for Gen 1-4 per project authority rules.
