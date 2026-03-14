import type { ActivePokemon } from "@pokemon-lib/battle";
import type { MoveData, PokemonSpeciesData } from "@pokemon-lib/core";
import type { SeededRandom } from "@pokemon-lib/core";

/**
 * Moves with a high critical hit ratio in Gen 1.
 * These moves multiply the base speed by 8 before the crit rate calculation.
 */
const HIGH_CRIT_MOVES: readonly string[] = ["slash", "karate-chop", "razor-leaf", "crabhammer"];

/**
 * Calculate the Gen 1 critical hit probability.
 *
 * Gen 1 crit rate = floor(baseSpeed / 2) / 256
 * - Focus Energy bug: divides by 4 instead of multiplying
 * - High-crit moves (Slash, Karate Chop, Razor Leaf, Crabhammer):
 *   use floor(baseSpeed * 8 / 2) / 256, capped at 255/256
 *
 * @param attackerBaseSpeed - The base Speed stat of the attacking species
 * @param hasFocusEnergy - Whether the attacker has used Focus Energy
 * @param isHighCritMove - Whether the move has a high critical hit ratio
 * @returns Probability of critical hit (0 to ~1)
 */
export function getGen1CritRate(
  attackerBaseSpeed: number,
  hasFocusEnergy: boolean,
  isHighCritMove: boolean,
): number {
  let threshold: number;

  if (isHighCritMove) {
    // High-crit moves: speed * 8 / 2, capped at 255
    threshold = Math.min(255, Math.floor((attackerBaseSpeed * 8) / 2));
  } else {
    // Normal moves: speed / 2
    threshold = Math.floor(attackerBaseSpeed / 2);
  }

  // Focus Energy bug: divides by 4 instead of multiplying by 4
  if (hasFocusEnergy) {
    threshold = Math.floor(threshold / 4);
  }

  // Cap at 255
  threshold = Math.min(255, threshold);

  return threshold / 256;
}

/**
 * Determine if a move is a high critical hit ratio move in Gen 1.
 */
export function isHighCritMove(move: MoveData): boolean {
  return HIGH_CRIT_MOVES.includes(move.id);
}

/**
 * Roll for a critical hit using Gen 1 mechanics.
 *
 * @param attacker - The active attacking Pokemon
 * @param move - The move being used
 * @param attackerSpecies - Species data (for base Speed)
 * @param rng - Seeded random number generator
 * @returns true if the move crits
 */
export function rollGen1Critical(
  attacker: ActivePokemon,
  move: MoveData,
  attackerSpecies: PokemonSpeciesData,
  rng: SeededRandom,
): boolean {
  const hasFocusEnergy = attacker.volatileStatuses.has("focus-energy");
  const highCrit = isHighCritMove(move);
  const critRate = getGen1CritRate(attackerSpecies.baseStats.speed, hasFocusEnergy, highCrit);

  return rng.chance(critRate);
}
