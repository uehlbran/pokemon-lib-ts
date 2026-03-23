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
// Carry-forward on-priority-check abilities
// ---------------------------------------------------------------------------

/**
 * Healing moves for Triage priority boost.
 * Source: Showdown data/abilities.ts -- triage: move.flags.heal
 */
const HEALING_MOVES: ReadonlySet<string> = new Set([
  "absorb",
  "drain-punch",
  "draining-kiss",
  "giga-drain",
  "horn-leech",
  "leech-life",
  "mega-drain",
  "oblivion-wing",
  "parabolic-charge",
  "heal-order",
  "heal-pulse",
  "milk-drink",
  "moonlight",
  "morning-sun",
  "recover",
  "rest",
  "roost",
  "slack-off",
  "soft-boiled",
  "synthesis",
  "wish",
  "floral-healing",
  "purify",
  "shore-up",
  "strength-sap",
]);

function isHealingMove(moveId: string, effectType: string | null): boolean {
  if (HEALING_MOVES.has(moveId)) return true;
  if (effectType === "drain") return true;
  return false;
}

/**
 * Handle carry-forward on-priority-check abilities for Gen 9.
 *
 * These abilities have identical behavior to Gen 8:
 *   - Prankster: +1 priority to status moves
 *   - Gale Wings: +1 priority to Flying-type moves at full HP (Gen 7+ nerf)
 *   - Triage: +3 priority to healing moves
 *
 * Source: Showdown data/abilities.ts -- Prankster, Gale Wings, Triage onModifyPriority
 */
function handleCarryForwardPriorityCheck(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  if (!ctx.move) return NO_ACTIVATION;

  const getName = () => ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case "prankster": {
      // +1 priority to status moves
      // Source: Showdown data/abilities.ts -- move.category === 'Status'
      if (ctx.move.category !== "status") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [],
        messages: [`${getName()}'s Prankster boosted the move's priority!`],
        priorityBoost: 1,
      };
    }

    case "gale-wings": {
      // +1 priority to Flying moves at full HP (Gen 7+ nerf)
      // Source: Showdown data/abilities.ts -- requires pokemon.hp === pokemon.maxhp
      if (ctx.move.type !== "flying") return NO_ACTIVATION;
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      if (ctx.pokemon.pokemon.currentHp < maxHp) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [],
        messages: [`${getName()}'s Gale Wings boosted the move's priority!`],
        priorityBoost: 1,
      };
    }

    case "triage": {
      // +3 priority to healing moves
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3
      if (!isHealingMove(ctx.move.id, ctx.move.effect?.type ?? null)) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [],
        messages: [`${getName()}'s Triage boosted the move's priority!`],
        priorityBoost: 3,
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

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

  // 3. Carry-forward abilities by trigger
  switch (trigger) {
    case "on-switch-in":
    case "on-switch-out":
    case "on-contact":
    case "on-status-inflicted":
    case "on-turn-end":
      return handleGen9SwitchAbility(trigger, context);

    // Carry-forward priority abilities (Prankster, Gale Wings, Triage)
    // Source: Showdown data/abilities.ts -- onModifyPriority handlers
    case "on-priority-check":
      return handleCarryForwardPriorityCheck(context);

    default:
      return NO_ACTIVATION;
  }
}
