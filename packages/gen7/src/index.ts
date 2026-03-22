// @pokemon-lib-ts/gen7 -- Gen7Ruleset + complete Gen 7 data

export { createGen7DataManager } from "./data/index.js";
export { GEN7_CRIT_MULTIPLIER, GEN7_CRIT_RATE_TABLE } from "./Gen7CritCalc.js";
export {
  calculateGen7Damage,
  isGen7Grounded,
  pokeRound,
  TYPE_RESIST_BERRIES,
} from "./Gen7DamageCalc.js";
export { Gen7Ruleset } from "./Gen7Ruleset.js";
export {
  applyGen7TerrainEffects,
  checkGen7TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
  handleSurgeAbility,
  isSurgeAbility,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "./Gen7Terrain.js";
export { GEN7_TYPE_CHART, GEN7_TYPES } from "./Gen7TypeChart.js";
