/**
 * Critical hit probability by stage (Gen 6+).
 *
 * | Stage | Rate           |
 * |-------|----------------|
 * | 0     | 1/24 (~4.17%)  |
 * | 1     | 1/8 (12.5%)    |
 * | 2     | 1/2 (50%)      |
 * | 3+    | 1/1 (100%)     |
 */
export const CRIT_RATES_GEN6: readonly number[] = [
  1 / 24, // Stage 0
  1 / 8, // Stage 1
  1 / 2, // Stage 2
  1, // Stage 3+
] as const;

/**
 * Critical hit probability by stage (Gen 2).
 * Gen 2 uses a 256-based lookup table, not the modern stage system.
 *
 * | Stage | Threshold | Rate approx    |
 * |-------|-----------|----------------|
 * | 0     | 17/256    | ~6.64%         |
 * | 1     | 32/256    | 12.5%          |
 * | 2     | 64/256    | 25%            |
 * | 3     | 85/256    | ~33.2%         |
 * | 4+    | 128/256   | 50%            |
 */
export const CRIT_RATES_GEN2: readonly number[] = [
  17 / 256, // Stage 0
  32 / 256, // Stage 1
  64 / 256, // Stage 2
  85 / 256, // Stage 3
  128 / 256, // Stage 4+
] as const;

/**
 * Critical hit probability by stage (Gen 3-5).
 *
 * | Stage | Rate           |
 * |-------|----------------|
 * | 0     | 1/16 (6.25%)   |
 * | 1     | 1/8 (12.5%)    |
 * | 2     | 1/4 (25%)      |
 * | 3     | 1/3 (33.3%)    |
 * | 4+    | 1/2 (50%)      |
 */
export const CRIT_RATES_GEN3_5: readonly number[] = [
  1 / 16, // Stage 0
  1 / 8, // Stage 1
  1 / 4, // Stage 2
  1 / 3, // Stage 3
  1 / 2, // Stage 4+
] as const;

/**
 * Get the critical hit rate for a given stage.
 * @param stage - Crit stage (0+, clamped to max index)
 * @param rateTable - Which generation's rate table to use
 * @returns Probability of critical hit (0 to 1)
 */
export function getCritRate(stage: number, rateTable: readonly number[]): number {
  const index = Math.min(Math.max(0, stage), rateTable.length - 1);
  return rateTable[index]!;
}

/** Critical hit damage multiplier (Gen 6+: 1.5x) */
export const CRIT_MULTIPLIER_MODERN = 1.5;

/** Critical hit damage multiplier (Gen 1-5: 2.0x) */
export const CRIT_MULTIPLIER_CLASSIC = 2.0;
