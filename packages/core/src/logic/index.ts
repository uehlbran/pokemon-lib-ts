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
  CRIT_RATE_PROBABILITIES_GEN2,
  CRIT_RATE_PROBABILITIES_GEN3_5,
  CRIT_RATE_PROBABILITIES_GEN6,
  CRIT_RATE_TABLE_GEN3_5,
  CRIT_RATE_TABLE_GEN6_PLUS,
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
  pokeRound,
} from "./damage-utils";
export {
  calculateExpGain,
  calculateExpGainClassic,
  getExpForLevel,
  getExpToNextLevel,
  normalizeExperienceGroup,
} from "./experience";
export {
  createFriendship,
  MAX_FRIENDSHIP,
  MIN_FRIENDSHIP,
  validateFriendship,
} from "./friendship-inputs";
export {
  calculateStatExpContribution,
  gen1to2FullParalysisCheck,
  gen1to4MultiHitRoll,
  gen1to6ConfusionSelfHitRoll,
} from "./gen12-shared.js";
export { MEGA_STONE_DATA } from "./mega-stone-data.js";
export {
  createMoveSlot,
  createPokemonInstance,
  determineGender,
  getDefaultMoves,
} from "./pokemon-factory";
export { calculateAllStats, calculateHp, calculateStat, getNatureModifier } from "./stat-calc";
export {
  createDvs,
  createEvs,
  createIvs,
  createStatExp,
  DEFAULT_DV,
  DEFAULT_EV,
  DEFAULT_IV,
  DEFAULT_STAT_EXP,
  type DvOverrides,
  type Dvs,
  type EvOverrides,
  type Evs,
  type IvOverrides,
  type Ivs,
  MAX_DV,
  MAX_EV,
  MAX_IV,
  MAX_STAT_EXP,
  MAX_TOTAL_EVS,
  MIN_DV,
  MIN_EV,
  MIN_IV,
  MIN_STAT_EXP,
  type StatExpOverrides,
  type StatExpValues,
  validateDvs,
  validateEvs,
  validateIvs,
  validateStatExp,
} from "./stat-inputs";
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
