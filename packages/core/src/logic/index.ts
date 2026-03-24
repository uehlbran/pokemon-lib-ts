export {
  calculateModifiedCatchRate,
  calculateShakeChecks,
  STATUS_CATCH_MODIFIERS,
  STATUS_CATCH_MODIFIERS_GEN5,
  STATUS_CATCH_MODIFIERS_GEN34,
} from "./catch-rate";
export {
  CRIT_MULTIPLIER_CLASSIC,
  CRIT_MULTIPLIER_MODERN,
  CRIT_RATES_GEN2,
  CRIT_RATES_GEN3_5,
  CRIT_RATES_GEN6,
  getCritRate,
} from "./critical-hit";
export {
  applyDamageModifier,
  applyDamageModifierChain,
  getStabModifier,
  getWeatherDamageModifier,
} from "./damage-utils";
export {
  calculateExpGain,
  calculateExpGainClassic,
  getExpForLevel,
  getExpToNextLevel,
} from "./experience";
export {
  calculateStatExpContribution,
  gen1to2FullParalysisCheck,
  gen1to4MultiHitRoll,
  gen1to6ConfusionSelfHitRoll,
} from "./gen12-shared.js";
export {
  createMoveSlot,
  createPokemonInstance,
  determineGender,
  getDefaultMoves,
} from "./pokemon-factory";
export { calculateAllStats, calculateHp, calculateStat, getNatureModifier } from "./stat-calc";
export {
  ACCURACY_STAGE_RATIOS,
  calculateAccuracy,
  GEN3_STAT_STAGE_RATIOS,
  GEN12_STAT_STAGE_RATIOS,
  getAccuracyEvasionMultiplier,
  getAccuracyStageRatio,
  getGen3StatStageRatio,
  getGen12StatStageRatio,
  getStatStageMultiplier,
} from "./stat-stages";
export {
  classifyEffectiveness,
  type EffectivenessCategory,
  getTypeEffectiveness,
  getTypeMultiplier,
} from "./type-effectiveness";
