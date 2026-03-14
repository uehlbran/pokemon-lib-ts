import type { NonHpStat } from "./stats";

export type NatureId =
  | "hardy"
  | "lonely"
  | "brave"
  | "adamant"
  | "naughty"
  | "bold"
  | "docile"
  | "relaxed"
  | "impish"
  | "lax"
  | "timid"
  | "hasty"
  | "serious"
  | "jolly"
  | "naive"
  | "modest"
  | "mild"
  | "quiet"
  | "bashful"
  | "rash"
  | "calm"
  | "gentle"
  | "sassy"
  | "careful"
  | "quirky";

/** The 5 neutral natures (no stat modification) */
export const NEUTRAL_NATURES: readonly NatureId[] = [
  "hardy",
  "docile",
  "serious",
  "bashful",
  "quirky",
] as const;

export interface NatureData {
  /** Lowercase identifier (e.g., "adamant") */
  readonly id: NatureId;

  /** Display name (e.g., "Adamant") */
  readonly displayName: string;

  /** Stat increased by 10% (null for neutral natures) */
  readonly increased: NonHpStat | null;

  /** Stat decreased by 10% (null for neutral natures) */
  readonly decreased: NonHpStat | null;

  /** Flavor this nature likes (for PokeBlocks/Poffins) */
  readonly likedFlavor: string | null;

  /** Flavor this nature dislikes */
  readonly dislikedFlavor: string | null;
}
