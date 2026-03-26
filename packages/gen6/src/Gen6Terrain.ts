/**
 * Gen 6 Terrain System
 *
 * Implements terrain effects introduced in Generation 6 (X/Y):
 *   - Electric Terrain: 1.5x Electric moves for grounded attacker; grounded sleep immunity
 *   - Grassy Terrain: 1.5x Grass moves for grounded attacker; 1/16 HP heal at EoT for grounded;
 *     Earthquake/Bulldoze/Magnitude deal half damage to grounded targets
 *   - Misty Terrain: 0.5x Dragon moves vs grounded defender; grounded status immunity
 *
 * Terrain lasts 5 turns by default (8 with Terrain Extender, introduced Gen 7).
 * Only one terrain can be active at a time; setting a new one replaces the old.
 *
 * Source: Bulbapedia "Electric Terrain" / "Grassy Terrain" / "Misty Terrain" -- Gen 6 effects
 * Source: Showdown data/conditions.ts -- terrain residual handlers
 * Source: Showdown sim/field.ts -- terrain effect application
 */

import type { ActivePokemon, BattleState, TerrainEffectResult } from "@pokemon-lib-ts/battle";
import type { PrimaryStatus } from "@pokemon-lib-ts/core";
import { CORE_STATUS_IDS, CORE_TERRAIN_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { GEN6_MOVE_IDS } from "./data/reference-ids.js";
import { isGen6Grounded } from "./Gen6EntryHazards.js";

/**
 * Apply Grassy Terrain's end-of-turn healing effect.
 *
 * At the end of each turn, grounded Pokemon recover 1/16 of their max HP.
 * Pokemon at full HP or fainted are not affected.
 *
 * Source: Bulbapedia "Grassy Terrain" -- "At the end of each turn, the HP of each
 *   grounded Pokemon is restored by 1/16 of its maximum HP."
 * Source: Showdown data/conditions.ts -- grassyterrain.onResidual:
 *   this.heal(pokemon.baseMaxhp / 16)
 */
export function applyGen6TerrainEffects(state: BattleState): TerrainEffectResult[] {
  if (!state.terrain) return [];

  const results: TerrainEffectResult[] = [];

  if (state.terrain.type === CORE_TERRAIN_IDS.grassy) {
    const gravityActive = state.gravity?.active ?? false;

    for (const side of state.sides) {
      for (const active of side.active) {
        if (!active || active.pokemon.currentHp <= 0) continue;
        if (!isGen6Grounded(active, gravityActive)) continue;

        const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
        const currentHp = active.pokemon.currentHp;
        if (currentHp >= maxHp) continue;

        // Source: Showdown data/conditions.ts -- grassyterrain: heal(pokemon.baseMaxhp / 16)
        const healAmount = Math.max(1, Math.floor(maxHp / 16));
        const pokemonName = active.pokemon.nickname ?? String(active.pokemon.speciesId);
        results.push({
          side: side.index as 0 | 1,
          pokemon: pokemonName,
          effect: "grassy-heal",
          message: `${pokemonName} is healed by Grassy Terrain!`,
          healAmount,
        });
      }
    }
  }

  return results;
}

/**
 * Check if a Pokemon can be inflicted with a primary status condition,
 * considering active terrain effects.
 *
 * - Electric Terrain: grounded Pokemon cannot fall asleep
 * - Misty Terrain: grounded Pokemon cannot gain any primary status condition
 *
 * Returns true if the status CAN be inflicted, false if terrain prevents it.
 *
 * Source: Bulbapedia "Electric Terrain" Gen 6 -- "Grounded Pokemon cannot fall asleep."
 * Source: Bulbapedia "Misty Terrain" Gen 6 -- "Grounded Pokemon are protected from
 *   status conditions."
 * Source: Showdown data/conditions.ts -- electricterrain.onSetStatus (sleep only),
 *   mistyterrain.onSetStatus (all status)
 */
export function canInflictStatusWithTerrain(
  status: PrimaryStatus,
  target: ActivePokemon,
  state: BattleState,
): boolean {
  if (!state.terrain) return true;

  const gravityActive = state.gravity?.active ?? false;
  if (!isGen6Grounded(target, gravityActive)) return true;

  // Electric Terrain: prevents sleep for grounded Pokemon
  // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus:
  //   if (status.id === 'slp') { ... return false; }
  if (state.terrain.type === CORE_TERRAIN_IDS.electric && status === CORE_STATUS_IDS.sleep)
    return false;

  // Misty Terrain: prevents all primary status for grounded Pokemon
  // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus:
  //   return false; (blocks all status)
  if (state.terrain.type === CORE_TERRAIN_IDS.misty) return false;

  return true;
}

/**
 * Terrain-based damage modifier for the power step of the damage formula.
 *
 * Applied to base power before the main damage formula runs:
 *   - Electric Terrain + Electric move + grounded attacker: 1.5x
 *   - Grassy Terrain + Grass move + grounded attacker: 1.5x
 *   - Misty Terrain + Dragon move + grounded defender: 0.5x
 *
 * Grassy Terrain also halves damage from Earthquake, Bulldoze, and Magnitude
 * against grounded defenders. This is a separate check from the type boost.
 *
 * Source: Bulbapedia "Electric Terrain" Gen 6 -- "increases the power of Electric-type
 *   moves used by grounded Pokemon by 50%"
 * Source: Bulbapedia "Grassy Terrain" Gen 6 -- "increases the power of Grass-type moves
 *   used by grounded Pokemon by 50%" and "Earthquake, Bulldoze, and Magnitude have their
 *   power halved"
 * Source: Bulbapedia "Misty Terrain" Gen 6 -- "the power of Dragon-type moves used against
 *   grounded Pokemon is halved"
 * Source: Showdown data/conditions.ts -- terrain onBasePower / onModifyDamage handlers
 *
 * @returns The terrain power modifier as a 4096-based value, or null if no modifier applies.
 *   Also returns a ground move halving flag for Grassy Terrain.
 */
export interface TerrainDamageModifier {
  /** 4096-based power modifier (6144 = 1.5x, 2048 = 0.5x), or null for no change */
  readonly powerModifier: number | null;
  /** Whether Grassy Terrain ground move halving applies (separate from type boost) */
  readonly grassyGroundHalved: boolean;
}

/**
 * Ground-hitting moves affected by Grassy Terrain's damage halving.
 *
 * Source: Bulbapedia "Grassy Terrain" -- "Earthquake, Bulldoze, and Magnitude
 *   have their power halved."
 * Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage:
 *   if (['earthquake', 'bulldoze', 'magnitude'].includes(move.id))
 */
const GRASSY_HALVED_MOVES: ReadonlySet<string> = new Set([
  GEN6_MOVE_IDS.earthquake,
  GEN6_MOVE_IDS.bulldoze,
  GEN6_MOVE_IDS.magnitude,
]);

export function getTerrainDamageModifier(
  terrainType: string,
  moveType: string,
  moveId: string,
  attackerGrounded: boolean,
  defenderGrounded: boolean,
): TerrainDamageModifier {
  let powerModifier: number | null = null;
  let grassyGroundHalved = false;

  // Electric Terrain: 1.5x for Electric moves when attacker is grounded
  // Source: Showdown data/conditions.ts -- electricterrain.onBasePower:
  //   chainModify(1.5) when type === 'Electric' and source.isGrounded()
  if (
    terrainType === CORE_TERRAIN_IDS.electric &&
    moveType === CORE_TYPE_IDS.electric &&
    attackerGrounded
  ) {
    powerModifier = 6144; // 1.5x in 4096-based math
  }

  // Grassy Terrain: 1.5x for Grass moves when attacker is grounded
  // Source: Showdown data/conditions.ts -- grassyterrain.onBasePower:
  //   chainModify(1.5) when type === 'Grass' and source.isGrounded()
  if (
    terrainType === CORE_TERRAIN_IDS.grassy &&
    moveType === CORE_TYPE_IDS.grass &&
    attackerGrounded
  ) {
    powerModifier = 6144; // 1.5x in 4096-based math
  }

  // Misty Terrain: 0.5x for Dragon moves when defender is grounded
  // Source: Showdown data/conditions.ts -- mistyterrain.onBasePower:
  //   chainModify(0.5) when type === 'Dragon' and target.isGrounded()
  if (
    terrainType === CORE_TERRAIN_IDS.misty &&
    moveType === CORE_TYPE_IDS.dragon &&
    defenderGrounded
  ) {
    powerModifier = 2048; // 0.5x in 4096-based math
  }

  // Grassy Terrain: halve damage from Earthquake/Bulldoze/Magnitude vs grounded
  // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage
  if (
    terrainType === CORE_TERRAIN_IDS.grassy &&
    defenderGrounded &&
    GRASSY_HALVED_MOVES.has(moveId)
  ) {
    grassyGroundHalved = true;
  }

  return { powerModifier, grassyGroundHalved };
}
