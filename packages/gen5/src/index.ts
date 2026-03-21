// @pokemon-lib-ts/gen5 -- Gen5Ruleset + complete Gen 5 data

export { createGen5DataManager } from "./data";
export { applyGen5Ability } from "./Gen5Abilities";
export {
  CRIT_MULTIPLIER_CLASSIC,
  CRIT_RATES_GEN3_5,
  GEN5_CRIT_MULTIPLIER,
  GEN5_CRIT_RATE_DENOMINATORS,
  GEN5_CRIT_RATES,
} from "./Gen5CritCalc";
export { calculateGen5Damage, pokeRound } from "./Gen5DamageCalc";
export { applyGen5HeldItem } from "./Gen5Items";
export { executeGen5MoveEffect } from "./Gen5MoveEffects";
export { Gen5Ruleset } from "./Gen5Ruleset";
export { GEN5_TYPE_CHART, GEN5_TYPES } from "./Gen5TypeChart";
export {
  applyGen5WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen5WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "./Gen5Weather";
