/**
 * Gen 5 ability master dispatcher.
 *
 * Routes ability triggers to the appropriate sub-module:
 *   - Gen5AbilitiesDamage: damage-calc and damage-immunity abilities
 *   - Gen5AbilitiesStat: stat-modifying and priority abilities
 *   - Gen5AbilitiesSwitch: switch-in/out, contact, passive-immunity abilities
 *   - Gen5AbilitiesRemaining: remaining abilities (Zen Mode, Harvest, Frisk, etc.)
 *
 * Also re-exports all public functions from sub-modules for direct consumer access.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 * Source: references/pokemon-showdown/data/abilities.ts
 */

import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger } from "@pokemon-lib-ts/core";
import {
  handleGen5DamageCalcAbility,
  handleGen5DamageImmunityAbility,
} from "./Gen5AbilitiesDamage";
import { handleGen5RemainingAbility } from "./Gen5AbilitiesRemaining";
import { handleGen5StatAbility } from "./Gen5AbilitiesStat";
import { handleGen5SwitchAbility } from "./Gen5AbilitiesSwitch";

// ---------------------------------------------------------------------------
// Re-exports from sub-modules
// ---------------------------------------------------------------------------

export {
  getAnalyticMultiplier,
  getMultiscaleMultiplier,
  getSandForceMultiplier,
  getSheerForceMultiplier,
  getSturdyDamageCap,
  handleGen5DamageCalcAbility,
  handleGen5DamageImmunityAbility,
  hasSheerForceEligibleEffect,
  isSheerForceEligibleMove,
  isSheerForceWhitelistedMove,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "./Gen5AbilitiesDamage";
export {
  FRIEND_GUARD_DAMAGE_MULTIPLIER,
  getSereneGraceMultiplier,
  getWeightMultiplier,
  HARVEST_BASE_PROBABILITY,
  HARVEST_SUN_PROBABILITY,
  HEALER_PROBABILITY,
  HEAVY_METAL_WEIGHT_MULTIPLIER,
  handleGen5RemainingAbility,
  LIGHT_METAL_WEIGHT_MULTIPLIER,
  SERENE_GRACE_CHANCE_MULTIPLIER,
} from "./Gen5AbilitiesRemaining";
export { handleGen5StatAbility, isPranksterEligible } from "./Gen5AbilitiesStat";
export { handleGen5SwitchAbility } from "./Gen5AbilitiesSwitch";

// ---------------------------------------------------------------------------
// Inactive result sentinel
// ---------------------------------------------------------------------------

const NO_ACTIVATION: AbilityResult = {
  activated: false,
  effects: [],
  messages: [],
};

// ---------------------------------------------------------------------------
// Master dispatcher
// ---------------------------------------------------------------------------

/**
 * Master dispatch function for Gen 5 ability triggers.
 *
 * Routes to the appropriate sub-module based on the trigger type and ability ID.
 * Each sub-module handles a category of abilities:
 *
 *   - **Damage** (Gen5AbilitiesDamage): on-damage-calc (attackers like Sheer Force,
 *     Technician; defenders like Multiscale, Solid Rock) and on-damage-taken immunity
 *     (Sturdy OHKO block)
 *   - **Stat** (Gen5AbilitiesStat): on-priority-check (Prankster), on-after-move-used
 *     (Moxie), on-stat-change (Defiant, Contrary, Simple), on-damage-taken
 *     (Justified, Weak Armor), on-turn-end (Speed Boost, Moody), on-flinch (Steadfast),
 *     on-item-use (Unnerve)
 *   - **Switch** (Gen5AbilitiesSwitch): on-switch-in (Intimidate, Drizzle, etc.),
 *     on-switch-out (Regenerator, Natural Cure), on-contact (Static, Flame Body, etc.),
 *     on-status-inflicted (Synchronize), passive-immunity (Levitate, Flash Fire, etc.),
 *     on-accuracy-check (Victory Star), trapping (Shadow Tag, Arena Trap)
 *   - **Remaining** (Gen5AbilitiesRemaining): on-turn-end (Zen Mode, Harvest, Healer),
 *     on-switch-in (Frisk), passive-immunity (Telepathy, Oblivious, Keen Eye),
 *     on-damage-calc (Friend Guard, Serene Grace)
 *
 * For triggers handled by multiple sub-modules (e.g., on-damage-taken is in both
 * Damage and Stat), we try each in order and return the first activation.
 *
 * @param trigger - The ability lifecycle trigger
 * @param ctx - Full ability context (pokemon, opponent, state, rng, move, etc.)
 * @returns AbilityResult indicating whether the ability activated and its effects
 */
export function applyGen5Ability(trigger: AbilityTrigger, ctx: AbilityContext): AbilityResult {
  switch (trigger) {
    // --- Triggers routed to a single sub-module ---

    case "on-priority-check":
    case "on-after-move-used":
    case "on-flinch":
    case "on-item-use":
      return handleGen5StatAbility(ctx);

    case "on-switch-out":
    case "on-contact":
    case "on-status-inflicted":
    case "on-accuracy-check":
      return handleGen5SwitchAbility(trigger, ctx);

    // --- Triggers shared across multiple sub-modules ---

    case "on-switch-in": {
      // Switch abilities take priority; fall through to Remaining (Frisk)
      const switchResult = handleGen5SwitchAbility(trigger, ctx);
      if (switchResult.activated) return switchResult;
      return handleGen5RemainingAbility(ctx);
    }

    case "on-damage-calc": {
      // Damage-calc abilities (attacker/defender modifiers) first,
      // then Remaining (Friend Guard, Serene Grace)
      const damageResult = handleGen5DamageCalcAbility(ctx);
      if (damageResult.activated) return damageResult;
      return handleGen5RemainingAbility(ctx);
    }

    case "on-damage-taken": {
      // Damage immunity (Sturdy OHKO block) first,
      // then Switch (Cursed Body, Rattled, Illusion reveal),
      // then Stat (Justified, Weak Armor)
      const immunityResult = handleGen5DamageImmunityAbility(ctx);
      if (immunityResult.activated) return immunityResult;
      const switchResult = handleGen5SwitchAbility(trigger, ctx);
      if (switchResult.activated) return switchResult;
      return handleGen5StatAbility(ctx);
    }

    case "on-stat-change": {
      // Stat abilities (Defiant, Contrary, Simple) first,
      // then Switch (Big Pecks)
      const statResult = handleGen5StatAbility(ctx);
      if (statResult.activated) return statResult;
      return handleGen5SwitchAbility(trigger, ctx);
    }

    case "on-turn-end": {
      // Stat turn-end (Speed Boost, Moody) first,
      // then Remaining (Zen Mode, Harvest, Healer)
      const statResult = handleGen5StatAbility(ctx);
      if (statResult.activated) return statResult;
      return handleGen5RemainingAbility(ctx);
    }

    case "passive-immunity": {
      // Switch passive-immunity (Levitate, Flash Fire, etc.) first,
      // then Remaining (Telepathy, Oblivious, Keen Eye),
      // then Stat (fallback)
      const switchResult = handleGen5SwitchAbility(trigger, ctx);
      if (switchResult.activated) return switchResult;
      const remainingResult = handleGen5RemainingAbility(ctx);
      if (remainingResult.activated) return remainingResult;
      return handleGen5StatAbility(ctx);
    }

    default:
      return NO_ACTIVATION;
  }
}
