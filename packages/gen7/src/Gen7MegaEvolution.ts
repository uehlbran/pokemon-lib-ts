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
 */

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
  CORE_NATURE_IDS,
  CORE_STAT_IDS,
  calculateStat,
  getNatureModifier,
  type MegaEvolutionData,
  type MutableStatBlock,
  type NatureData,
  type PokemonType,
  MEGA_STONE_DATA as SHARED_MEGA_STONE_DATA,
} from "@pokemon-lib-ts/core";

import { isMegaStone, isZCrystal } from "./Gen7Items.js";

export const MEGA_STONE_DATA = SHARED_MEGA_STONE_DATA;

/**
 * Mega Rayquaza data. Rayquaza does not need a Mega Stone - it Mega Evolves by
 * knowing Dragon Ascent (and must NOT be holding a Z-Crystal).
 *
 * Source: Bulbapedia "Mega Rayquaza" -- Mega Evolves if it knows Dragon Ascent
 * Source: Showdown data/items.ts -- no rayquazite item; Showdown sim/battle-actions.ts
 *   canMegaEvo special-cases Rayquaza: has Dragon Ascent + no Z-Crystal
 * Source: Bulbapedia "Mega Evolution" -- base stats for Mega Rayquaza
 */
export const MEGA_RAYQUAZA_DATA: Readonly<MegaEvolutionData> = {
  form: "mega-rayquaza",
  item: "",
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
  const knowsDragonAscent = pokemon.pokemon.moves.some((m) => m.moveId === "dragon-ascent");
  if (!knowsDragonAscent) return false;
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

  private readonly usedBySide: Set<0 | 1> = new Set();

  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    if (this.usedBySide.has(side.index)) return false;
    if (pokemon.isMega) return false;
    if (canRayquazaMegaEvolve(pokemon)) return true;

    const megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    if (!megaData) return false;
    if (megaData.baseSpeciesId !== pokemon.pokemon.speciesId) return false;
    return true;
  }

  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    if (this.usedBySide.has(side.index) || pokemon.isMega) return [];

    let megaData: MegaEvolutionData | null;
    if (canRayquazaMegaEvolve(pokemon)) {
      megaData = MEGA_RAYQUAZA_DATA;
    } else {
      megaData = getMegaEvolutionData(pokemon.pokemon.heldItem);
    }

    if (!megaData || megaData.baseSpeciesId !== pokemon.pokemon.speciesId) {
      return [];
    }

    pokemon.types = [...megaData.types] as PokemonType[];
    pokemon.ability = megaData.ability;

    if (pokemon.pokemon.calculatedStats) {
      const cs = pokemon.pokemon.calculatedStats as unknown as MutableStatBlock;
      const { level, ivs, evs, nature: natureId } = pokemon.pokemon;

      const foundNature = ALL_NATURES.find((n) => n.id === natureId);
      const natureData: NatureData = foundNature ?? {
        id: CORE_NATURE_IDS.hardy,
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
    this.usedBySide.add(side.index);
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

  reset(): void {
    this.usedBySide.clear();
  }

  serializeState(): { usedBySide: Array<0 | 1> } {
    return { usedBySide: [...this.usedBySide] };
  }

  restoreState(state: unknown): void {
    this.usedBySide.clear();
    if (!state || typeof state !== "object" || !("usedBySide" in state)) return;

    const usedBySide = (state as { usedBySide?: unknown }).usedBySide;
    if (!Array.isArray(usedBySide)) return;

    for (const sideIndex of usedBySide) {
      if (sideIndex === 0 || sideIndex === 1) {
        this.usedBySide.add(sideIndex);
      }
    }
  }

  hasUsedMega(sideIndex: 0 | 1): boolean {
    return this.usedBySide.has(sideIndex);
  }
}
