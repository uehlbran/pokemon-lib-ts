import { CRIT_MULTIPLIER_CLASSIC, CRIT_RATES_GEN3_5 } from "@pokemon-lib-ts/core";

/**
 * Gen 5 critical hit rate table (denominators), indexed by stage.
 *
 * | Stage | Rate      | Denominator |
 * |-------|-----------|-------------|
 * | 0     | 1/16      | 16          |
 * | 1     | 1/8       | 8           |
 * | 2     | 1/4       | 4           |
 * | 3     | 1/3       | 3           |
 * | 4+    | 1/2       | 2           |
 *
 * Source: references/pokemon-showdown/sim/battle-actions.ts lines 1625-1627
 * Gen 5 crit rate table: stage -> denominator (chance = 1/denominator)
 */
export const GEN5_CRIT_RATE_DENOMINATORS: readonly number[] = [16, 8, 4, 3, 2] as const;

/**
 * Gen 5 critical hit rate table as probability fractions (0-1), indexed by stage.
 * Re-exports CRIT_RATES_GEN3_5 from core for convenience.
 *
 * Source: references/pokemon-showdown/sim/battle-actions.ts -- same crit system as Gen 3-5
 */
export const GEN5_CRIT_RATES: typeof CRIT_RATES_GEN3_5 = CRIT_RATES_GEN3_5;

/**
 * Gen 5 critical hit damage multiplier: 2.0x (classic, unlike Gen 6+ which uses 1.5x).
 * Re-exports CRIT_MULTIPLIER_CLASSIC from core for convenience.
 *
 * Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
 * Gen 5 crit doubles the damage (same as Gen 3-4)
 */
export const GEN5_CRIT_MULTIPLIER: typeof CRIT_MULTIPLIER_CLASSIC = CRIT_MULTIPLIER_CLASSIC;

// Re-export core constants for barrel export
export { CRIT_MULTIPLIER_CLASSIC, CRIT_RATES_GEN3_5 };
