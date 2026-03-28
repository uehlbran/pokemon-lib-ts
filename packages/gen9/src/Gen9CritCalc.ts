import {
  CRIT_MULTIPLIER_MODERN,
  CRIT_RATE_PROBABILITIES_GEN6,
  CRIT_RATE_TABLE_GEN6_PLUS,
} from "@pokemon-lib-ts/core";

/**
 * Gen 9 critical hit constants.
 *
 * Gen 9 uses the same crit system as Gen 6-8:
 *   - Crit multiplier: 1.5x (same as Gen 6-8)
 *   - Crit rate table: [24, 8, 2, 1] (stages 0-3+)
 *   - Stage 3+ is always a guaranteed crit (1/1)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 9 crit rate unchanged from Gen 6
 * Source: Bulbapedia "Critical hit" Gen 9 section -- same as Gen 6-8
 */

/**
 * Critical hit rate denominators by crit stage (Gen 9).
 *
 * Stage 0: 1/24  (~4.2%)
 * Stage 1: 1/8   (12.5%)
 * Stage 2: 1/2   (50%)
 * Stage 3+: 1/1  (guaranteed)
 *
 * Source: Showdown sim/battle-actions.ts -- critRatio array (Gen 9 unchanged from Gen 6)
 * Source: Bulbapedia "Critical hit" Gen 9 -- rate table
 */
export const GEN9_CRIT_RATE_TABLE: typeof CRIT_RATE_TABLE_GEN6_PLUS = CRIT_RATE_TABLE_GEN6_PLUS;

/**
 * Gen 9 critical hit probabilities by crit stage (0-1 values).
 * Re-exports the core Gen 6+ probability table with a gen-local name for API consistency.
 */
export const GEN9_CRIT_RATE_PROBABILITIES = CRIT_RATE_PROBABILITIES_GEN6;

/**
 * Critical hit damage multiplier in Gen 9.
 *
 * Same as Gen 6-8: 1.5x (reduced from 2.0x in Gen 3-5).
 *
 * Source: Showdown sim/battle-actions.ts -- baseDamage *= move.crit ? 1.5 : 1
 * Source: Bulbapedia "Critical hit" Gen 9 -- multiplier remains 1.5x
 */
export const GEN9_CRIT_MULTIPLIER: typeof CRIT_MULTIPLIER_MODERN = CRIT_MULTIPLIER_MODERN;
