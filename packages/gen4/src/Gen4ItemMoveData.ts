/**
 * Gen 4 item-related move data tables.
 *
 * Extracted from Gen4MoveEffects.ts to break the circular import between
 * Gen4MoveEffects and Gen4MoveEffectsBehavior.
 *
 * Closes #1103
 */

import { CORE_TYPE_IDS, type PokemonType } from "@pokemon-lib-ts/core";
import { GEN4_ITEM_IDS } from "./data/reference-ids";

const ITEM_IDS = GEN4_ITEM_IDS;

// ---------------------------------------------------------------------------
// Natural Gift Berry Table (Gen 4)
// ---------------------------------------------------------------------------

/**
 * Natural Gift type and power for each berry in Gen 4.
 *
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Natural_Gift_(move)
 *   (Generation IV column)
 * Source: Showdown sim/items.ts — naturalGift field per berry item
 */
export const NATURAL_GIFT_TABLE: Readonly<Record<string, { type: PokemonType; power: number }>> = {
  [ITEM_IDS.cheriBerry]: { type: CORE_TYPE_IDS.fire, power: 60 },
  [ITEM_IDS.chestoBerry]: { type: CORE_TYPE_IDS.water, power: 60 },
  [ITEM_IDS.pechaBerry]: { type: CORE_TYPE_IDS.electric, power: 60 },
  [ITEM_IDS.rawstBerry]: { type: CORE_TYPE_IDS.grass, power: 60 },
  [ITEM_IDS.aspearBerry]: { type: CORE_TYPE_IDS.ice, power: 60 },
  [ITEM_IDS.leppaBerry]: { type: CORE_TYPE_IDS.fighting, power: 60 },
  [ITEM_IDS.oranBerry]: { type: CORE_TYPE_IDS.poison, power: 60 },
  [ITEM_IDS.persimBerry]: { type: CORE_TYPE_IDS.ground, power: 60 },
  [ITEM_IDS.lumBerry]: { type: CORE_TYPE_IDS.flying, power: 60 },
  [ITEM_IDS.sitrusBerry]: { type: CORE_TYPE_IDS.psychic, power: 60 },
  [ITEM_IDS.figyBerry]: { type: CORE_TYPE_IDS.bug, power: 60 },
  [ITEM_IDS.wikiBerry]: { type: CORE_TYPE_IDS.rock, power: 60 },
  [ITEM_IDS.magoBerry]: { type: CORE_TYPE_IDS.ghost, power: 60 },
  [ITEM_IDS.aguavBerry]: { type: CORE_TYPE_IDS.dragon, power: 60 },
  [ITEM_IDS.iapapaBerry]: { type: CORE_TYPE_IDS.dark, power: 60 },
  [ITEM_IDS.razzBerry]: { type: CORE_TYPE_IDS.steel, power: 60 },
  [ITEM_IDS.blukBerry]: { type: CORE_TYPE_IDS.fire, power: 70 },
  [ITEM_IDS.nanabBerry]: { type: CORE_TYPE_IDS.water, power: 70 },
  [ITEM_IDS.wepearBerry]: { type: CORE_TYPE_IDS.electric, power: 70 },
  [ITEM_IDS.pinapBerry]: { type: CORE_TYPE_IDS.grass, power: 70 },
  [ITEM_IDS.pomegBerry]: { type: CORE_TYPE_IDS.ice, power: 70 },
  [ITEM_IDS.kelpsyBerry]: { type: CORE_TYPE_IDS.fighting, power: 70 },
  [ITEM_IDS.qualotBerry]: { type: CORE_TYPE_IDS.poison, power: 70 },
  [ITEM_IDS.hondewBerry]: { type: CORE_TYPE_IDS.ground, power: 70 },
  [ITEM_IDS.grepaBerry]: { type: CORE_TYPE_IDS.flying, power: 70 },
  [ITEM_IDS.tamatoBerry]: { type: CORE_TYPE_IDS.psychic, power: 70 },
  [ITEM_IDS.cornnBerry]: { type: CORE_TYPE_IDS.bug, power: 70 },
  [ITEM_IDS.magostBerry]: { type: CORE_TYPE_IDS.rock, power: 70 },
  [ITEM_IDS.rabutaBerry]: { type: CORE_TYPE_IDS.ghost, power: 70 },
  [ITEM_IDS.nomelBerry]: { type: CORE_TYPE_IDS.dragon, power: 70 },
  [ITEM_IDS.spelonBerry]: { type: CORE_TYPE_IDS.dark, power: 70 },
  [ITEM_IDS.pamtreBerry]: { type: CORE_TYPE_IDS.steel, power: 70 },
  [ITEM_IDS.watmelBerry]: { type: CORE_TYPE_IDS.fire, power: 80 },
  [ITEM_IDS.durinBerry]: { type: CORE_TYPE_IDS.water, power: 80 },
  [ITEM_IDS.belueBerry]: { type: CORE_TYPE_IDS.electric, power: 80 },
  [ITEM_IDS.occaBerry]: { type: CORE_TYPE_IDS.fire, power: 60 },
  [ITEM_IDS.passhoBerry]: { type: CORE_TYPE_IDS.water, power: 60 },
  [ITEM_IDS.wacanBerry]: { type: CORE_TYPE_IDS.electric, power: 60 },
  [ITEM_IDS.rindoBerry]: { type: CORE_TYPE_IDS.grass, power: 60 },
  [ITEM_IDS.yacheBerry]: { type: CORE_TYPE_IDS.ice, power: 60 },
  [ITEM_IDS.chopleBerry]: { type: CORE_TYPE_IDS.fighting, power: 60 },
  [ITEM_IDS.kebiaBerry]: { type: CORE_TYPE_IDS.poison, power: 60 },
  [ITEM_IDS.shucaBerry]: { type: CORE_TYPE_IDS.ground, power: 60 },
  [ITEM_IDS.cobaBerry]: { type: CORE_TYPE_IDS.flying, power: 60 },
  [ITEM_IDS.payapaBerry]: { type: CORE_TYPE_IDS.psychic, power: 60 },
  [ITEM_IDS.tangaBerry]: { type: CORE_TYPE_IDS.bug, power: 60 },
  [ITEM_IDS.chartiBerry]: { type: CORE_TYPE_IDS.rock, power: 60 },
  [ITEM_IDS.kasibBerry]: { type: CORE_TYPE_IDS.ghost, power: 60 },
  [ITEM_IDS.habanBerry]: { type: CORE_TYPE_IDS.dragon, power: 60 },
  [ITEM_IDS.colburBerry]: { type: CORE_TYPE_IDS.dark, power: 60 },
  [ITEM_IDS.babiriBerry]: { type: CORE_TYPE_IDS.steel, power: 60 },
  [ITEM_IDS.liechiBerry]: { type: CORE_TYPE_IDS.grass, power: 80 },
  [ITEM_IDS.ganlonBerry]: { type: CORE_TYPE_IDS.ice, power: 80 },
  [ITEM_IDS.salacBerry]: { type: CORE_TYPE_IDS.fighting, power: 80 },
  // Source: Showdown Gen 4 data — Natural Gift: Petaya Berry => Poison type, 80 power
  [ITEM_IDS.petayaBerry]: { type: CORE_TYPE_IDS.poison, power: 80 },
  [ITEM_IDS.apicotBerry]: { type: CORE_TYPE_IDS.ground, power: 80 },
  [ITEM_IDS.lansatBerry]: { type: CORE_TYPE_IDS.flying, power: 80 },
  [ITEM_IDS.starfBerry]: { type: CORE_TYPE_IDS.psychic, power: 80 },
  [ITEM_IDS.enigmaBerry]: { type: CORE_TYPE_IDS.bug, power: 80 },
  [ITEM_IDS.micleBerry]: { type: CORE_TYPE_IDS.rock, power: 80 },
  [ITEM_IDS.custapBerry]: { type: CORE_TYPE_IDS.ghost, power: 80 },
  [ITEM_IDS.jabocaBerry]: { type: CORE_TYPE_IDS.dragon, power: 80 },
  [ITEM_IDS.rowapBerry]: { type: CORE_TYPE_IDS.dark, power: 80 },
};

// ---------------------------------------------------------------------------
// Fling Power Table (Gen 4)
// ---------------------------------------------------------------------------

/**
 * Fling power for commonly flung items in Gen 4.
 * Items not in this table with "-berry" suffix default to 10.
 * Items not in this table without "-berry" suffix have fling power 0 (fail).
 *
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Fling_(move)
 *   (Generation IV column)
 * Source: Showdown sim/items.ts — fling field per item
 */
const FLING_POWER_TABLE: Readonly<Record<string, number>> = {
  [ITEM_IDS.ironBall]: 130,
  [ITEM_IDS.hardStone]: 100,
  [ITEM_IDS.rareBone]: 100,
  [ITEM_IDS.poisonBarb]: 70,
  [ITEM_IDS.powerBracer]: 70,
  [ITEM_IDS.powerBelt]: 70,
  [ITEM_IDS.powerLens]: 70,
  [ITEM_IDS.powerBand]: 70,
  [ITEM_IDS.powerAnklet]: 70,
  [ITEM_IDS.powerWeight]: 70,
  [ITEM_IDS.machoBrace]: 60,
  [ITEM_IDS.adamantOrb]: 60,
  [ITEM_IDS.lustrousOrb]: 60,
  [ITEM_IDS.griseousOrb]: 60,
  [ITEM_IDS.dampRock]: 60,
  [ITEM_IDS.heatRock]: 60,
  [ITEM_IDS.icyRock]: 60,
  [ITEM_IDS.smoothRock]: 60,
  [ITEM_IDS.thickClub]: 90,
  [ITEM_IDS.luckyPunch]: 40,
  [ITEM_IDS.stick]: 60,
  [ITEM_IDS.metalCoat]: 30,
  [ITEM_IDS.kingsRock]: 30,
  [ITEM_IDS.razorFang]: 30,
  [ITEM_IDS.deepSeaTooth]: 90,
  [ITEM_IDS.deepSeaScale]: 30,
  [ITEM_IDS.lightBall]: 30,
  [ITEM_IDS.flameOrb]: 30,
  [ITEM_IDS.toxicOrb]: 30,
  [ITEM_IDS.blackBelt]: 30,
  [ITEM_IDS.blackGlasses]: 30,
  [ITEM_IDS.charcoal]: 30,
  [ITEM_IDS.dragonFang]: 30,
  [ITEM_IDS.magnet]: 30,
  [ITEM_IDS.miracleSeed]: 30,
  [ITEM_IDS.mysticWater]: 30,
  [ITEM_IDS.neverMeltIce]: 30,
  [ITEM_IDS.sharpBeak]: 30,
  [ITEM_IDS.silkScarf]: 30,
  [ITEM_IDS.silverPowder]: 30,
  [ITEM_IDS.softSand]: 30,
  [ITEM_IDS.spellTag]: 30,
  [ITEM_IDS.twistedSpoon]: 30,
  [ITEM_IDS.choiceBand]: 10,
  [ITEM_IDS.choiceScarf]: 10,
  [ITEM_IDS.choiceSpecs]: 10,
  [ITEM_IDS.leftovers]: 10,
  [ITEM_IDS.lifeOrb]: 30,
  [ITEM_IDS.scopeLens]: 30,
  [ITEM_IDS.wideLens]: 10,
  [ITEM_IDS.zoomLens]: 10,
  [ITEM_IDS.expertBelt]: 10,
  [ITEM_IDS.focusSash]: 10,
  [ITEM_IDS.focusBand]: 10,
  [ITEM_IDS.muscleBand]: 10,
  [ITEM_IDS.wiseGlasses]: 10,
  [ITEM_IDS.razorClaw]: 80,
  [ITEM_IDS.shellBell]: 30,
  [ITEM_IDS.soulDew]: 30,
  [ITEM_IDS.whiteHerb]: 10,
  [ITEM_IDS.mentalHerb]: 10,
  [ITEM_IDS.powerHerb]: 10,
};

/**
 * Get the Fling power for a given item.
 * Berries not in the explicit table default to 10.
 * Other items not in the table return 0 (Fling fails).
 *
 * Source: Showdown sim/items.ts — fling basePower default for berries
 */
export function getFlingPower(item: string): number {
  const explicit = FLING_POWER_TABLE[item];
  if (explicit !== undefined) return explicit;
  // All berries default to 10 power
  if (item.endsWith("-berry")) return 10;
  return 0;
}
