import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger } from "@pokemon-lib-ts/core";
import { handleGen9NewAbility, isEmbodyAspect } from "./Gen9AbilitiesNew.js";
import { handleGen9StatAbility } from "./Gen9AbilitiesStat.js";
import { handleGen9SwitchAbility } from "./Gen9AbilitiesSwitch.js";

/**
 * Gen 9 master ability dispatcher.
 *
 * Central router that delegates to the appropriate ability handler module
 * based on the trigger type and ability ID.
 *
 * Module responsibilities:
 *   - Gen9AbilitiesSwitch: switch-in/out, contact, passive, status, turn-end
 *   - Gen9AbilitiesStat: Protosynthesis, Quark Drive (weather/terrain-triggered stat boosts)
 *   - Gen9AbilitiesNew: Toxic Chain, Good as Gold, Embody Aspect, Mycelium Might,
 *                       Supreme Overlord, Intrepid Sword/Dauntless Shield (Gen 9 nerfs),
 *                       Protean/Libero (Gen 9 nerfs)
 *
 * Source: Showdown data/abilities.ts
 */

const NO_ACTIVATION: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Abilities handled by Gen9AbilitiesNew (precedence check)
// ---------------------------------------------------------------------------

/**
 * Set of ability IDs handled by Gen9AbilitiesNew.
 * These are checked first to ensure Gen 9 nerfs take precedence over carry-forward behavior.
 */
const GEN9_NEW_ABILITIES = new Set([
  "toxic-chain",
  "good-as-gold",
  "embody-aspect-teal",
  "embody-aspect-hearthflame",
  "embody-aspect-wellspring",
  "embody-aspect-cornerstone",
  "mycelium-might",
  "intrepid-sword",
  "dauntless-shield",
  "protean",
  "libero",
]);

/**
 * Set of ability IDs handled by Gen9AbilitiesStat.
 */
const GEN9_STAT_ABILITIES = new Set(["protosynthesis", "quark-drive"]);

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

/**
 * Handle a Gen 9 ability trigger.
 *
 * Routing priority:
 *   1. Gen 9 stat abilities (Protosynthesis, Quark Drive) -- on-switch-in, on-weather-change, on-terrain-change
 *   2. Gen 9 new/nerfed abilities -- various triggers
 *   3. Gen 9 switch abilities (carry-forward) -- on-switch-in, on-switch-out, on-contact, etc.
 */
export function handleGen9Ability(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
  const abilityId = context.pokemon.ability;

  // 1. Stat abilities (Protosynthesis, Quark Drive)
  if (GEN9_STAT_ABILITIES.has(abilityId)) {
    const result = handleGen9StatAbility(context);
    if (result.activated) return result;
  }

  // 2. New/nerfed Gen 9 abilities
  if (GEN9_NEW_ABILITIES.has(abilityId) || isEmbodyAspect(abilityId)) {
    const result = handleGen9NewAbility(context);
    if (result.activated) return result;
  }

  // 3. Carry-forward switch/contact/passive abilities
  switch (trigger) {
    case "on-switch-in":
    case "on-switch-out":
    case "on-contact":
    case "on-status-inflicted":
    case "on-turn-end":
      return handleGen9SwitchAbility(trigger, context);

    default:
      return NO_ACTIVATION;
  }
}
