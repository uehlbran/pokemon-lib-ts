/**
 * Gen 5 field effect and priority move handlers.
 *
 * Implements:
 *   - Magic Room: suppresses held items for 5 turns (priority -7)
 *   - Wonder Room: swaps Def/SpDef for all Pokemon for 5 turns (priority -7)
 *   - Trick Room: reverses speed order for 5 turns (priority -7, Gen 4 carry-over)
 *   - Quick Guard: blocks priority > 0 moves targeting the side (+3 priority)
 *   - Wide Guard: blocks spread moves targeting the side (+3 priority)
 *   - Tailwind: doubles speed for 4 turns (Gen 5 changed from Gen 4's 3 turns)
 *   - Priority overrides: ExtremeSpeed +1 -> +2, Follow Me +2 -> +3, Rage Powder +2 -> +3
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts (base definitions)
 */

import {
  BATTLE_EFFECT_TARGETS,
  type MoveEffectContext,
  type MoveEffectResult,
} from "@pokemon-lib-ts/battle";
import type { SeededRandom } from "@pokemon-lib-ts/core";
import { CORE_VOLATILE_IDS } from "@pokemon-lib-ts/core";

// ---------------------------------------------------------------------------
// Default empty result
// ---------------------------------------------------------------------------

function createBaseResult(): MoveEffectResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Field Effect Handlers
// ---------------------------------------------------------------------------

/**
 * Handle Magic Room move effect.
 *
 * Toggles Magic Room: if already active, deactivate it. Otherwise, set it for 5 turns.
 * When Magic Room is active, all held items are suppressed (their effects are ignored).
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 11153-11197 -- magicroom
 *   duration: 5, onFieldRestart: removes the pseudo-weather (toggle off)
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 561-563 -- priority: -7
 */
function handleMagicRoom(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  if (ctx.state.magicRoom.active) {
    // Toggle off: using Magic Room again ends it early
    // Source: Showdown onFieldRestart: this.field.removePseudoWeather('magicroom')
    return {
      ...base,
      magicRoomSet: { turnsLeft: 0 },
      messages: ["The area returned to normal!"],
    };
  }
  // Activate for 5 turns
  // Source: Showdown magicroom condition -- duration: 5
  return {
    ...base,
    magicRoomSet: { turnsLeft: 5 },
    messages: ["It created a bizarre area in which Pokemon's held items lose their effects!"],
  };
}

/**
 * Handle Wonder Room move effect.
 *
 * Toggles Wonder Room: if already active, deactivate it. Otherwise, set it for 5 turns.
 * When Wonder Room is active, all Pokemon have their Defense and Sp. Def stats swapped.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 21753-21800 -- wonderroom
 *   duration: 5, onFieldRestart: removes the pseudo-weather (toggle off)
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 1043-1045 -- priority: -7
 */
function handleWonderRoom(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  if (ctx.state.wonderRoom.active) {
    // Toggle off
    // Source: Showdown onFieldRestart: this.field.removePseudoWeather('wonderroom')
    return {
      ...base,
      wonderRoomSet: { turnsLeft: 0 },
      messages: ["Wonder Room wore off, and Defense and Sp. Def stats returned to normal!"],
    };
  }
  // Activate for 5 turns
  // Source: Showdown wonderroom condition -- duration: 5
  return {
    ...base,
    wonderRoomSet: { turnsLeft: 5 },
    messages: ["It created a bizarre area in which Defense and Sp. Def stats are swapped!"],
  };
}

/**
 * Handle Trick Room move effect.
 *
 * Toggles Trick Room: if already active, deactivate it. Otherwise, set it for 5 turns.
 * When Trick Room is active, slower Pokemon move first (speed order is reversed).
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 20683-20718 -- trickroom
 *   duration: 5, onFieldRestart: removes the pseudo-weather (toggle off)
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- inherits Gen 4 behavior unchanged
 */
function handleTrickRoom(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  if (ctx.state.trickRoom.active) {
    // Toggle off
    // Source: Showdown onFieldRestart: this.field.removePseudoWeather('trickroom')
    return {
      ...base,
      trickRoomSet: { turnsLeft: 0 },
      messages: ["The twisted dimensions returned to normal!"],
    };
  }
  // Activate for 5 turns
  // Source: Showdown trickroom condition -- duration: 5
  return {
    ...base,
    trickRoomSet: { turnsLeft: 5 },
    messages: ["The dimensions were twisted!"],
  };
}

/**
 * Handle Quick Guard move effect.
 *
 * Sets the "quick-guard" volatile on the user for the remainder of the turn.
 * Quick Guard blocks all moves with priority > 0 targeting the user's side.
 * Uses the same consecutive stalling penalty as Protect (via the stall volatile).
 *
 * In Gen 5, Quick Guard only blocks moves with a NATURAL positive priority.
 * It does not block moves whose priority was boosted by Prankster.
 * Feint bypasses Quick Guard.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 682-713
 *   stallingMove: true, onTry: checks StallMove event
 *   condition.onTryHit: blocks if dex.moves.get(effect.id).priority > 0 && not feint
 * Source: references/pokemon-showdown/data/moves.ts lines 15021-15067
 *   priority: 3, sideCondition: 'quickguard'
 */
function handleQuickGuard(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  // Quick Guard uses the same stalling mechanic as Protect.
  // consecutiveProtects is tracked on ActivePokemon, not in the volatile data.
  // Source: BattleEngine.ts -- actor.consecutiveProtects incremented on protect success
  // Source: Showdown Gen 5 quickguard -- stallingMove: true, onTry checks StallMove
  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: CORE_VOLATILE_IDS.quickGuard,
    selfVolatileData: { turnsLeft: 1 },
    messages: ["Quick Guard protected the team!"],
  };
}

/**
 * Handle Wide Guard move effect.
 *
 * Sets the "wide-guard" volatile on the user for the remainder of the turn.
 * Wide Guard blocks all spread moves (target: allAdjacent or allAdjacentFoes)
 * targeting the user's side.
 * Uses the same consecutive stalling penalty as Protect.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 1029-1037
 *   stallingMove: true, onTry: checks StallMove event
 * Source: references/pokemon-showdown/data/moves.ts lines 21582-21630
 *   priority: 3, sideCondition: 'wideguard'
 *   condition.onTryHit: blocks if move.target === 'allAdjacent' or 'allAdjacentFoes'
 */
function handleWideGuard(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  // Wide Guard uses the same stalling mechanic as Protect.
  // consecutiveProtects is tracked on ActivePokemon, not in the volatile data.
  // Source: BattleEngine.ts -- actor.consecutiveProtects incremented on protect success
  // Source: Showdown Gen 5 wideguard -- stallingMove: true, onTry checks StallMove
  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: CORE_VOLATILE_IDS.wideGuard,
    selfVolatileData: { turnsLeft: 1 },
    messages: ["Wide Guard protected the team!"],
  };
}

/**
 * Handle Tailwind move effect.
 *
 * Sets Tailwind on the user's side for 4 turns. Tailwind doubles the Speed
 * of all Pokemon on the user's side while active.
 *
 * Gen 5 changed Tailwind from 3 turns (Gen 4) to 4 turns.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- tailwind duration: 4
 * Source: Bulbapedia -- "In Generation V onwards, Tailwind lasts for four turns"
 * Source: references/pokemon-showdown/data/mods/gen4/conditions.ts -- tailwind duration: 3 (Gen 4)
 */
function handleTailwind(_ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  // Source: Showdown Gen 5 -- Tailwind duration is 4 turns (changed from Gen 4's 3)
  return {
    ...base,
    tailwindSet: { turnsLeft: 4, side: BATTLE_EFFECT_TARGETS.attacker },
    messages: ["The tailwind blew from behind the team!"],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch table for Gen 5 field effect moves.
 *
 * Returns null if the move is not a recognized field effect move,
 * allowing the caller to fall through to other move effect handlers.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 */
export function handleGen5FieldMove(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult | null {
  switch (ctx.move.id) {
    case "magic-room":
      return handleMagicRoom(ctx);
    case "wonder-room":
      return handleWonderRoom(ctx);
    case "trick-room":
      return handleTrickRoom(ctx);
    case "quick-guard":
      return handleQuickGuard(ctx, rng, rollProtectSuccess);
    case "wide-guard":
      return handleWideGuard(ctx, rng, rollProtectSuccess);
    case "tailwind":
      return handleTailwind(ctx);
    default:
      return null;
  }
}

/**
 * Gen 5 priority overrides.
 *
 * Returns the correct Gen 5 priority for moves whose priority changed from Gen 4,
 * or null if the move's priority is unchanged in Gen 5 (use the data file value).
 *
 * Changes from Gen 4 to Gen 5:
 *   - ExtremeSpeed: +1 -> +2
 *   - Follow Me: +2 -> +3
 *   - Rage Powder: +2 -> +3 (new in Gen 5 with this priority)
 *
 * Moves that did NOT change (already correct in Gen 5 data):
 *   - Protect/Detect/Endure: +4 in Gen 4/5 (unchanged)
 *   - Quick Guard/Wide Guard: +3 (new in Gen 5, no Gen 4 value)
 *
 * Note: The Gen 5 move data already reflects these priorities, so this function
 * is primarily useful for verifying correctness and for engines that need to
 * know what changed between generations.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 *   followme: priority: 3  (was 2 in gen4)
 *   ragepowder: priority: 3  (was 2 in gen4 -- actually new in Gen 5)
 * Source: references/pokemon-showdown/data/mods/gen4/moves.ts
 *   extremespeed: priority: 1  (gen5 base data has 2)
 * Source: references/pokemon-showdown/data/moves.ts
 *   extremespeed: priority: 2  (current/gen5+ value)
 *   followme: priority: 2 -> gen5 mod overrides to 3
 *   ragepowder: priority: 2 -> gen5 mod overrides to 3
 */
export function getGen5PriorityOverride(moveId: string): number | null {
  switch (moveId) {
    case "extreme-speed":
      // Source: Showdown gen4/moves.ts extremespeed priority: 1
      // Source: Showdown data/moves.ts extremespeed priority: 2 (Gen 5+)
      return 2;
    case "follow-me":
      // Source: Showdown gen5/moves.ts followme priority: 3
      return 3;
    case "rage-powder":
      // Source: Showdown gen5/moves.ts ragepowder priority: 3
      return 3;
    default:
      return null;
  }
}

/**
 * Check if a move would be blocked by Quick Guard.
 *
 * In Gen 5, Quick Guard blocks moves with a NATURAL positive priority (from the
 * move data itself, not from Prankster or other priority-boosting effects).
 * Feint bypasses Quick Guard.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 697-700
 *   onTryHit: if (effect.id === 'feint' || this.dex.moves.get(effect.id).priority <= 0) return;
 *   In Gen 5, this checks the NATURAL priority of the move, not the boosted priority.
 */
export function isBlockedByQuickGuard(moveId: string, naturalPriority: number): boolean {
  // Feint always bypasses Quick Guard
  // Source: Showdown Gen 5 quickguard condition -- feint check
  if (moveId === "feint") return false;
  // Only blocks moves with natural priority > 0
  // Source: Showdown Gen 5 quickguard -- dex.moves.get(effect.id).priority <= 0 returns (no block)
  return naturalPriority > 0;
}

/**
 * Check if a move would be blocked by Wide Guard.
 *
 * Wide Guard blocks spread moves -- those that target all adjacent foes,
 * all adjacent Pokemon, or similar multi-target categories.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 21604-21607
 *   onTryHit: if move.target !== 'allAdjacent' && move.target !== 'allAdjacentFoes' return;
 *
 * Our MoveTarget equivalents:
 *   'allAdjacent' = 'all-adjacent'
 *   'allAdjacentFoes' = 'all-adjacent-foes'
 */
export function isBlockedByWideGuard(moveTarget: string): boolean {
  // Source: Showdown wideguard condition -- blocks allAdjacent and allAdjacentFoes
  return moveTarget === "all-adjacent" || moveTarget === "all-adjacent-foes";
}
