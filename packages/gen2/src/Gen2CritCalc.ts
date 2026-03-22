import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData, SeededRandom } from "@pokemon-lib-ts/core";

/**
 * Gen 2 critical hit rate table by stage.
 *
 * | Stage | Rate     |
 * |-------|----------|
 * | 0     | 17/256   |
 * | 1     | 32/256   |
 * | 2     | 64/256   |
 * | 3     | 85/256   |
 * | 4+    | 128/256  |
 */
export const GEN2_CRIT_RATES: readonly number[] = [
  17 / 256,
  32 / 256,
  64 / 256,
  85 / 256,
  128 / 256,
];

/**
 * Moves with a high critical hit ratio in Gen 2.
 * These add +1 to the crit stage.
 * Source: pret/pokecrystal — high-crit moves only increment stage once
 */
const HIGH_CRIT_MOVES: readonly string[] = [
  "slash",
  "karate-chop",
  "razor-leaf",
  "crabhammer",
  "cross-chop",
  "aeroblast",
  "razor-wind",
];

/**
 * Determine if a move is a high critical hit ratio move in Gen 2.
 */
function isHighCritMove(move: MoveData): boolean {
  return HIGH_CRIT_MOVES.includes(move.id);
}

/**
 * Calculate the critical hit stage for a Gen 2 attack.
 *
 * Modifiers that add stages (they stack):
 * - move.critRatio: added directly (e.g., Razor Wind critRatio: 2 from data)
 * - High crit moves (Slash, Cross Chop, etc.): +1 (via hardcoded list, for moves without critRatio)
 * - Focus Energy: +1 (FIXED in Gen 2 — not bugged like Gen 1)
 * - Scope Lens item: +1
 * - Stick (Farfetch'd only): +2
 * - Lucky Punch (Chansey only): +2
 *
 * The stage is clamped to [0, 4] (index into GEN2_CRIT_RATES).
 *
 * Source: gen2-ground-truth.md §4 — Crit Stage Sources table
 * Source: pret/pokecrystal effect_commands.asm — BattleCommand_RazorWind sets crit stage
 *
 * @param attacker - The active attacking Pokemon
 * @param move - The move being used
 * @returns The crit stage (0-4)
 */
export function getGen2CritStage(attacker: ActivePokemon, move: MoveData): number {
  let stage = 0;

  // Move-declared crit ratio (e.g., Razor Wind critRatio: 2)
  // Source: pret/pokecrystal effect_commands.asm:1182-1184 — BattleCommand_RazorWind
  if (move.critRatio && move.critRatio > 0) {
    stage += move.critRatio;
  } else if (isHighCritMove(move)) {
    // Fallback: hardcoded high crit move list for moves without critRatio in data
    // Source: pret/pokecrystal — high-crit moves only increment stage once
    stage += 1;
  }

  // Focus Energy: +1 (fixed in Gen 2)
  if (attacker.volatileStatuses.has("focus-energy")) {
    stage += 1;
  }

  // Scope Lens held item: +1
  // Source: gen2-ground-truth.md §4 — Crit Stage Sources
  if (attacker.pokemon.heldItem === "scope-lens") {
    stage += 1;
  }

  // Stick (Farfetch'd #83 only): +2
  // Source: gen2-ground-truth.md §4 — Crit Stage Sources
  if (attacker.pokemon.heldItem === "stick" && attacker.pokemon.speciesId === 83) {
    stage += 2;
  }

  // Lucky Punch (Chansey #113 only): +2
  // Source: gen2-ground-truth.md §4 — Crit Stage Sources
  if (attacker.pokemon.heldItem === "lucky-punch" && attacker.pokemon.speciesId === 113) {
    stage += 2;
  }

  // Clamp to max stage
  return Math.min(stage, GEN2_CRIT_RATES.length - 1);
}

/**
 * Roll for a critical hit using Gen 2 mechanics.
 *
 * Uses the stage-based crit rate table. The RNG generates a value
 * and compares against the crit rate for the calculated stage.
 *
 * @param attacker - The active attacking Pokemon
 * @param move - The move being used
 * @param rng - Seeded random number generator
 * @returns true if the move crits
 */
export function rollGen2Critical(
  attacker: ActivePokemon,
  move: MoveData,
  rng: SeededRandom,
): boolean {
  const stage = getGen2CritStage(attacker, move);
  const critRate = GEN2_CRIT_RATES[stage] as number;
  return rng.chance(critRate);
}
