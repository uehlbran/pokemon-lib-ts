export type ExperienceGroup =
  | "erratic" // 600,000 EXP to level 100
  | "fast" // 800,000 EXP to level 100
  | "medium-fast" // 1,000,000 EXP to level 100
  | "medium-slow" // 1,059,860 EXP to level 100
  | "slow" // 1,250,000 EXP to level 100
  | "fluctuating"; // 1,640,000 EXP to level 100

/**
 * PokeAPI still exposes these legacy growth-rate names for the erratic and fluctuating
 * formulas. The runtime normalizes them at the seam so existing shipped data remains usable
 * until regenerated datasets are refreshed.
 */
export type ExperienceGroupAlias =
  | "medium"
  | "slow-then-very-fast"
  | "fast-then-very-slow";

export type ExperienceGroupIdentifier = ExperienceGroup | ExperienceGroupAlias;
