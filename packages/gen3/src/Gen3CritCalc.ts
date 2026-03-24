import { CRIT_MULTIPLIER_CLASSIC, CRIT_RATE_PROBABILITIES_GEN3_5 } from "@pokemon-lib-ts/core";

/**
 * Gen 3 critical hit rate table (denominators), indexed by stage.
 *
 * | Stage | Rate      | Denominator |
 * |-------|-----------|-------------|
 * | 0     | 1/16      | 16          |
 * | 1     | 1/8       | 8           |
 * | 2     | 1/4       | 4           |
 * | 3     | 1/3       | 3           |
 * | 4+    | 1/2       | 2           |
 *
 * Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
 *
 * Stage sources:
 *   - Stage 0: base (no modifiers)
 *   - Stage 1: Scope Lens item, or a high-crit move (Slash, Crabhammer, etc.)
 *   - Stage 2: Scope Lens + high-crit move
 *   - Stage 3: Focus Energy (+2 stages in Gen 3, correctly implemented unlike Gen 1 bug)
 *   - Stage 4+: Focus Energy + Scope Lens
 */
export const GEN3_CRIT_RATE_TABLE: readonly number[] = [16, 8, 4, 3, 2] as const;

/** @deprecated Use `GEN3_CRIT_RATE_TABLE`. */
export const GEN3_CRIT_RATE_DENOMINATORS = GEN3_CRIT_RATE_TABLE;

/**
 * Gen 3 critical hit rate table as probability fractions (0–1), indexed by stage.
 * Re-exports CRIT_RATES_GEN3_5 from core for convenience.
 *
 * Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
 */
export const GEN3_CRIT_RATE_PROBABILITIES: typeof CRIT_RATE_PROBABILITIES_GEN3_5 =
  CRIT_RATE_PROBABILITIES_GEN3_5;

/** @deprecated Use `GEN3_CRIT_RATE_PROBABILITIES`. */
export const GEN3_CRIT_RATES = GEN3_CRIT_RATE_PROBABILITIES;

/**
 * Gen 3 critical hit damage multiplier: 2.0x (classic, unlike Gen 6+ which uses 1.5x).
 * Re-exports CRIT_MULTIPLIER_CLASSIC from core for convenience.
 *
 * Source: pret/pokeemerald src/battle_util.c — crit doubles the damage
 */
export const GEN3_CRIT_MULTIPLIER: typeof CRIT_MULTIPLIER_CLASSIC = CRIT_MULTIPLIER_CLASSIC;
