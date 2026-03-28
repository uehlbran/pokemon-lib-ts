import {
  CRIT_MULTIPLIER_CLASSIC,
  CRIT_RATE_PROBABILITIES_GEN3_5,
  CRIT_RATE_TABLE_GEN3_5,
} from "@pokemon-lib-ts/core";

/**
 * Gen 4 critical hit rate table (denominators), indexed by stage.
 *
 * | Stage | Rate      | Denominator |
 * |-------|-----------|-------------|
 * | 0     | 1/16      | 16          |
 * | 1     | 1/8       | 8           |
 * | 2     | 1/4       | 4           |
 * | 3     | 1/3       | 3           |
 * | 4+    | 1/2       | 2           |
 *
 * Source: pret/pokeplatinum — same crit table as Gen 3 and Gen 5
 * Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
 */
export const GEN4_CRIT_RATE_TABLE: typeof CRIT_RATE_TABLE_GEN3_5 = CRIT_RATE_TABLE_GEN3_5;

/**
 * Gen 4 critical hit rate table as probability fractions (0-1), indexed by stage.
 * Re-exports CRIT_RATE_PROBABILITIES_GEN3_5 from core for convenience.
 *
 * Source: pret/pokeplatinum — same crit system as Gen 3-5
 */
export const GEN4_CRIT_RATE_PROBABILITIES: typeof CRIT_RATE_PROBABILITIES_GEN3_5 =
  CRIT_RATE_PROBABILITIES_GEN3_5;

/**
 * Gen 4 critical hit damage multiplier: 2.0x (classic, unlike Gen 6+ which uses 1.5x).
 * Re-exports CRIT_MULTIPLIER_CLASSIC from core for convenience.
 *
 * Source: pret/pokeplatinum — crit doubles the damage (same as Gen 3-5)
 */
export const GEN4_CRIT_MULTIPLIER: typeof CRIT_MULTIPLIER_CLASSIC = CRIT_MULTIPLIER_CLASSIC;

// Re-export core constants for barrel export
export { CRIT_MULTIPLIER_CLASSIC, CRIT_RATE_PROBABILITIES_GEN3_5 };
