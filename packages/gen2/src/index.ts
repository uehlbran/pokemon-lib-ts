// @pokemon-lib-ts/gen2 — Gen2Ruleset + complete Gen 2 data
export { createGen2DataManager } from "./data";
export { GEN2_CRIT_STAGES, getGen2CritStage, rollGen2Critical } from "./Gen2CritCalc";
export { calculateGen2Damage, isPhysicalInGen2 } from "./Gen2DamageCalc";
export { applyGen2HeldItem } from "./Gen2Items";
export { Gen2Ruleset } from "./Gen2Ruleset";
export { calculateGen2Stats } from "./Gen2StatCalc";
export { calculateGen2StatusDamage, canInflictGen2Status } from "./Gen2Status";
export { GEN2_TYPE_CHART, GEN2_TYPES } from "./Gen2TypeChart";
export { applyGen2WeatherEffects, getWeatherDamageModifier } from "./Gen2Weather";
