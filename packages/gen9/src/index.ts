// @pokemon-lib-ts/gen9 -- Gen9Ruleset + complete Gen 9 data

export { createGen9DataManager } from "./data/index.js";
export { GEN9_CRIT_MULTIPLIER, GEN9_CRIT_RATE_TABLE } from "./Gen9CritCalc.js";
export {
  calculateGen9Damage,
  isGen9Grounded,
  pokeRound,
  TYPE_RESIST_BERRIES,
} from "./Gen9DamageCalc.js";
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
export { Gen9Ruleset } from "./Gen9Ruleset.js";
export { calculateTeraStab, Gen9Terastallization } from "./Gen9Terastallization.js";
export { GEN9_TYPE_CHART, GEN9_TYPES } from "./Gen9TypeChart.js";
