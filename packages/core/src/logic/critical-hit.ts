/**
 * Critical hit probability by stage (Gen 6+).
 *
 * Source: Showdown sim/battle-actions.ts — Gen 6+ critical hit rates
 * Source: Bulbapedia — Critical hit (https://bulbapedia.bulbagarden.net/wiki/Critical_hit)
 *
 * | Stage | Rate           |
 * |-------|----------------|
 * | 0     | 1/24 (~4.17%)  |
 * | 1     | 1/8 (12.5%)    |
 * | 2     | 1/2 (50%)      |
 * | 3+    | 1/1 (100%)     |
 */
export const CRIT_RATE_PROBABILITIES_GEN6: readonly number[] = [
  1 / 24, // Stage 0
  1 / 8, // Stage 1
  1 / 2, // Stage 2
  1, // Stage 3+
] as const;

/** @deprecated Use `CRIT_RATE_PROBABILITIES_GEN6`. */
export const CRIT_RATES_GEN6 = CRIT_RATE_PROBABILITIES_GEN6;

/**
 * Critical hit probability by stage (Gen 2).
 * Gen 2 uses a 256-based lookup table, not the modern stage system.
 *
 * Source: pret/pokecrystal engine/battle/core.asm — CriticalHitTest
 * Source: Bulbapedia — Critical hit (Gen II thresholds)
 *
 * | Stage | Threshold | Rate approx    |
 * |-------|-----------|----------------|
 * | 0     | 17/256    | ~6.64%         |
 * | 1     | 32/256    | 12.5%          |
 * | 2     | 64/256    | 25%            |
 * | 3     | 85/256    | ~33.2%         |
 * | 4+    | 128/256   | 50%            |
 */
export const CRIT_RATE_PROBABILITIES_GEN2: readonly number[] = [
  17 / 256, // Stage 0
  32 / 256, // Stage 1
  64 / 256, // Stage 2
  85 / 256, // Stage 3
  128 / 256, // Stage 4+
] as const;

/** @deprecated Use `CRIT_RATE_PROBABILITIES_GEN2`. */
export const CRIT_RATES_GEN2 = CRIT_RATE_PROBABILITIES_GEN2;

/**
 * Critical hit probability by stage (Gen 3-5).
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:606 sCriticalHitChance = {16, 8, 4, 3, 2}
 *   Critical hit occurs when Random() % sCriticalHitChance[stage] == 0, i.e. 1/N chance
 *
 * | Stage | Rate           |
 * |-------|----------------|
 * | 0     | 1/16 (6.25%)   |
 * | 1     | 1/8 (12.5%)    |
 * | 2     | 1/4 (25%)      |
 * | 3     | 1/3 (33.3%)    |
 * | 4+    | 1/2 (50%)      |
 */
export const CRIT_RATE_PROBABILITIES_GEN3_5: readonly number[] = [
  1 / 16, // Stage 0
  1 / 8, // Stage 1
  1 / 4, // Stage 2
  1 / 3, // Stage 3
  1 / 2, // Stage 4+
] as const;

/** @deprecated Use `CRIT_RATE_PROBABILITIES_GEN3_5`. */
export const CRIT_RATES_GEN3_5 = CRIT_RATE_PROBABILITIES_GEN3_5;

/**
 * Get the critical hit probability for a given stage.
 * @param stage - Crit stage (0+, clamped to max index)
 * @param probabilityTable - Critical hit probabilities by stage (0-1 values), not denominator tables
 * @returns Probability of critical hit (0 to 1)
 */
export function getCritRate(stage: number, probabilityTable: readonly number[]): number {
  const index = Math.min(Math.max(0, stage), probabilityTable.length - 1);
  return probabilityTable[index] as number;
}

/** Critical hit damage multiplier (Gen 6+: 1.5x)
 * Source: Showdown sim/battle-actions.ts — basePower *= 1.5 for crits in Gen 6+
 */
export const CRIT_MULTIPLIER_MODERN = 1.5;

/** Critical hit damage multiplier (Gen 1-5: 2.0x)
 * Source: pret/pokeemerald src/battle_script_commands.c:1283 — gCritMultiplier = 2
 */
export const CRIT_MULTIPLIER_CLASSIC = 2.0;
