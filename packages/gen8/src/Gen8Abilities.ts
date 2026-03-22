import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger } from "@pokemon-lib-ts/core";
import { handleGen8SwitchAbility, shouldMirrorArmorReflect } from "./Gen8AbilitiesSwitch.js";

/**
 * Gen 8 master ability dispatcher.
 *
 * Central router that delegates to the appropriate ability handler module
 * based on the trigger type and ability ID.
 *
 * Module responsibilities:
 *   - Gen8AbilitiesSwitch: switch-in/out, contact, passive, status, before-move, turn-end
 *   - Future: Gen8AbilitiesDamage (damage-calc modifiers)
 *   - Future: Gen8AbilitiesStat (stat-change triggers like Defiant, Competitive, etc.)
 *
 * Source: Showdown data/abilities.ts
 */

const NO_ACTIVATION: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Switch-in abilities
// ---------------------------------------------------------------------------

/**
 * Handle a switch-in ability trigger.
 *
 * Routes to Gen8AbilitiesSwitch for weather, Intimidate, Screen Cleaner,
 * Neutralizing Gas, Intrepid Sword, Dauntless Shield, etc.
 */
export function handleGen8SwitchInAbility(
  abilityId: string,
  trigger: AbilityTrigger,
  context: AbilityContext,
): AbilityResult {
  if (trigger !== "on-switch-in") return NO_ACTIVATION;
  return handleGen8SwitchAbility(trigger, context);
}

// ---------------------------------------------------------------------------
// Contact abilities
// ---------------------------------------------------------------------------

/**
 * Handle a contact-triggered ability.
 *
 * Routes to Gen8AbilitiesSwitch for Static, Flame Body, Rough Skin,
 * Wandering Spirit, Perish Body, Gulp Missile, Ice Face, etc.
 */
export function handleGen8ContactAbility(
  abilityId: string,
  trigger: AbilityTrigger,
  context: AbilityContext,
): AbilityResult {
  if (trigger !== "on-contact") return NO_ACTIVATION;
  return handleGen8SwitchAbility(trigger, context);
}

// ---------------------------------------------------------------------------
// Field/passive abilities
// ---------------------------------------------------------------------------

/**
 * Handle a field-wide or passive ability trigger.
 *
 * Routes to the appropriate handler based on trigger type:
 *   - on-switch-out: Regenerator, Natural Cure
 *   - on-status-inflicted: Synchronize
 *   - on-before-move: Libero, Protean
 *   - on-turn-end: Hunger Switch
 *   - on-stat-change: Mirror Armor
 */
export function handleGen8FieldAbility(
  abilityId: string,
  trigger: AbilityTrigger,
  context: AbilityContext,
): AbilityResult {
  // Mirror Armor: special handling for stat-change trigger
  if (trigger === "on-stat-change" && abilityId === "mirror-armor") {
    return handleMirrorArmorStatChange(context);
  }

  // Route everything else through the switch handler
  return handleGen8SwitchAbility(trigger, context);
}

// ---------------------------------------------------------------------------
// Mirror Armor stat-change handler
// ---------------------------------------------------------------------------

/**
 * Handle Mirror Armor reflecting stat drops.
 *
 * When a stat is lowered by an opponent, Mirror Armor reflects the drop
 * back to the source instead of applying it to the holder.
 *
 * Source: Showdown data/abilities.ts -- Mirror Armor onTryBoost
 * Source: Bulbapedia "Mirror Armor" -- "Bounces back stat-lowering effects"
 */
function handleMirrorArmorStatChange(ctx: AbilityContext): AbilityResult {
  if (!ctx.statChange) return NO_ACTIVATION;

  const { stat, stages, source } = ctx.statChange;
  if (!shouldMirrorArmorReflect("mirror-armor", stages, source)) {
    return NO_ACTIVATION;
  }

  // HP cannot be stage-changed; Mirror Armor only reflects non-HP stats
  if (stat === "hp") return NO_ACTIVATION;

  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  // Reflect the stat drop back to the opponent
  return {
    activated: true,
    effects: [{ effectType: "stat-change", target: "opponent", stat, stages }],
    messages: [`${name}'s Mirror Armor reflected the stat drop!`],
  };
}
