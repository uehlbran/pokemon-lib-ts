/**
 * Gen 9 Terrain System
 *
 * Implements terrain effects for Generation 9 (Scarlet/Violet):
 *   - Electric Terrain: grounded sleep immunity (boost handled in damage calc)
 *   - Grassy Terrain: 1/16 HP heal at EoT for grounded Pokemon
 *     (Earthquake/Bulldoze/Magnitude half-damage handled in damage calc)
 *   - Psychic Terrain: blocks priority moves targeting grounded defenders
 *   - Misty Terrain: grounded status immunity; blocks confusion for grounded Pokemon
 *     (Dragon move halving handled in damage calc)
 *
 * Terrain lasts 5 turns by default (8 with Terrain Extender).
 * Only one terrain can be active at a time; setting a new one replaces the old.
 *
 * Gen 9 terrain damage boost is 1.3x (5325/4096), same as Gen 8.
 * That boost is handled INSIDE the damage calc, NOT here.
 *
 * Source: Showdown data/conditions.ts -- terrain handlers
 * Source: Bulbapedia "Electric Terrain" / "Grassy Terrain" / "Misty Terrain" / "Psychic Terrain"
 */

import type { ActivePokemon, BattleState, TerrainEffectResult } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type PrimaryStatus,
  type TerrainType,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";

// ---- Constants ----

/**
 * Default terrain duration (5 turns).
 *
 * Source: Bulbapedia -- Terrain lasts 5 turns by default.
 * Source: Showdown data/conditions.ts -- terrain duration: 5
 */
export const TERRAIN_DEFAULT_TURNS = 5;

/**
 * Extended terrain duration with Terrain Extender item (8 turns).
 *
 * Source: Bulbapedia "Terrain Extender" -- extends terrain duration to 8 turns
 * Source: Showdown data/items.ts -- terrainextender: terrain duration + 3
 */
export const TERRAIN_EXTENDED_TURNS = 8;

// ---- Grounding Check ----

/**
 * Check if a Pokemon is grounded (affected by terrain and ground-based effects).
 *
 * Grounding rules (same as Gen 6-8):
 * - Gravity: all Pokemon are grounded
 * - Ingrain: forces grounding
 * - Iron Ball: forces grounding (unless Klutz or Embargo)
 * - Smack Down: forces grounding
 * - Flying type: not grounded
 * - Levitate ability: not grounded
 * - Air Balloon (with HP > 0, no Klutz/Embargo): not grounded
 * - Magnet Rise volatile: not grounded
 * - Telekinesis volatile: not grounded
 *
 * Source: Showdown sim/pokemon.ts -- isGrounded()
 * Source: Bulbapedia -- grounding mechanics
 */
export function isGen9Grounded(pokemon: ActivePokemon, gravityActive: boolean): boolean {
  if (gravityActive) return true;
  if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.ingrain)) return true;

  const itemsSuppressed =
    pokemon.ability === CORE_ABILITY_IDS.klutz ||
    pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.embargo);
  if (pokemon.pokemon.heldItem === CORE_ITEM_IDS.ironBall && !itemsSuppressed) return true;
  if (pokemon.volatileStatuses.has("smackdown" as VolatileStatus)) return true;

  if (pokemon.types.includes(CORE_TYPE_IDS.flying)) return false;
  if (pokemon.ability === CORE_ABILITY_IDS.levitate) return false;
  if (
    pokemon.pokemon.heldItem === CORE_ITEM_IDS.airBalloon &&
    !itemsSuppressed &&
    pokemon.pokemon.currentHp > 0
  ) {
    return false;
  }
  if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.magnetRise)) return false;
  if (pokemon.volatileStatuses.has("telekinesis" as VolatileStatus)) return false;

  return true;
}

// ---- Terrain Status Immunity ----

/**
 * Check if a Pokemon can be inflicted with a primary status condition,
 * considering active terrain effects.
 *
 * - Electric Terrain: grounded Pokemon cannot fall asleep
 * - Misty Terrain: grounded Pokemon cannot gain any primary status condition
 *
 * Returns `{ immune: false }` if the status CAN be inflicted,
 * or `{ immune: true, message }` if terrain prevents it.
 *
 * Note: Misty Terrain also blocks confusion (volatile, not primary status),
 * but that is handled separately since this function only covers PrimaryStatus.
 *
 * Source: Showdown data/conditions.ts -- electricterrain.onSetStatus (sleep only),
 *   mistyterrain.onSetStatus (all status)
 * Source: Bulbapedia "Electric Terrain" Gen 9 -- "Grounded Pokemon cannot fall asleep."
 * Source: Bulbapedia "Misty Terrain" Gen 9 -- "Grounded Pokemon are protected from
 *   status conditions and confusion."
 */
export function checkGen9TerrainStatusImmunity(
  status: PrimaryStatus,
  target: ActivePokemon,
  state: BattleState,
): { immune: boolean; message?: string } {
  if (!state.terrain) return { immune: false };

  const gravityActive = state.gravity?.active ?? false;
  if (!isGen9Grounded(target, gravityActive)) return { immune: false };

  const pokemonName = target.pokemon.nickname ?? String(target.pokemon.speciesId);

  // Electric Terrain: prevents sleep for grounded Pokemon
  // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus:
  //   if (status.id === 'slp') { ... return false; }
  if (state.terrain.type === "electric" && status === CORE_STATUS_IDS.sleep) {
    return {
      immune: true,
      message: `${pokemonName} is protected by Electric Terrain!`,
    };
  }

  // Misty Terrain: prevents all primary status for grounded Pokemon
  // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus:
  //   return false; (blocks all status)
  if (state.terrain.type === "misty") {
    return {
      immune: true,
      message: `${pokemonName} is protected by Misty Terrain!`,
    };
  }

  return { immune: false };
}

/**
 * Check if Misty Terrain blocks confusion for a grounded Pokemon.
 *
 * Misty Terrain prevents confusion from moves (e.g., Confuse Ray, Swagger)
 * for grounded Pokemon. This is separate from primary status immunity.
 *
 * Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile:
 *   if (status.id === 'confusion') { return null; }
 * Source: Bulbapedia "Misty Terrain" -- "prevents confusion"
 */
export function checkMistyTerrainConfusionImmunity(
  target: ActivePokemon,
  state: BattleState,
): boolean {
  if (!state.terrain || state.terrain.type !== "misty") return false;

  const gravityActive = state.gravity?.active ?? false;
  return isGen9Grounded(target, gravityActive);
}

// ---- Psychic Terrain Priority Blocking ----

/**
 * Check if Psychic Terrain blocks a priority move from hitting a grounded target.
 *
 * In Gen 9, Psychic Terrain blocks moves with priority > 0 from hitting grounded
 * defenders. The move fails entirely (not just misses).
 *
 * Note: This only blocks moves targeting a grounded Pokemon. Self-targeting priority
 * moves (Protect, Quick Guard) are NOT blocked.
 *
 * Source: Showdown data/conditions.ts -- psychicterrain.onTryHit:
 *   if (target.isGrounded() && move.priority > 0) { return false; }
 * Source: Bulbapedia "Psychic Terrain" -- "Grounded Pokemon are protected from
 *   moves with increased priority."
 *
 * @param terrainType - The current terrain type, or null if no terrain
 * @param movePriority - The effective priority of the move (after Prankster, etc.)
 * @param target - The defending Pokemon
 * @param state - The battle state (for gravity check)
 * @returns true if the move is blocked by Psychic Terrain
 */
export function checkPsychicTerrainPriorityBlock(
  terrainType: TerrainType | null,
  movePriority: number,
  target: ActivePokemon,
  state: BattleState,
): boolean {
  if (terrainType !== "psychic") return false;
  if (movePriority <= 0) return false;

  const gravityActive = state.gravity?.active ?? false;
  return isGen9Grounded(target, gravityActive);
}

// ---- Grassy Terrain End-of-Turn Healing ----

/**
 * Apply terrain end-of-turn effects (currently only Grassy Terrain healing).
 *
 * At the end of each turn, grounded Pokemon on Grassy Terrain recover 1/16 of their
 * max HP. Pokemon at full HP or fainted are not affected.
 *
 * Source: Bulbapedia "Grassy Terrain" -- "At the end of each turn, the HP of each
 *   grounded Pokemon is restored by 1/16 of its maximum HP."
 * Source: Showdown data/conditions.ts -- grassyterrain.onResidual:
 *   this.heal(pokemon.baseMaxhp / 16)
 */
export function applyGen9TerrainEffects(state: BattleState): TerrainEffectResult[] {
  if (!state.terrain) return [];

  const results: TerrainEffectResult[] = [];

  if (state.terrain.type === "grassy") {
    const gravityActive = state.gravity?.active ?? false;

    for (const side of state.sides) {
      for (const active of side.active) {
        if (!active || active.pokemon.currentHp <= 0) continue;
        if (!isGen9Grounded(active, gravityActive)) continue;

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

// ---- Surge Abilities ----

/**
 * Map of Surge ability names to the terrain they set.
 *
 * Source: Showdown data/abilities.ts -- Electric Surge, Grassy Surge, etc.
 * Source: Bulbapedia -- Surge abilities set terrain on switch-in
 */
const SURGE_ABILITIES: Readonly<Record<string, TerrainType>> = {
  "electric-surge": "electric",
  "grassy-surge": "grassy",
  "psychic-surge": "psychic",
  "misty-surge": "misty",
};

/**
 * Check if an ability is a Surge ability.
 *
 * @param ability - The ability identifier to check
 * @returns true if the ability is a Surge ability
 */
export function isSurgeAbility(ability: string | null): boolean {
  if (!ability) return false;
  return ability in SURGE_ABILITIES;
}

/**
 * Get the terrain type that a Surge ability sets.
 *
 * @param ability - The Surge ability identifier
 * @returns The terrain type, or null if not a Surge ability
 */
export function getSurgeTerrainType(ability: string): TerrainType | null {
  return SURGE_ABILITIES[ability] ?? null;
}
