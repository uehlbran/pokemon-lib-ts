/**
 * Gen 6 critical hit constants.
 *
 * Gen 6 restructured the crit system:
 *   - Crit multiplier reduced from 2.0x (Gen 3-5) to 1.5x
 *   - Crit rate table changed: [24, 8, 2, 1] (stages 0-3+)
 *   - Stage 3+ is always a guaranteed crit (1/1)
 *
 * Source: Bulbapedia "Critical hit" Gen 6 section
 * Source: Showdown sim/battle-actions.ts -- Gen 6 crit multiplier and rate table
 */

/**
 * Critical hit rate denominators by crit stage (Gen 6).
 *
 * Stage 0: 1/24  (~4.2%)
 * Stage 1: 1/8   (12.5%)
 * Stage 2: 1/2   (50%)
 * Stage 3+: 1/1  (guaranteed)
 *
 * Source: Bulbapedia "Critical hit" Gen 6 -- rate table
 * Source: Showdown sim/battle-actions.ts -- critRatio array
 */
export const GEN6_CRIT_RATE_TABLE = [24, 8, 2, 1] as const;

/**
 * Critical hit damage multiplier in Gen 6+.
 *
 * Reduced from 2.0x (Gen 3-5) to 1.5x (Gen 6+).
 *
 * Source: Bulbapedia "Critical hit" Gen 6 -- multiplier reduced from 2x to 1.5x
 * Source: Showdown sim/battle-actions.ts -- baseDamage *= move.crit ? 1.5 : 1
 */
export const GEN6_CRIT_MULTIPLIER = 1.5;
