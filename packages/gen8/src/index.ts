// @pokemon-lib-ts/gen8 -- Gen8Ruleset + complete Gen 8 data

export { createGen8DataManager } from "./data/index.js";
export { GEN8_CRIT_MULTIPLIER, GEN8_CRIT_RATE_TABLE } from "./Gen8CritCalc.js";
export {
  calculateGen8Damage,
  isGen8Grounded,
  pokeRound,
  TYPE_RESIST_BERRIES,
} from "./Gen8DamageCalc.js";
export { Gen8Ruleset } from "./Gen8Ruleset.js";
export { GEN8_TYPE_CHART, GEN8_TYPES } from "./Gen8TypeChart.js";
