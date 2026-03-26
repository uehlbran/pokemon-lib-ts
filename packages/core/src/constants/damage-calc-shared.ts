import type { PokemonType } from "../entities/types";
import { CORE_ABILITY_IDS, CORE_ITEM_IDS, CORE_TYPE_IDS } from "./reference-ids";

/**
 * Shared offensive lookup tables used by Gen 4-9 damage calculators.
 *
 * These tables are generation-agnostic constants, so they belong in core rather than
 * the battle engine package. Later generations extend them locally when mechanics add
 * new entries such as Pixie Plate or Roseli Berry.
 */

export const BASE_TYPE_BOOST_ITEMS: Readonly<Record<string, PokemonType>> = {
  charcoal: CORE_TYPE_IDS.fire,
  "mystic-water": CORE_TYPE_IDS.water,
  "miracle-seed": CORE_TYPE_IDS.grass,
  magnet: CORE_TYPE_IDS.electric,
  "twisted-spoon": CORE_TYPE_IDS.psychic,
  "spell-tag": CORE_TYPE_IDS.ghost,
  "never-melt-ice": CORE_TYPE_IDS.ice,
  "black-belt": CORE_TYPE_IDS.fighting,
  "poison-barb": CORE_TYPE_IDS.poison,
  "soft-sand": CORE_TYPE_IDS.ground,
  "sharp-beak": CORE_TYPE_IDS.flying,
  "hard-stone": CORE_TYPE_IDS.rock,
  "silver-powder": CORE_TYPE_IDS.bug,
  "dragon-fang": CORE_TYPE_IDS.dragon,
  "black-glasses": CORE_TYPE_IDS.dark,
  "metal-coat": CORE_TYPE_IDS.steel,
  "silk-scarf": CORE_TYPE_IDS.normal,
};

export const BASE_PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
  "flame-plate": CORE_TYPE_IDS.fire,
  "splash-plate": CORE_TYPE_IDS.water,
  "meadow-plate": CORE_TYPE_IDS.grass,
  "zap-plate": CORE_TYPE_IDS.electric,
  "mind-plate": CORE_TYPE_IDS.psychic,
  "spooky-plate": CORE_TYPE_IDS.ghost,
  "icicle-plate": CORE_TYPE_IDS.ice,
  "fist-plate": CORE_TYPE_IDS.fighting,
  "toxic-plate": CORE_TYPE_IDS.poison,
  "earth-plate": CORE_TYPE_IDS.ground,
  "sky-plate": CORE_TYPE_IDS.flying,
  "stone-plate": CORE_TYPE_IDS.rock,
  "insect-plate": CORE_TYPE_IDS.bug,
  "draco-plate": CORE_TYPE_IDS.dragon,
  "dread-plate": CORE_TYPE_IDS.dark,
  "iron-plate": CORE_TYPE_IDS.steel,
};

export const BASE_PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  [CORE_ABILITY_IDS.overgrow]: CORE_TYPE_IDS.grass,
  [CORE_ABILITY_IDS.blaze]: CORE_TYPE_IDS.fire,
  [CORE_ABILITY_IDS.torrent]: CORE_TYPE_IDS.water,
  swarm: CORE_TYPE_IDS.bug,
};

export const BASE_TYPE_RESIST_BERRIES: Readonly<Record<string, PokemonType>> = {
  [CORE_ITEM_IDS.occaBerry]: CORE_TYPE_IDS.fire,
  [CORE_ITEM_IDS.passhoBerry]: CORE_TYPE_IDS.water,
  [CORE_ITEM_IDS.wacanBerry]: CORE_TYPE_IDS.electric,
  [CORE_ITEM_IDS.rindoBerry]: CORE_TYPE_IDS.grass,
  [CORE_ITEM_IDS.yacheBerry]: CORE_TYPE_IDS.ice,
  [CORE_ITEM_IDS.chopleBerry]: CORE_TYPE_IDS.fighting,
  [CORE_ITEM_IDS.kebiaBerry]: CORE_TYPE_IDS.poison,
  [CORE_ITEM_IDS.shucaBerry]: CORE_TYPE_IDS.ground,
  [CORE_ITEM_IDS.cobaBerry]: CORE_TYPE_IDS.flying,
  [CORE_ITEM_IDS.payapaBerry]: CORE_TYPE_IDS.psychic,
  [CORE_ITEM_IDS.tangaBerry]: CORE_TYPE_IDS.bug,
  [CORE_ITEM_IDS.chartiBerry]: CORE_TYPE_IDS.rock,
  [CORE_ITEM_IDS.kasibBerry]: CORE_TYPE_IDS.ghost,
  [CORE_ITEM_IDS.habanBerry]: CORE_TYPE_IDS.dragon,
  [CORE_ITEM_IDS.colburBerry]: CORE_TYPE_IDS.dark,
  [CORE_ITEM_IDS.babiriBerry]: CORE_TYPE_IDS.steel,
  [CORE_ITEM_IDS.chilanBerry]: CORE_TYPE_IDS.normal,
};

export const BASE_ABILITY_TYPE_IMMUNITIES: Readonly<Record<string, PokemonType>> = {
  [CORE_ABILITY_IDS.levitate]: CORE_TYPE_IDS.ground,
  [CORE_ABILITY_IDS.voltAbsorb]: CORE_TYPE_IDS.electric,
  [CORE_ABILITY_IDS.waterAbsorb]: CORE_TYPE_IDS.water,
  [CORE_ABILITY_IDS.flashFire]: CORE_TYPE_IDS.fire,
  [CORE_ABILITY_IDS.motorDrive]: CORE_TYPE_IDS.electric,
  [CORE_ABILITY_IDS.drySkin]: CORE_TYPE_IDS.water,
  [CORE_ABILITY_IDS.stormDrain]: CORE_TYPE_IDS.water,
  [CORE_ABILITY_IDS.lightningRod]: CORE_TYPE_IDS.electric,
  [CORE_ABILITY_IDS.sapSipper]: CORE_TYPE_IDS.grass,
};
