// @pokemon-lib-ts/gen7 -- Gen7Ruleset + complete Gen 7 data

export { createGen7DataManager } from "./data/index.js";
export * from "./data/reference-ids.js";
export {
  getAteAbilityOverride,
  getFurCoatMultiplier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getToughClawsMultiplier,
  handleGen7DamageCalcAbility,
  handleGen7DamageImmunityAbility,
  hasSheerForceEligibleEffect,
  isParentalBondEligible,
  isSheerForceEligibleMove,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "./Gen7AbilitiesDamage.js";
export {
  getDisguiseBreakDamage,
  getRKSType,
  handleGen7NewAbility,
  isComatoseAsleep,
  isComatoseStatusImmune,
  isDisguiseActive,
  isSchoolForm,
  isShieldsDownMeteorForm,
  MEMORY_TYPE_MAP,
  SCHOOLING_HP_THRESHOLD,
  SCHOOLING_MIN_LEVEL,
  shouldBattleBondTransform,
  shouldPowerConstructTransform,
} from "./Gen7AbilitiesNew.js";
export {
  getTriagePriorityBonus,
  handleGen7StatAbility,
  isGaleWingsActive,
  isPranksterBlockedByDarkType,
  isPranksterEligible,
} from "./Gen7AbilitiesStat.js";
export {
  getWeatherDuration,
  handleGen7SwitchAbility,
  hasMagicGuard,
  hasOvercoat,
  isBulletproofBlocked,
  isDampBlocked,
  isMoldBreakerAbility,
  isSoundproofBlocked,
  MOLD_BREAKER_ALIASES,
  rollHarvest,
  rollShedSkin,
  TRACE_UNCOPYABLE_ABILITIES,
  UNSUPPRESSABLE_ABILITIES,
} from "./Gen7AbilitiesSwitch.js";
export {
  GEN7_CRIT_MULTIPLIER,
  GEN7_CRIT_RATE_PROBABILITIES,
  GEN7_CRIT_RATE_TABLE,
} from "./Gen7CritCalc.js";
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
  applyGen7HeldItem,
  getPinchBerryThreshold,
  getSpeciesZMoves,
  getTypedZMoves,
  getZCrystalType,
  hasTerrainExtender,
  isGen7PowderBlocked,
  isMegaStone,
  isSpeciesZCrystal,
  isZCrystal,
  TERRAIN_EXTENDER_ITEM_ID,
} from "./Gen7Items.js";
export {
  canRayquazaMegaEvolve,
  Gen7MegaEvolution,
  getMegaEvolutionData,
  MEGA_RAYQUAZA_DATA,
  MEGA_STONE_DATA,
} from "./Gen7MegaEvolution.js";
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
  GEN7_WEATHER_DAMAGE_MULTIPLIERS,
  HAIL_IMMUNE_TYPES,
  isGen7WeatherImmune,
  isWeatherSuppressedGen7,
  isWeatherSuppressedOnFieldGen7,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "./Gen7Weather.js";
export {
  Gen7ZMove,
  getSpeciesZBaseMove,
  getZMoveName,
  getZMovePower,
} from "./Gen7ZMove.js";
