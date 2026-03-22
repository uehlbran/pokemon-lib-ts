/**
 * Gen 7 Entry Hazards
 *
 * Implements Spikes, Stealth Rock, Toxic Spikes, and Sticky Web hazard
 * application for Pokemon switching into battle. Gen 7 hazards are identical
 * to Gen 6 mechanics.
 *
 * Key mechanics:
 *   - Spikes: layer-scaled HP damage (1/8, 1/6, 1/4), grounded-only
 *   - Stealth Rock: Rock-type effectiveness-scaled damage (no grounding check)
 *   - Toxic Spikes: poison/badly-poisoned on grounded switch-in; Poison-type absorbs
 *   - Sticky Web: -1 Speed stage to grounded switch-ins
 *   - Magic Guard: immune to ALL hazard effects (damage, status) but NOT Sticky Web
 *   - Air Balloon: grants levitation (immune to ground-based hazards)
 *   - Heavy-Duty Boots do NOT exist in Gen 7 (introduced Gen 8)
 *
 * Source: Showdown data/moves.ts -- spikes, stealthrock, toxicspikes, stickyweb conditions
 * Source: Bulbapedia -- individual hazard pages
 */

import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  EntryHazardResult,
} from "@pokemon-lib-ts/battle";
import type {
  BattleStat,
  EntryHazardType,
  PrimaryStatus,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { isGen7Grounded } from "./Gen7DamageCalc.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of applying a single damage-dealing hazard (Spikes or Stealth Rock) */
export interface HazardDamageResult {
  /** HP damage dealt */
  readonly damage: number;
  /** Message to emit */
  readonly message: string;
}

/** Result of applying Toxic Spikes */
export interface ToxicSpikesResult {
  /** Whether a Poison-type absorbed (removed) the hazard */
  readonly absorbed: boolean;
  /** Status to inflict, or null if immune */
  readonly status: "poison" | "badly-poisoned" | null;
  /** Message to emit */
  readonly message: string | null;
}

/** Result of applying Sticky Web */
export interface StickyWebResult {
  /** Whether the Speed drop was applied */
  readonly applied: boolean;
  /** Stat change to emit (speed: -1), or null if immune */
  readonly statChange: { stat: BattleStat; stages: number } | null;
  /** Messages to emit */
  readonly messages: string[];
}

// ---------------------------------------------------------------------------
// Individual Hazard Functions
// ---------------------------------------------------------------------------

/**
 * Apply Spikes damage to a grounded Pokemon switching in.
 *
 * Damage is layer-dependent:
 *   - 1 layer: floor(maxHp * 3 / 24) = floor(maxHp / 8)
 *   - 2 layers: floor(maxHp * 4 / 24) = floor(maxHp / 6)
 *   - 3 layers: floor(maxHp * 6 / 24) = floor(maxHp / 4)
 *
 * Returns null if the Pokemon is immune (not grounded).
 *
 * Source: Showdown data/moves.ts -- spikes.condition.onSwitchIn
 *   const damageAmounts = [0, 3, 4, 6]; // fractions of maxhp/24
 *   this.damage(damageAmounts[layers] * pokemon.maxhp / 24);
 */
export function applyGen7SpikesHazard(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): HazardDamageResult | null {
  if (layers <= 0) return null;

  // Not grounded -> immune
  if (!isGen7Grounded(switchingIn, gravityActive)) return null;

  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Source: Showdown data/moves.ts -- spikes: damageAmounts = [0, 3, 4, 6]
  const damageNumerators = [0, 3, 4, 6];
  const clampedLayers = Math.min(layers, 3);
  const numerator = damageNumerators[clampedLayers] ?? 3;
  const damage = Math.max(1, Math.floor((maxHp * numerator) / 24));

  return {
    damage,
    message: `${pokemonName} was hurt by the spikes!`,
  };
}

/**
 * Apply Stealth Rock damage to a Pokemon switching in.
 *
 * Damage = floor(maxHp * typeEffectiveness / 8)
 * where typeEffectiveness is Rock-type's effectiveness against the switching Pokemon's types.
 *
 * Stealth Rock has NO grounding check -- it hits Flying-types, Levitate, etc.
 * Only Magic Guard prevents the damage.
 *
 * Source: Showdown data/moves.ts -- stealthrock.condition.onSwitchIn
 *   const typeMod = this.clampIntRange(pokemon.runEffectiveness(...), -6, 6);
 *   this.damage(pokemon.maxhp * (2 ** typeMod) / 8);
 */
export function applyGen7StealthRock(
  switchingIn: ActivePokemon,
  typeChart: TypeChart,
): HazardDamageResult | null {
  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Calculate Rock-type effectiveness against switching Pokemon's types
  let effectiveness = 1;
  const rockChart = (typeChart as Record<string, Record<string, number>>).rock;
  if (rockChart) {
    for (const type of switchingIn.types) {
      const mult = rockChart[type] ?? 1;
      effectiveness *= mult;
    }
  }

  // Source: Showdown -- damage = floor(maxhp * effectiveness / 8)
  const damage = Math.max(1, Math.floor((maxHp * effectiveness) / 8));

  return {
    damage,
    message: `Pointed stones dug into ${pokemonName}!`,
  };
}

/**
 * Apply Toxic Spikes effect to a Pokemon switching in.
 *
 * Layer 1: inflicts regular poison
 * Layer 2: inflicts badly poisoned (toxic)
 *
 * Immunities:
 *   - Poison-type: absorbs (removes) the hazard from the field
 *   - Steel-type: immune to poison status
 *   - Not grounded: immune (Flying, Levitate, Air Balloon, Magnet Rise, Telekinesis)
 *   - Already has a primary status: cannot gain another
 *
 * Source: Showdown data/moves.ts -- toxicspikes.condition.onSwitchIn
 *   if (pokemon.hasType('Poison')) -> removeSideCondition('toxicspikes')
 *   elif (pokemon.hasType('Steel')) -> do nothing
 *   elif (layers >= 2) -> trySetStatus('tox')
 *   else -> trySetStatus('psn')
 */
export function applyGen7ToxicSpikes(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): ToxicSpikesResult {
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  if (layers <= 0) {
    return { absorbed: false, status: null, message: null };
  }

  // Not grounded -> immune
  if (!isGen7Grounded(switchingIn, gravityActive)) {
    return { absorbed: false, status: null, message: null };
  }

  // Poison-type absorbs (removes) Toxic Spikes
  // Source: Showdown -- toxicspikes: grounded Poison-type removes them
  if (switchingIn.types.includes("poison")) {
    return {
      absorbed: true,
      status: null,
      message: `${pokemonName} absorbed the poison spikes!`,
    };
  }

  // Steel-type immune to poison
  // Source: Bulbapedia -- Steel types cannot be poisoned
  if (switchingIn.types.includes("steel")) {
    return { absorbed: false, status: null, message: null };
  }

  // Already has a primary status -> cannot gain another
  if (switchingIn.pokemon.status) {
    return { absorbed: false, status: null, message: null };
  }

  // Apply poison based on layers
  const clampedLayers = Math.min(layers, 2);
  if (clampedLayers >= 2) {
    return {
      absorbed: false,
      status: "badly-poisoned",
      message: `${pokemonName} was badly poisoned by the toxic spikes!`,
    };
  }

  return {
    absorbed: false,
    status: "poison",
    message: `${pokemonName} was poisoned by the toxic spikes!`,
  };
}

/**
 * Apply Sticky Web effect to a Pokemon switching in.
 *
 * Sticky Web lowers the Speed stat of the opposing grounded Pokemon by 1 stage.
 *
 * Immunities:
 *   - Not grounded: immune (Flying, Levitate, Air Balloon, Magnet Rise, Telekinesis)
 *   - Clear Body / White Smoke: blocks stat drops
 *   - Full Metal Body: blocks stat drops (Gen 7+ ability)
 *   - Magic Guard does NOT block Sticky Web (it only blocks indirect damage)
 *
 * Triggers:
 *   - Defiant: +2 Attack when a stat is lowered by an opponent
 *   - Competitive: +2 Special Attack when a stat is lowered by an opponent
 *
 * Source: Showdown data/moves.ts -- stickyweb.condition.onSwitchIn
 *   "if (!pokemon.isGrounded()) return;"
 *   "this.boost({spe: -1}, pokemon, ...);"
 * Source: Bulbapedia -- Sticky Web: "lowers the Speed stat of the opposing Pokemon
 *   that switches into it by one stage"
 * Source: Bulbapedia -- Full Metal Body: "prevents other Pokemon from lowering this
 *   Pokemon's stat stages" (Gen 7+ ability, Solgaleo/Necrozma)
 */
export function applyGen7StickyWeb(
  switchingIn: ActivePokemon,
  gravityActive: boolean,
): StickyWebResult {
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Not grounded -> immune
  if (!isGen7Grounded(switchingIn, gravityActive)) {
    return { applied: false, statChange: null, messages: [] };
  }

  // Clear Body / White Smoke / Full Metal Body: prevents stat drops
  // Source: Showdown data/abilities.ts -- clearbody/whitesmoke/fullmetalbody: onBoost
  // Source: Bulbapedia -- Full Metal Body prevents stat reductions (Gen 7+)
  if (
    switchingIn.ability === "clear-body" ||
    switchingIn.ability === "white-smoke" ||
    switchingIn.ability === "full-metal-body"
  ) {
    const abilityNames: Record<string, string> = {
      "clear-body": "Clear Body",
      "white-smoke": "White Smoke",
      "full-metal-body": "Full Metal Body",
    };
    const abilityName = abilityNames[switchingIn.ability] ?? switchingIn.ability;
    return {
      applied: false,
      statChange: null,
      messages: [`${pokemonName}'s ${abilityName} prevents stat loss!`],
    };
  }

  // Apply -1 Speed stage
  const messages: string[] = [`${pokemonName} was caught in a sticky web!`];

  // Defiant / Competitive trigger
  if (switchingIn.ability === "defiant") {
    messages.push(`${pokemonName}'s Defiant sharply raised its Attack!`);
  } else if (switchingIn.ability === "competitive") {
    messages.push(`${pokemonName}'s Competitive sharply raised its Sp. Atk!`);
  }

  return {
    applied: true,
    statChange: { stat: "speed", stages: -1 },
    messages,
  };
}

// ---------------------------------------------------------------------------
// Main Entry Hazard Application
// ---------------------------------------------------------------------------

/**
 * Apply all entry hazards to a Pokemon switching in.
 *
 * Processes hazards in order: Stealth Rock, Spikes, Toxic Spikes, Sticky Web.
 *
 * Magic Guard prevents ALL hazard effects (both damage and status) but NOT
 * Sticky Web's stat drop (Sticky Web is not damage).
 *
 * Source: Showdown sim/battle-actions.ts -- runSwitch: sideConditions applied individually
 * Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
 */
export function applyGen7EntryHazards(
  switchingIn: ActivePokemon,
  side: BattleSide,
  state: BattleState,
  typeChart: TypeChart,
): EntryHazardResult {
  let totalDamage = 0;
  let statusInflicted: PrimaryStatus | null = null;
  const messages: string[] = [];
  const hazardsToRemove: EntryHazardType[] = [];
  const statChanges: Array<{ stat: BattleStat; stages: number }> = [];
  const gravityActive = state.gravity?.active ?? false;

  // Magic Guard: immune to all DAMAGE-related hazard effects but NOT Sticky Web
  // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
  const hasMagicGuard = switchingIn.ability === "magic-guard";

  if (!hasMagicGuard) {
    // --- Stealth Rock ---
    // No grounding check -- Stealth Rock hits everything
    const stealthRock = side.hazards.find((h) => h.type === "stealth-rock");
    if (stealthRock && stealthRock.layers > 0) {
      const result = applyGen7StealthRock(switchingIn, typeChart);
      if (result) {
        totalDamage += result.damage;
        messages.push(result.message);
      }
    }

    // --- Spikes ---
    const spikes = side.hazards.find((h) => h.type === "spikes");
    if (spikes && spikes.layers > 0) {
      const result = applyGen7SpikesHazard(switchingIn, spikes.layers, gravityActive);
      if (result) {
        totalDamage += result.damage;
        messages.push(result.message);
      }
    }

    // --- Toxic Spikes ---
    const toxicSpikes = side.hazards.find((h) => h.type === "toxic-spikes");
    if (toxicSpikes && toxicSpikes.layers > 0) {
      const result = applyGen7ToxicSpikes(switchingIn, toxicSpikes.layers, gravityActive);
      if (result.absorbed) {
        hazardsToRemove.push("toxic-spikes");
      }
      // Misty Terrain blocks all status for grounded Pokemon
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus blocks all status
      const terrainBlocksStatus =
        state.terrain?.type === "misty" && isGen7Grounded(switchingIn, gravityActive);
      if (result.status && !terrainBlocksStatus) {
        statusInflicted = result.status;
      }
      // Only suppress the poison message when terrain blocks the status.
      // Absorption messages (Poison-type absorbing spikes) should still be emitted.
      if (result.message && !(result.status && terrainBlocksStatus)) {
        messages.push(result.message);
      }
    }
  }

  // --- Sticky Web ---
  // NOT gated by Magic Guard (Sticky Web is a stat drop, not damage)
  // Source: Showdown data/moves.ts -- stickyweb.condition.onSwitchIn
  const stickyWeb = side.hazards.find((h) => h.type === "sticky-web");
  if (stickyWeb && stickyWeb.layers > 0) {
    const result = applyGen7StickyWeb(switchingIn, gravityActive);
    if (result.applied && result.statChange) {
      statChanges.push(result.statChange);
    }
    messages.push(...result.messages);
  }

  return {
    damage: totalDamage,
    statusInflicted,
    statChanges,
    messages,
    hazardsToRemove: hazardsToRemove.length > 0 ? hazardsToRemove : undefined,
  };
}
