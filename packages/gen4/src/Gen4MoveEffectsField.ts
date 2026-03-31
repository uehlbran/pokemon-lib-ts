/**
 * Gen 4 field effect move handlers.
 *
 * Handles Gen 4 moves that affect the field, hazards, and binding effects:
 *   - Stealth Rock: places entry hazard on opponent's side
 *   - Toxic Spikes: places poison entry hazard on opponent's side
 *   - Trick Room: reverses speed order for 5 turns
 *   - Tailwind: doubles speed for 3 turns (Gen 4 duration)
 *   - Defog: clears defender hazards + screens, -1 evasion
 *   - Gravity: intensifies gravity for 5 turns
 *   - Rapid Spin: removes hazards and binding volatiles from user's side
 *   - Binding moves (Bind, Wrap, Fire Spin, Clamp, Whirlpool, Sand Tomb, Magma Storm)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import { BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_HAZARD_IDS,
  CORE_STAT_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { GEN4_ITEM_IDS, GEN4_MOVE_IDS } from "./data/reference-ids";

const ITEM_IDS = GEN4_ITEM_IDS;

// ---------------------------------------------------------------------------
// Helper: empty result
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<MoveEffectResult> & { messages: string[] },
): MoveEffectResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Field Move Handlers
// ---------------------------------------------------------------------------

function handleStealthRock(ctx: MoveEffectContext): MoveEffectResult {
  // Place Stealth Rock on the foe's side
  // Source: Showdown Gen 4 — Stealth Rock entry hazard
  // Source: Bulbapedia — Stealth Rock introduced in Gen 4
  const attackerSideIndex = ctx.state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === ctx.attacker.pokemon),
  );
  const targetSide = (attackerSideIndex === 0 ? 1 : 0) as 0 | 1;
  return makeResult({
    hazardSet: { hazard: CORE_HAZARD_IDS.stealthRock, targetSide },
    messages: ["Pointed stones float in the air around the foe!"],
  });
}

function handleToxicSpikes(ctx: MoveEffectContext): MoveEffectResult {
  // Place Toxic Spikes on the foe's side
  // Source: Showdown Gen 4 — Toxic Spikes entry hazard
  // Source: Bulbapedia — Toxic Spikes introduced in Gen 4
  const attackerSideIndex = ctx.state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === ctx.attacker.pokemon),
  );
  const targetSide = (attackerSideIndex === 0 ? 1 : 0) as 0 | 1;
  return makeResult({
    hazardSet: { hazard: CORE_HAZARD_IDS.toxicSpikes, targetSide },
    messages: ["Poison spikes were scattered on the ground!"],
  });
}

function handleTrickRoom(ctx: MoveEffectContext): MoveEffectResult {
  // Toggle Trick Room: if already active, end it; otherwise start it (5 turns)
  // Source: Showdown Gen 4 — Trick Room reverses speed order for 5 turns
  if (ctx.state.trickRoom.active) {
    // turnsLeft: 0 signals the engine to deactivate Trick Room
    return makeResult({
      trickRoomSet: { turnsLeft: 0 },
      messages: ["The twisted dimensions returned to normal!"],
    });
  }
  return makeResult({
    trickRoomSet: { turnsLeft: 5 },
    messages: ["The dimensions were twisted!"],
  });
}

function handleTailwind(ctx: MoveEffectContext): MoveEffectResult {
  // Set Tailwind on attacker's side (3 turns in Gen 4)
  // Source: Showdown Gen 4 — Tailwind lasts 3 turns (including the turn it's used)
  // Source: Bulbapedia — Tailwind duration is 3 turns in Gen 4
  // Note: Gen 5+ extended Tailwind to 4 turns
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    tailwindSet: { turnsLeft: 3, side: BATTLE_EFFECT_TARGETS.attacker },
    messages: [`${attackerName} whipped up a tailwind!`],
  });
}

function handleDefog(_ctx: MoveEffectContext): MoveEffectResult {
  // Clear defender's hazards + screens; -1 evasion on defender
  // Source: Showdown Gen 4 — Defog clears hazards, screens, and lowers evasion
  // Source: Bulbapedia — Defog lowers target's evasion by 1 and clears hazards
  return makeResult({
    clearSideHazards: BATTLE_EFFECT_TARGETS.defender,
    screensCleared: BATTLE_EFFECT_TARGETS.defender,
    statChanges: [
      {
        target: BATTLE_EFFECT_TARGETS.defender,
        stat: CORE_STAT_IDS.evasion,
        stages: -1,
      },
    ],
    messages: ["It blew away the hazards!"],
  });
}

function handleGravity(_ctx: MoveEffectContext): MoveEffectResult {
  // Intensify gravity — engine applies the field state via gravitySet flag
  // Source: Showdown Gen 4 — Gravity lasts 5 turns, grounds all Pokemon
  // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Gravity_(move)
  return makeResult({
    gravitySet: true,
    messages: ["Gravity intensified!"],
  });
}

function handleRapidSpin(ctx: MoveEffectContext): MoveEffectResult {
  // Remove leech-seed and binding volatiles from user, hazards from user's side
  // Source: Showdown Gen 4 — Rapid Spin clears Spikes, Stealth Rock, Toxic Spikes,
  //   Leech Seed, and Wrap/Bind
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    volatilesToClear: [
      {
        target: BATTLE_EFFECT_TARGETS.attacker,
        volatile: CORE_VOLATILE_IDS.leechSeed,
      },
      {
        target: BATTLE_EFFECT_TARGETS.attacker,
        volatile: CORE_VOLATILE_IDS.bound,
      },
    ],
    clearSideHazards: BATTLE_EFFECT_TARGETS.attacker,
    messages: [`${attackerName} blew away leech seed and spikes!`],
  });
}

function handleBindingMove(ctx: MoveEffectContext, moveId: string): MoveEffectResult {
  // Binding moves: trap target for 3-6 turns (or 6 with Grip Claw).
  // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/conditions.ts —
  //   partiallytrapped.durationCallback: if gripclaw => 6, else this.random(3, 7)
  //   Showdown random(3, 7) = exclusive upper bound = 3, 4, 5, or 6 turns
  // Our rng.int() is inclusive, so rng.int(3, 6) gives the same range.
  const { attacker, defender, rng } = ctx;
  const defName = defender.pokemon.nickname ?? "The foe";
  if (defender.volatileStatuses.has(CORE_VOLATILE_IDS.bound)) {
    return makeResult({ messages: [] }); // Already bound
  }
  // Grip Claw: binding lasts 6 turns (not random)
  // Source: Showdown Gen 4 mod conditions.ts — if gripclaw => return 6
  const hasGripClaw =
    attacker.pokemon.heldItem === ITEM_IDS.gripClaw && attacker.ability !== CORE_ABILITY_IDS.klutz;
  const turnsLeft = hasGripClaw ? 6 : rng.int(3, 6);
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.bound,
    volatileData: { turnsLeft },
    messages: [`${defName} was squeezed by ${moveId}!`],
  });
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Handle Gen 4 field effect moves.
 *
 * Returns a MoveEffectResult if this is a recognized field effect move,
 * or null if not recognized (caller should try other handlers).
 *
 * @param ctx - Full move execution context
 * @returns MoveEffectResult if handled, or null if unrecognized
 */
export function handleGen4FieldMove(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case GEN4_MOVE_IDS.stealthRock:
      return handleStealthRock(ctx);
    case GEN4_MOVE_IDS.toxicSpikes:
      return handleToxicSpikes(ctx);
    case GEN4_MOVE_IDS.trickRoom:
      return handleTrickRoom(ctx);
    case GEN4_MOVE_IDS.tailwind:
      return handleTailwind(ctx);
    case GEN4_MOVE_IDS.defog:
      return handleDefog(ctx);
    case GEN4_MOVE_IDS.gravity:
      return handleGravity(ctx);
    case GEN4_MOVE_IDS.rapidSpin:
      return handleRapidSpin(ctx);
    case GEN4_MOVE_IDS.bind:
    case GEN4_MOVE_IDS.wrap:
    case GEN4_MOVE_IDS.fireSpin:
    case GEN4_MOVE_IDS.clamp:
    case GEN4_MOVE_IDS.whirlpool:
    case GEN4_MOVE_IDS.sandTomb:
    case GEN4_MOVE_IDS.magmaStorm:
      return handleBindingMove(ctx, ctx.move.id);
    default:
      return null;
  }
}
