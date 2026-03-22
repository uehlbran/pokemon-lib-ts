/**
 * Gen 6 ability master dispatcher.
 *
 * Routes ability triggers to the appropriate sub-module:
 *   - Gen6AbilitiesDamage: damage-calc and damage-immunity abilities
 *   - Gen6AbilitiesStat: stat-modifying and priority abilities
 *   - Gen6AbilitiesSwitch: switch-in/out, contact, passive-immunity abilities (TODO: Wave 5B)
 *   - Gen6AbilitiesRemaining: remaining abilities (TODO: Wave 5B)
 *
 * Also re-exports all public functions from sub-modules for direct consumer access.
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 */

import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger, PokemonType } from "@pokemon-lib-ts/core";
import {
  handleGen6DamageCalcAbility,
  handleGen6DamageImmunityAbility,
} from "./Gen6AbilitiesDamage.js";
import { handleGen6StatAbility } from "./Gen6AbilitiesStat.js";

// ---------------------------------------------------------------------------
// Re-exports from sub-modules
// ---------------------------------------------------------------------------

export {
  getAteAbilityOverride,
  getFurCoatMultiplier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getToughClawsMultiplier,
  handleGen6DamageCalcAbility,
  handleGen6DamageImmunityAbility,
  hasSheerForceEligibleEffect,
  isParentalBondEligible,
  isSheerForceEligibleMove,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "./Gen6AbilitiesDamage.js";
export { handleGen6StatAbility, isPranksterEligible } from "./Gen6AbilitiesStat.js";

// ---------------------------------------------------------------------------
// Passive immunity: ability → immune move type mapping
// ---------------------------------------------------------------------------

/**
 * Maps ability IDs to the move type they grant immunity to.
 * Mirrors the private ABILITY_TYPE_IMMUNITIES map in Gen6DamageCalc for use
 * in the passive-immunity trigger.
 *
 * Source: Showdown data/abilities.ts -- Levitate/Volt Absorb/Water Absorb/Flash Fire etc.
 */
const PASSIVE_IMMUNITY_TYPES: Readonly<Record<string, PokemonType>> = {
  levitate: "ground",
  "volt-absorb": "electric",
  "water-absorb": "water",
  "flash-fire": "fire",
  "motor-drive": "electric",
  "dry-skin": "water",
  "storm-drain": "water",
  "lightning-rod": "electric",
  "sap-sipper": "grass",
};

// ---------------------------------------------------------------------------
// Inactive result sentinel
// ---------------------------------------------------------------------------

const NO_ACTIVATION: AbilityResult = {
  activated: false,
  effects: [],
  messages: [],
};

// ---------------------------------------------------------------------------
// Stub dispatchers for not-yet-implemented sub-modules (Wave 5B)
// ---------------------------------------------------------------------------

// TODO (Wave 5B): Gen6AbilitiesSwitch -- Intimidate, Drizzle, Regenerator, etc.
function handleGen6SwitchAbility(_trigger: AbilityTrigger, _ctx: AbilityContext): AbilityResult {
  return NO_ACTIVATION;
}

// TODO (Wave 5B): Gen6AbilitiesRemaining -- Frisk, Friend Guard, Serene Grace, etc.
function handleGen6RemainingAbility(_ctx: AbilityContext): AbilityResult {
  return NO_ACTIVATION;
}

// ---------------------------------------------------------------------------
// Master dispatcher
// ---------------------------------------------------------------------------

/**
 * Master dispatch function for Gen 6 ability triggers.
 *
 * Routes to the appropriate sub-module based on the trigger type and ability ID.
 * Each sub-module handles a category of abilities:
 *
 *   - **Damage** (Gen6AbilitiesDamage): on-damage-calc (attackers like Sheer Force,
 *     Technician, Tough Claws, Strong Jaw, Mega Launcher, Pixilate, Aerilate,
 *     Refrigerate, Parental Bond; defenders like Multiscale, Solid Rock, Fur Coat)
 *     and on-damage-taken immunity (Sturdy OHKO block)
 *   - **Stat** (Gen6AbilitiesStat): on-priority-check (Prankster, Gale Wings),
 *     on-before-move (Protean), on-after-move-used (Moxie), on-stat-change
 *     (Defiant, Competitive, Contrary, Simple), on-damage-taken (Justified,
 *     Weak Armor), on-turn-end (Speed Boost, Moody), on-flinch (Steadfast),
 *     on-item-use (Unnerve)
 *   - **Switch** (Gen6AbilitiesSwitch): TODO Wave 5B
 *   - **Remaining** (Gen6AbilitiesRemaining): TODO Wave 5B
 *
 * For triggers handled by multiple sub-modules, we try each in order and return
 * the first activation.
 *
 * @param trigger - The ability lifecycle trigger
 * @param ctx - Full ability context (pokemon, opponent, state, rng, move, etc.)
 * @returns AbilityResult indicating whether the ability activated and its effects
 */
export function applyGen6Ability(trigger: AbilityTrigger, ctx: AbilityContext): AbilityResult {
  switch (trigger) {
    // --- Triggers routed to a single sub-module ---

    case "on-priority-check":
    case "on-after-move-used":
    case "on-flinch":
    case "on-item-use":
    case "on-before-move":
      return handleGen6StatAbility(ctx);

    case "on-switch-out":
    case "on-contact":
    case "on-status-inflicted":
    case "on-accuracy-check":
      return handleGen6SwitchAbility(trigger, ctx);

    // --- Triggers shared across multiple sub-modules ---

    case "on-switch-in": {
      // Switch abilities take priority; fall through to Remaining (Frisk)
      const switchResult = handleGen6SwitchAbility(trigger, ctx);
      if (switchResult.activated) return switchResult;
      return handleGen6RemainingAbility(ctx);
    }

    case "on-damage-calc": {
      // Damage-calc abilities (attacker/defender modifiers) first,
      // then Remaining (Friend Guard, Serene Grace)
      const damageResult = handleGen6DamageCalcAbility(ctx);
      if (damageResult.activated) return damageResult;
      return handleGen6RemainingAbility(ctx);
    }

    case "on-damage-taken": {
      // Damage immunity (Sturdy OHKO block) first,
      // then Switch (Cursed Body, Rattled, Illusion reveal),
      // then Stat (Justified, Weak Armor)
      const immunityResult = handleGen6DamageImmunityAbility(ctx);
      if (immunityResult.activated) return immunityResult;
      const switchResult = handleGen6SwitchAbility(trigger, ctx);
      if (switchResult.activated) return switchResult;
      return handleGen6StatAbility(ctx);
    }

    case "on-stat-change": {
      // Stat abilities (Defiant, Competitive, Contrary, Simple) first,
      // then Switch (Big Pecks)
      const statResult = handleGen6StatAbility(ctx);
      if (statResult.activated) return statResult;
      return handleGen6SwitchAbility(trigger, ctx);
    }

    case "on-turn-end": {
      // Stat turn-end (Speed Boost, Moody) first,
      // then Remaining (Zen Mode, Harvest, Healer)
      const statResult = handleGen6StatAbility(ctx);
      if (statResult.activated) return statResult;
      return handleGen6RemainingAbility(ctx);
    }

    case "passive-immunity": {
      // Minimal handler for type-immunity abilities already recognized by Gen6DamageCalc.
      // When calculateGen6Damage returns {damage:0, effectiveness:0} for an ability immunity,
      // the engine checks applyAbility('passive-immunity', ...) to confirm the move is absorbed.
      // This must return activated:true for the engine to skip downstream move effects.
      //
      // Source: Showdown data/abilities.ts -- Levitate, Volt Absorb, Water Absorb, etc.
      const immuneType = PASSIVE_IMMUNITY_TYPES[ctx.pokemon.ability];
      let levitateActive = true;
      if (ctx.pokemon.ability === "levitate") {
        // Levitate is negated by Gravity or Iron Ball
        const gravityActive = ctx.state.gravity?.active ?? false;
        const ironBallGrounded = ctx.pokemon.pokemon.heldItem === "iron-ball";
        if (gravityActive || ironBallGrounded) {
          levitateActive = false;
        }
      }
      if (immuneType && ctx.move?.type === immuneType && levitateActive) {
        const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
        return {
          activated: true,
          effects: [{ effectType: "none", target: "self" }],
          messages: [`${name}'s ${ctx.pokemon.ability} made ${ctx.move.displayName} miss!`],
        };
      }

      // Wave 5B: Switch passive-immunity (Levitate as switch-in announce, Flash Fire boost, etc.),
      // then Remaining (Telepathy, Oblivious, Keen Eye)
      const switchResult = handleGen6SwitchAbility(trigger, ctx);
      if (switchResult.activated) return switchResult;
      const remainingResult = handleGen6RemainingAbility(ctx);
      if (remainingResult.activated) return remainingResult;
      return handleGen6StatAbility(ctx);
    }

    default:
      return NO_ACTIVATION;
  }
}
