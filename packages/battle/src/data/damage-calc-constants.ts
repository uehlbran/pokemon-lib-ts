import type { PokemonType } from "@pokemon-lib-ts/core";

/**
 * Battle-local shared lookup tables for damage calculation.
 *
 * These are the stable offensive tables that are duplicated across multiple
 * generation damage calculators. Generation-specific files extend these tables
 * only when a newer generation adds an entry.
 */

export const BASE_TYPE_BOOST_ITEMS: Readonly<Record<string, PokemonType>> = {
  charcoal: "fire",
  "mystic-water": "water",
  "miracle-seed": "grass",
  magnet: "electric",
  "twisted-spoon": "psychic",
  "spell-tag": "ghost",
  "never-melt-ice": "ice",
  "black-belt": "fighting",
  "poison-barb": "poison",
  "soft-sand": "ground",
  "sharp-beak": "flying",
  "hard-stone": "rock",
  "silver-powder": "bug",
  "dragon-fang": "dragon",
  "black-glasses": "dark",
  "metal-coat": "steel",
  "silk-scarf": "normal",
};

export const BASE_PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
  "flame-plate": "fire",
  "splash-plate": "water",
  "meadow-plate": "grass",
  "zap-plate": "electric",
  "mind-plate": "psychic",
  "spooky-plate": "ghost",
  "icicle-plate": "ice",
  "fist-plate": "fighting",
  "toxic-plate": "poison",
  "earth-plate": "ground",
  "sky-plate": "flying",
  "stone-plate": "rock",
  "insect-plate": "bug",
  "draco-plate": "dragon",
  "dread-plate": "dark",
  "iron-plate": "steel",
};

export const BASE_PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  overgrow: "grass",
  blaze: "fire",
  torrent: "water",
  swarm: "bug",
};
