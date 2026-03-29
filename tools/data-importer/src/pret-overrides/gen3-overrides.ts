/**
 * Gen 3 pret overrides.
 *
 * Source authority: pret/pokeemerald decomp
 * Reference: references/pokeemerald-master/pokeemerald-master/
 */

import type { PretOverride } from "./types";

export const gen3Overrides: readonly PretOverride[] = [
  // Endure: @pkmn/data reports priority 4, pokeemerald says 3
  {
    target: "move",
    moveId: "endure",
    field: "priority",
    value: 3,
    showdownValue: 4,
    source: "pret/pokeemerald src/data/battle_moves.h — endure: .priority = 3",
  },

  // Curse type: pokeemerald uses TYPE_MYSTERY (value 9), not TYPE_GHOST
  {
    target: "move",
    moveId: "curse",
    field: "type",
    value: "unknown",
    showdownValue: "ghost",
    source:
      "pret/pokeemerald include/constants/pokemon.h — TYPE_MYSTERY = 9; src/data/battle_moves.h — Curse .type = TYPE_MYSTERY",
  },
];
