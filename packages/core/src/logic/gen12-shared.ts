import type { SeededRandom } from "../prng/seeded-random.js";

/**
 * Gen 1–2: ~24.6% chance (63/256) to be fully paralyzed and lose the turn.
 *
 * Source: pret/pokered engine/battle/core.asm:3454 — cp 25 percent (= 63/256)
 * Source: pret/pokecrystal engine/battle/core.asm — same 25% threshold
 *
 * @param rng - The battle's seeded PRNG
 * @returns `true` if the Pokémon is fully paralyzed this turn
 */
export function gen1to2FullParalysisCheck(rng: SeededRandom): boolean {
  return rng.int(0, 255) < 63;
}

/** @deprecated Use gen1to2FullParalysisCheck() for the clearer public name. */
export const gen12FullParalysisCheck = gen1to2FullParalysisCheck;

/**
 * Gen 1–4: Weighted multi-hit distribution [2,2,2,3,3,3,4,5].
 *
 * Source: pret/pokered engine/battle/core.asm — multi-hit random distribution
 * Source: Bulbapedia — Multi-hit move (https://bulbapedia.bulbagarden.net/wiki/Multi-strike_move)
 *
 * Hit counts: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%).
 *
 * @param rng - The battle's seeded PRNG
 * @returns Number of hits: 2, 3, 4, or 5
 */
export function gen1to4MultiHitRoll(rng: SeededRandom): number {
  return rng.pick([2, 2, 2, 3, 3, 3, 4, 5] as const);
}

/** @deprecated Use gen1to4MultiHitRoll() for the clearer public name. */
export const gen14MultiHitRoll = gen1to4MultiHitRoll;

/**
 * Gen 1–6: 50% chance to hit self in confusion.
 *
 * Source: pret/pokered engine/battle/core.asm — confusion self-hit check (50%)
 * Source: pret/pokecrystal engine/battle/effect_commands.asm:602 HitConfusion
 *
 * @param rng - The battle's seeded PRNG
 * @returns `true` if the Pokémon hits itself in confusion
 */
export function gen1to6ConfusionSelfHitRoll(rng: SeededRandom): boolean {
  return rng.chance(0.5);
}

/** @deprecated Use gen1to6ConfusionSelfHitRoll() for the clearer public name. */
export const gen16ConfusionSelfHitRoll = gen1to6ConfusionSelfHitRoll;

/**
 * Gen 1–2: Stat EXP contribution = floor(ceil(sqrt(statExp)) / 4).
 *
 * Source: pret/pokered engine/battle/core.asm — stat experience calculation
 * Source: pret/pokecrystal engine/battle/core.asm — same formula
 * Source: Bulbapedia — Stat experience (https://bulbapedia.bulbagarden.net/wiki/Stat_experience)
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
