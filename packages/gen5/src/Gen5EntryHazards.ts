/**
 * Gen 5 Entry Hazards
 *
 * Implements Spikes, Stealth Rock, and Toxic Spikes hazard application for
 * Pokemon switching into battle. Gen 5 hazards are mechanically identical to
 * Gen 4, with no changes to the formulas or type interactions.
 *
 * Key mechanics:
 *   - Spikes: layer-scaled HP damage (1/8, 1/6, 1/4), grounded-only
 *   - Stealth Rock: Rock-type effectiveness-scaled damage (no grounding check)
 *   - Toxic Spikes: poison/badly-poisoned on grounded switch-in; Poison-type absorbs
 *   - Magic Guard: immune to ALL hazard effects (damage AND status)
 *   - Air Balloon: grants levitation (immune to ground-based hazards)
 *   - Heavy-Duty Boots do NOT exist in Gen 5 (introduced Gen 8)
 *
 * Source: Showdown data/moves.ts -- spikes, stealthrock, toxicspikes conditions
 * Source: Showdown data/mods/gen5/ -- no overrides to hazard behavior (inherits base)
 */

import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  EntryHazardResult,
} from "@pokemon-lib-ts/battle";
import type {
  EntryHazardType,
  PrimaryStatus,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";

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

// ---------------------------------------------------------------------------
// Grounding Check
// ---------------------------------------------------------------------------

/**
 * Determines whether a Pokemon is grounded (affected by Spikes and Toxic Spikes).
 *
 * A Pokemon is grounded unless it is:
 *   - Flying-type
 *   - Has Levitate ability
 *   - Has Magnet Rise volatile
 *   - Holds Air Balloon (Gen 5 item)
 *
 * Exception: Gravity overrides all of the above and grounds everything.
 * Exception: Iron Ball grounds the holder.
 * Exception: Smack Down (volatile "smackdown") grounds the target.
 *
 * Source: Showdown sim/pokemon.ts -- isGrounded()
 * Source: Bulbapedia -- individual ability/item/move pages
 */
export function isGen5Grounded(pokemon: ActivePokemon, gravityActive: boolean): boolean {
  // Gravity grounds everything
  // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
  if (gravityActive) return true;

  // Ingrain grounds the user even if Flying-type or Levitate
  // Source: Bulbapedia -- Ingrain: "The user is affected by hazards on the ground,
  //   even if it is a Flying-type or has the Levitate ability."
  // Source: Showdown sim/pokemon.ts -- isGrounded: checks 'ingrain' volatile before
  //   Flying/Levitate checks
  if (pokemon.volatileStatuses.has("ingrain")) return true;

  // Iron Ball grounds the holder
  // Source: Bulbapedia -- Iron Ball: "makes the holder grounded"
  if (pokemon.pokemon.heldItem === "iron-ball") return true;

  // Smack Down grounds the target
  // Source: Showdown data/moves.ts -- smackdown volatile grounds the target
  // Note: "smackdown" is not in the VolatileStatus union (Gen 5-specific volatile),
  // so we cast. The combat move handler uses the same cast pattern.
  if (pokemon.volatileStatuses.has("smackdown" as VolatileStatus)) return true;

  // Flying-type is not grounded
  if (pokemon.types.includes("flying")) return false;

  // Levitate grants levitation
  // Source: Bulbapedia -- Levitate: "gives full immunity to Ground-type moves"
  if (pokemon.ability === "levitate") return false;

  // Magnet Rise grants levitation
  // Source: Bulbapedia -- Magnet Rise: "makes the user immune to Ground-type moves"
  if (pokemon.volatileStatuses.has("magnet-rise")) return false;

  // Air Balloon grants levitation ONLY when item effects are not suppressed.
  // Klutz ability and Embargo volatile both suppress held-item effects.
  // Source: Showdown sim/pokemon.ts -- isGrounded: checks item suppression
  //   before treating Air Balloon as levitating
  // Source: Bulbapedia -- Air Balloon: "makes the holder immune to Ground-type moves"
  // Source: Bulbapedia -- Klutz: "The held item has no effect" (suppresses items)
  // Source: Bulbapedia -- Embargo: "The target cannot use its held item" (suppresses items)
  const itemsSuppressed = pokemon.ability === "klutz" || pokemon.volatileStatuses.has("embargo");
  if (pokemon.pokemon.heldItem === "air-balloon" && !itemsSuppressed) return false;

  return true;
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
export function applyGen5SpikesHazard(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): HazardDamageResult | null {
  // Not grounded -> immune
  if (!isGen5Grounded(switchingIn, gravityActive)) return null;

  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Source: Showdown data/moves.ts -- spikes: damageAmounts = [0, 3, 4, 6]
  // damage = damageAmounts[layers] * maxhp / 24
  const damageNumerators = [0, 3, 4, 6];
  const clampedLayers = Math.min(Math.max(layers, 1), 3);
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
export function applyGen5StealthRock(
  switchingIn: ActivePokemon,
  typeChart: TypeChart,
): HazardDamageResult | null {
  const maxHp = switchingIn.pokemon.calculatedStats?.hp ?? switchingIn.pokemon.currentHp;
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Calculate Rock-type effectiveness against switching Pokemon's types
  // Source: Showdown -- runEffectiveness multiplies per-type matchups
  let effectiveness = 1;
  const rockChart = (typeChart as Record<string, Record<string, number>>).rock;
  if (rockChart) {
    for (const type of switchingIn.types) {
      const mult = rockChart[type] ?? 1;
      effectiveness *= mult;
    }
  }

  // Source: Showdown -- damage = floor(maxhp * (2^typeMod) / 8)
  // Since effectiveness is already the product of multipliers (0.25, 0.5, 1, 2, 4),
  // this is equivalent to floor(maxhp * effectiveness / 8)
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
 *   - Not grounded: immune (Flying, Levitate, Air Balloon, Magnet Rise)
 *   - Already has a primary status: cannot gain another
 *
 * Source: Showdown data/moves.ts -- toxicspikes.condition.onSwitchIn
 *   if (pokemon.hasType('Poison')) -> removeSideCondition('toxicspikes')
 *   elif (pokemon.hasType('Steel')) -> do nothing
 *   elif (layers >= 2) -> trySetStatus('tox')
 *   else -> trySetStatus('psn')
 */
export function applyGen5ToxicSpikes(
  switchingIn: ActivePokemon,
  layers: number,
  gravityActive: boolean,
): ToxicSpikesResult {
  const pokemonName = switchingIn.pokemon.nickname ?? String(switchingIn.pokemon.speciesId);

  // Not grounded -> immune
  if (!isGen5Grounded(switchingIn, gravityActive)) {
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
  const clampedLayers = Math.min(Math.max(layers, 1), 2);
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

// ---------------------------------------------------------------------------
// Main Entry Hazard Application
// ---------------------------------------------------------------------------

/**
 * Apply all entry hazards to a Pokemon switching in.
 *
 * Processes hazards in order: Stealth Rock, Spikes, Toxic Spikes.
 * This matches the Gen 4 ordering used by pret/pokeplatinum and carried
 * forward into Gen 5.
 *
 * Magic Guard prevents ALL hazard effects (both damage and status).
 *
 * Source: Showdown data/moves.ts -- individual hazard condition.onSwitchIn handlers
 * Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
 */
export function applyGen5EntryHazards(
  switchingIn: ActivePokemon,
  side: BattleSide,
  state: BattleState,
  typeChart: TypeChart,
): EntryHazardResult {
  // Magic Guard: immune to all indirect damage, including entry hazards
  // Note: Toxic Spikes status infliction is ALSO prevented by Magic Guard
  // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
  // Source: Showdown -- Magic Guard prevents hazard damage and status
  if (switchingIn.ability === "magic-guard") {
    return {
      damage: 0,
      statusInflicted: null,
      statChanges: [],
      messages: [],
    };
  }

  let totalDamage = 0;
  let statusInflicted: PrimaryStatus | null = null;
  const messages: string[] = [];
  const hazardsToRemove: EntryHazardType[] = [];
  const gravityActive = state.gravity?.active ?? false;

  // --- Stealth Rock ---
  // No grounding check -- Stealth Rock hits everything
  const stealthRock = side.hazards.find((h) => h.type === "stealth-rock");
  if (stealthRock && stealthRock.layers > 0) {
    const result = applyGen5StealthRock(switchingIn, typeChart);
    if (result) {
      totalDamage += result.damage;
      messages.push(result.message);
    }
  }

  // --- Spikes ---
  const spikes = side.hazards.find((h) => h.type === "spikes");
  if (spikes && spikes.layers > 0) {
    const result = applyGen5SpikesHazard(switchingIn, spikes.layers, gravityActive);
    if (result) {
      totalDamage += result.damage;
      messages.push(result.message);
    }
  }

  // --- Toxic Spikes ---
  const toxicSpikes = side.hazards.find((h) => h.type === "toxic-spikes");
  if (toxicSpikes && toxicSpikes.layers > 0) {
    const result = applyGen5ToxicSpikes(switchingIn, toxicSpikes.layers, gravityActive);
    if (result.absorbed) {
      hazardsToRemove.push("toxic-spikes");
    }
    if (result.status) {
      statusInflicted = result.status;
    }
    if (result.message) {
      messages.push(result.message);
    }
  }

  return {
    damage: totalDamage,
    statusInflicted,
    statChanges: [],
    messages,
    hazardsToRemove: hazardsToRemove.length > 0 ? hazardsToRemove : undefined,
  };
}
