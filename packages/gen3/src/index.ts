// @pokemon-lib-ts/gen3 — Gen3Ruleset + complete Gen 3 data

export { createGen3DataManager } from "./data";
export * from "./data/reference-ids";
export {
  applyGen3Ability,
  GEN3_ABILITY_STATUS_IMMUNITIES,
  GEN3_ABILITY_VOLATILE_IMMUNITIES,
  isGen3AbilityStatusImmune,
  isGen3StatDropBlocked,
  isGen3VolatileBlockedByAbility,
  isWeatherSuppressedGen3,
  WEATHER_SUPPRESSING_ABILITIES,
} from "./Gen3Abilities";
export {
  GEN3_CRIT_MULTIPLIER,
  GEN3_CRIT_RATE_PROBABILITIES,
  GEN3_CRIT_RATE_TABLE,
} from "./Gen3CritCalc";
export { calculateGen3Damage, isGen3PhysicalType } from "./Gen3DamageCalc";
export { applyGen3HeldItem, TYPE_BOOST_ITEMS } from "./Gen3Items";
export { executeGen3MoveEffect } from "./Gen3MoveEffects";
export { canInflictGen3Status, Gen3Ruleset } from "./Gen3Ruleset";
export { GEN3_TYPE_CHART, GEN3_TYPES } from "./Gen3TypeChart";
export { GEN3_WEATHER_DAMAGE_MULTIPLIERS } from "./Gen3Weather";
