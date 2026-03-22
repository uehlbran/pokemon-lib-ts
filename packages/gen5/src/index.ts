// @pokemon-lib-ts/gen5 -- Gen5Ruleset + complete Gen 5 data

export { createGen5DataManager } from "./data";
export {
  applyGen5Ability,
  FRIEND_GUARD_DAMAGE_MULTIPLIER,
  getAnalyticMultiplier,
  getMultiscaleMultiplier,
  getSandForceMultiplier,
  getSereneGraceMultiplier,
  getSheerForceMultiplier,
  getSturdyDamageCap,
  getWeightMultiplier,
  HARVEST_BASE_PROBABILITY,
  HARVEST_SUN_PROBABILITY,
  HEALER_PROBABILITY,
  HEAVY_METAL_WEIGHT_MULTIPLIER,
  handleGen5DamageCalcAbility,
  handleGen5DamageImmunityAbility,
  handleGen5RemainingAbility,
  handleGen5StatAbility,
  handleGen5SwitchAbility,
  hasSheerForceEligibleEffect,
  isPranksterEligible,
  LIGHT_METAL_WEIGHT_MULTIPLIER,
  SERENE_GRACE_CHANCE_MULTIPLIER,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "./Gen5Abilities";
export {
  CRIT_MULTIPLIER_CLASSIC,
  CRIT_RATES_GEN3_5,
  GEN5_CRIT_MULTIPLIER,
  GEN5_CRIT_RATE_DENOMINATORS,
  GEN5_CRIT_RATES,
} from "./Gen5CritCalc";
export { calculateGen5Damage, pokeRound } from "./Gen5DamageCalc";
export {
  applyGen5EntryHazards,
  applyGen5SpikesHazard,
  applyGen5StealthRock,
  applyGen5ToxicSpikes,
  isGen5Grounded,
} from "./Gen5EntryHazards";
export { applyGen5HeldItem, GEM_TYPES, getPinchBerryThreshold } from "./Gen5Items";
export {
  didAllyFaintLastTurn,
  executeGen5MoveEffect,
  getAcrobaticsBP,
  getElectroBallBP,
  getGen5PriorityOverride,
  getGyroBallBP,
  getRetaliateBP,
  getWeightBasedBP,
  handleGen5BehaviorMove,
  handleGen5CombatMove,
  handleGen5FieldMove,
  handleGen5StatusMove,
  isBerry,
  isBlockedByQuickGuard,
  isBlockedByWideGuard,
  isGen5PowderMoveBlocked,
  isToxicGuaranteedAccuracy,
} from "./Gen5MoveEffects";
export { Gen5Ruleset } from "./Gen5Ruleset";
export { GEN5_TYPE_CHART, GEN5_TYPES } from "./Gen5TypeChart";
export {
  applyGen5WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen5WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "./Gen5Weather";
