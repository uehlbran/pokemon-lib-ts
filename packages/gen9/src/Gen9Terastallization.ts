/**
 * Gen 9 Terastallization BattleGimmick implementation.
 *
 * Terastallization is the sole battle gimmick in Generation 9 (Scarlet/Violet).
 * A Pokemon's type changes to its assigned Tera Type for the rest of the battle:
 *   - Once per battle per team (tracked via BattleSide.gimmickUsed)
 *   - Permanent -- does not revert on switch (persisted via PokemonInstance fields)
 *   - Defensive typing becomes the single Tera Type (except Stellar, which retains original)
 *   - STAB calculation changes: original types still count for 1.5x, Tera+original = 2.0x
 *
 * Source: Showdown sim/battle-actions.ts:1760-1793 -- STAB logic
 * Source: Showdown data/abilities.ts:43-56 -- Adaptability interaction
 * Source: Showdown data/moves.ts:19919-19955 -- Tera Blast
 * Source: Bulbapedia "Terastallization" -- https://bulbapedia.bulbagarden.net/wiki/Terastallization
 */

import type {
  ActivePokemon,
  BattleEvent,
  BattleGimmick,
  BattleSide,
  BattleState,
  TerastallizeEvent,
} from "@pokemon-lib-ts/battle";
import { BATTLE_EVENT_TYPES } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { GEN9_SPECIAL_TERA_TYPE_IDS } from "./constants/mechanics.js";

/**
 * Gen 9 Terastallization gimmick.
 *
 * Implements the BattleGimmick interface for Terastallization.
 *
 * Rules (Source: Bulbapedia "Terastallization", Showdown sim/battle.ts Gen 9):
 *   1. One Terastallization per trainer per battle (tracked via BattleSide.gimmickUsed)
 *   2. The Pokemon must have a Tera Type assigned (PokemonInstance.teraType)
 *   3. Terastallization is permanent for the rest of the battle (no reversion)
 *   4. Defensive typing changes to the single Tera Type (exception: Stellar retains original)
 *   5. STAB is computed from both Tera type and original base types
 *   6. Tera Blast changes type/category when Terastallized
 */
export class Gen9Terastallization implements BattleGimmick {
  readonly name = "Terastallization";
  readonly generations = [9] as const;

  /**
   * Returns true if Terastallization can be used this turn.
   *
   * Conditions (all must be true):
   *   - The side has not yet used its gimmick this battle
   *   - The Pokemon has not already Terastallized
   *   - The Pokemon has a Tera Type assigned
   *
   * Source: Showdown sim/battle.ts -- Tera can-use checks
   * Source: Bulbapedia "Terastallization" -- one per trainer per battle
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    // Once per battle gate
    if (side.gimmickUsed) return false;
    // Can't Tera if already Terastallized
    if (pokemon.isTerastallized) return false;
    // Must have a Tera Type assigned
    if (!pokemon.pokemon.teraType) return false;
    return true;
  }

  /**
   * Activates Terastallization for the given Pokemon.
   *
   * Mutations applied:
   *   - pokemon.isTerastallized set to true
   *   - pokemon.teraType set to the Tera Type
   *   - pokemon.types changed to single Tera Type (exception: Stellar retains original)
   *   - side.gimmickUsed set to true
   *   - PokemonInstance persistence fields set for switch-out/switch-in restoration
   *
   * Returns a TerastallizeEvent identifying the side, Pokemon UID, and Tera Type.
   *
   * Source: Bulbapedia "Terastallization" -- type change, permanence
   * Source: Showdown sim/battle.ts -- terastallize activation and event emission
   */
  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    // canUse() guarantees teraType is set -- safe to cast
    const teraType = pokemon.pokemon.teraType as PokemonType;

    // Mark as Terastallized
    pokemon.isTerastallized = true;
    pokemon.teraType = teraType;
    side.gimmickUsed = true;

    // Save original pre-Tera types before any type change.
    // teraTypes is used by getOriginalTypes() for STAB calc — must be pre-Tera.
    // Source: Showdown sim/battle.ts -- teraTypes stores original species types
    const originalTypes = [...pokemon.types] as PokemonType[];

    // Change defensive typing to single Tera Type
    // Exception: Stellar retains original types defensively
    // Source: Showdown sim/pokemon.ts -- Stellar Tera has no defensive type change
    const isStellar = (teraType as string) === GEN9_SPECIAL_TERA_TYPE_IDS.stellar;
    if (!isStellar) {
      pokemon.types = [teraType];
    }
    // If Stellar, types remain unchanged (original defensive types)

    // Persist Tera state on the underlying PokemonInstance so that when this Pokemon
    // is switched out and back in, createOnFieldPokemon() can restore the Tera form.
    // Source: Gen 9 game mechanic -- Terastallization is permanent for the rest of the battle.
    pokemon.pokemon.terastallized = true;
    // teraOriginalTypes: pre-Tera species types, used by getOriginalTypes() for STAB calc.
    pokemon.pokemon.teraOriginalTypes = originalTypes;
    // teraTypes: resolved DEFENSIVE types for switch-in type restoration via createOnFieldPokemon.
    //   Non-Stellar: [teraType] (single Tera type is the defensive type)
    //   Stellar: originalTypes (Stellar retains original defensive types)
    // Source: Showdown sim/pokemon.ts -- Stellar retains original defensive types; non-Stellar is single Tera type
    pokemon.pokemon.teraTypes = isStellar ? originalTypes : [teraType];

    const pokemonId = pokemon.pokemon.uid;

    const event: TerastallizeEvent = {
      type: BATTLE_EVENT_TYPES.terastallize,
      side: side.index,
      pokemon: pokemonId,
      teraType,
    };

    return [event];
  }

  /**
   * Transforms Tera Blast when the user is Terastallized.
   *
   * Tera Blast behavior:
   *   - Not Terastallized: unchanged (Normal type, Special, 80 BP)
   *   - Terastallized (non-Stellar): type becomes Tera Type, physical if Atk > SpA
   *   - Terastallized (Stellar): 100 BP, type stays Normal (proxy for Stellar)
   *     The self-debuff (-1 Atk, -1 SpA) is handled by the move effect handler, not here
   *
   * Source: Showdown data/moves.ts:19919-19955 -- Tera Blast move data
   */
  modifyMove(move: MoveData, pokemon: ActivePokemon): MoveData {
    if (move.id !== "tera-blast") return move;
    if (!pokemon.isTerastallized) return move;

    const teraType = pokemon.teraType ?? pokemon.pokemon.teraType;
    if (!teraType) return move;

    const isStellar = (teraType as string) === GEN9_SPECIAL_TERA_TYPE_IDS.stellar;

    if (isStellar) {
      // Stellar Tera Blast: 100 BP
      // Source: Showdown data/moves.ts:19919-19955 -- Stellar Tera Blast has 100 BP
      return {
        ...move,
        power: 100,
        // Type stays "normal" as a proxy for Stellar (hits all types neutrally)
        // The actual Stellar type effectiveness is handled by the damage calc
      };
    }

    // Standard Tera Blast: type changes to Tera Type, physical if Atk > SpA
    // Source: Showdown data/moves.ts:19930-19940 -- category is physical if Atk > SpA
    const stats = pokemon.pokemon.calculatedStats;
    const atk = stats?.attack ?? 100;
    const spa = stats?.spAttack ?? 100;
    const isPhysical = atk > spa;

    return {
      ...move,
      type: teraType as PokemonType,
      category: isPhysical ? "physical" : "special",
    };
  }

  // Terastallization has no revert (permanent for the rest of the battle)
  // Source: Bulbapedia "Terastallization" -- "reverts to its normal form at the end of the battle"
  // i.e., reversion only happens after the battle ends, not automatically during it.
}

/**
 * Calculates the STAB multiplier for a Gen 9 move taking Terastallization into account.
 *
 * This is a standalone helper function exported for use by the damage calculator (Wave 3).
 * It encapsulates all Tera STAB logic including Stellar and Adaptability interactions.
 *
 * Source: Showdown sim/battle-actions.ts:1760-1793
 *
 * Rules:
 * 1. Move matches Tera type AND Tera type is an original type: 2.0x STAB
 * 2. Move matches Tera type but NOT an original type: 1.5x STAB
 * 3. Move matches an original type but NOT Tera type: 1.5x STAB
 * 4. No match: 1.0x (no STAB)
 * 5. Stellar type: one-time 2x per base type (tracked via stellarBoostedTypes), 1.2x otherwise
 * 6. Adaptability: 1.5x -> 2.0x, 2.0x -> 2.25x (NOT simple doubling)
 *    - Only applies when hasType() is true (current type), not for original types only
 *    - Not applied during Stellar Tera
 *
 * @param pokemon - The attacking Pokemon
 * @param moveType - The type of the move being used
 * @param originalTypes - The pre-Tera types of the Pokemon
 * @param hasAdaptability - Whether the attacker has the Adaptability ability
 * @returns The STAB multiplier (1.0, 1.5, 2.0, or 2.25)
 */
export function calculateTeraStab(
  pokemon: ActivePokemon,
  moveType: PokemonType,
  originalTypes: PokemonType[],
  hasAdaptability: boolean,
): number {
  if (!pokemon.isTerastallized) {
    // Standard STAB (non-Tera)
    // Source: Showdown sim/battle-actions.ts:1756-1760 -- isSTAB check
    const isSTAB = originalTypes.includes(moveType);
    if (!isSTAB) return 1.0;
    if (hasAdaptability) return 2.0;
    return 1.5;
  }

  const isStellar = (pokemon.teraType as string) === GEN9_SPECIAL_TERA_TYPE_IDS.stellar;

  if (isStellar) {
    // Stellar Tera: special one-time boost per base type
    // Source: Showdown sim/battle-actions.ts:1770-1785
    const hasBaseType = originalTypes.includes(moveType);
    const alreadyBoosted = pokemon.stellarBoostedTypes.includes(moveType);

    if (hasBaseType && !alreadyBoosted) {
      // First use of this base type: 2x boost, mark as consumed
      pokemon.stellarBoostedTypes.push(moveType);
      // Persist the updated boost tracking on PokemonInstance for switch survival
      if (!pokemon.pokemon.stellarBoostedTypes) {
        pokemon.pokemon.stellarBoostedTypes = [];
      }
      pokemon.pokemon.stellarBoostedTypes.push(moveType);
      return 2.0;
    }
    if (hasBaseType && alreadyBoosted) {
      // Already consumed this type's boost -- standard STAB
      return 1.5;
    }
    // Non-base type: 1.2x boost (4915/4096)
    // Source: Showdown battle-actions.ts:1781-1784 -- Stellar STAB for non-base types
    return 4915 / 4096;
  }

  // Standard Tera (non-Stellar)
  // hasType() in Showdown checks current types (Tera type after Terastallization)
  // getTypes(false, true) returns original/base types
  // Source: Showdown sim/battle-actions.ts:1756-1793
  const currentType = pokemon.teraType as PokemonType;
  const hasCurrentType = currentType === moveType;
  const hasOriginalType = originalTypes.includes(moveType);
  const isSTAB = hasCurrentType || hasOriginalType;

  if (!isSTAB) return 1.0;

  let stab = 1.5;

  // Rule 1: Tera type matches original type AND move type -> 2.0x
  // Source: Showdown sim/battle-actions.ts:1788-1791
  if (hasCurrentType && hasOriginalType) {
    stab = 2.0;
  }

  // Adaptability: boosts STAB if current type matches move type
  // Source: Showdown data/abilities.ts:43-56
  // Critical: Adaptability checks hasType() which is CURRENT TYPE ONLY (not original types)
  // So Adaptability CANNOT boost original-type STAB when Tera'd to a different type
  // Source: Showdown data/abilities.ts:47 -- onModifySTAB only triggers when source.hasType(move.type)
  if (hasAdaptability && hasCurrentType) {
    if (stab === 2.0) return 2.25;
    return 2.0;
  }

  return stab;
}
