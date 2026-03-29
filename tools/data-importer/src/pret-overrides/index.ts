/**
 * Pret override system public API.
 *
 * Usage in import-gen.ts:
 *   import { getOverridesForGen, applyMoveOverrides, applyPokemonOverrides } from "./pret-overrides/index";
 */

export {
  applyMoveOverrides,
  applyPokemonOverrides,
  type ImportedMove,
  type ImportedPokemon,
  type ImportedStats,
} from "./apply-overrides";
export { gen1Overrides } from "./gen1-overrides";
export { gen2Overrides } from "./gen2-overrides";
export { gen3Overrides } from "./gen3-overrides";
export { gen4Overrides } from "./gen4-overrides";
export type { MoveOverride, PokemonOverride, PretOverride } from "./types";

import { gen1Overrides } from "./gen1-overrides";
import { gen2Overrides } from "./gen2-overrides";
import { gen3Overrides } from "./gen3-overrides";
import { gen4Overrides } from "./gen4-overrides";
import type { PretOverride } from "./types";

const OVERRIDES_BY_GEN: Record<number, readonly PretOverride[]> = {
  1: gen1Overrides,
  2: gen2Overrides,
  3: gen3Overrides,
  4: gen4Overrides,
};

/** Returns the override list for a given generation, or empty array for Gen 5+. */
export function getOverridesForGen(gen: number): readonly PretOverride[] {
  return OVERRIDES_BY_GEN[gen] ?? [];
}
