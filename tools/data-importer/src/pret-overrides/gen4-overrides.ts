/**
 * Gen 4 pret overrides.
 *
 * Source authority: pret/pokeplatinum decomp
 * Reference: references/pokeplatinum-main/pokeplatinum-main/
 */

import type { PretOverride } from "./types";

export const gen4Overrides: readonly PretOverride[] = [
  // Endure: @pkmn/data reports priority 4, pokeplatinum says 3
  {
    target: "move",
    moveId: "endure",
    field: "priority",
    value: 3,
    showdownValue: 4,
    source: "pret/pokeplatinum res/battle/moves/endure/data.json — priority: 3",
  },

  // Curse type: pokeplatinum uses TYPE_MYSTERY (value 9), not TYPE_GHOST
  {
    target: "move",
    moveId: "curse",
    field: "type",
    value: "unknown",
    showdownValue: "ghost",
    source:
      "pret/pokeplatinum include/constants/pokemon.h — TYPE_MYSTERY = 9; move Curse uses TYPE_MYSTERY not TYPE_GHOST",
  },
];
