---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen7": minor
---

feat(gen7): implement Ultra Burst gimmick for Necrozma

- Adds `"ultraburst"` to `BattleGimmickType` union and `BATTLE_GIMMICK_IDS`
- Adds `UltraBurstEvent` to the `BattleEvent` union
- Adds `ultraBurst?: boolean` to `MoveAction` and `isUltraBurst` to `ActivePokemon`
- Adds three Necrozma formes to Gen 7 data (Dusk-Mane, Dawn-Wings, Ultra Necrozma)
- Exports new `Gen7UltraBurst` class implementing the `BattleGimmick` interface
- Adds Neuroforce ability modifier (1.25x on super-effective hits) to Gen 7 damage calc
- Supports simultaneous Ultra Burst + Z-Move activation in the same turn
