import type {
  ActivePokemon,
  BattleEvent,
  BattleGimmick,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import { BATTLE_EVENT_TYPES } from "@pokemon-lib-ts/battle";
import {
  ALL_NATURES,
  CORE_STAT_IDS,
  calculateStat,
  getNatureModifier,
  type MegaEvolutionData,
  type MutableStatBlock,
  type NatureData,
  type PokemonType,
  MEGA_STONE_DATA as SHARED_MEGA_STONE_DATA,
} from "@pokemon-lib-ts/core";

import { isMegaStone } from "./Gen6Items.js";

export const MEGA_STONE_DATA = SHARED_MEGA_STONE_DATA;

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
 * Source: Showdown sim/battle.ts -- isMega tracking, gimmickUsed gate
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
   * Source: Showdown sim/battle.ts -- megaEvolution can-use checks
   * Source: Bulbapedia "Mega Evolution" -- one per trainer per battle
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    if (side.gimmickUsed) return false;
    if (pokemon.isMega) return false;
    const megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    if (!megaData) return false;
    if (megaData.baseSpeciesId !== pokemon.pokemon.speciesId) return false;
    return true;
  }

  /**
   * Activates Mega Evolution for the given Pokemon.
   */
  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    const megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    if (!megaData) return [];

    pokemon.types = [...megaData.types] as PokemonType[];
    pokemon.ability = megaData.ability;

    if (pokemon.pokemon.calculatedStats) {
      const cs = pokemon.pokemon.calculatedStats as unknown as MutableStatBlock;
      const { level, ivs, evs, nature: natureId } = pokemon.pokemon;

      const foundNature = ALL_NATURES.find((n) => n.id === natureId);
      const natureData: NatureData = foundNature ?? {
        id: "hardy",
        displayName: "Hardy",
        increased: null,
        decreased: null,
        likedFlavor: null,
        dislikedFlavor: null,
      };

      cs.attack = calculateStat(
        megaData.baseStats.attack,
        ivs.attack,
        evs.attack,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.attack),
      );
      cs.defense = calculateStat(
        megaData.baseStats.defense,
        ivs.defense,
        evs.defense,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.defense),
      );
      cs.spAttack = calculateStat(
        megaData.baseStats.spAttack,
        ivs.spAttack,
        evs.spAttack,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.spAttack),
      );
      cs.spDefense = calculateStat(
        megaData.baseStats.spDefense,
        ivs.spDefense,
        evs.spDefense,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.spDefense),
      );
      cs.speed = calculateStat(
        megaData.baseStats.speed,
        ivs.speed,
        evs.speed,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.speed),
      );
    }

    pokemon.isMega = true;
    side.gimmickUsed = true;
    pokemon.pokemon.megaTypes = [...megaData.types] as PokemonType[];
    pokemon.pokemon.megaAbility = megaData.ability;

    const event: BattleEvent = {
      type: BATTLE_EVENT_TYPES.megaEvolve,
      side: side.index,
      pokemon: pokemon.pokemon.uid,
      form: megaData.form,
    };

    return [event];
  }

  // Mega Evolution has no revert (permanent for the rest of the battle).
}
