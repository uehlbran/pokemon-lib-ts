import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import {
  CORE_MOVE_CATEGORIES,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type MoveData,
} from "@pokemon-lib-ts/core";
import { GEN9_ABILITY_IDS } from "./data/reference-ids.js";
import {
  getSupremeOverlordModifier,
  SUPREME_OVERLORD_TABLE as SUPREME_OVERLORD_MODIFIER_TABLE,
} from "./Gen9AbilitiesDamage.js";

/**
 * Gen 9 new signature abilities.
 *
 * Covers abilities introduced in Gen 9:
 *   - Toxic Chain: 30% chance to badly poison target after dealing damage
 *   - Good as Gold: immune to all Status-category moves from opponents
 *   - Embody Aspect (4 variants): +1 stat on entry when Terastallized (once per battle)
 *   - Mycelium Might: status moves bypass opponent abilities but move last in priority bracket
 *   - Supreme Overlord: power boost based on fainted allies
 *
 * Source: Showdown data/abilities.ts
 * Source: specs/battle/10-gen9.md -- New Abilities section
 */

// ---------------------------------------------------------------------------
// Inactive sentinel
// ---------------------------------------------------------------------------

const INACTIVE: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Toxic Chain
// ---------------------------------------------------------------------------

/**
 * Toxic Chain: 30% chance to badly poison the target after dealing damage.
 *
 * Does NOT activate if:
 *   - The move is a status move (only triggers on damage-dealing moves)
 *   - The target already has a primary status condition
 *   - The target is Poison-type or Steel-type (immune to poison)
 *
 * Source: Showdown data/abilities.ts:5001-5014
 *   "this.randomChance(3, 10)" -- 30% chance
 *   "target.trySetStatus('tox', source)"
 */
export function handleToxicChain(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-after-move-used") return INACTIVE;
  if (!ctx.move) return INACTIVE;
  if (!ctx.opponent) return INACTIVE;

  // Only on damage-dealing moves
  if (ctx.move.category === CORE_MOVE_CATEGORIES.status) return INACTIVE;

  // 30% chance
  if (!ctx.rng.chance(3 / 10)) return INACTIVE;

  // Target already has a status
  if (ctx.opponent.pokemon.status) return INACTIVE;

  // Poison/Steel type immunity
  if (
    ctx.opponent.types.includes(CORE_TYPE_IDS.poison) ||
    ctx.opponent.types.includes(CORE_TYPE_IDS.steel)
  ) {
    return INACTIVE;
  }

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
        target: BATTLE_EFFECT_TARGETS.opponent,
        status: CORE_STATUS_IDS.badlyPoisoned,
      },
    ],
    messages: [`${name}'s Toxic Chain badly poisoned the target!`],
  };
}

/**
 * Check if Toxic Chain would apply to a given context (without RNG).
 * Useful for testing the conditions without needing to mock RNG.
 *
 * Source: Showdown data/abilities.ts:5001-5014
 */
export function canToxicChainApply(
  move: MoveData,
  defenderStatus: string | null,
  defenderTypes: readonly string[],
): boolean {
  if (move.category === CORE_MOVE_CATEGORIES.status) return false;
  if (defenderStatus) return false;
  if (defenderTypes.includes(CORE_TYPE_IDS.poison) || defenderTypes.includes(CORE_TYPE_IDS.steel)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Good as Gold
// ---------------------------------------------------------------------------

/**
 * Good as Gold: immune to ALL Status-category moves from opponents.
 *
 * This includes Toxic, Will-O-Wisp, Thunder Wave, Spore, Sleep Powder,
 * Taunt, Encore, Stealth Rock, Spikes, etc. -- any move with category "Status".
 *
 * Self-targeting status moves (from the same side) are NOT blocked.
 *
 * Source: Showdown data/abilities.ts:1573-1584
 *   "if (move.category === 'Status' && target !== source) return null"
 */
export function handleGoodAsGold(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-before-move") return INACTIVE;
  if (!ctx.move) return INACTIVE;

  // Only blocks Status-category moves
  if (ctx.move.category !== CORE_MOVE_CATEGORIES.status) return INACTIVE;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [],
    messages: [`${name}'s Good as Gold made the move fail!`],
    movePrevented: true,
  };
}

/**
 * Check if a move is blocked by Good as Gold.
 *
 * Source: Showdown data/abilities.ts:1573-1584
 */
export function isBlockedByGoodAsGold(abilityId: string, moveCategory: string): boolean {
  if (abilityId !== GEN9_ABILITY_IDS.goodAsGold) return false;
  return moveCategory === CORE_MOVE_CATEGORIES.status;
}

// ---------------------------------------------------------------------------
// Embody Aspect (Ogerpon)
// ---------------------------------------------------------------------------

/**
 * Maps Embody Aspect ability IDs to the stat they boost.
 *
 * Source: Showdown data/abilities.ts:1162-1212
 *   embodyaspectteal: spe +1
 *   embodyaspecthearthflame: atk +1
 *   embodyaspectwellspring: spd +1
 *   embodyaspectcornerstone: def +1
 */
export const EMBODY_ASPECT_BOOSTS: Readonly<
  Record<string, "attack" | "defense" | "spAttack" | "spDefense" | "speed">
> = {
  [GEN9_ABILITY_IDS.embodyAspectTeal]: "speed",
  [GEN9_ABILITY_IDS.embodyAspectHearthflame]: "attack",
  [GEN9_ABILITY_IDS.embodyAspectWellspring]: "spDefense",
  [GEN9_ABILITY_IDS.embodyAspectCornerstone]: "defense",
};

/**
 * Human-readable stat display names for Embody Aspect messages.
 */
const STAT_NAMES: Record<string, string> = {
  attack: "Attack",
  defense: "Defense",
  spAttack: "Sp. Atk",
  spDefense: "Sp. Def",
  speed: "Speed",
};

/**
 * Handle Embody Aspect activation on switch-in.
 *
 * Activation conditions:
 *   1. Pokemon must be Terastallized
 *   2. Ability hasn't been used yet this battle (tracked via `CORE_VOLATILE_IDS.embodyAspectUsed`)
 *
 * Source: Showdown data/abilities.ts:1162-1212
 *   "if (!pokemon.terastallized) return" -- must be Tera'd
 *   "if (pokemon.set.shiny) { ... }" -- once per battle check
 */
export function handleEmbodyAspect(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-switch-in") return INACTIVE;

  // Must be Terastallized
  if (!ctx.pokemon.isTerastallized) return INACTIVE;

  // Once per battle
  if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.embodyAspectUsed)) return INACTIVE;

  const boostStat = EMBODY_ASPECT_BOOSTS[ctx.pokemon.ability];
  if (!boostStat) return INACTIVE;

  const name = getName(ctx);
  const statName = STAT_NAMES[boostStat] ?? boostStat;

  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
        target: BATTLE_EFFECT_TARGETS.self,
        volatile: CORE_VOLATILE_IDS.embodyAspectUsed,
      },
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.self,
        stat: boostStat,
        stages: 1,
      },
    ],
    messages: [`${name}'s Embody Aspect boosted its ${statName}!`],
  };
}

/**
 * Check if an ability ID is an Embody Aspect variant.
 */
export function isEmbodyAspect(abilityId: string): boolean {
  return abilityId in EMBODY_ASPECT_BOOSTS;
}

// ---------------------------------------------------------------------------
// Mycelium Might
// ---------------------------------------------------------------------------

/**
 * Mycelium Might: status moves have -0.1 priority but bypass opponent abilities.
 *
 * The -0.1 priority reduction is handled in turn order resolution.
 * The ability bypass is checked during move execution.
 *
 * Source: Showdown data/abilities.ts:2722-2738
 *   onFractionalPriority: -0.1 for status moves
 *   onModifyMove: sets "ignoreAbility" for status moves
 */
export function handleMyceliumMight(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-priority-check") return INACTIVE;
  if (!ctx.move) return INACTIVE;
  if (ctx.move.category !== CORE_MOVE_CATEGORIES.status) return INACTIVE;

  // Signal that this move has -0.1 fractional priority
  const name = getName(ctx);
  return {
    activated: true,
    effects: [],
    messages: [`${name}'s Mycelium Might activates!`],
  };
}

/**
 * Check if Mycelium Might reduces priority for a given move.
 *
 * Source: Showdown data/abilities.ts:2722-2728
 *   "if (move.category === 'Status') return -0.1"
 */
export function hasMyceliumMightPriorityReduction(
  abilityId: string,
  moveCategory: string,
): boolean {
  if (abilityId !== GEN9_ABILITY_IDS.myceliumMight) return false;
  return moveCategory === CORE_MOVE_CATEGORIES.status;
}

/**
 * Check if Mycelium Might causes ability bypass for a given move.
 *
 * Source: Showdown data/abilities.ts:2730-2738
 *   "if (move.category === 'Status') move.ignoreAbility = true"
 */
export function isMyceliumMightBypassingAbility(abilityId: string, moveCategory: string): boolean {
  if (abilityId !== GEN9_ABILITY_IDS.myceliumMight) return false;
  return moveCategory === CORE_MOVE_CATEGORIES.status;
}

// ---------------------------------------------------------------------------
// Supreme Overlord
// ---------------------------------------------------------------------------

/**
 * Supreme Overlord power boost lookup table.
 * The multiplier scales with the number of fainted allies (capped at 5).
 *
 * Source: Showdown data/abilities.ts:4634-4658
 *   "const dominated = [4096, 4506, 4915, 5325, 5734, 6144]"
 */
export const SUPREME_OVERLORD_TABLE = SUPREME_OVERLORD_MODIFIER_TABLE.map(
  (modifier) => modifier / 4096,
) as readonly number[];

/**
 * Get the power multiplier for Supreme Overlord.
 *
 * @param faintedAllies Number of fainted allies (capped at 5)
 * @returns The power multiplier
 *
 * Source: Showdown data/abilities.ts:4634-4658
 */
export function getSupremeOverlordFloatMultiplier(faintedAllies: number): number {
  return getSupremeOverlordModifier(GEN9_ABILITY_IDS.supremeOverlord, faintedAllies) / 4096;
}

/**
 * @deprecated Use getSupremeOverlordFloatMultiplier() for the floating-point helper.
 */
export const getSupremeOverlordMultiplier = getSupremeOverlordFloatMultiplier;

// ---------------------------------------------------------------------------
// Gen 9 nerfed abilities: Intrepid Sword, Dauntless Shield, Protean/Libero
// ---------------------------------------------------------------------------

/**
 * Handle Intrepid Sword in Gen 9 (once per battle, not every switch-in).
 *
 * Source: Showdown data/abilities.ts -- intrepidsword: once per battle in Gen 9
 * Source: specs/battle/10-gen9.md -- "Intrepid Sword: once per battle (nerfed from Gen 8)"
 */
export function handleGen9IntrepidSwordTrigger(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-switch-in") return INACTIVE;

  // Once per battle. Persist on PokemonInstance so the restriction survives switch-out.
  if (ctx.pokemon.pokemon.swordBoost) return INACTIVE;
  ctx.pokemon.pokemon.swordBoost = true;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
        target: BATTLE_EFFECT_TARGETS.self,
        volatile: CORE_VOLATILE_IDS.intrepidSwordUsed,
      },
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.self,
        stat: "attack",
        stages: 1,
      },
    ],
    messages: [`${name}'s Intrepid Sword raised its Attack!`],
  };
}

/**
 * @deprecated Use handleGen9IntrepidSwordTrigger for the explicit AbilityResult handler.
 */
export const handleGen9IntrepidSword = handleGen9IntrepidSwordTrigger;

/**
 * @deprecated Use handleGen9IntrepidSwordTrigger for the explicit AbilityResult handler.
 */
export const handleIntrepidSwordGen9 = handleGen9IntrepidSwordTrigger;

/**
 * Handle Dauntless Shield in Gen 9 (once per battle, not every switch-in).
 *
 * Source: Showdown data/abilities.ts -- dauntlessshield: once per battle in Gen 9
 * Source: specs/battle/10-gen9.md -- "Dauntless Shield: once per battle (nerfed from Gen 8)"
 */
export function handleGen9DauntlessShieldTrigger(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-switch-in") return INACTIVE;

  // Once per battle. Persist on PokemonInstance so the restriction survives switch-out.
  if (ctx.pokemon.pokemon.shieldBoost) return INACTIVE;
  ctx.pokemon.pokemon.shieldBoost = true;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
        target: BATTLE_EFFECT_TARGETS.self,
        volatile: CORE_VOLATILE_IDS.dauntlessShieldUsed,
      },
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.self,
        stat: "defense",
        stages: 1,
      },
    ],
    messages: [`${name}'s Dauntless Shield raised its Defense!`],
  };
}

/**
 * @deprecated Use handleGen9DauntlessShieldTrigger for the explicit AbilityResult handler.
 */
export const handleGen9DauntlessShield = handleGen9DauntlessShieldTrigger;

/**
 * @deprecated Use handleGen9DauntlessShieldTrigger for the explicit AbilityResult handler.
 */
export const handleDauntlessShieldGen9 = handleGen9DauntlessShieldTrigger;

/**
 * Handle Protean/Libero in Gen 9 (once per switch-in, not every move).
 *
 * Source: Showdown data/abilities.ts -- protean/libero: once per switchin in Gen 9
 * Source: specs/battle/10-gen9.md -- "Protean/Libero: once per switchin"
 */
export function handleGen9ProteanTrigger(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-before-move") return INACTIVE;
  if (!ctx.move) return INACTIVE;

  // Once per switch-in
  if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.proteanUsed)) return INACTIVE;

  const moveType = ctx.move.type;
  // Don't activate if already the move's type
  if (ctx.pokemon.types.length === 1 && ctx.pokemon.types[0] === moveType) return INACTIVE;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
        target: BATTLE_EFFECT_TARGETS.self,
        volatile: CORE_VOLATILE_IDS.proteanUsed,
      },
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
        target: BATTLE_EFFECT_TARGETS.self,
        types: [moveType],
      },
    ],
    messages: [
      `${name}'s ${ctx.pokemon.ability === GEN9_ABILITY_IDS.protean ? "Protean" : "Libero"} changed its type to ${moveType}!`,
    ],
  };
}

/**
 * @deprecated Use handleGen9ProteanTrigger for the explicit AbilityResult handler.
 */
export const handleGen9Protean = handleGen9ProteanTrigger;

/**
 * @deprecated Use handleGen9ProteanTrigger for the explicit AbilityResult handler.
 */
export const handleProteanGen9 = handleGen9ProteanTrigger;

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

/**
 * Main entry point for Gen 9 new ability handlers.
 */
export function handleGen9NewAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case GEN9_ABILITY_IDS.toxicChain:
      return handleToxicChain(ctx);
    case GEN9_ABILITY_IDS.goodAsGold:
      return handleGoodAsGold(ctx);
    case GEN9_ABILITY_IDS.embodyAspectTeal:
    case GEN9_ABILITY_IDS.embodyAspectHearthflame:
    case GEN9_ABILITY_IDS.embodyAspectWellspring:
    case GEN9_ABILITY_IDS.embodyAspectCornerstone:
      return handleEmbodyAspect(ctx);
    case GEN9_ABILITY_IDS.myceliumMight:
      return handleMyceliumMight(ctx);
    case GEN9_ABILITY_IDS.intrepidSword:
      return handleGen9IntrepidSwordTrigger(ctx);
    case GEN9_ABILITY_IDS.dauntlessShield:
      return handleGen9DauntlessShieldTrigger(ctx);
    case GEN9_ABILITY_IDS.protean:
    case GEN9_ABILITY_IDS.libero:
      return handleGen9ProteanTrigger(ctx);
    default:
      return INACTIVE;
  }
}
