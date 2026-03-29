/**
 * Gen 1 pret overrides.
 *
 * Source authority: pret/pokered disassembly
 * Reference: references/pokered-master/pokered-master/
 */

import type { PretOverride } from "./types";

export const gen1Overrides: readonly PretOverride[] = [
  // Charizard Gen 1 unified Special stat
  // @pkmn/data returns spa=109 for Gen 1 (the Gen 2+ SpAtk value after the Special split).
  // pret/pokered shows the true cartridge value: db 78, 84, 78, 100, 85 (hp, atk, def, spd, spc=85)
  {
    target: "pokemon",
    name: "charizard",
    field: "baseStats.spAttack",
    value: 85,
    showdownValue: 109,
    source:
      "pret/pokered data/pokemon/base_stats/charizard.asm — db 78, 84, 78, 100, 85 (hp, atk, def, spd, spc=85)",
  },
  {
    target: "pokemon",
    name: "charizard",
    field: "baseStats.spDefense",
    value: 85,
    showdownValue: 109,
    source:
      "pret/pokered data/pokemon/base_stats/charizard.asm — db 78, 84, 78, 100, 85 (hp, atk, def, spd, spc=85)",
  },
];
