// @pokemon-lib-ts/gen6 -- Gen6Ruleset + complete Gen 6 data

export { createGen6DataManager } from "./data/index.js";
export {
  applyGen6Ability,
  FRIEND_GUARD_DAMAGE_MULTIPLIER,
  getAteAbilityOverride,
  getFurCoatMultiplier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getSereneGraceMultiplier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getToughClawsMultiplier,
  getWeightMultiplier,
  HARVEST_BASE_PROBABILITY,
  HARVEST_SUN_PROBABILITY,
  HEALER_PROBABILITY,
  HEAVY_METAL_WEIGHT_MULTIPLIER,
  handleGen6DamageCalcAbility,
  handleGen6DamageImmunityAbility,
  handleGen6RemainingAbility,
  handleGen6StatAbility,
  handleGen6SwitchAbility,
  hasSheerForceEligibleEffect,
  isAromaVeilBlocked,
  isBulletproofBlocked,
  isMoldBreakerAbility,
  isParentalBondEligible,
  isPranksterEligible,
  isSheerForceEligibleMove,
  isTrappedByAbility,
  LIGHT_METAL_WEIGHT_MULTIPLIER,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
  SERENE_GRACE_CHANCE_MULTIPLIER,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
  VICTORY_STAR_ACCURACY_MULTIPLIER,
} from "./Gen6Abilities.js";
export { GEN6_CRIT_MULTIPLIER, GEN6_CRIT_RATE_TABLE } from "./Gen6CritCalc.js";
export { calculateGen6Damage, pokeRound, TYPE_RESIST_BERRIES } from "./Gen6DamageCalc.js";
export {
  applyGen6EntryHazards,
  applyGen6SpikesHazard,
  applyGen6StealthRock,
  applyGen6StickyWeb,
  applyGen6ToxicSpikes,
  isGen6Grounded,
} from "./Gen6EntryHazards.js";
export {
  applyGen6HeldItem,
  GEM_TYPES,
  getPinchBerryThreshold,
  isGen6PowderBlocked,
  isMegaStone,
} from "./Gen6Items.js";
export { Gen6MegaEvolution, getMegaEvolutionData, MEGA_STONE_DATA } from "./Gen6MegaEvolution.js";
export {
  calculateSpikyShieldDamage,
  executeGen6MoveEffect,
  handleDrainEffect,
  isBlockedByCraftyShield,
  isBlockedByKingsShield,
  isBlockedByMatBlock,
  isBlockedBySpikyShield,
  isGen6GrassPowderBlocked,
} from "./Gen6MoveEffects.js";
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
