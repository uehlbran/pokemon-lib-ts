import { CRIT_RATE_PROBABILITIES_GEN6 } from "@pokemon-lib-ts/core";

/**
 * Gen 7 critical hit constants.
 *
 * Gen 7 uses the same crit system as Gen 6:
 *   - Crit multiplier: 1.5x (same as Gen 6)
 *   - Crit rate table: [24, 8, 2, 1] (stages 0-3+)
 *   - Stage 3+ is always a guaranteed crit (1/1)
 *
 * Source: Bulbapedia "Critical hit" Gen 7 section
 * Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier and rate table
 */

/**
 * Critical hit rate denominators by crit stage (Gen 7).
 *
 * Stage 0: 1/24  (~4.2%)
 * Stage 1: 1/8   (12.5%)
 * Stage 2: 1/2   (50%)
 * Stage 3+: 1/1  (guaranteed)
 *
 * Source: Bulbapedia "Critical hit" Gen 7 -- rate table (same as Gen 6)
 * Source: Showdown sim/battle-actions.ts -- critRatio array
 */
export const GEN7_CRIT_RATE_TABLE = [24, 8, 2, 1] as const;

/**
 * Gen 7 critical hit probabilities by crit stage (0-1 values).
 * Re-exports the core Gen 6+ probability table with a gen-local name for API consistency.
 */
export const GEN7_CRIT_RATE_PROBABILITIES = CRIT_RATE_PROBABILITIES_GEN6;

/** @deprecated Use `GEN7_CRIT_RATE_PROBABILITIES`. */
export const GEN7_CRIT_RATES = GEN7_CRIT_RATE_PROBABILITIES;

/**
 * Critical hit damage multiplier in Gen 7.
 *
 * Same as Gen 6: 1.5x (reduced from 2.0x in Gen 3-5).
 *
 * Source: Bulbapedia "Critical hit" Gen 7 -- multiplier remains 1.5x
 * Source: Showdown sim/battle-actions.ts -- baseDamage *= move.crit ? 1.5 : 1
 */
export const GEN7_CRIT_MULTIPLIER = 1.5;
