// @pokemon-lib/gen1 — Gen1Ruleset + complete Gen 1 data
export { createGen1DataManager } from "./data";
export { Gen1Ruleset } from "./Gen1Ruleset";
export { calculateGen1Stats, calculateStatExpContribution } from "./Gen1StatCalc";
export { GEN1_TYPE_CHART, GEN1_TYPES } from "./Gen1TypeChart";
export { calculateGen1Damage, isPhysicalInGen1 } from "./Gen1DamageCalc";
export { getGen1CritRate, rollGen1Critical, isHighCritMove } from "./Gen1CritCalc";
