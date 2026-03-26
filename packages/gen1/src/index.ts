// @pokemon-lib-ts/gen1 — Gen1Ruleset + complete Gen 1 data
export { createGen1DataManager } from "./data";
export * from "./data/reference-ids";
export { getGen1CritRate, isGen1HighCritMove, rollGen1Critical } from "./Gen1CritCalc";
export { calculateGen1Damage, isGen1PhysicalType } from "./Gen1DamageCalc";
export type { Gen1RulesetOptions } from "./Gen1Ruleset";
export { Gen1Ruleset } from "./Gen1Ruleset";
export type { Gen1BadgeBoosts } from "./Gen1StatCalc";
export { applyGen1BadgeBoosts, calculateGen1Stats } from "./Gen1StatCalc";
export { GEN1_TYPE_CHART, GEN1_TYPES } from "./Gen1TypeChart";
