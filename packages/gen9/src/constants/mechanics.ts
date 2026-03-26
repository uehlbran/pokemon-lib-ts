import { CORE_FIXED_POINT, CORE_MECHANIC_MULTIPLIERS } from "@pokemon-lib-ts/core";

/**
 * Gen 9 shared mechanics constants used across the stat/damage stack.
 *
 * These values belong to Gen 9 rules logic, not the generation data bundle.
 */
export const GEN9_STAT_ABILITY_SPEED_MULTIPLIER = CORE_MECHANIC_MULTIPLIERS.stab;

export const GEN9_STAT_ABILITY_STANDARD_MULTIPLIER =
  CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity;

export const GEN9_ORICHALCUM_HADRON_MODIFIER = 5461;

export const GEN9_ORICHALCUM_HADRON_MULTIPLIER =
  GEN9_ORICHALCUM_HADRON_MODIFIER / CORE_FIXED_POINT.identity;
