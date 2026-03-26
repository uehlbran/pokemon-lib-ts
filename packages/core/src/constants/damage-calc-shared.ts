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
  [CORE_ITEM_IDS.charcoal]: CORE_TYPE_IDS.fire,
  [CORE_ITEM_IDS.mysticWater]: CORE_TYPE_IDS.water,
  [CORE_ITEM_IDS.miracleSeed]: CORE_TYPE_IDS.grass,
  [CORE_ITEM_IDS.magnet]: CORE_TYPE_IDS.electric,
  [CORE_ITEM_IDS.twistedSpoon]: CORE_TYPE_IDS.psychic,
  [CORE_ITEM_IDS.spellTag]: CORE_TYPE_IDS.ghost,
  [CORE_ITEM_IDS.neverMeltIce]: CORE_TYPE_IDS.ice,
  [CORE_ITEM_IDS.blackBelt]: CORE_TYPE_IDS.fighting,
  [CORE_ITEM_IDS.poisonBarb]: CORE_TYPE_IDS.poison,
  [CORE_ITEM_IDS.softSand]: CORE_TYPE_IDS.ground,
  [CORE_ITEM_IDS.sharpBeak]: CORE_TYPE_IDS.flying,
  [CORE_ITEM_IDS.hardStone]: CORE_TYPE_IDS.rock,
  [CORE_ITEM_IDS.silverPowder]: CORE_TYPE_IDS.bug,
  [CORE_ITEM_IDS.dragonFang]: CORE_TYPE_IDS.dragon,
  [CORE_ITEM_IDS.blackGlasses]: CORE_TYPE_IDS.dark,
  [CORE_ITEM_IDS.metalCoat]: CORE_TYPE_IDS.steel,
  [CORE_ITEM_IDS.silkScarf]: CORE_TYPE_IDS.normal,
};

export const BASE_PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
  [CORE_ITEM_IDS.flamePlate]: CORE_TYPE_IDS.fire,
  [CORE_ITEM_IDS.splashPlate]: CORE_TYPE_IDS.water,
  [CORE_ITEM_IDS.meadowPlate]: CORE_TYPE_IDS.grass,
  [CORE_ITEM_IDS.zapPlate]: CORE_TYPE_IDS.electric,
  [CORE_ITEM_IDS.mindPlate]: CORE_TYPE_IDS.psychic,
  [CORE_ITEM_IDS.spookyPlate]: CORE_TYPE_IDS.ghost,
  [CORE_ITEM_IDS.iciclePlate]: CORE_TYPE_IDS.ice,
  [CORE_ITEM_IDS.fistPlate]: CORE_TYPE_IDS.fighting,
  [CORE_ITEM_IDS.toxicPlate]: CORE_TYPE_IDS.poison,
  [CORE_ITEM_IDS.earthPlate]: CORE_TYPE_IDS.ground,
  [CORE_ITEM_IDS.skyPlate]: CORE_TYPE_IDS.flying,
  [CORE_ITEM_IDS.stonePlate]: CORE_TYPE_IDS.rock,
  [CORE_ITEM_IDS.insectPlate]: CORE_TYPE_IDS.bug,
  [CORE_ITEM_IDS.dracoPlate]: CORE_TYPE_IDS.dragon,
  [CORE_ITEM_IDS.dreadPlate]: CORE_TYPE_IDS.dark,
  [CORE_ITEM_IDS.ironPlate]: CORE_TYPE_IDS.steel,
};

export const BASE_PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  [CORE_ABILITY_IDS.overgrow]: CORE_TYPE_IDS.grass,
  [CORE_ABILITY_IDS.blaze]: CORE_TYPE_IDS.fire,
  [CORE_ABILITY_IDS.torrent]: CORE_TYPE_IDS.water,
  [CORE_ABILITY_IDS.swarm]: CORE_TYPE_IDS.bug,
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
