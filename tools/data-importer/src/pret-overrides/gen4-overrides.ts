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
];
