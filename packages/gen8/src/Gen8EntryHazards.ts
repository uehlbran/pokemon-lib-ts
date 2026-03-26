/**
 * Gen 8 Entry Hazards
 *
 * Implements Spikes, Stealth Rock, Toxic Spikes, Sticky Web, and G-Max Steelsurge
 * hazard application for Pokemon switching into battle.
 *
 * Key mechanics (same as Gen 7):
 *   - Spikes: layer-scaled HP damage (1/8, 1/6, 1/4), grounded-only
 *   - Stealth Rock: Rock-type effectiveness-scaled damage (no grounding check)
 *   - Toxic Spikes: poison/badly-poisoned on grounded switch-in; Poison-type absorbs
 *   - Sticky Web: -1 Speed stage to grounded switch-ins
 *   - Magic Guard: immune to ALL hazard effects (damage, status) but NOT Sticky Web
 *   - Air Balloon: grants levitation (immune to ground-based hazards)
 *
 * New in Gen 8:
 *   - G-Max Steelsurge: Steel-type Stealth Rock (effectiveness-scaled like SR but Steel type)
 *   - Heavy-Duty Boots: blocks ALL entry hazard effects on switch-in
 *
 * Source: Showdown data/moves.ts -- spikes, stealthrock, toxicspikes, stickyweb, gmaxsteelsurge
 * Source: Showdown data/items.ts -- heavydutyboots
 * Source: Bulbapedia -- individual hazard pages
 */

import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  EntryHazardResult,
} from "@pokemon-lib-ts/battle";
import type { BattleStat, EntryHazardType, PrimaryStatus, TypeChart } from "@pokemon-lib-ts/core";
import { CORE_STAT_IDS } from "@pokemon-lib-ts/core";
import { isGen8Grounded } from "./Gen8DamageCalc.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of applying a single damage-dealing hazard (Spikes, Stealth Rock, G-Max Steelsurge) */
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
  /**
   * Primary stat change (speed: -1), or null if immune.
   * @deprecated Use statChanges array instead; this remains for backwards compatibility.
   */
  readonly statChange: { stat: BattleStat; stages: number } | null;
  /**
   * All stat changes resulting from Sticky Web, including secondary ability-triggered changes
   * (e.g., Defiant +2 Attack, Competitive +2 Sp. Atk).
   */
  readonly statChanges: ReadonlyArray<{ stat: BattleStat; stages: number }>;
  /** Messages to emit */
  readonly messages: string[];
}

// ---------------------------------------------------------------------------
// Heavy-Duty Boots Check
// ---------------------------------------------------------------------------

/**
 * Check whether a Pokemon has Heavy-Duty Boots equipped.
 *
 * Heavy-Duty Boots (introduced Gen 8) blocks ALL entry hazard effects on switch-in:
 * Stealth Rock, Spikes, Toxic Spikes, Sticky Web, and G-Max Steelsurge.
 *
 * Source: Showdown data/items.ts -- heavydutyboots: onDamagePriority = -30, all hazards nullified
 * Source: Bulbapedia -- Heavy-Duty Boots page
 */
export function hasHeavyDutyBoots(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === "heavy-duty-boots";
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
export function applyGen8SpikesHazard(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): HazardDamageResult | null {
  if (layers <= 0) return null;

  // Not grounded -> immune
  if (!isGen8Grounded(switchingIn, gravityActive)) return null;

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
 * Only Magic Guard or Heavy-Duty Boots prevents the damage.
 *
 * Source: Showdown data/moves.ts -- stealthrock.condition.onSwitchIn
 *   const typeMod = this.clampIntRange(pokemon.runEffectiveness(...), -6, 6);
 *   this.damage(pokemon.maxhp * (2 ** typeMod) / 8);
 */
export function applyGen8StealthRock(
  switchingIn: ActivePokemon,
  typeChart: TypeChart,
): HazardDamageResult | null {
  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Calculate Rock-type effectiveness against switching Pokemon's types
  let effectiveness = 1;
  const rockChart = typeChart.rock;
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
 * Apply G-Max Steelsurge damage to a Pokemon switching in.
 *
 * Damage = floor(maxHp * steelTypeEffectiveness / 8)
 * where steelTypeEffectiveness is Steel-type's effectiveness against the switching Pokemon's types.
 *
 * G-Max Steelsurge has NO grounding check -- it hits all Pokemon (same as Stealth Rock).
 * Only Magic Guard or Heavy-Duty Boots prevents the damage.
 *
 * Source: Showdown data/moves.ts -- gmaxsteelsurge.condition.onSwitchIn
 *   const typeMod = this.clampIntRange(pokemon.runEffectiveness(...), -6, 6);
 *   this.damage(pokemon.maxhp * Math.pow(2, typeMod) / 8);
 * Source: Showdown data/moves.ts line 7475 -- G-Max Steelsurge sets Steel-type hazard
 */
export function applyGen8GMaxSteelsurge(
  switchingIn: ActivePokemon,
  typeChart: TypeChart,
): HazardDamageResult | null {
  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Calculate Steel-type effectiveness against switching Pokemon's types
  let effectiveness = 1;
  const steelChart = typeChart.steel;
  if (steelChart) {
    for (const type of switchingIn.types) {
      const mult = steelChart[type] ?? 1;
      effectiveness *= mult;
    }
  }

  // Source: Showdown -- damage = floor(maxhp * effectiveness / 8)
  const damage = Math.max(1, Math.floor((maxHp * effectiveness) / 8));

  return {
    damage,
    message: `Sharp steel bit into ${pokemonName}!`,
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
export function applyGen8ToxicSpikes(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): ToxicSpikesResult {
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  if (layers <= 0) {
    return { absorbed: false, status: null, message: null };
  }

  // Not grounded -> immune
  if (!isGen8Grounded(switchingIn, gravityActive)) {
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
export function applyGen8StickyWeb(
  switchingIn: ActivePokemon,
  gravityActive: boolean,
): StickyWebResult {
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Not grounded -> immune
  if (!isGen8Grounded(switchingIn, gravityActive)) {
    return { applied: false, statChange: null, statChanges: [], messages: [] };
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
      statChanges: [],
      messages: [`${pokemonName}'s ${abilityName} prevents stat loss!`],
    };
  }

  // Apply -1 Speed stage
  const messages: string[] = [`${pokemonName} was caught in a sticky web!`];
  const speedChange: { stat: BattleStat; stages: number } = {
    stat: CORE_STAT_IDS.speed,
    stages: -1,
  };
  const allStatChanges: Array<{ stat: BattleStat; stages: number }> = [speedChange];

  // Defiant / Competitive: triggered by opponent-caused stat drop, raise Attack or Sp. Atk by +2
  // Source: Showdown data/abilities.ts -- Defiant/Competitive onAfterEachBoost
  // Source: Bulbapedia "Defiant" -- "raises Attack by 2 when its stats are lowered by an opponent"
  if (switchingIn.ability === "defiant") {
    messages.push(`${pokemonName}'s Defiant sharply raised its Attack!`);
    allStatChanges.push({ stat: CORE_STAT_IDS.attack, stages: 2 });
  } else if (switchingIn.ability === "competitive") {
    messages.push(`${pokemonName}'s Competitive sharply raised its Sp. Atk!`);
    allStatChanges.push({ stat: CORE_STAT_IDS.spAttack, stages: 2 });
  }

  return {
    applied: true,
    statChange: speedChange,
    statChanges: allStatChanges,
    messages,
  };
}

// ---------------------------------------------------------------------------
// Main Entry Hazard Application
// ---------------------------------------------------------------------------

/**
 * Apply all entry hazards to a Pokemon switching in.
 *
 * Processes hazards in order: Stealth Rock, Spikes, Toxic Spikes, Sticky Web,
 * G-Max Steelsurge.
 *
 * Heavy-Duty Boots: blocks ALL hazard effects (damage, status, stat drops).
 * Magic Guard: prevents ALL hazard effects (both damage and status) but NOT
 * Sticky Web's stat drop (Sticky Web is not damage).
 *
 * Source: Showdown sim/battle-actions.ts -- runSwitch: sideConditions applied individually
 * Source: Showdown data/items.ts -- heavydutyboots: blocks all hazards
 * Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
 * Source: Bulbapedia -- Heavy-Duty Boots: "blocks entry hazard damage on switch-in"
 */
export function applyGen8EntryHazards(
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

  // Heavy-Duty Boots: blocks ALL hazard effects on switch-in
  // Source: Showdown data/items.ts -- heavydutyboots: onDamagePriority = -30, all hazards nullified
  // Source: Bulbapedia -- Heavy-Duty Boots page
  if (hasHeavyDutyBoots(switchingIn)) {
    return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
  }

  // Magic Guard: immune to all DAMAGE-related hazard effects but NOT Sticky Web
  // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
  const hasMagicGuard = switchingIn.ability === "magic-guard";

  if (!hasMagicGuard) {
    // --- Stealth Rock ---
    // No grounding check -- Stealth Rock hits everything
    const stealthRock = side.hazards.find((h) => h.type === "stealth-rock");
    if (stealthRock && stealthRock.layers > 0) {
      const result = applyGen8StealthRock(switchingIn, typeChart);
      if (result) {
        totalDamage += result.damage;
        messages.push(result.message);
      }
    }

    // --- Spikes ---
    const spikes = side.hazards.find((h) => h.type === "spikes");
    if (spikes && spikes.layers > 0) {
      const result = applyGen8SpikesHazard(switchingIn, spikes.layers, gravityActive);
      if (result) {
        totalDamage += result.damage;
        messages.push(result.message);
      }
    }

    // --- Toxic Spikes ---
    const toxicSpikes = side.hazards.find((h) => h.type === "toxic-spikes");
    if (toxicSpikes && toxicSpikes.layers > 0) {
      const result = applyGen8ToxicSpikes(switchingIn, toxicSpikes.layers, gravityActive);
      if (result.absorbed) {
        hazardsToRemove.push("toxic-spikes");
      }
      // Misty Terrain blocks all status for grounded Pokemon
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus blocks all status
      const terrainBlocksStatus =
        state.terrain?.type === "misty" && isGen8Grounded(switchingIn, gravityActive);
      if (result.status && !terrainBlocksStatus) {
        statusInflicted = result.status;
      }
      // Only suppress the poison message when terrain blocks the status.
      // Absorption messages (Poison-type absorbing spikes) should still be emitted.
      if (result.message && !(result.status && terrainBlocksStatus)) {
        messages.push(result.message);
      }
    }

    // --- G-Max Steelsurge ---
    // No grounding check -- G-Max Steelsurge hits everything (same as Stealth Rock)
    // Source: Showdown data/moves.ts line 7475 -- gmaxsteelsurge condition
    const steelsurge = side.hazards.find((h) => h.type === "gmax-steelsurge");
    if (steelsurge && steelsurge.layers > 0) {
      const result = applyGen8GMaxSteelsurge(switchingIn, typeChart);
      if (result) {
        totalDamage += result.damage;
        messages.push(result.message);
      }
    }
  }

  // --- Sticky Web ---
  // NOT gated by Magic Guard (Sticky Web is a stat drop, not damage)
  // NOT gated by Heavy-Duty Boots (already handled above)
  // Source: Showdown data/moves.ts -- stickyweb.condition.onSwitchIn
  const stickyWeb = side.hazards.find((h) => h.type === "sticky-web");
  if (stickyWeb && stickyWeb.layers > 0) {
    const result = applyGen8StickyWeb(switchingIn, gravityActive);
    if (result.applied && result.statChanges.length > 0) {
      statChanges.push(...result.statChanges);
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
