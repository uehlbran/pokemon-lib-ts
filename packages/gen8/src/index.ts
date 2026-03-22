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
export {
  applyGen8TerrainEffects,
  checkGen8TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
  handleSurgeAbility,
  isSurgeAbility,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "./Gen8Terrain.js";
export { GEN8_TYPE_CHART, GEN8_TYPES } from "./Gen8TypeChart.js";
