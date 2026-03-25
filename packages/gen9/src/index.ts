// @pokemon-lib-ts/gen9 -- Gen9Ruleset + complete Gen 9 data

export { createGen9DataManager } from "./data/index.js";
export * from "./data/reference-ids.js";
export { handleGen9Ability } from "./Gen9Abilities.js";
export {
  applyGen9DauntlessShieldBoost,
  applyGen9IntrepidSwordBoost,
  applyGen9ProteanTypeChange,
  getAteAbilityOverride,
  getFluffyModifier,
  getFurCoatMultiplier,
  getHadronEngineSpAModifier,
  getIceScalesModifier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getOrichalcumPulseAtkModifier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getSupremeOverlordModifier,
  getToughClawsMultiplier,
  handleGen9DamageCalcAbility,
  handleGen9DamageImmunityAbility,
  hasSheerForceEligibleEffect,
  isParentalBondEligible,
  isSheerForceEligibleMove,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "./Gen9AbilitiesDamage.js";
export {
  canToxicChainApply,
  EMBODY_ASPECT_BOOSTS,
  handleEmbodyAspect,
  handleGen9DauntlessShieldTrigger,
  handleGen9IntrepidSwordTrigger,
  handleGen9NewAbility,
  handleGen9ProteanTrigger,
  handleGoodAsGold,
  handleMyceliumMight,
  handleToxicChain,
  hasMyceliumMightPriorityReduction,
  isBlockedByGoodAsGold,
  isEmbodyAspect,
  isMyceliumMightBypassingAbility,
} from "./Gen9AbilitiesNew.js";
export type { BoostableStat } from "./Gen9AbilitiesStat.js";
export {
  getBoostMultiplier,
  getHadronEngineMultiplier,
  getHighestBaseStat,
  getOrichalcumPulseMultiplier,
  handleGen9StatAbility,
  handleProtosynthesis,
  handleQuarkDrive,
  shouldProtosynthesisActivate,
  shouldQuarkDriveActivate,
} from "./Gen9AbilitiesStat.js";
export {
  getWeatherDuration,
  handleGen9SwitchAbility,
  isMoldBreakerAbility,
  isSurgeAbility,
  MOLD_BREAKER_ALIASES,
  SCREEN_CLEANER_SCREENS,
  TRACE_UNCOPYABLE_ABILITIES,
  UNSUPPRESSABLE_ABILITIES,
} from "./Gen9AbilitiesSwitch.js";
export {
  GEN9_CRIT_MULTIPLIER,
  GEN9_CRIT_RATE_PROBABILITIES,
  GEN9_CRIT_RATE_TABLE,
  GEN9_CRIT_RATES,
} from "./Gen9CritCalc.js";
export {
  calculateGen9Damage,
  isGen9Grounded,
  pokeRound,
  TYPE_RESIST_BERRIES,
} from "./Gen9DamageCalc.js";
export {
  applyGen9EntryHazards,
  applyGen9SpikesHazard,
  applyGen9StealthRock,
  applyGen9StickyWeb,
  applyGen9ToxicSpikes,
  hasHeavyDutyBoots,
} from "./Gen9EntryHazards.js";
export {
  applyGen9HeldItem,
  getBlackSludgeEffect,
  getChoiceItemBoost,
  getConsumableItemEffect,
  getEvioliteModifier,
  getFocusSashTrigger,
  getItemDamageModifier,
  getLeftoversHeal,
  getLifeOrbRecoil,
  getPinchBerryThreshold,
  getRockyHelmetDamage,
  getThroatSprayTrigger,
  getTypeBoostItem,
  getTypeResistBerry,
  getWeatherRockType,
  hasAirBalloon,
  hasCovertCloak,
  hasIronBall,
  hasTerrainExtender,
  hasUtilityUmbrella,
  isAssaultVestHolder,
  isBoosterEnergy,
  isChoiceLocked,
  isGen9PowderBlocked,
  TERRAIN_EXTENDER_ITEM_ID,
} from "./Gen9Items.js";
export {
  calculateRevivalHp,
  calculateSaltCureDamage,
  calculateShedTailCost,
  canUseRevivalBlessing,
  canUseShedTail,
  executeGen9MoveEffect,
  findRevivalTarget,
  getLastRespectsPower,
  getRageFistPower,
  handleLastRespects,
  handleMakeItRain,
  handlePopulationBomb,
  handleRageFist,
  handleRevivalBlessing,
  handleSaltCure,
  handleShedTail,
  handleTeraBlast,
  handleTidyUp,
  shouldApplyStellarDebuff,
} from "./Gen9MoveEffects.js";
export { Gen9Ruleset } from "./Gen9Ruleset.js";
export { calculateTeraStab, Gen9Terastallization } from "./Gen9Terastallization.js";
export {
  applyGen9TerrainEffects,
  checkGen9TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
  getSurgeTerrainType,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "./Gen9Terrain.js";
export { GEN9_TYPE_CHART, GEN9_TYPES } from "./Gen9TypeChart.js";
export {
  ABILITY_WEATHER_TURNS,
  applyGen9WeatherEffects,
  isGen9WeatherImmune,
  isWeatherSuppressedGen9,
  isWeatherSuppressedOnFieldGen9,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "./Gen9Weather.js";
