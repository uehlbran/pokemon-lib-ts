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

import { isMegaStone } from "./Gen6Items.js";

/**
 * Hardcoded Mega Evolution data keyed by Mega Stone item ID.
 *
 * The gen6 data/pokemon.json does not carry megaEvolutions entries — the data importer
 * pipeline only imports base-form stats. All mega form data is sourced from:
 *   Source: Bulbapedia "Mega Evolution" — base stats, types, abilities for each mega form
 *   Source: Showdown data/pokedex.ts — mega form entries (e.g., "Charizard-Mega-X")
 *   Source: Showdown data/items.ts — mega stone item IDs
 *
 * Only "normal" mega evolutions are listed here (no Primal Reversion, which is handled
 * separately by a weather-triggered mechanic, not the gimmick system).
 *
 * Format: megaStoneItemId → MegaEvolutionData
 */
export const MEGA_STONE_DATA: Record<string, MegaEvolutionData> = {
  // #003 Venusaur-Mega
  venusaurite: {
    form: "mega-venusaur",
    item: "venusaurite",
    types: ["grass", "poison"],
    baseStats: { hp: 80, attack: 100, defense: 123, spAttack: 122, spDefense: 120, speed: 80 },
    ability: "thick-fat",
  },
  // #006 Charizard-Mega-X
  "charizardite-x": {
    form: "mega-charizard-x",
    item: "charizardite-x",
    types: ["fire", "dragon"],
    baseStats: { hp: 78, attack: 130, defense: 111, spAttack: 130, spDefense: 85, speed: 100 },
    ability: "tough-claws",
  },
  // #006 Charizard-Mega-Y
  "charizardite-y": {
    form: "mega-charizard-y",
    item: "charizardite-y",
    types: ["fire", "flying"],
    baseStats: { hp: 78, attack: 104, defense: 78, spAttack: 159, spDefense: 115, speed: 100 },
    ability: "drought",
  },
  // #009 Blastoise-Mega
  blastoisinite: {
    form: "mega-blastoise",
    item: "blastoisinite",
    types: ["water"],
    baseStats: { hp: 79, attack: 103, defense: 120, spAttack: 135, spDefense: 115, speed: 78 },
    ability: "mega-launcher",
  },
  // #015 Beedrill-Mega
  beedrillite: {
    form: "mega-beedrill",
    item: "beedrillite",
    types: ["bug", "poison"],
    baseStats: { hp: 65, attack: 150, defense: 40, spAttack: 15, spDefense: 80, speed: 145 },
    ability: "adaptability",
  },
  // #018 Pidgeot-Mega
  pidgeotite: {
    form: "mega-pidgeot",
    item: "pidgeotite",
    types: ["normal", "flying"],
    baseStats: { hp: 83, attack: 80, defense: 80, spAttack: 135, spDefense: 80, speed: 121 },
    ability: "no-guard",
  },
  // #065 Alakazam-Mega
  alakazite: {
    form: "mega-alakazam",
    item: "alakazite",
    types: ["psychic"],
    baseStats: { hp: 55, attack: 50, defense: 65, spAttack: 175, spDefense: 95, speed: 150 },
    ability: "trace",
  },
  // #068 Machamp-Mega — NOT in Gen 6 (only in Legends: Arceus)
  // #094 Gengar-Mega
  gengarite: {
    form: "mega-gengar",
    item: "gengarite",
    types: ["ghost", "poison"],
    baseStats: { hp: 60, attack: 65, defense: 80, spAttack: 170, spDefense: 95, speed: 130 },
    ability: "shadow-tag",
  },
  // #127 Pinsir-Mega
  pinsirite: {
    form: "mega-pinsir",
    item: "pinsirite",
    types: ["bug", "flying"],
    baseStats: { hp: 65, attack: 155, defense: 120, spAttack: 65, spDefense: 90, speed: 105 },
    ability: "aerilate",
  },
  // #130 Gyarados-Mega
  gyaradosite: {
    form: "mega-gyarados",
    item: "gyaradosite",
    types: ["water", "dark"],
    baseStats: { hp: 95, attack: 155, defense: 109, spAttack: 70, spDefense: 130, speed: 81 },
    ability: "mold-breaker",
  },
  // #142 Aerodactyl-Mega
  aerodactylite: {
    form: "mega-aerodactyl",
    item: "aerodactylite",
    types: ["rock", "flying"],
    baseStats: { hp: 80, attack: 135, defense: 85, spAttack: 70, spDefense: 95, speed: 150 },
    ability: "tough-claws",
  },
  // #150 Mewtwo-Mega-X
  "mewtwonite-x": {
    form: "mega-mewtwo-x",
    item: "mewtwonite-x",
    types: ["psychic", "fighting"],
    baseStats: { hp: 106, attack: 190, defense: 100, spAttack: 154, spDefense: 100, speed: 130 },
    ability: "steadfast",
  },
  // #150 Mewtwo-Mega-Y
  "mewtwonite-y": {
    form: "mega-mewtwo-y",
    item: "mewtwonite-y",
    types: ["psychic"],
    baseStats: { hp: 106, attack: 150, defense: 70, spAttack: 194, spDefense: 120, speed: 140 },
    ability: "insomnia",
  },
  // #181 Ampharos-Mega
  ampharosite: {
    form: "mega-ampharos",
    item: "ampharosite",
    types: ["electric", "dragon"],
    baseStats: { hp: 90, attack: 95, defense: 105, spAttack: 165, spDefense: 110, speed: 45 },
    ability: "mold-breaker",
  },
  // #212 Scizor-Mega
  scizorite: {
    form: "mega-scizor",
    item: "scizorite",
    types: ["bug", "steel"],
    baseStats: { hp: 70, attack: 150, defense: 140, spAttack: 65, spDefense: 100, speed: 75 },
    ability: "technician",
  },
  // #214 Heracross-Mega
  heracronite: {
    form: "mega-heracross",
    item: "heracronite",
    types: ["bug", "fighting"],
    baseStats: { hp: 80, attack: 185, defense: 115, spAttack: 40, spDefense: 105, speed: 75 },
    ability: "skill-link",
  },
  // #229 Houndoom-Mega
  houndoominite: {
    form: "mega-houndoom",
    item: "houndoominite",
    types: ["dark", "fire"],
    baseStats: { hp: 75, attack: 90, defense: 90, spAttack: 140, spDefense: 90, speed: 115 },
    ability: "solar-power",
  },
  // #248 Tyranitar-Mega
  tyranitarite: {
    form: "mega-tyranitar",
    item: "tyranitarite",
    types: ["rock", "dark"],
    baseStats: { hp: 100, attack: 164, defense: 150, spAttack: 95, spDefense: 120, speed: 71 },
    ability: "sand-stream",
  },
  // #254 Sceptile-Mega
  sceptilite: {
    form: "mega-sceptile",
    item: "sceptilite",
    types: ["grass", "dragon"],
    baseStats: { hp: 70, attack: 110, defense: 75, spAttack: 145, spDefense: 85, speed: 145 },
    ability: "lightning-rod",
  },
  // #257 Blaziken-Mega
  blazikenite: {
    form: "mega-blaziken",
    item: "blazikenite",
    types: ["fire", "fighting"],
    baseStats: { hp: 80, attack: 160, defense: 80, spAttack: 130, spDefense: 80, speed: 100 },
    ability: "speed-boost",
  },
  // #260 Swampert-Mega
  swampertite: {
    form: "mega-swampert",
    item: "swampertite",
    types: ["water", "ground"],
    baseStats: { hp: 100, attack: 150, defense: 110, spAttack: 95, spDefense: 110, speed: 70 },
    ability: "swift-swim",
  },
  // #282 Gardevoir-Mega
  gardevoirite: {
    form: "mega-gardevoir",
    item: "gardevoirite",
    types: ["psychic", "fairy"],
    baseStats: { hp: 68, attack: 85, defense: 65, spAttack: 165, spDefense: 135, speed: 100 },
    ability: "pixilate",
  },
  // #302 Sableye-Mega
  sablenite: {
    form: "mega-sableye",
    item: "sablenite",
    types: ["dark", "ghost"],
    baseStats: { hp: 50, attack: 85, defense: 125, spAttack: 85, spDefense: 115, speed: 20 },
    ability: "magic-bounce",
  },
  // #303 Mawile-Mega
  mawilite: {
    form: "mega-mawile",
    item: "mawilite",
    types: ["steel", "fairy"],
    baseStats: { hp: 50, attack: 105, defense: 125, spAttack: 55, spDefense: 95, speed: 50 },
    ability: "huge-power",
  },
  // #306 Aggron-Mega
  aggronite: {
    form: "mega-aggron",
    item: "aggronite",
    types: ["steel"],
    baseStats: { hp: 70, attack: 140, defense: 230, spAttack: 60, spDefense: 80, speed: 50 },
    ability: "filter",
  },
  // #310 Manectric-Mega
  manectite: {
    form: "mega-manectric",
    item: "manectite",
    types: ["electric"],
    baseStats: { hp: 70, attack: 75, defense: 80, spAttack: 135, spDefense: 80, speed: 135 },
    ability: "intimidate",
  },
  // #323 Camerupt-Mega
  cameruptite: {
    form: "mega-camerupt",
    item: "cameruptite",
    types: ["fire", "ground"],
    baseStats: { hp: 70, attack: 120, defense: 100, spAttack: 145, spDefense: 105, speed: 20 },
    ability: "sheer-force",
  },
  // #334 Altaria-Mega
  altarianite: {
    form: "mega-altaria",
    item: "altarianite",
    types: ["dragon", "fairy"],
    baseStats: { hp: 75, attack: 110, defense: 110, spAttack: 110, spDefense: 105, speed: 80 },
    ability: "pixilate",
  },
  // #354 Banette-Mega
  banettite: {
    form: "mega-banette",
    item: "banettite",
    types: ["ghost"],
    baseStats: { hp: 64, attack: 165, defense: 75, spAttack: 93, spDefense: 83, speed: 75 },
    ability: "prankster",
  },
  // #359 Absol-Mega
  absolite: {
    form: "mega-absol",
    item: "absolite",
    types: ["dark"],
    baseStats: { hp: 65, attack: 150, defense: 60, spAttack: 115, spDefense: 60, speed: 115 },
    ability: "magic-bounce",
  },
  // #362 Glalie-Mega
  glalitite: {
    form: "mega-glalie",
    item: "glalitite",
    types: ["ice"],
    baseStats: { hp: 80, attack: 120, defense: 80, spAttack: 120, spDefense: 80, speed: 100 },
    ability: "refrigerate",
  },
  // #373 Salamence-Mega
  salamencite: {
    form: "mega-salamence",
    item: "salamencite",
    types: ["dragon", "flying"],
    baseStats: { hp: 95, attack: 145, defense: 130, spAttack: 120, spDefense: 90, speed: 120 },
    ability: "aerilate",
  },
  // #376 Metagross-Mega
  metagrossite: {
    form: "mega-metagross",
    item: "metagrossite",
    types: ["steel", "psychic"],
    baseStats: { hp: 80, attack: 145, defense: 150, spAttack: 105, spDefense: 110, speed: 110 },
    ability: "tough-claws",
  },
  // #380 Latias-Mega
  latiasite: {
    form: "mega-latias",
    item: "latiasite",
    types: ["dragon", "psychic"],
    baseStats: { hp: 80, attack: 100, defense: 120, spAttack: 140, spDefense: 150, speed: 110 },
    ability: "levitate",
  },
  // #381 Latios-Mega
  latiosite: {
    form: "mega-latios",
    item: "latiosite",
    types: ["dragon", "psychic"],
    baseStats: { hp: 80, attack: 130, defense: 100, spAttack: 160, spDefense: 120, speed: 110 },
    ability: "levitate",
  },
  // #384 Rayquaza-Mega (no item needed, has Dragon Ascent)
  // Rayquaza mega is triggered by knowing Dragon Ascent, not holding a stone.
  // Excluded from this table — implement as a special case if needed.

  // #428 Lopunny-Mega
  lopunnite: {
    form: "mega-lopunny",
    item: "lopunnite",
    types: ["normal", "fighting"],
    baseStats: { hp: 65, attack: 136, defense: 94, spAttack: 54, spDefense: 96, speed: 135 },
    ability: "scrappy",
  },
  // #445 Garchomp-Mega
  garchompite: {
    form: "mega-garchomp",
    item: "garchompite",
    types: ["dragon", "ground"],
    baseStats: { hp: 108, attack: 170, defense: 115, spAttack: 120, spDefense: 95, speed: 92 },
    ability: "sand-force",
  },
  // #448 Lucario-Mega
  lucarionite: {
    form: "mega-lucario",
    item: "lucarionite",
    types: ["fighting", "steel"],
    baseStats: { hp: 70, attack: 145, defense: 88, spAttack: 140, spDefense: 70, speed: 112 },
    ability: "adaptability",
  },
  // #460 Abomasnow-Mega
  abomasite: {
    form: "mega-abomasnow",
    item: "abomasite",
    types: ["grass", "ice"],
    baseStats: { hp: 90, attack: 132, defense: 105, spAttack: 132, spDefense: 105, speed: 30 },
    ability: "snow-warning",
  },
  // #475 Gallade-Mega
  galladite: {
    form: "mega-gallade",
    item: "galladite",
    types: ["psychic", "fighting"],
    baseStats: { hp: 68, attack: 165, defense: 95, spAttack: 65, spDefense: 115, speed: 110 },
    ability: "inner-focus",
  },
  // #531 Audino-Mega
  audinite: {
    form: "mega-audino",
    item: "audinite",
    types: ["normal", "fairy"],
    baseStats: { hp: 103, attack: 60, defense: 126, spAttack: 80, spDefense: 126, speed: 50 },
    ability: "healer",
  },
  // #719 Diancie-Mega
  diancite: {
    form: "mega-diancie",
    item: "diancite",
    types: ["rock", "fairy"],
    baseStats: { hp: 50, attack: 160, defense: 110, spAttack: 160, spDefense: 110, speed: 110 },
    ability: "magic-bounce",
  },

  // #115 Kangaskhan-Mega (Parental Bond)
  kangaskhanite: {
    form: "mega-kangaskhan",
    item: "kangaskhanite",
    types: ["normal"],
    baseStats: { hp: 105, attack: 125, defense: 100, spAttack: 60, spDefense: 100, speed: 100 },
    ability: "parental-bond",
  },
  // #461 Weavile (no mega) — skip
  // #135 Jolteon (no mega) — skip

  // #205 Forretress (no mega)
  // #230 Kingdra (no mega)

  // #319 Sharpedo-Mega
  sharpedonite: {
    form: "mega-sharpedo",
    item: "sharpedonite",
    types: ["water", "dark"],
    baseStats: { hp: 70, attack: 140, defense: 70, spAttack: 110, spDefense: 65, speed: 105 },
    ability: "strong-jaw",
  },

  // #143 Snorlax (no mega)
  // #245 Suicune (no mega)

  // #079/#080 Slowbro-Mega (ORAS)
  slowbronite: {
    form: "mega-slowbro",
    item: "slowbronite",
    types: ["water", "psychic"],
    baseStats: { hp: 95, attack: 75, defense: 180, spAttack: 130, spDefense: 80, speed: 30 },
    ability: "shell-armor",
  },

  // #208 Steelix-Mega (ORAS)
  steelixite: {
    form: "mega-steelix",
    item: "steelixite",
    types: ["steel", "ground"],
    baseStats: { hp: 75, attack: 125, defense: 230, spAttack: 55, spDefense: 95, speed: 30 },
    ability: "sand-force",
  },

  // #308 Medicham-Mega (XY)
  medichamite: {
    form: "mega-medicham",
    item: "medichamite",
    types: ["fighting", "psychic"],
    baseStats: { hp: 60, attack: 100, defense: 85, spAttack: 80, spDefense: 85, speed: 100 },
    ability: "pure-power",
  },
};

/**
 * Get the Mega Evolution data for a given held item, if applicable.
 *
 * Returns the MegaEvolutionData for the item if it is a Mega Stone with registered
 * mega form data, or null if the item is not a qualifying Mega Stone.
 *
 * Source: Showdown data/items.ts — individual mega stone entries
 * Source: Bulbapedia "Mega Evolution" — mega form data
 *
 * @param itemId - The item ID to look up
 * @returns MegaEvolutionData if item is a Mega Stone with known mega form data, else null
 */
export function getMegaEvolutionData(itemId: string | null | undefined): MegaEvolutionData | null {
  if (!itemId) return null;
  if (!isMegaStone(itemId)) return null;
  return MEGA_STONE_DATA[itemId] ?? null;
}

/**
 * Gen 6 Mega Evolution gimmick.
 *
 * Implements the BattleGimmick interface for Gen 6 Mega Evolution.
 *
 * Rules (Source: Bulbapedia "Mega Evolution", Showdown sim/battle.ts Gen 6):
 *   1. One Mega Evolution per trainer per battle (tracked via BattleSide.gimmickUsed)
 *   2. The Pokemon must hold the correct Mega Stone for its species
 *   3. Mega Evolution occurs at the start of the turn, before the move is executed
 *   4. Mega Evolution is permanent for the rest of the battle (no reversion)
 *   5. Mega forms have different base stats, type(s), and ability
 *   6. The Mega Stone is consumed (effectively locked in — cannot be removed or used again)
 *
 * Note: Primal Reversion (Kyogre/Groudon) is NOT handled here. Primal Reversion
 *   is a weather-triggered transformation that happens on switch-in, not a gimmick.
 *   It uses Blue Orb / Red Orb items, not Mega Stones.
 *
 * Source: Bulbapedia "Mega Evolution" Gen 6
 * Source: Showdown sim/battle.ts — isMega tracking, gimmickUsed gate
 */
export class Gen6MegaEvolution implements BattleGimmick {
  readonly name = "Mega Evolution";
  readonly generations = [6] as const;

  /**
   * Returns true if Mega Evolution can be used this turn.
   *
   * Conditions (all must be true):
   *   - The side has not yet used its gimmick this battle
   *   - The Pokemon has not already mega evolved
   *   - The Pokemon holds a Mega Stone
   *   - That Mega Stone has known mega form data
   *
   * Source: Showdown sim/battle.ts — megaEvolution can-use checks
   * Source: Bulbapedia "Mega Evolution" — one per trainer per battle
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    if (side.gimmickUsed) return false;
    if (pokemon.isMega) return false;
    const megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    return megaData !== null;
  }

  /**
   * Activates Mega Evolution for the given Pokemon.
   *
   * Mutations applied:
   *   - pokemon.types updated to mega form types
   *   - pokemon.ability updated to mega form ability
   *   - pokemon.pokemon.calculatedStats updated to mega form base stats (scaled by level)
   *     Note: We update calculatedStats directly since PokemonInstance.calculatedStats
   *     is the live runtime stat block. In a full implementation, a stat recalc helper
   *     would be called; here we set the mega form base stats as the calculated stats
   *     since test helpers and the current engine architecture both use calculatedStats
   *     directly. This is consistent with how switch-in stat recalc works.
   *   - pokemon.isMega set to true
   *   - side.gimmickUsed set to true
   *
   * Returns a MegaEvolveEvent identifying the side, Pokemon UID, and form.
   *
   * Source: Bulbapedia "Mega Evolution" — base stat, type, ability changes
   * Source: Showdown sim/battle.ts — mega evolution activation and event emission
   */
  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    const megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    if (!megaData) return [];

    // Update type(s)
    pokemon.types = [...megaData.types] as PokemonType[];

    // Update ability
    pokemon.ability = megaData.ability;

    // Update calculated stats to mega form stats using the full Gen 3+ stat formula.
    // Source: Showdown sim/battle.ts (setSpecies) — mega evolution calls spreadModify with the
    //   mega form's base stats, which applies level/IV/EV/nature scaling. The BattleGimmick
    //   interface does not receive the ruleset, so we inline the Gen 3+ formula here.
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
      // Hardy is neutral (increased/decreased both null) — safe fallback that produces 1.0 modifier on all stats.
      const natureData: NatureData = foundNature ?? {
        id: "hardy",
        displayName: "Hardy",
        increased: null,
        decreased: null,
        likedFlavor: null,
        dislikedFlavor: null,
      };

      // HP does NOT change on mega evolution (only attack, defense, spAtk, spDef, speed)
      // Source: Bulbapedia "Mega Evolution" — "HP does not change when Mega Evolving"
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

    // Mark the Pokemon as mega evolved and the side as having used its gimmick
    pokemon.isMega = true;
    side.gimmickUsed = true;

    const pokemonId = pokemon.pokemon.uid;

    const event: BattleEvent = {
      type: "mega-evolve",
      side: side.index,
      pokemon: pokemonId,
      form: megaData.form,
    };

    return [event];
  }

  // Mega Evolution has no revert (permanent for the rest of the battle)
  // Source: Bulbapedia "Mega Evolution" — "reverts to its normal form at the end of the battle"
  // i.e., reversion only happens after the battle ends, not automatically during it.
  // The optional revert() method is therefore not implemented.
}
