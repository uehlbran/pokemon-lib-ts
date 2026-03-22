/**
 * Gen 7 Mega Evolution BattleGimmick implementation.
 *
 * Ported from Gen6MegaEvolution with one critical difference:
 * Gen 7 does NOT use `side.gimmickUsed` to track mega evolution usage,
 * because Gen 7 allows BOTH Mega Evolution AND Z-Moves in the same battle.
 * The single `side.gimmickUsed` boolean would block one or the other.
 *
 * Instead, Gen7MegaEvolution tracks mega usage internally via a per-side
 * Set, matching how Gen7ZMove tracks Z-Move usage internally.
 *
 * Mega Evolution mechanics are identical to Gen 6:
 *   - One Mega Evolution per trainer per battle
 *   - Pokemon must hold the correct Mega Stone for its species
 *   - Mega Evolution occurs before the move is executed
 *   - Mega Evolution is permanent for the rest of the battle
 *   - Mega forms have different base stats, type(s), and ability
 *
 * Source: Showdown sim/side.ts:170 -- megaUsed: boolean (separate from zMoveUsed in Gen 7)
 * Source: Bulbapedia "Mega Evolution" -- mechanics identical across Gen 6 and Gen 7
 * Source: Showdown sim/battle-actions.ts -- canMega checks are per-side, not per-gimmick-slot
 */

import type {
  ActivePokemon,
  BattleEvent,
  BattleGimmick,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import {
  ALL_NATURES,
  calculateStat,
  getNatureModifier,
  type MegaEvolutionData,
  type MutableStatBlock,
  type NatureData,
  type PokemonType,
} from "@pokemon-lib-ts/core";

import { isMegaStone, isZCrystal } from "./Gen7Items.js";

/**
 * Hardcoded Mega Evolution data keyed by Mega Stone item ID.
 *
 * No new Mega Evolutions were introduced in Gen 7 -- this table is identical
 * to the Gen 6 table. All 47 Mega Stones from XY/ORAS carry forward unchanged.
 *
 * Source: Bulbapedia "Mega Evolution" -- same mega forms in Gen 6 and Gen 7
 * Source: Showdown data/pokedex.ts -- mega form entries unchanged between Gen 6 and 7
 * Source: Showdown data/items.ts -- mega stone item IDs unchanged between Gen 6 and 7
 */
export const MEGA_STONE_DATA: Readonly<Record<string, MegaEvolutionData>> = {
  // #003 Venusaur-Mega
  // Source: Bulbapedia "Venusaurite" — belongs to Venusaur (#003)
  venusaurite: {
    form: "mega-venusaur",
    item: "venusaurite",
    types: ["grass", "poison"],
    baseStats: { hp: 80, attack: 100, defense: 123, spAttack: 122, spDefense: 120, speed: 80 },
    ability: "thick-fat",
    baseSpeciesId: 3,
  },
  // #006 Charizard-Mega-X
  // Source: Bulbapedia "Charizardite X" — belongs to Charizard (#006)
  "charizardite-x": {
    form: "mega-charizard-x",
    item: "charizardite-x",
    types: ["fire", "dragon"],
    baseStats: { hp: 78, attack: 130, defense: 111, spAttack: 130, spDefense: 85, speed: 100 },
    ability: "tough-claws",
    baseSpeciesId: 6,
  },
  // #006 Charizard-Mega-Y
  // Source: Bulbapedia "Charizardite Y" — belongs to Charizard (#006)
  "charizardite-y": {
    form: "mega-charizard-y",
    item: "charizardite-y",
    types: ["fire", "flying"],
    baseStats: { hp: 78, attack: 104, defense: 78, spAttack: 159, spDefense: 115, speed: 100 },
    ability: "drought",
    baseSpeciesId: 6,
  },
  // #009 Blastoise-Mega
  // Source: Bulbapedia "Blastoisinite" — belongs to Blastoise (#009)
  blastoisinite: {
    form: "mega-blastoise",
    item: "blastoisinite",
    types: ["water"],
    baseStats: { hp: 79, attack: 103, defense: 120, spAttack: 135, spDefense: 115, speed: 78 },
    ability: "mega-launcher",
    baseSpeciesId: 9,
  },
  // #015 Beedrill-Mega
  // Source: Bulbapedia "Beedrillite" — belongs to Beedrill (#015)
  beedrillite: {
    form: "mega-beedrill",
    item: "beedrillite",
    types: ["bug", "poison"],
    baseStats: { hp: 65, attack: 150, defense: 40, spAttack: 15, spDefense: 80, speed: 145 },
    ability: "adaptability",
    baseSpeciesId: 15,
  },
  // #018 Pidgeot-Mega
  // Source: Bulbapedia "Pidgeotite" — belongs to Pidgeot (#018)
  pidgeotite: {
    form: "mega-pidgeot",
    item: "pidgeotite",
    types: ["normal", "flying"],
    baseStats: { hp: 83, attack: 80, defense: 80, spAttack: 135, spDefense: 80, speed: 121 },
    ability: "no-guard",
    baseSpeciesId: 18,
  },
  // #065 Alakazam-Mega
  // Source: Bulbapedia "Alakazite" — belongs to Alakazam (#065)
  alakazite: {
    form: "mega-alakazam",
    item: "alakazite",
    types: ["psychic"],
    baseStats: { hp: 55, attack: 50, defense: 65, spAttack: 175, spDefense: 95, speed: 150 },
    ability: "trace",
    baseSpeciesId: 65,
  },
  // #094 Gengar-Mega
  // Source: Bulbapedia "Gengarite" — belongs to Gengar (#094)
  gengarite: {
    form: "mega-gengar",
    item: "gengarite",
    types: ["ghost", "poison"],
    baseStats: { hp: 60, attack: 65, defense: 80, spAttack: 170, spDefense: 95, speed: 130 },
    ability: "shadow-tag",
    baseSpeciesId: 94,
  },
  // #115 Kangaskhan-Mega (Parental Bond)
  // Source: Bulbapedia "Kangaskhanite" — belongs to Kangaskhan (#115)
  kangaskhanite: {
    form: "mega-kangaskhan",
    item: "kangaskhanite",
    types: ["normal"],
    baseStats: { hp: 105, attack: 125, defense: 100, spAttack: 60, spDefense: 100, speed: 100 },
    ability: "parental-bond",
    baseSpeciesId: 115,
  },
  // #127 Pinsir-Mega
  // Source: Bulbapedia "Pinsirite" — belongs to Pinsir (#127)
  pinsirite: {
    form: "mega-pinsir",
    item: "pinsirite",
    types: ["bug", "flying"],
    baseStats: { hp: 65, attack: 155, defense: 120, spAttack: 65, spDefense: 90, speed: 105 },
    ability: "aerilate",
    baseSpeciesId: 127,
  },
  // #130 Gyarados-Mega
  // Source: Bulbapedia "Gyaradosite" — belongs to Gyarados (#130)
  gyaradosite: {
    form: "mega-gyarados",
    item: "gyaradosite",
    types: ["water", "dark"],
    baseStats: { hp: 95, attack: 155, defense: 109, spAttack: 70, spDefense: 130, speed: 81 },
    ability: "mold-breaker",
    baseSpeciesId: 130,
  },
  // #142 Aerodactyl-Mega
  // Source: Bulbapedia "Aerodactylite" — belongs to Aerodactyl (#142)
  aerodactylite: {
    form: "mega-aerodactyl",
    item: "aerodactylite",
    types: ["rock", "flying"],
    baseStats: { hp: 80, attack: 135, defense: 85, spAttack: 70, spDefense: 95, speed: 150 },
    ability: "tough-claws",
    baseSpeciesId: 142,
  },
  // #150 Mewtwo-Mega-X
  // Source: Bulbapedia "Mewtwonite X" — belongs to Mewtwo (#150)
  "mewtwonite-x": {
    form: "mega-mewtwo-x",
    item: "mewtwonite-x",
    types: ["psychic", "fighting"],
    baseStats: { hp: 106, attack: 190, defense: 100, spAttack: 154, spDefense: 100, speed: 130 },
    ability: "steadfast",
    baseSpeciesId: 150,
  },
  // #150 Mewtwo-Mega-Y
  // Source: Bulbapedia "Mewtwonite Y" — belongs to Mewtwo (#150)
  "mewtwonite-y": {
    form: "mega-mewtwo-y",
    item: "mewtwonite-y",
    types: ["psychic"],
    baseStats: { hp: 106, attack: 150, defense: 70, spAttack: 194, spDefense: 120, speed: 140 },
    ability: "insomnia",
    baseSpeciesId: 150,
  },
  // #181 Ampharos-Mega
  // Source: Bulbapedia "Ampharosite" — belongs to Ampharos (#181)
  ampharosite: {
    form: "mega-ampharos",
    item: "ampharosite",
    types: ["electric", "dragon"],
    baseStats: { hp: 90, attack: 95, defense: 105, spAttack: 165, spDefense: 110, speed: 45 },
    ability: "mold-breaker",
    baseSpeciesId: 181,
  },
  // #208 Steelix-Mega (ORAS)
  // Source: Bulbapedia "Steelixite" — belongs to Steelix (#208)
  steelixite: {
    form: "mega-steelix",
    item: "steelixite",
    types: ["steel", "ground"],
    baseStats: { hp: 75, attack: 125, defense: 230, spAttack: 55, spDefense: 95, speed: 30 },
    ability: "sand-force",
    baseSpeciesId: 208,
  },
  // #212 Scizor-Mega
  // Source: Bulbapedia "Scizorite" — belongs to Scizor (#212)
  scizorite: {
    form: "mega-scizor",
    item: "scizorite",
    types: ["bug", "steel"],
    baseStats: { hp: 70, attack: 150, defense: 140, spAttack: 65, spDefense: 100, speed: 75 },
    ability: "technician",
    baseSpeciesId: 212,
  },
  // #214 Heracross-Mega
  // Source: Bulbapedia "Heracronite" — belongs to Heracross (#214)
  heracronite: {
    form: "mega-heracross",
    item: "heracronite",
    types: ["bug", "fighting"],
    baseStats: { hp: 80, attack: 185, defense: 115, spAttack: 40, spDefense: 105, speed: 75 },
    ability: "skill-link",
    baseSpeciesId: 214,
  },
  // #229 Houndoom-Mega
  // Source: Bulbapedia "Houndoominite" — belongs to Houndoom (#229)
  houndoominite: {
    form: "mega-houndoom",
    item: "houndoominite",
    types: ["dark", "fire"],
    baseStats: { hp: 75, attack: 90, defense: 90, spAttack: 140, spDefense: 90, speed: 115 },
    ability: "solar-power",
    baseSpeciesId: 229,
  },
  // #248 Tyranitar-Mega
  // Source: Bulbapedia "Tyranitarite" — belongs to Tyranitar (#248)
  tyranitarite: {
    form: "mega-tyranitar",
    item: "tyranitarite",
    types: ["rock", "dark"],
    baseStats: { hp: 100, attack: 164, defense: 150, spAttack: 95, spDefense: 120, speed: 71 },
    ability: "sand-stream",
    baseSpeciesId: 248,
  },
  // #254 Sceptile-Mega
  // Source: Bulbapedia "Sceptilite" — belongs to Sceptile (#254)
  sceptilite: {
    form: "mega-sceptile",
    item: "sceptilite",
    types: ["grass", "dragon"],
    baseStats: { hp: 70, attack: 110, defense: 75, spAttack: 145, spDefense: 85, speed: 145 },
    ability: "lightning-rod",
    baseSpeciesId: 254,
  },
  // #257 Blaziken-Mega
  // Source: Bulbapedia "Blazikenite" — belongs to Blaziken (#257)
  blazikenite: {
    form: "mega-blaziken",
    item: "blazikenite",
    types: ["fire", "fighting"],
    baseStats: { hp: 80, attack: 160, defense: 80, spAttack: 130, spDefense: 80, speed: 100 },
    ability: "speed-boost",
    baseSpeciesId: 257,
  },
  // #260 Swampert-Mega
  // Source: Bulbapedia "Swampertite" — belongs to Swampert (#260)
  swampertite: {
    form: "mega-swampert",
    item: "swampertite",
    types: ["water", "ground"],
    baseStats: { hp: 100, attack: 150, defense: 110, spAttack: 95, spDefense: 110, speed: 70 },
    ability: "swift-swim",
    baseSpeciesId: 260,
  },
  // #282 Gardevoir-Mega
  // Source: Bulbapedia "Gardevoirite" — belongs to Gardevoir (#282)
  gardevoirite: {
    form: "mega-gardevoir",
    item: "gardevoirite",
    types: ["psychic", "fairy"],
    baseStats: { hp: 68, attack: 85, defense: 65, spAttack: 165, spDefense: 135, speed: 100 },
    ability: "pixilate",
    baseSpeciesId: 282,
  },
  // #302 Sableye-Mega
  // Source: Bulbapedia "Sablenite" — belongs to Sableye (#302)
  sablenite: {
    form: "mega-sableye",
    item: "sablenite",
    types: ["dark", "ghost"],
    baseStats: { hp: 50, attack: 85, defense: 125, spAttack: 85, spDefense: 115, speed: 20 },
    ability: "magic-bounce",
    baseSpeciesId: 302,
  },
  // #303 Mawile-Mega
  // Source: Bulbapedia "Mawilite" — belongs to Mawile (#303)
  mawilite: {
    form: "mega-mawile",
    item: "mawilite",
    types: ["steel", "fairy"],
    baseStats: { hp: 50, attack: 105, defense: 125, spAttack: 55, spDefense: 95, speed: 50 },
    ability: "huge-power",
    baseSpeciesId: 303,
  },
  // #306 Aggron-Mega
  // Source: Bulbapedia "Aggronite" — belongs to Aggron (#306)
  aggronite: {
    form: "mega-aggron",
    item: "aggronite",
    types: ["steel"],
    baseStats: { hp: 70, attack: 140, defense: 230, spAttack: 60, spDefense: 80, speed: 50 },
    ability: "filter",
    baseSpeciesId: 306,
  },
  // #308 Medicham-Mega (XY)
  // Source: Bulbapedia "Medichamite" — belongs to Medicham (#308)
  medichamite: {
    form: "mega-medicham",
    item: "medichamite",
    types: ["fighting", "psychic"],
    baseStats: { hp: 60, attack: 100, defense: 85, spAttack: 80, spDefense: 85, speed: 100 },
    ability: "pure-power",
    baseSpeciesId: 308,
  },
  // #310 Manectric-Mega
  // Source: Bulbapedia "Manectite" — belongs to Manectric (#310)
  manectite: {
    form: "mega-manectric",
    item: "manectite",
    types: ["electric"],
    baseStats: { hp: 70, attack: 75, defense: 80, spAttack: 135, spDefense: 80, speed: 135 },
    ability: "intimidate",
    baseSpeciesId: 310,
  },
  // #319 Sharpedo-Mega
  // Source: Bulbapedia "Sharpedonite" — belongs to Sharpedo (#319)
  sharpedonite: {
    form: "mega-sharpedo",
    item: "sharpedonite",
    types: ["water", "dark"],
    baseStats: { hp: 70, attack: 140, defense: 70, spAttack: 110, spDefense: 65, speed: 105 },
    ability: "strong-jaw",
    baseSpeciesId: 319,
  },
  // #323 Camerupt-Mega
  // Source: Bulbapedia "Cameruptite" — belongs to Camerupt (#323)
  cameruptite: {
    form: "mega-camerupt",
    item: "cameruptite",
    types: ["fire", "ground"],
    baseStats: { hp: 70, attack: 120, defense: 100, spAttack: 145, spDefense: 105, speed: 20 },
    ability: "sheer-force",
    baseSpeciesId: 323,
  },
  // #334 Altaria-Mega
  // Source: Bulbapedia "Altarianite" — belongs to Altaria (#334)
  altarianite: {
    form: "mega-altaria",
    item: "altarianite",
    types: ["dragon", "fairy"],
    baseStats: { hp: 75, attack: 110, defense: 110, spAttack: 110, spDefense: 105, speed: 80 },
    ability: "pixilate",
    baseSpeciesId: 334,
  },
  // #354 Banette-Mega
  // Source: Bulbapedia "Banettite" — belongs to Banette (#354)
  banettite: {
    form: "mega-banette",
    item: "banettite",
    types: ["ghost"],
    baseStats: { hp: 64, attack: 165, defense: 75, spAttack: 93, spDefense: 83, speed: 75 },
    ability: "prankster",
    baseSpeciesId: 354,
  },
  // #359 Absol-Mega
  // Source: Bulbapedia "Absolite" — belongs to Absol (#359)
  absolite: {
    form: "mega-absol",
    item: "absolite",
    types: ["dark"],
    baseStats: { hp: 65, attack: 150, defense: 60, spAttack: 115, spDefense: 60, speed: 115 },
    ability: "magic-bounce",
    baseSpeciesId: 359,
  },
  // #362 Glalie-Mega
  // Source: Bulbapedia "Glalitite" — belongs to Glalie (#362)
  glalitite: {
    form: "mega-glalie",
    item: "glalitite",
    types: ["ice"],
    baseStats: { hp: 80, attack: 120, defense: 80, spAttack: 120, spDefense: 80, speed: 100 },
    ability: "refrigerate",
    baseSpeciesId: 362,
  },
  // #373 Salamence-Mega
  // Source: Bulbapedia "Salamencite" — belongs to Salamence (#373)
  salamencite: {
    form: "mega-salamence",
    item: "salamencite",
    types: ["dragon", "flying"],
    baseStats: { hp: 95, attack: 145, defense: 130, spAttack: 120, spDefense: 90, speed: 120 },
    ability: "aerilate",
    baseSpeciesId: 373,
  },
  // #376 Metagross-Mega
  // Source: Bulbapedia "Metagrossite" — belongs to Metagross (#376)
  metagrossite: {
    form: "mega-metagross",
    item: "metagrossite",
    types: ["steel", "psychic"],
    baseStats: { hp: 80, attack: 145, defense: 150, spAttack: 105, spDefense: 110, speed: 110 },
    ability: "tough-claws",
    baseSpeciesId: 376,
  },
  // #380 Latias-Mega
  // Source: Bulbapedia "Latiasite" — belongs to Latias (#380)
  latiasite: {
    form: "mega-latias",
    item: "latiasite",
    types: ["dragon", "psychic"],
    baseStats: { hp: 80, attack: 100, defense: 120, spAttack: 140, spDefense: 150, speed: 110 },
    ability: "levitate",
    baseSpeciesId: 380,
  },
  // #381 Latios-Mega
  // Source: Bulbapedia "Latiosite" — belongs to Latios (#381)
  latiosite: {
    form: "mega-latios",
    item: "latiosite",
    types: ["dragon", "psychic"],
    baseStats: { hp: 80, attack: 130, defense: 100, spAttack: 160, spDefense: 120, speed: 110 },
    ability: "levitate",
    baseSpeciesId: 381,
  },
  // #384 Rayquaza-Mega is NOT in this table because it doesn't need a Mega Stone.
  // Handled as a special case via MEGA_RAYQUAZA_DATA below.

  // #428 Lopunny-Mega
  // Source: Bulbapedia "Lopunnite" — belongs to Lopunny (#428)
  lopunnite: {
    form: "mega-lopunny",
    item: "lopunnite",
    types: ["normal", "fighting"],
    baseStats: { hp: 65, attack: 136, defense: 94, spAttack: 54, spDefense: 96, speed: 135 },
    ability: "scrappy",
    baseSpeciesId: 428,
  },
  // #445 Garchomp-Mega
  // Source: Bulbapedia "Garchompite" — belongs to Garchomp (#445)
  garchompite: {
    form: "mega-garchomp",
    item: "garchompite",
    types: ["dragon", "ground"],
    baseStats: { hp: 108, attack: 170, defense: 115, spAttack: 120, spDefense: 95, speed: 92 },
    ability: "sand-force",
    baseSpeciesId: 445,
  },
  // #448 Lucario-Mega
  // Source: Bulbapedia "Lucarionite" — belongs to Lucario (#448)
  lucarionite: {
    form: "mega-lucario",
    item: "lucarionite",
    types: ["fighting", "steel"],
    baseStats: { hp: 70, attack: 145, defense: 88, spAttack: 140, spDefense: 70, speed: 112 },
    ability: "adaptability",
    baseSpeciesId: 448,
  },
  // #460 Abomasnow-Mega
  // Source: Bulbapedia "Abomasite" — belongs to Abomasnow (#460)
  abomasite: {
    form: "mega-abomasnow",
    item: "abomasite",
    types: ["grass", "ice"],
    baseStats: { hp: 90, attack: 132, defense: 105, spAttack: 132, spDefense: 105, speed: 30 },
    ability: "snow-warning",
    baseSpeciesId: 460,
  },
  // #475 Gallade-Mega
  // Source: Bulbapedia "Galladite" — belongs to Gallade (#475)
  galladite: {
    form: "mega-gallade",
    item: "galladite",
    types: ["psychic", "fighting"],
    baseStats: { hp: 68, attack: 165, defense: 95, spAttack: 65, spDefense: 115, speed: 110 },
    ability: "inner-focus",
    baseSpeciesId: 475,
  },
  // #531 Audino-Mega
  // Source: Bulbapedia "Audinite" — belongs to Audino (#531)
  audinite: {
    form: "mega-audino",
    item: "audinite",
    types: ["normal", "fairy"],
    baseStats: { hp: 103, attack: 60, defense: 126, spAttack: 80, spDefense: 126, speed: 50 },
    ability: "healer",
    baseSpeciesId: 531,
  },
  // #719 Diancie-Mega
  // Source: Bulbapedia "Diancite" — belongs to Diancie (#719)
  diancite: {
    form: "mega-diancie",
    item: "diancite",
    types: ["rock", "fairy"],
    baseStats: { hp: 50, attack: 160, defense: 110, spAttack: 160, spDefense: 110, speed: 110 },
    ability: "magic-bounce",
    baseSpeciesId: 719,
  },
  // #079/#080 Slowbro-Mega (ORAS)
  // Source: Bulbapedia "Slowbronite" — belongs to Slowbro (#080)
  slowbronite: {
    form: "mega-slowbro",
    item: "slowbronite",
    types: ["water", "psychic"],
    baseStats: { hp: 95, attack: 75, defense: 180, spAttack: 130, spDefense: 80, speed: 30 },
    ability: "shell-armor",
    baseSpeciesId: 80,
  },
};

/**
 * Get the Mega Evolution data for a given held item, if applicable.
 *
 * Returns the MegaEvolutionData for the item if it is a Mega Stone with registered
 * mega form data, or null if the item is not a qualifying Mega Stone.
 *
 * Source: Showdown data/items.ts -- individual mega stone entries
 * Source: Bulbapedia "Mega Evolution" -- mega form data
 *
 * @param itemId - The item ID to look up
 * @returns MegaEvolutionData if item is a Mega Stone with known mega form data, else null
 */
/**
 * Mega Rayquaza data. Rayquaza does not need a Mega Stone — it Mega Evolves by
 * knowing Dragon Ascent (and must NOT be holding a Z-Crystal).
 *
 * Source: Bulbapedia "Mega Rayquaza" -- Mega Evolves if it knows Dragon Ascent
 * Source: Showdown data/items.ts -- no rayquazite item; Showdown sim/battle-actions.ts
 *   canMegaEvo special-cases Rayquaza: has Dragon Ascent + no Z-Crystal
 * Source: Bulbapedia "Mega Evolution" -- base stats for Mega Rayquaza
 */
export const MEGA_RAYQUAZA_DATA: Readonly<MegaEvolutionData> = {
  form: "mega-rayquaza",
  item: "", // No Mega Stone needed
  types: ["dragon", "flying"],
  baseStats: {
    hp: 105,
    attack: 180,
    defense: 100,
    spAttack: 180,
    spDefense: 100,
    speed: 115,
  },
  ability: "delta-stream",
  baseSpeciesId: 384,
};

/**
 * Rayquaza's species ID for special-case Mega Evolution checks.
 * Source: Bulbapedia -- Rayquaza is #384 in the National Pokedex
 */
const RAYQUAZA_SPECIES_ID = 384;

/**
 * Check if a Pokemon is Rayquaza and knows Dragon Ascent (required for Mega Evolution).
 * Also checks that Rayquaza is NOT holding a Z-Crystal (which blocks Mega Evolution).
 *
 * Source: Showdown sim/battle-actions.ts -- canMegaEvo: Rayquaza needs Dragon Ascent, no Z-Crystal
 * Source: Bulbapedia "Mega Evolution" -- "Rayquaza can Mega Evolve if it knows Dragon Ascent
 *   and is not holding a Z-Crystal."
 */
export function canRayquazaMegaEvolve(pokemon: ActivePokemon): boolean {
  if (pokemon.pokemon.speciesId !== RAYQUAZA_SPECIES_ID) return false;
  // Must know Dragon Ascent
  const knowsDragonAscent = pokemon.pokemon.moves.some((m) => m.moveId === "dragon-ascent");
  if (!knowsDragonAscent) return false;
  // Must NOT hold a Z-Crystal (Z-Crystals block Rayquaza's Mega Evolution)
  const heldItem = pokemon.pokemon.heldItem;
  if (heldItem && isZCrystal(heldItem)) return false;
  return true;
}

export function getMegaEvolutionData(itemId: string | null | undefined): MegaEvolutionData | null {
  if (!itemId) return null;
  if (!isMegaStone(itemId)) return null;
  return MEGA_STONE_DATA[itemId] ?? null;
}

/**
 * Gen 7 Mega Evolution gimmick.
 *
 * Implements the BattleGimmick interface for Gen 7 Mega Evolution.
 *
 * KEY DIFFERENCE FROM GEN 6:
 * Gen 6 uses `side.gimmickUsed = true` to block reuse. Gen 7 cannot do this
 * because Z-Moves also exist in Gen 7 and both gimmicks must be usable in the
 * same battle. Instead, mega usage is tracked internally via a per-side Set,
 * matching the pattern used by Gen7ZMove.
 *
 * Rules (Source: Bulbapedia "Mega Evolution", Showdown sim/battle.ts Gen 7):
 *   1. One Mega Evolution per trainer per battle (tracked internally)
 *   2. The Pokemon must hold the correct Mega Stone for its species
 *   3. Mega Evolution occurs at the start of the turn, before the move is executed
 *   4. Mega Evolution is permanent for the rest of the battle (no reversion)
 *   5. Mega forms have different base stats, type(s), and ability
 *   6. The Mega Stone is consumed (effectively locked in -- cannot be removed or used again)
 *
 * Source: Showdown sim/side.ts:170 -- megaUsed per-side tracking (separate from zMoveUsed)
 * Source: Bulbapedia "Mega Evolution" Gen 7 -- mechanics unchanged from Gen 6
 */
export class Gen7MegaEvolution implements BattleGimmick {
  readonly name = "Mega Evolution";
  readonly generations = [7] as const;

  /**
   * Tracks which sides have already used their Mega Evolution this battle.
   * Gen 7 tracks Mega Evolution usage separately from Z-Move usage
   * (side.megaUsed in Showdown vs side.zMoveUsed).
   *
   * Source: Showdown sim/side.ts:170 -- megaUsed is per-side, separate from zMoveUsed
   */
  private readonly usedBySide: Set<0 | 1> = new Set();

  /**
   * Returns true if Mega Evolution can be used this turn.
   *
   * Conditions (all must be true):
   *   - This side has not yet used Mega Evolution this battle (checked via internal tracking)
   *   - The Pokemon has not already mega evolved
   *   - The Pokemon holds a Mega Stone
   *   - That Mega Stone has known mega form data
   *   - The Mega Stone belongs to this Pokemon's species
   *
   * NOTE: Does NOT check side.gimmickUsed (Gen 7 difference from Gen 6).
   *
   * Source: Showdown sim/battle.ts -- megaEvolution can-use checks
   * Source: Bulbapedia "Mega Evolution" -- one per trainer per battle
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    // 1. Mega not already used this battle for this side (internal tracking)
    if (this.usedBySide.has(side.index)) return false;
    // 2. Pokemon not already mega evolved
    if (pokemon.isMega) return false;

    // Special case: Rayquaza Mega Evolution via Dragon Ascent (no Mega Stone needed).
    // Source: Showdown sim/battle-actions.ts -- canMegaEvo: Rayquaza special case
    // Source: Bulbapedia "Mega Evolution" -- "Rayquaza can Mega Evolve if it knows
    //   Dragon Ascent and is not holding a Z-Crystal."
    if (canRayquazaMegaEvolve(pokemon)) return true;

    // 3-4. Pokemon holds a valid Mega Stone with registered form data
    const megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    if (!megaData) return false;
    // 5. Mega Stone species must match the Pokemon's species
    // Source: Game mechanic -- each Mega Stone is species-specific.
    // Source: Showdown sim/battle.ts -- formeChange only permitted when pokemon.species matches stone
    if (megaData.baseSpeciesId !== pokemon.pokemon.speciesId) return false;
    return true;
  }

  /**
   * Activates Mega Evolution for the given Pokemon.
   *
   * Mutations applied:
   *   - pokemon.types updated to mega form types
   *   - pokemon.ability updated to mega form ability
   *   - pokemon.pokemon.calculatedStats updated to mega form base stats (scaled by level)
   *   - pokemon.isMega set to true
   *   - Internal usedBySide tracking updated
   *   - side.gimmickUsed is NOT set (Gen 7 difference from Gen 6)
   *   - pokemon.pokemon.megaTypes and megaAbility set for switch-in restoration
   *
   * Returns a MegaEvolveEvent identifying the side, Pokemon UID, and form.
   *
   * Source: Bulbapedia "Mega Evolution" -- base stat, type, ability changes
   * Source: Showdown sim/battle.ts -- mega evolution activation and event emission
   */
  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    // Guard against double-use and already-mega
    if (this.usedBySide.has(side.index) || pokemon.isMega) return [];

    // Determine mega data: Rayquaza special case, or standard Mega Stone lookup
    // Source: Showdown sim/battle-actions.ts -- Rayquaza mega uses special data, not stone lookup
    let megaData: MegaEvolutionData | null;
    if (canRayquazaMegaEvolve(pokemon)) {
      megaData = MEGA_RAYQUAZA_DATA;
    } else {
      megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    }
    // Guard: no valid mega data, or species mismatch
    if (!megaData || megaData.baseSpeciesId !== pokemon.pokemon.speciesId) {
      return [];
    }

    // Update type(s)
    pokemon.types = [...megaData.types] as PokemonType[];

    // Update ability
    pokemon.ability = megaData.ability;

    // Update calculated stats to mega form stats using the full Gen 3+ stat formula.
    // Source: Showdown sim/battle.ts (setSpecies) -- mega evolution calls spreadModify with the
    //   mega form's base stats, which applies level/IV/EV/nature scaling.
    // Source: pret/pokeemerald src/pokemon.c:2814 CALC_STAT macro
    //   Stat = floor((floor((2*Base + IV + floor(EV/4)) * Level / 100) + 5) * NatureMod)
    //
    // StatBlock is readonly in the interface, but calculatedStats is the live runtime stat block
    // that the engine mutates; cast through unknown to MutableStatBlock for mutation.
    if (pokemon.pokemon.calculatedStats) {
      const cs = pokemon.pokemon.calculatedStats as unknown as MutableStatBlock;
      const { level, ivs, evs, nature: natureId } = pokemon.pokemon;

      // Look up the nature data to get boost/hinder modifiers.
      // ALL_NATURES contains all 25 natures with their stat effects.
      // Hardy (neutral, 1.0/1.0 modifier on all stats) is the safe fallback.
      // Source: packages/core/src/constants/natures.ts
      const foundNature = ALL_NATURES.find((n) => n.id === natureId);
      // Hardy is neutral (increased/decreased both null) -- safe fallback that produces 1.0 modifier on all stats.
      const natureData: NatureData = foundNature ?? {
        id: "hardy",
        displayName: "Hardy",
        increased: null,
        decreased: null,
        likedFlavor: null,
        dislikedFlavor: null,
      };

      // HP does NOT change on mega evolution (only attack, defense, spAtk, spDef, speed)
      // Source: Bulbapedia "Mega Evolution" -- "HP does not change when Mega Evolving"
      cs.attack = calculateStat(
        megaData.baseStats.attack,
        ivs.attack,
        evs.attack,
        level,
        getNatureModifier(natureData, "attack"),
      );
      cs.defense = calculateStat(
        megaData.baseStats.defense,
        ivs.defense,
        evs.defense,
        level,
        getNatureModifier(natureData, "defense"),
      );
      cs.spAttack = calculateStat(
        megaData.baseStats.spAttack,
        ivs.spAttack,
        evs.spAttack,
        level,
        getNatureModifier(natureData, "spAttack"),
      );
      cs.spDefense = calculateStat(
        megaData.baseStats.spDefense,
        ivs.spDefense,
        evs.spDefense,
        level,
        getNatureModifier(natureData, "spDefense"),
      );
      cs.speed = calculateStat(
        megaData.baseStats.speed,
        ivs.speed,
        evs.speed,
        level,
        getNatureModifier(natureData, "speed"),
      );
    }

    // Mark the Pokemon as mega evolved -- internal tracking only, NOT side.gimmickUsed
    // Source: Showdown sim/side.ts:170 -- megaUsed is separate from zMoveUsed in Gen 7
    pokemon.isMega = true;
    this.usedBySide.add(side.index);

    // Persist the mega form types and ability on the underlying PokemonInstance so that
    // when this Pokemon is switched out and back in, createActivePokemon() in BattleHelpers.ts
    // can restore the mega form state (types, ability, isMega flag) on the new ActivePokemon.
    // Source: Gen 7 game mechanic -- Mega Evolution is permanent for the rest of the battle.
    // Source: Showdown sim/battle.ts -- forme restored on sendOut after mega evolution.
    pokemon.pokemon.megaTypes = [...megaData.types] as PokemonType[];
    pokemon.pokemon.megaAbility = megaData.ability;

    const pokemonId = pokemon.pokemon.uid;

    const event: BattleEvent = {
      type: "mega-evolve",
      side: side.index,
      pokemon: pokemonId,
      form: megaData.form,
    };

    return [event];
  }

  /**
   * Reset mega evolution tracking (for new battle).
   * Called when a new battle starts to clear the used-by-side tracking.
   */
  reset(): void {
    this.usedBySide.clear();
  }

  /**
   * Check if a side has already used its Mega Evolution.
   * Exposed for testing and external validation.
   */
  hasUsedMega(sideIndex: 0 | 1): boolean {
    return this.usedBySide.has(sideIndex);
  }

  // Mega Evolution has no revert (permanent for the rest of the battle)
  // Source: Bulbapedia "Mega Evolution" -- "reverts to its normal form at the end of the battle"
  // i.e., reversion only happens after the battle ends, not automatically during it.
  // The optional revert() method is therefore not implemented.
}
