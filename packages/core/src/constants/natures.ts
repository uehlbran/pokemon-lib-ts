import type { NatureData } from "../entities/nature";

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
    increased: "attack",
    decreased: "defense",
    likedFlavor: "spicy",
    dislikedFlavor: "sour",
  },
  {
    id: "brave",
    displayName: "Brave",
    increased: "attack",
    decreased: "speed",
    likedFlavor: "spicy",
    dislikedFlavor: "sweet",
  },
  {
    id: "adamant",
    displayName: "Adamant",
    increased: "attack",
    decreased: "spAttack",
    likedFlavor: "spicy",
    dislikedFlavor: "dry",
  },
  {
    id: "naughty",
    displayName: "Naughty",
    increased: "attack",
    decreased: "spDefense",
    likedFlavor: "spicy",
    dislikedFlavor: "bitter",
  },

  // +Defense natures (like Sour)
  {
    id: "bold",
    displayName: "Bold",
    increased: "defense",
    decreased: "attack",
    likedFlavor: "sour",
    dislikedFlavor: "spicy",
  },
  {
    id: "relaxed",
    displayName: "Relaxed",
    increased: "defense",
    decreased: "speed",
    likedFlavor: "sour",
    dislikedFlavor: "sweet",
  },
  {
    id: "impish",
    displayName: "Impish",
    increased: "defense",
    decreased: "spAttack",
    likedFlavor: "sour",
    dislikedFlavor: "dry",
  },
  {
    id: "lax",
    displayName: "Lax",
    increased: "defense",
    decreased: "spDefense",
    likedFlavor: "sour",
    dislikedFlavor: "bitter",
  },

  // +Speed natures (like Sweet)
  {
    id: "timid",
    displayName: "Timid",
    increased: "speed",
    decreased: "attack",
    likedFlavor: "sweet",
    dislikedFlavor: "spicy",
  },
  {
    id: "hasty",
    displayName: "Hasty",
    increased: "speed",
    decreased: "defense",
    likedFlavor: "sweet",
    dislikedFlavor: "sour",
  },
  {
    id: "jolly",
    displayName: "Jolly",
    increased: "speed",
    decreased: "spAttack",
    likedFlavor: "sweet",
    dislikedFlavor: "dry",
  },
  {
    id: "naive",
    displayName: "Naive",
    increased: "speed",
    decreased: "spDefense",
    likedFlavor: "sweet",
    dislikedFlavor: "bitter",
  },

  // +SpAttack natures (like Dry)
  {
    id: "modest",
    displayName: "Modest",
    increased: "spAttack",
    decreased: "attack",
    likedFlavor: "dry",
    dislikedFlavor: "spicy",
  },
  {
    id: "mild",
    displayName: "Mild",
    increased: "spAttack",
    decreased: "defense",
    likedFlavor: "dry",
    dislikedFlavor: "sour",
  },
  {
    id: "quiet",
    displayName: "Quiet",
    increased: "spAttack",
    decreased: "speed",
    likedFlavor: "dry",
    dislikedFlavor: "sweet",
  },
  {
    id: "rash",
    displayName: "Rash",
    increased: "spAttack",
    decreased: "spDefense",
    likedFlavor: "dry",
    dislikedFlavor: "bitter",
  },

  // +SpDefense natures (like Bitter)
  {
    id: "calm",
    displayName: "Calm",
    increased: "spDefense",
    decreased: "attack",
    likedFlavor: "bitter",
    dislikedFlavor: "spicy",
  },
  {
    id: "gentle",
    displayName: "Gentle",
    increased: "spDefense",
    decreased: "defense",
    likedFlavor: "bitter",
    dislikedFlavor: "sour",
  },
  {
    id: "sassy",
    displayName: "Sassy",
    increased: "spDefense",
    decreased: "speed",
    likedFlavor: "bitter",
    dislikedFlavor: "sweet",
  },
  {
    id: "careful",
    displayName: "Careful",
    increased: "spDefense",
    decreased: "spAttack",
    likedFlavor: "bitter",
    dislikedFlavor: "dry",
  },
] as const;

/** O(1) lookup for nature data by id. */
export const NATURES_BY_ID: ReadonlyMap<NatureData["id"], NatureData> = new Map(
  ALL_NATURES.map((nature) => [nature.id, nature] as const),
);
