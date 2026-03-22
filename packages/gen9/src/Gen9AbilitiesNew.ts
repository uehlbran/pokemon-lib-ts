import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";

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
  if (ctx.move.category === "status") return INACTIVE;

  // 30% chance
  if (!ctx.rng.chance(3 / 10)) return INACTIVE;

  // Target already has a status
  if (ctx.opponent.pokemon.status) return INACTIVE;

  // Poison/Steel type immunity
  if (ctx.opponent.types.includes("poison") || ctx.opponent.types.includes("steel")) {
    return INACTIVE;
  }

  const name = getName(ctx);
  return {
    activated: true,
    effects: [{ effectType: "status-inflict", target: "opponent", status: "badly-poisoned" }],
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
  if (move.category === "status") return false;
  if (defenderStatus) return false;
  if (defenderTypes.includes("poison") || defenderTypes.includes("steel")) return false;
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
  if (ctx.move.category !== "status") return INACTIVE;

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
  if (abilityId !== "good-as-gold") return false;
  return moveCategory === "status";
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
  "embody-aspect-teal": "speed",
  "embody-aspect-hearthflame": "attack",
  "embody-aspect-wellspring": "spDefense",
  "embody-aspect-cornerstone": "defense",
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
 *   2. Ability hasn't been used yet this battle (tracked via "embody-aspect-used" volatile)
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
  if (ctx.pokemon.volatileStatuses.has("embody-aspect-used")) return INACTIVE;

  const boostStat = EMBODY_ASPECT_BOOSTS[ctx.pokemon.ability];
  if (!boostStat) return INACTIVE;

  const name = getName(ctx);
  const statName = STAT_NAMES[boostStat] ?? boostStat;

  return {
    activated: true,
    effects: [
      {
        effectType: "volatile-inflict",
        target: "self",
        volatile: "embody-aspect-used",
      },
      {
        effectType: "stat-change",
        target: "self",
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
  if (ctx.move.category !== "status") return INACTIVE;

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
  if (abilityId !== "mycelium-might") return false;
  return moveCategory === "status";
}

/**
 * Check if Mycelium Might causes ability bypass for a given move.
 *
 * Source: Showdown data/abilities.ts:2730-2738
 *   "if (move.category === 'Status') move.ignoreAbility = true"
 */
export function isMyceliumMightBypassingAbility(abilityId: string, moveCategory: string): boolean {
  if (abilityId !== "mycelium-might") return false;
  return moveCategory === "status";
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
export const SUPREME_OVERLORD_TABLE: readonly number[] = [
  4096 / 4096, // 0 fainted: 1.0x
  4506 / 4096, // 1 fainted: ~1.10x
  4915 / 4096, // 2 fainted: ~1.20x
  5325 / 4096, // 3 fainted: ~1.30x
  5734 / 4096, // 4 fainted: ~1.40x
  6144 / 4096, // 5+ fainted: 1.50x
];

/**
 * Get the power multiplier for Supreme Overlord.
 *
 * @param faintedAllies Number of fainted allies (capped at 5)
 * @returns The power multiplier
 *
 * Source: Showdown data/abilities.ts:4634-4658
 */
export function getSupremeOverlordMultiplier(faintedAllies: number): number {
  const capped = Math.min(5, Math.max(0, faintedAllies));
  return SUPREME_OVERLORD_TABLE[capped] ?? 1;
}

// ---------------------------------------------------------------------------
// Gen 9 nerfed abilities: Intrepid Sword, Dauntless Shield, Protean/Libero
// ---------------------------------------------------------------------------

/**
 * Handle Intrepid Sword in Gen 9 (once per battle, not every switch-in).
 *
 * Source: Showdown data/abilities.ts -- intrepidsword: once per battle in Gen 9
 * Source: specs/battle/10-gen9.md -- "Intrepid Sword: once per battle (nerfed from Gen 8)"
 */
export function handleIntrepidSwordGen9(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-switch-in") return INACTIVE;

  // Once per battle
  if (ctx.pokemon.volatileStatuses.has("intrepid-sword-used")) return INACTIVE;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      { effectType: "volatile-inflict", target: "self", volatile: "intrepid-sword-used" },
      { effectType: "stat-change", target: "self", stat: "attack", stages: 1 },
    ],
    messages: [`${name}'s Intrepid Sword raised its Attack!`],
  };
}

/**
 * Handle Dauntless Shield in Gen 9 (once per battle, not every switch-in).
 *
 * Source: Showdown data/abilities.ts -- dauntlessshield: once per battle in Gen 9
 * Source: specs/battle/10-gen9.md -- "Dauntless Shield: once per battle (nerfed from Gen 8)"
 */
export function handleDauntlessShieldGen9(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-switch-in") return INACTIVE;

  // Once per battle
  if (ctx.pokemon.volatileStatuses.has("dauntless-shield-used")) return INACTIVE;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      { effectType: "volatile-inflict", target: "self", volatile: "dauntless-shield-used" },
      { effectType: "stat-change", target: "self", stat: "defense", stages: 1 },
    ],
    messages: [`${name}'s Dauntless Shield raised its Defense!`],
  };
}

/**
 * Handle Protean/Libero in Gen 9 (once per switch-in, not every move).
 *
 * Source: Showdown data/abilities.ts -- protean/libero: once per switchin in Gen 9
 * Source: specs/battle/10-gen9.md -- "Protean/Libero: once per switchin"
 */
export function handleProteanGen9(ctx: AbilityContext): AbilityResult {
  if (ctx.trigger !== "on-before-move") return INACTIVE;
  if (!ctx.move) return INACTIVE;

  // Once per switch-in
  if (ctx.pokemon.volatileStatuses.has("protean-used")) return INACTIVE;

  const moveType = ctx.move.type;
  // Don't activate if already the move's type
  if (ctx.pokemon.types.length === 1 && ctx.pokemon.types[0] === moveType) return INACTIVE;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      { effectType: "volatile-inflict", target: "self", volatile: "protean-used" },
      { effectType: "type-change", target: "self", types: [moveType] },
    ],
    messages: [
      `${name}'s ${ctx.pokemon.ability === "protean" ? "Protean" : "Libero"} changed its type to ${moveType}!`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

/**
 * Main entry point for Gen 9 new ability handlers.
 */
export function handleGen9NewAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case "toxic-chain":
      return handleToxicChain(ctx);
    case "good-as-gold":
      return handleGoodAsGold(ctx);
    case "embody-aspect-teal":
    case "embody-aspect-hearthflame":
    case "embody-aspect-wellspring":
    case "embody-aspect-cornerstone":
      return handleEmbodyAspect(ctx);
    case "mycelium-might":
      return handleMyceliumMight(ctx);
    case "intrepid-sword":
      return handleIntrepidSwordGen9(ctx);
    case "dauntless-shield":
      return handleDauntlessShieldGen9(ctx);
    case "protean":
    case "libero":
      return handleProteanGen9(ctx);
    default:
      return INACTIVE;
  }
}
