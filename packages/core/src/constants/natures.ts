import type { NatureData } from "../entities/nature";
import { CORE_STAT_IDS } from "./reference-ids";

/**
 * All 25 Pokemon natures with their stat modifiers and flavor preferences.
 *
 * 5 natures are neutral (no stat change): Hardy, Docile, Serious, Bashful, Quirky.
 * The other 20 each increase one non-HP stat by 10% and decrease another by 10%.
 *
 * Flavor preferences correspond to the increased stat:
 *   attack → spicy, defense → sour, speed → sweet, spAttack → dry, spDefense → bitter
 * Disliked flavor corresponds to the decreased stat.
 */
export const ALL_NATURES: readonly NatureData[] = [
  // Neutral natures
  {
    id: "hardy",
    displayName: "Hardy",
    increased: null,
    decreased: null,
    likedFlavor: null,
    dislikedFlavor: null,
  },
  {
    id: "docile",
    displayName: "Docile",
    increased: null,
    decreased: null,
    likedFlavor: null,
    dislikedFlavor: null,
  },
  {
    id: "serious",
    displayName: "Serious",
    increased: null,
    decreased: null,
    likedFlavor: null,
    dislikedFlavor: null,
  },
  {
    id: "bashful",
    displayName: "Bashful",
    increased: null,
    decreased: null,
    likedFlavor: null,
    dislikedFlavor: null,
  },
  {
    id: "quirky",
    displayName: "Quirky",
    increased: null,
    decreased: null,
    likedFlavor: null,
    dislikedFlavor: null,
  },

  // +Attack natures (like Spicy)
  {
    id: "lonely",
    displayName: "Lonely",
    increased: CORE_STAT_IDS.attack,
    decreased: CORE_STAT_IDS.defense,
    likedFlavor: "spicy",
    dislikedFlavor: "sour",
  },
  {
    id: "brave",
    displayName: "Brave",
    increased: CORE_STAT_IDS.attack,
    decreased: CORE_STAT_IDS.speed,
    likedFlavor: "spicy",
    dislikedFlavor: "sweet",
  },
  {
    id: "adamant",
    displayName: "Adamant",
    increased: CORE_STAT_IDS.attack,
    decreased: CORE_STAT_IDS.spAttack,
    likedFlavor: "spicy",
    dislikedFlavor: "dry",
  },
  {
    id: "naughty",
    displayName: "Naughty",
    increased: CORE_STAT_IDS.attack,
    decreased: CORE_STAT_IDS.spDefense,
    likedFlavor: "spicy",
    dislikedFlavor: "bitter",
  },

  // +Defense natures (like Sour)
  {
    id: "bold",
    displayName: "Bold",
    increased: CORE_STAT_IDS.defense,
    decreased: CORE_STAT_IDS.attack,
    likedFlavor: "sour",
    dislikedFlavor: "spicy",
  },
  {
    id: "relaxed",
    displayName: "Relaxed",
    increased: CORE_STAT_IDS.defense,
    decreased: CORE_STAT_IDS.speed,
    likedFlavor: "sour",
    dislikedFlavor: "sweet",
  },
  {
    id: "impish",
    displayName: "Impish",
    increased: CORE_STAT_IDS.defense,
    decreased: CORE_STAT_IDS.spAttack,
    likedFlavor: "sour",
    dislikedFlavor: "dry",
  },
  {
    id: "lax",
    displayName: "Lax",
    increased: CORE_STAT_IDS.defense,
    decreased: CORE_STAT_IDS.spDefense,
    likedFlavor: "sour",
    dislikedFlavor: "bitter",
  },

  // +Speed natures (like Sweet)
  {
    id: "timid",
    displayName: "Timid",
    increased: CORE_STAT_IDS.speed,
    decreased: CORE_STAT_IDS.attack,
    likedFlavor: "sweet",
    dislikedFlavor: "spicy",
  },
  {
    id: "hasty",
    displayName: "Hasty",
    increased: CORE_STAT_IDS.speed,
    decreased: CORE_STAT_IDS.defense,
    likedFlavor: "sweet",
    dislikedFlavor: "sour",
  },
  {
    id: "jolly",
    displayName: "Jolly",
    increased: CORE_STAT_IDS.speed,
    decreased: CORE_STAT_IDS.spAttack,
    likedFlavor: "sweet",
    dislikedFlavor: "dry",
  },
  {
    id: "naive",
    displayName: "Naive",
    increased: CORE_STAT_IDS.speed,
    decreased: CORE_STAT_IDS.spDefense,
    likedFlavor: "sweet",
    dislikedFlavor: "bitter",
  },

  // +SpAttack natures (like Dry)
  {
    id: "modest",
    displayName: "Modest",
    increased: CORE_STAT_IDS.spAttack,
    decreased: CORE_STAT_IDS.attack,
    likedFlavor: "dry",
    dislikedFlavor: "spicy",
  },
  {
    id: "mild",
    displayName: "Mild",
    increased: CORE_STAT_IDS.spAttack,
    decreased: CORE_STAT_IDS.defense,
    likedFlavor: "dry",
    dislikedFlavor: "sour",
  },
  {
    id: "quiet",
    displayName: "Quiet",
    increased: CORE_STAT_IDS.spAttack,
    decreased: CORE_STAT_IDS.speed,
    likedFlavor: "dry",
    dislikedFlavor: "sweet",
  },
  {
    id: "rash",
    displayName: "Rash",
    increased: CORE_STAT_IDS.spAttack,
    decreased: CORE_STAT_IDS.spDefense,
    likedFlavor: "dry",
    dislikedFlavor: "bitter",
  },

  // +SpDefense natures (like Bitter)
  {
    id: "calm",
    displayName: "Calm",
    increased: CORE_STAT_IDS.spDefense,
    decreased: CORE_STAT_IDS.attack,
    likedFlavor: "bitter",
    dislikedFlavor: "spicy",
  },
  {
    id: "gentle",
    displayName: "Gentle",
    increased: CORE_STAT_IDS.spDefense,
    decreased: CORE_STAT_IDS.defense,
    likedFlavor: "bitter",
    dislikedFlavor: "sour",
  },
  {
    id: "sassy",
    displayName: "Sassy",
    increased: CORE_STAT_IDS.spDefense,
    decreased: CORE_STAT_IDS.speed,
    likedFlavor: "bitter",
    dislikedFlavor: "sweet",
  },
  {
    id: "careful",
    displayName: "Careful",
    increased: CORE_STAT_IDS.spDefense,
    decreased: CORE_STAT_IDS.spAttack,
    likedFlavor: "bitter",
    dislikedFlavor: "dry",
  },
] as const;

/** O(1) lookup for nature data by id. */
export const NATURES_BY_ID: ReadonlyMap<NatureData["id"], NatureData> = new Map(
  ALL_NATURES.map((nature) => [nature.id, nature] as const),
);
