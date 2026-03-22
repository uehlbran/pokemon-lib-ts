// @pokemon-lib-ts/gen7 -- Gen7Ruleset + complete Gen 7 data

export { createGen7DataManager } from "./data/index.js";
export { GEN7_CRIT_MULTIPLIER, GEN7_CRIT_RATE_TABLE } from "./Gen7CritCalc.js";
export {
  calculateGen7Damage,
  isGen7Grounded,
  pokeRound,
  TYPE_RESIST_BERRIES,
} from "./Gen7DamageCalc.js";
export {
  applyGen7EntryHazards,
  applyGen7SpikesHazard,
  applyGen7StealthRock,
  applyGen7StickyWeb,
  applyGen7ToxicSpikes,
} from "./Gen7EntryHazards.js";
export {
  AURORA_VEIL_DEFAULT_TURNS,
  AURORA_VEIL_LIGHT_CLAY_TURNS,
  calculateSpikyShieldDamage,
  executeGen7MoveEffect,
  handleAuroraVeil,
  handleDrainEffect,
  isBlockedByBanefulBunker,
  isBlockedByCraftyShield,
  isBlockedByKingsShield,
  isBlockedByMatBlock,
  isBlockedBySpikyShield,
  isGen7GrassPowderBlocked,
} from "./Gen7MoveEffects.js";
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
export {
  ABILITY_WEATHER_TURNS,
  applyGen7WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen7WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "./Gen7Weather.js";
