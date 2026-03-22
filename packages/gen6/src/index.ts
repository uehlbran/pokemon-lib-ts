// @pokemon-lib-ts/gen6 -- Gen6Ruleset + complete Gen 6 data

export { createGen6DataManager } from "./data/index.js";
export { GEN6_CRIT_MULTIPLIER, GEN6_CRIT_RATE_TABLE } from "./Gen6CritCalc.js";
export { calculateGen6Damage, pokeRound } from "./Gen6DamageCalc.js";
export {
  applyGen6EntryHazards,
  applyGen6SpikesHazard,
  applyGen6StealthRock,
  applyGen6StickyWeb,
  applyGen6ToxicSpikes,
  isGen6Grounded,
} from "./Gen6EntryHazards.js";
export { Gen6Ruleset } from "./Gen6Ruleset.js";
export type { TerrainDamageModifier } from "./Gen6Terrain.js";
export {
  applyGen6TerrainEffects,
  canInflictStatusWithTerrain,
  getTerrainDamageModifier,
} from "./Gen6Terrain.js";
export { GEN6_TYPE_CHART, GEN6_TYPES } from "./Gen6TypeChart.js";
export {
  ABILITY_WEATHER_TURNS,
  applyGen6WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen6WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "./Gen6Weather.js";
