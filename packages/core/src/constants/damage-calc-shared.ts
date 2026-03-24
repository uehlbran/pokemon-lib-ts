import type { PokemonType } from "../entities/types";

/**
 * Shared offensive lookup tables used by Gen 4-9 damage calculators.
 *
 * These tables are generation-agnostic constants, so they belong in core rather than
 * the battle engine package. Later generations extend them locally when mechanics add
 * new entries such as Pixie Plate or Roseli Berry.
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
