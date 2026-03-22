// Source: pret/pokered data/battle/stat_modifiers.asm — Gen 1-2 stat stage numerator/denominator pairs
// Source: pret/pokecrystal data/battle/stat_multipliers.asm — identical table, INCLUDEd in two ROM banks
export const GEN12_STAT_STAGE_RATIOS: ReadonlyArray<{ num: number; den: number }> = [
  { num: 25, den: 100 }, // stage -6
  { num: 28, den: 100 }, // stage -5
  { num: 33, den: 100 }, // stage -4
  { num: 40, den: 100 }, // stage -3
  { num: 50, den: 100 }, // stage -2
  { num: 66, den: 100 }, // stage -1
  { num: 1, den: 1 }, // stage  0
  { num: 15, den: 10 }, // stage +1
  { num: 2, den: 1 }, // stage +2
  { num: 25, den: 10 }, // stage +3
  { num: 3, den: 1 }, // stage +4
  { num: 35, den: 10 }, // stage +5
  { num: 4, den: 1 }, // stage +6
];

// Source: pret/pokeemerald src/pokemon.c:1868 gStatStageRatios — Gen 3+ stat stage table
export const GEN3_STAT_STAGE_RATIOS: ReadonlyArray<{ num: number; den: number }> = [
  { num: 10, den: 40 }, // stage -6
  { num: 10, den: 35 }, // stage -5
  { num: 10, den: 30 }, // stage -4
  { num: 10, den: 25 }, // stage -3
  { num: 10, den: 20 }, // stage -2
  { num: 10, den: 15 }, // stage -1
  { num: 10, den: 10 }, // stage  0
  { num: 15, den: 10 }, // stage +1
  { num: 20, den: 10 }, // stage +2
  { num: 25, den: 10 }, // stage +3
  { num: 30, den: 10 }, // stage +4
  { num: 35, den: 10 }, // stage +5
  { num: 40, den: 10 }, // stage +6
];

// Source: pret/pokeemerald src/battle_script_commands.c:588 sAccuracyStageRatios
// Source: pret/pokecrystal data/battle/accuracy_multipliers.asm — same table (AccuracyLevelMultipliers)
export const ACCURACY_STAGE_RATIOS: ReadonlyArray<{ num: number; den: number }> = [
  { num: 33, den: 100 }, // stage -6
  { num: 36, den: 100 }, // stage -5
  { num: 43, den: 100 }, // stage -4
  { num: 50, den: 100 }, // stage -3
  { num: 60, den: 100 }, // stage -2
  { num: 75, den: 100 }, // stage -1
  { num: 1, den: 1 }, // stage  0
  { num: 133, den: 100 }, // stage +1
  { num: 166, den: 100 }, // stage +2
  { num: 2, den: 1 }, // stage +3
  { num: 233, den: 100 }, // stage +4
  { num: 133, den: 50 }, // stage +5
  { num: 3, den: 1 }, // stage +6
];

/** Returns the integer numerator/denominator for a stat stage in Gen 1-2.
 * Source: pret/pokered data/battle/stat_modifiers.asm
 */
export function getGen12StatStageRatio(stage: number): { num: number; den: number } {
  const idx = Math.max(-6, Math.min(6, stage)) + 6;
  // idx is always in [0, 12] due to clamp — safe to assert non-null
  return GEN12_STAT_STAGE_RATIOS[idx] as { num: number; den: number };
}

/** Returns the integer numerator/denominator for a stat stage in Gen 3+.
 * Source: pret/pokeemerald src/pokemon.c:1868 gStatStageRatios
 */
export function getGen3StatStageRatio(stage: number): { num: number; den: number } {
  const idx = Math.max(-6, Math.min(6, stage)) + 6;
  // idx is always in [0, 12] due to clamp — safe to assert non-null
  return GEN3_STAT_STAGE_RATIOS[idx] as { num: number; den: number };
}

/** Returns the integer numerator/denominator for an accuracy/evasion stage.
 * Same table is used in Gen 2 (pokecrystal) and Gen 3+ (pokeemerald).
 * Source: pret/pokeemerald src/battle_script_commands.c:588 sAccuracyStageRatios
 * Source: pret/pokecrystal data/battle/accuracy_multipliers.asm
 */
export function getAccuracyStageRatio(stage: number): { num: number; den: number } {
  const idx = Math.max(-6, Math.min(6, stage)) + 6;
  // idx is always in [0, 12] due to clamp — safe to assert non-null
  return ACCURACY_STAGE_RATIOS[idx] as { num: number; den: number };
}

/**
 * Stat stage multiplier for regular stats (Atk, Def, SpAtk, SpDef, Speed).
 * Approximate float version; prefer getGen12StatStageRatio or getGen3StatStageRatio for integer math.
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
 * Approximate float version; prefer getAccuracyStageRatio for integer math.
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
 * Nets accuracy and evasion stages, then applies the cartridge-accurate
 * ratio from ACCURACY_STAGE_RATIOS (sourced from pokeemerald sAccuracyStageRatios).
 *
 * If move accuracy is null, the move never misses (returns Infinity).
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:588 sAccuracyStageRatios
 */
export function calculateAccuracy(
  moveAccuracy: number | null,
  accuracyStage: number,
  evasionStage: number,
): number {
  if (moveAccuracy === null) return Number.POSITIVE_INFINITY;
  const netStage = Math.max(-6, Math.min(6, accuracyStage - evasionStage));
  const { num, den } = getAccuracyStageRatio(netStage);
  return Math.floor((moveAccuracy * num) / den);
}
