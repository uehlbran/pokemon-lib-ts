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
];
