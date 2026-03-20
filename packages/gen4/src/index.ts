// @pokemon-lib-ts/gen4 -- Gen4Ruleset + complete Gen 4 data

export { createGen4DataManager } from "./data";
export { applyGen4Ability } from "./Gen4Abilities";
export {
  CRIT_MULTIPLIER_CLASSIC,
  CRIT_RATES_GEN3_5,
  GEN4_CRIT_MULTIPLIER,
  GEN4_CRIT_RATE_DENOMINATORS,
  GEN4_CRIT_RATES,
} from "./Gen4CritCalc";
export { calculateGen4Damage } from "./Gen4DamageCalc";
export { applyGen4HeldItem } from "./Gen4Items";
export { canInflictGen4Status, executeGen4MoveEffect } from "./Gen4MoveEffects";
export { Gen4Ruleset } from "./Gen4Ruleset";
export { GEN4_TYPE_CHART, GEN4_TYPES } from "./Gen4TypeChart";
export {
  applyGen4WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen4WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "./Gen4Weather";
