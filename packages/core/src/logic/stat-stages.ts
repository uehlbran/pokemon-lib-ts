/**
 * Stat stage multiplier for regular stats (Atk, Def, SpAtk, SpDef, Speed).
 *
 * Stage 0 = 1x (no modification).
 * Positive stages boost, negative stages reduce.
 *
 * Formula: multiplier = max(2, 2 + stage) / max(2, 2 - stage)
 *
 * | Stage | Multiplier |
 * |-------|-----------|
 * | -6    | 2/8 = 0.25 |
 * | -5    | 2/7       |
 * | -4    | 2/6       |
 * | -3    | 2/5 = 0.40 |
 * | -2    | 2/4 = 0.50 |
 * | -1    | 2/3       |
 * |  0    | 2/2 = 1.00 |
 * | +1    | 3/2 = 1.50 |
 * | +2    | 4/2 = 2.00 |
 * | +3    | 5/2 = 2.50 |
 * | +4    | 6/2 = 3.00 |
 * | +5    | 7/2 = 3.50 |
 * | +6    | 8/2 = 4.00 |
 */
export function getStatStageMultiplier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  if (clamped >= 0) {
    return (2 + clamped) / 2;
  }
  return 2 / (2 - clamped);
}

/**
 * Accuracy/Evasion stage multiplier.
 * Uses a different scale than regular stats (Gen 3+).
 *
 * | Stage | Multiplier |
 * |-------|-----------|
 * | -6    | 3/9 = 0.33 |
 * | -3    | 3/6 = 0.50 |
 * |  0    | 3/3 = 1.00 |
 * | +3    | 6/3 = 2.00 |
 * | +6    | 9/3 = 3.00 |
 */
export function getAccuracyEvasionMultiplier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  if (clamped >= 0) {
    return (3 + clamped) / 3;
  }
  return 3 / (3 - clamped);
}

/**
 * Calculate the effective accuracy of a move in battle.
 *
 * Stages are netted first (accStage - evaStage) to avoid floating-point rounding
 * artifacts from intermediate division. Formula: acc * (3 + net) / 3 for positive net,
 * acc * 3 / (3 - net) for negative net.
 *
 * If move accuracy is null, the move never misses (returns Infinity).
 */
export function calculateAccuracy(
  moveAccuracy: number | null,
  accuracyStage: number,
  evasionStage: number,
): number {
  if (moveAccuracy === null) return Number.POSITIVE_INFINITY;
  const netStage = Math.max(-6, Math.min(6, accuracyStage - evasionStage));
  if (netStage > 0) return Math.floor((moveAccuracy * (3 + netStage)) / 3);
  if (netStage < 0) return Math.floor((moveAccuracy * 3) / (3 - netStage));
  return moveAccuracy;
}
