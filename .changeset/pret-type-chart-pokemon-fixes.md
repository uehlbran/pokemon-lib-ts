---
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
---

Fix Gen 1-3 data to match pret/cartridge-accurate values.

**Gen 1**:
- Struggle: pp 1 → 10, accuracy null → 100 (pokered data/moves/moves.asm line 178)
- Charizard: spAttack/spDefense 109 → 85 (pokered data/pokemon/base_stats/charizard.asm — Gen 1 unified Special=85; @pkmn/data incorrectly returns the Gen 2+ SpAtk split value)

**Gen 2**:
- Water → Steel: 0.5 → 1 (neutral). The Water resistance was NOT in Gen 2; absent from pokecrystal data/types/type_matchups.asm.
- Electric → Steel: 0.5 → 1 (neutral). Same — Electric resistance was NOT in Gen 2.

**Gen 3**:
- Water → Steel: 0.5 → 1 (neutral). Absent from pokeemerald src/battle_main.c gTypeEffectiveness[].
- Electric → Steel: 0.5 → 1 (neutral). Same.

Both Steel resistances to Water and Electric were introduced in Gen 4, not Gen 3.

Source: pret disassemblies are authoritative for Gen 1-3; decompiled sources where available for Gen 4.
