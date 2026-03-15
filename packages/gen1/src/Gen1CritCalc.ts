import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonSpeciesData, SeededRandom } from "@pokemon-lib-ts/core";

/**
 * Moves with a high critical hit ratio in Gen 1.
 * These moves multiply the base speed by 8 before the crit rate calculation.
 */
const HIGH_CRIT_MOVES: readonly string[] = ["slash", "karate-chop", "razor-leaf", "crabhammer"];

/**
 * Calculate the Gen 1 critical hit probability.
 *
 * Matches Showdown's gen1 scripts.ts algorithm exactly:
 *   1. critChance = floor(baseSpeed / 2)
 *   2. Focus Energy (bugged): divides by 2 instead of multiplying by 4
 *      Normal: multiplies by 2 (clamped 1-255)
 *   3. Normal move: divide by 2
 *      High-crit move: multiply by 4 (clamped 1-255)
 *   4. Hit check: randomChance(critChance, 256)
 *
 * @param attackerBaseSpeed - The base Speed stat of the attacking species
 * @param hasFocusEnergy - Whether the attacker has used Focus Energy
 * @param isHighCritMove - Whether the move has a high critical hit ratio
 * @returns Probability of critical hit (0 to 1)
 */
export function getGen1CritRate(
  attackerBaseSpeed: number,
  hasFocusEnergy: boolean,
  isHighCritMove: boolean,
): number {
  // Step 1: base threshold
  let critChance = Math.floor(attackerBaseSpeed / 2);

  // Step 2: Focus Energy modifier
  if (hasFocusEnergy) {
    // Gen 1 Focus Energy bug: divides by 2 instead of multiplying by 4
    critChance = Math.floor(critChance / 2);
  } else {
    // Normal: multiply by 2, clamped to 1-255
    critChance = Math.min(255, Math.max(1, critChance * 2));
  }

  // Step 3: move type modifier
  if (isHighCritMove) {
    // High-crit moves: multiply by 4, clamped to 1-255
    critChance = Math.min(255, Math.max(1, critChance * 4));
  } else {
    // Normal moves: divide by 2
    critChance = Math.floor(critChance / 2);
  }

  return critChance / 256;
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
