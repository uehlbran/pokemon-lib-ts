/**
 * Gen 8 Dynamax/Gigantamax gimmick implementation.
 *
 * Implements the BattleGimmick interface for Dynamax:
 *   - HP scaling based on Dynamax Level (0-10)
 *   - 3-turn duration
 *   - Move conversion to Max Moves / G-Max Moves
 *   - Species immunity (Zacian, Zamazenta, Eternatus)
 *
 * Source: Showdown data/conditions.ts lines 771-802 -- Dynamax HP scaling and reversion
 * Source: Showdown sim/battle-actions.ts -- Max Move conversion
 * Source: Bulbapedia "Dynamax" -- mechanics overview
 */

import type {
  ActivePokemon,
  BattleEvent,
  BattleGimmick,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";

import { getGMaxMove, isGigantamaxEligible } from "./Gen8GMaxMoves.js";
import { getMaxMoveName, getMaxMovePower, isMaxGuard } from "./Gen8MaxMoves.js";

/**
 * Number of turns Dynamax lasts before reverting.
 *
 * Source: Showdown data/conditions.ts line 766 -- duration: 3
 * Source: Bulbapedia "Dynamax" -- "Dynamax lasts for three turns"
 */
export const DYNAMAX_TURNS = 3;

/**
 * Species that cannot Dynamax.
 *
 * Source: Showdown data/conditions.ts -- canDynamax species filter
 * Source: Bulbapedia "Dynamax" -- Zacian, Zamazenta, and Eternatus cannot Dynamax
 */
export const DYNAMAX_IMMUNE_SPECIES: readonly string[] = ["zacian", "zamazenta", "eternatus"];

/**
 * Species IDs of Dynamax-immune Pokemon for numeric lookup.
 *
 * Source: Bulbapedia -- Zacian (#888), Zamazenta (#889), Eternatus (#890)
 */
const DYNAMAX_IMMUNE_SPECIES_IDS: readonly number[] = [888, 889, 890];

/**
 * Calculates the max HP of a Dynamaxed Pokemon.
 *
 * Formula: floor(baseMaxHp * (1.5 + dynamaxLevel * 0.05))
 *   - dynamaxLevel 0: 1.5x HP
 *   - dynamaxLevel 10: 2.0x HP
 *
 * Source: Showdown data/conditions.ts lines 771-774 -- HP scaling on Dynamax activation
 *
 * @param baseMaxHp - The Pokemon's max HP before Dynamax
 * @param dynamaxLevel - Dynamax Level (0-10)
 * @returns The Dynamaxed max HP
 */
export function getDynamaxMaxHp(baseMaxHp: number, dynamaxLevel: number): number {
  const ratio = 1.5 + dynamaxLevel * 0.05;
  return Math.floor(baseMaxHp * ratio);
}

/**
 * Calculates the current HP of a Dynamaxed Pokemon.
 *
 * The current HP is scaled proportionally using the same multiplier as max HP.
 *
 * Source: Showdown data/conditions.ts lines 771-774 -- HP scaling on Dynamax activation
 *
 * @param currentHp - The Pokemon's current HP before Dynamax
 * @param dynamaxLevel - Dynamax Level (0-10)
 * @returns The Dynamaxed current HP
 */
export function getDynamaxCurrentHp(currentHp: number, dynamaxLevel: number): number {
  const ratio = 1.5 + dynamaxLevel * 0.05;
  return Math.floor(currentHp * ratio);
}

/**
 * Calculates the restored HP when a Pokemon reverts from Dynamax.
 *
 * Uses proportional HP restoration: undynamaxedHp = round(currentHp * baseMaxHp / maxHp)
 *
 * Source: Showdown data/conditions.ts lines 801-802 -- HP restoration on Dynamax end
 *
 * @param currentHp - Current HP while Dynamaxed
 * @param maxHp - Max HP while Dynamaxed
 * @param baseMaxHp - Original max HP before Dynamax
 * @returns The HP after reverting from Dynamax
 */
export function getUndynamaxedHp(currentHp: number, maxHp: number, baseMaxHp: number): number {
  if (maxHp === 0) return 0;
  return Math.round((currentHp * baseMaxHp) / maxHp);
}

/**
 * Checks whether a species is immune to Dynamax by species name (lowercase).
 */
function isSpeciesImmuneByName(speciesName: string): boolean {
  return DYNAMAX_IMMUNE_SPECIES.includes(speciesName.toLowerCase());
}

/**
 * Checks whether a species is immune to Dynamax by species ID.
 */
function isSpeciesImmuneById(speciesId: number): boolean {
  return DYNAMAX_IMMUNE_SPECIES_IDS.includes(speciesId);
}

/**
 * Gen 8 Dynamax gimmick.
 *
 * Implements the BattleGimmick interface for Dynamax/Gigantamax. When activated,
 * the Pokemon's HP is scaled based on its Dynamax Level, all moves become Max Moves
 * (or G-Max Moves if the species has a Gigantamax form), and the effect lasts 3 turns.
 *
 * Restrictions:
 *   - One Dynamax per trainer per battle (tracked via BattleSide.gimmickUsed)
 *   - Zacian, Zamazenta, and Eternatus cannot Dynamax
 *   - Already-dynamaxed Pokemon cannot Dynamax again
 *
 * Source: Showdown data/conditions.ts -- Dynamax condition
 * Source: Bulbapedia "Dynamax" -- mechanics overview
 */
export class Gen8Dynamax implements BattleGimmick {
  readonly name = "Dynamax";
  readonly generations = [8] as const;

  /**
   * Returns true if Dynamax can be used for the given Pokemon on this turn.
   *
   * Conditions (all must be true):
   *   - The side has not yet used its gimmick this battle
   *   - The Pokemon is not already Dynamaxed
   *   - The Pokemon's species is not immune to Dynamax
   *   - The species has `canDynamax !== false` (defaults to true)
   *
   * Source: Showdown data/conditions.ts -- canDynamax checks
   * Source: Bulbapedia "Dynamax" -- restrictions
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    if (side.gimmickUsed) return false;
    if (pokemon.isDynamaxed) return false;

    // Check species immunity by ID
    if (isSpeciesImmuneById(pokemon.pokemon.speciesId)) return false;

    // Check species immunity by name if species data is available via transformedSpecies
    const speciesData = pokemon.transformedSpecies;
    if (speciesData && isSpeciesImmuneByName(speciesData.name)) return false;

    // Check canDynamax flag on species data (defaults to true if absent)
    if (speciesData && speciesData.canDynamax === false) return false;

    return true;
  }

  /**
   * Activates Dynamax for the given Pokemon.
   *
   * Mutations applied:
   *   - pokemon.isDynamaxed = true
   *   - pokemon.dynamaxTurnsLeft = 3
   *   - pokemon.pokemon.currentHp scaled by Dynamax Level
   *   - pokemon.pokemon.calculatedStats.hp scaled by Dynamax Level
   *   - side.gimmickUsed = true
   *
   * Returns a DynamaxEvent identifying the side and Pokemon.
   *
   * Source: Showdown data/conditions.ts lines 771-774 -- HP scaling
   * Source: Bulbapedia "Dynamax" -- activation mechanics
   */
  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    const dynamaxLevel = pokemon.pokemon.dynamaxLevel ?? 10;

    // Scale HP
    // Source: Showdown data/conditions.ts lines 771-774
    if (pokemon.pokemon.calculatedStats) {
      const baseMaxHp = pokemon.pokemon.calculatedStats.hp;
      const newMaxHp = getDynamaxMaxHp(baseMaxHp, dynamaxLevel);
      const newCurrentHp = getDynamaxCurrentHp(pokemon.pokemon.currentHp, dynamaxLevel);

      // Store the base max HP for exact restoration on revert.
      // Avoids off-by-1 from reverse-dividing Math.floor'd values.
      // Source: Showdown sim/pokemon.ts -- pokemon.baseMaxhp stores original max HP during Dynamax
      pokemon.preDynamaxMaxHp = baseMaxHp;

      // MutableStatBlock cast is required because StatBlock is readonly
      const stats = pokemon.pokemon.calculatedStats as { hp: number };
      stats.hp = newMaxHp;
      pokemon.pokemon.currentHp = newCurrentHp;
    }

    // Set Dynamax state
    pokemon.isDynamaxed = true;
    pokemon.dynamaxTurnsLeft = DYNAMAX_TURNS;
    side.gimmickUsed = true;

    const event: BattleEvent = {
      type: "dynamax",
      side: side.index,
      pokemon: pokemon.pokemon.uid,
    };

    return [event];
  }

  /**
   * Reverts Dynamax when the 3-turn duration expires.
   *
   * Mutations applied:
   *   - pokemon.isDynamaxed = false
   *   - pokemon.dynamaxTurnsLeft = 0
   *   - pokemon.pokemon.currentHp proportionally restored
   *   - pokemon.pokemon.calculatedStats.hp restored to base
   *
   * Source: Showdown data/conditions.ts lines 801-802 -- HP restoration
   * Source: Bulbapedia "Dynamax" -- reversion mechanics
   */
  revert(pokemon: ActivePokemon, state: BattleState): BattleEvent[] {
    if (!pokemon.isDynamaxed) return [];

    // Validate side index BEFORE mutating state — throw on invalid state, not after partial mutation.
    // Source: sentinel review finding — throw must precede any state mutation
    const sideIndex = state.sides.findIndex((s) =>
      s.active.some((a) => a?.pokemon.uid === pokemon.pokemon.uid),
    );

    if (sideIndex < 0) {
      throw new Error(
        `Gen8Dynamax.revert: Pokemon uid=${pokemon.pokemon.uid} not found in any active slot`,
      );
    }

    // Restore HP proportionally
    // Source: Showdown data/conditions.ts lines 801-802
    if (pokemon.pokemon.calculatedStats) {
      const currentMaxHp = pokemon.pokemon.calculatedStats.hp;

      // Use stored base max HP (set during activate) to avoid off-by-1 from reverse-dividing.
      // Fallback to reverse-division only if preDynamaxMaxHp is missing (e.g., legacy state).
      // Source: Showdown sim/pokemon.ts -- pokemon.baseMaxhp stores original max HP during Dynamax
      const baseMaxHp =
        pokemon.preDynamaxMaxHp ??
        Math.round(currentMaxHp / (1.5 + (pokemon.pokemon.dynamaxLevel ?? 10) * 0.05));

      const restoredHp = getUndynamaxedHp(pokemon.pokemon.currentHp, currentMaxHp, baseMaxHp);

      const stats = pokemon.pokemon.calculatedStats as { hp: number };
      stats.hp = baseMaxHp;
      pokemon.pokemon.currentHp = Math.min(restoredHp, baseMaxHp);
    }

    // Clear Dynamax state and stored base HP
    pokemon.isDynamaxed = false;
    pokemon.dynamaxTurnsLeft = 0;
    pokemon.preDynamaxMaxHp = undefined;

    const event: BattleEvent = {
      type: "dynamax-end",
      side: sideIndex as 0 | 1,
      pokemon: pokemon.pokemon.uid,
    };

    return [event];
  }

  /**
   * Converts a move to its Max Move equivalent when the Pokemon is Dynamaxed.
   *
   * - Status moves become Max Guard (BP 0, blocks all moves including other Max Moves)
   * - Damage moves become the appropriate Max Move for their type with converted base power
   * - If the Pokemon has a Gigantamax form and the move type matches, use the G-Max Move instead
   *
   * Source: Showdown sim/battle-actions.ts -- Max Move conversion
   * Source: Bulbapedia "Max Move" -- move conversion rules
   */
  modifyMove(move: MoveData, pokemon: ActivePokemon): MoveData {
    if (!pokemon.isDynamaxed) return move;

    // Status moves become Max Guard
    // Source: Showdown sim/battle-actions.ts -- status moves become Max Guard
    // Max Guard uses the "max-guard" variant so it sets a distinct volatile that
    // cannot be bypassed by any move — not even other Max Moves.
    // Source: Showdown sim/battle-actions.ts -- Max Guard blocks all moves including Max Moves
    if (isMaxGuard(move)) {
      return {
        ...move,
        id: "max-guard",
        displayName: "Max Guard",
        power: null,
        accuracy: null,
        priority: 4,
        effect: { type: "protect", variant: "max-guard" },
      };
    }

    // Check for G-Max move eligibility
    const speciesData = pokemon.transformedSpecies;
    if (speciesData && isGigantamaxEligible(speciesData)) {
      const gmaxMove = getGMaxMove(speciesData.name);
      if (gmaxMove && gmaxMove.moveType === move.type) {
        const basePower = gmaxMove.basePower ?? getMaxMovePower(move.power ?? 0, move.type);
        return {
          ...move,
          id: `gmax-${speciesData.name.toLowerCase()}`,
          displayName: gmaxMove.species,
          power: basePower,
          accuracy: null, // Max Moves never miss
        };
      }
    }

    // Standard Max Move conversion
    const maxMoveName = getMaxMoveName(move.type, false);
    const maxMovePower = getMaxMovePower(move.power ?? 0, move.type);

    return {
      ...move,
      id: `max-${move.type}`,
      displayName: maxMoveName,
      power: maxMovePower,
      accuracy: null, // Max Moves never miss
    };
  }
}
