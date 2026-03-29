/**
 * Gen 1 pret overrides.
 *
 * Source authority: pret/pokered disassembly
 * Reference: references/pokered-master/pokered-master/
 */

import type { PretOverride } from "./types";

export const gen1Overrides: readonly PretOverride[] = [
  // No overrides needed for Gen 1 at this time.
  // pokered base stats, move data, and type chart all match @pkmn/data
  // for Gen 1 fields we track (power, accuracy, pp, type, priority).
];
