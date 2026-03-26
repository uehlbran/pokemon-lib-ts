/**
 * Gen 8 Terrain System
 *
 * Implements terrain effects for Generation 8 (Sword/Shield):
 *   - Electric Terrain: grounded sleep immunity (boost handled in Gen8DamageCalc)
 *   - Grassy Terrain: 1/16 HP heal at EoT for grounded Pokemon
 *     (Earthquake/Bulldoze/Magnitude half-damage handled in Gen8DamageCalc)
 *   - Psychic Terrain: blocks priority moves targeting grounded defenders
 *   - Misty Terrain: grounded status immunity; blocks confusion for grounded Pokemon
 *     (Dragon move halving handled in Gen8DamageCalc)
 *
 * Terrain lasts 5 turns by default (8 with Terrain Extender).
 * Only one terrain can be active at a time; setting a new one replaces the old.
 *
 * Gen 8 terrain damage boost is 1.3x (5325/4096), down from 1.5x in Gen 6-7.
 * That boost is handled INSIDE Gen8DamageCalc.ts, NOT here.
 *
 * Source: Showdown data/conditions.ts -- terrain handlers (Gen 8)
 * Source: Showdown data/mods/gen8/scripts.ts -- terrain boost nerfed to 1.3x
 * Source: Bulbapedia "Electric Terrain" / "Grassy Terrain" / "Misty Terrain" / "Psychic Terrain"
 */

import type {
  AbilityContext,
  AbilityResult,
  ActivePokemon,
  BattleState,
  TerrainEffectResult,
} from "@pokemon-lib-ts/battle";
import type { PrimaryStatus, TerrainType } from "@pokemon-lib-ts/core";
import { CORE_STATUS_IDS, CORE_TERRAIN_IDS } from "@pokemon-lib-ts/core";
import { GEN8_ABILITY_IDS, GEN8_ITEM_IDS } from "./data/reference-ids.js";
import { isGen8Grounded } from "./Gen8DamageCalc.js";

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
 * Source: Bulbapedia "Electric Terrain" Gen 8 -- "Grounded Pokemon cannot fall asleep."
 * Source: Bulbapedia "Misty Terrain" Gen 8 -- "Grounded Pokemon are protected from
 *   status conditions and confusion."
 */
export function checkGen8TerrainStatusImmunity(
  status: PrimaryStatus,
  target: ActivePokemon,
  state: BattleState,
): { immune: boolean; message?: string } {
  if (!state.terrain) return { immune: false };

  const gravityActive = state.gravity?.active ?? false;
  if (!isGen8Grounded(target, gravityActive)) return { immune: false };

  const pokemonName = target.pokemon.nickname ?? String(target.pokemon.speciesId);

  // Electric Terrain: prevents sleep for grounded Pokemon
  // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus:
  //   if (status.id === 'slp') { ... return false; }
  if (state.terrain.type === CORE_TERRAIN_IDS.electric && status === CORE_STATUS_IDS.sleep) {
    return {
      immune: true,
      message: `${pokemonName} is protected by Electric Terrain!`,
    };
  }

  // Misty Terrain: prevents all primary status for grounded Pokemon
  // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus:
  //   return false; (blocks all status)
  if (state.terrain.type === CORE_TERRAIN_IDS.misty) {
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
  if (!state.terrain || state.terrain.type !== CORE_TERRAIN_IDS.misty) return false;

  const gravityActive = state.gravity?.active ?? false;
  return isGen8Grounded(target, gravityActive);
}

// ---- Psychic Terrain Priority Blocking ----

/**
 * Check if Psychic Terrain blocks a priority move from hitting a grounded target.
 *
 * In Gen 8, Psychic Terrain blocks moves with priority > 0 from hitting grounded
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
  if (terrainType !== CORE_TERRAIN_IDS.psychic) return false;
  if (movePriority <= 0) return false;

  const gravityActive = state.gravity?.active ?? false;
  return isGen8Grounded(target, gravityActive);
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
export function applyGen8TerrainEffects(state: BattleState): TerrainEffectResult[] {
  if (!state.terrain) return [];

  const results: TerrainEffectResult[] = [];

  if (state.terrain.type === CORE_TERRAIN_IDS.grassy) {
    const gravityActive = state.gravity?.active ?? false;

    for (const side of state.sides) {
      for (const active of side.active) {
        if (!active || active.pokemon.currentHp <= 0) continue;
        if (!isGen8Grounded(active, gravityActive)) continue;

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
  [GEN8_ABILITY_IDS.electricSurge]: CORE_TERRAIN_IDS.electric,
  [GEN8_ABILITY_IDS.grassySurge]: CORE_TERRAIN_IDS.grassy,
  [GEN8_ABILITY_IDS.psychicSurge]: CORE_TERRAIN_IDS.psychic,
  [GEN8_ABILITY_IDS.mistySurge]: CORE_TERRAIN_IDS.misty,
};

/**
 * Handle Surge ability activation on switch-in.
 *
 * Sets the corresponding terrain for 5 turns (8 with Terrain Extender held item).
 * Directly mutates state.terrain because AbilityEffect does not yet have a
 * "terrain-set" variant.
 *
 * Surge abilities (Gen 8):
 *   - Electric Surge (Pincurchin, Tapu Koko): Electric Terrain
 *   - Grassy Surge (Rillaboom, Tapu Bulu): Grassy Terrain
 *   - Psychic Surge (Indeedee, Tapu Lele): Psychic Terrain
 *   - Misty Surge (Galarian Weezing, Tapu Fini): Misty Terrain
 *
 * Source: Showdown data/abilities.ts -- electricsurge/grassysurge/psychicsurge/mistysurge:
 *   onStart: this.field.setTerrain('...')
 * Source: Bulbapedia -- "Electric Surge sets Electric Terrain when the Pokemon enters battle."
 */
export function handleSurgeAbility(context: AbilityContext): AbilityResult {
  const ability = context.pokemon.ability;
  if (!ability) return { activated: false, effects: [], messages: [] };

  const terrainType = SURGE_ABILITIES[ability];
  if (!terrainType) return { activated: false, effects: [], messages: [] };

  // Check if ability is suppressed
  if (context.pokemon.suppressedAbility !== null) {
    return { activated: false, effects: [], messages: [] };
  }

  // Determine duration: 8 turns with Terrain Extender, 5 turns otherwise
  // Source: Showdown data/items.ts -- terrainextender: terrain duration + 3
  // Source: Bulbapedia "Terrain Extender" -- "extends terrain to 8 turns"
  const heldItem = context.pokemon.pokemon.heldItem;
  const hasTerrainExtender = heldItem === GEN8_ITEM_IDS.terrainExtender;
  const duration = hasTerrainExtender ? TERRAIN_EXTENDED_TURNS : TERRAIN_DEFAULT_TURNS;

  // Directly set terrain on state (AbilityEffect lacks "terrain-set" variant)
  const mutableState = context.state as BattleState;
  mutableState.terrain = {
    type: terrainType,
    turnsLeft: duration,
    source: ability,
  };

  const pokemonName = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);

  const terrainDisplayNames: Record<TerrainType, string> = {
    electric: "Electric Terrain",
    grassy: "Grassy Terrain",
    psychic: "Psychic Terrain",
    misty: "Misty Terrain",
  };

  return {
    activated: true,
    effects: [],
    messages: [`${pokemonName}'s ${ability} set ${terrainDisplayNames[terrainType]}!`],
  };
}

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
