import type { SeededRandom } from "../prng/seeded-random.js";

/**
 * Gen 1–2: ~24.6% chance (63/256) to be fully paralyzed and lose the turn.
 *
 * @param rng - The battle's seeded PRNG
 * @returns `true` if the Pokémon is fully paralyzed this turn
 */
export function gen12FullParalysisCheck(rng: SeededRandom): boolean {
  return rng.int(0, 255) < 63;
}

/**
 * Gen 1–4: Weighted multi-hit distribution [2,2,2,3,3,3,4,5].
 *
 * Hit counts: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%).
 *
 * @param rng - The battle's seeded PRNG
 * @returns Number of hits: 2, 3, 4, or 5
 */
export function gen14MultiHitRoll(rng: SeededRandom): number {
  return rng.pick([2, 2, 2, 3, 3, 3, 4, 5] as const);
}

/**
 * Gen 1–6: 50% chance to hit self in confusion.
 *
 * @param rng - The battle's seeded PRNG
 * @returns `true` if the Pokémon hits itself in confusion
 */
export function gen16ConfusionSelfHitRoll(rng: SeededRandom): boolean {
  return rng.chance(0.5);
}

/**
 * Gen 1–2: Stat EXP contribution = floor(ceil(sqrt(statExp)) / 4).
 *
 * Used in both Gen1StatCalc and Gen2StatCalc. statExp range: 0–65535.
 *
 * @param statExp - Accumulated stat experience points (0–65535)
 * @returns The contribution value added to the base stat formula
 */
export function calculateStatExpContribution(statExp: number): number {
  const clamped = Math.max(0, Math.min(65535, Math.floor(statExp)));
  return Math.floor(Math.ceil(Math.sqrt(clamped)) / 4);
}
