/**
 * Gen 4 status and utility move handlers.
 *
 * Handles Gen 4 status/utility moves that require special logic:
 *   - Taunt: random 3-5 turn volatile (Gen 4 specific)
 *   - Disable: random 4-7 turn volatile with move ID data
 *   - Yawn: drowsy volatile, fails if status/immune
 *   - Encore: random 4-8 turn volatile (Gen 4 specific)
 *   - Heal Block: 5-turn volatile blocking HP recovery
 *   - Embargo: 5-turn volatile blocking held items
 *   - Worry Seed: changes target's ability to Insomnia
 *   - Gastro Acid: suppresses target's ability
 *   - Rest: full heal + exactly 2-turn sleep
 *   - Heal Bell / Aromatherapy: cures all party members' status
 *   - Safeguard: 5-turn team protection from status
 *   - Lucky Chant: 5-turn team protection from crits
 *   - Block / Mean Look / Spider Web: trapping volatile
 *   - Ingrain: roots user, heals each turn, prevents switching
 *   - Aqua Ring: surround with water, heals each turn
 *   - Refresh: cure own status condition
 *   - Destiny Bond: if user faints, foe faints too
 *   - Wish: deferred heal for floor(wisher's maxHP / 2)
 *   - Haze: reset all stat stages for both sides
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import { BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import {
  CORE_SCREEN_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { GEN4_ABILITY_IDS, GEN4_MOVE_IDS } from "./data/reference-ids";

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
// Status Move Handlers
// ---------------------------------------------------------------------------

function handleTaunt(ctx: MoveEffectContext): MoveEffectResult {
  // Taunt: data has volatile-status "taunt" but we need turnsLeft randomly for Gen 4
  // Source: Showdown Gen 4 mod — `this.random(3, 6)` (exclusive max) = 3, 4, or 5 turns
  // Source: Bulbapedia — "Taunt lasts for 3–5 turns in Generation IV" (fixed to 3 in Gen 5+)
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.taunt,
    volatileData: { turnsLeft: ctx.rng.int(3, 5) },
    messages: [],
  });
}

function handleDisable(ctx: MoveEffectContext): MoveEffectResult {
  // Disable: data has volatile-status "disable" but we need turnsLeft and target's lastMoveUsed
  // Source: Showdown Gen 4 — Disable lasts 4-7 turns (this.random(4, 8) = exclusive upper bound)
  // Source: Bulbapedia — "Disable disables the target's last used move for 4-7 turns in Gen 4"
  const { defender } = ctx;
  if (!defender.lastMoveUsed) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Disable fails if the target's last move is not a current move slot or has 0 PP
  // Source: Showdown Gen 4 — Disable fails if target's last move has 0 PP or is not in moveset
  const moveSlot = defender.pokemon.moves.find(
    (slot) => slot && slot.moveId === defender.lastMoveUsed,
  );
  if (!moveSlot || moveSlot.currentPP <= 0) {
    return makeResult({ messages: ["But it failed!"] });
  }
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.disable,
    volatileData: {
      turnsLeft: ctx.rng.int(4, 7),
      data: { moveId: defender.lastMoveUsed },
    },
    messages: [],
  });
}

function handleYawn(ctx: MoveEffectContext): MoveEffectResult {
  // Yawn: inflict "yawn" volatile on target — sleep comes at end of next turn
  // Source: Bulbapedia — Yawn: "causes drowsiness; the target falls asleep at the end
  //   of the next turn"
  // Source: Showdown Gen 4 mod — Yawn sets a 1-turn drowsy volatile
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  // Yawn fails if target already has a primary status
  if (defender.pokemon.status !== null) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Yawn fails if target already has the yawn volatile
  if (defender.volatileStatuses.has(CORE_VOLATILE_IDS.yawn)) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Yawn fails if target has Insomnia or Vital Spirit
  // Source: Showdown Gen 4 mod — Yawn blocked by sleep-preventing abilities
  if (
    defender.ability === GEN4_ABILITY_IDS.insomnia ||
    defender.ability === GEN4_ABILITY_IDS.vitalSpirit
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.yawn,
    volatileData: { turnsLeft: 1 },
    messages: [`${defenderName} grew drowsy!`],
  });
}

function handleEncore(ctx: MoveEffectContext): MoveEffectResult {
  // Encore: lock target into its last used move for 4-8 turns (Gen 4)
  // Source: Showdown Gen 4 mod — Encore duration: this.random(4, 9) (exclusive max) = 4..8 turns
  // Source: Bulbapedia — "Encore forces the target to repeat its last used move for 2-6 turns"
  // Note: Showdown Gen 4 uses 4-8 turns. Bulbapedia states 4-8 for Gen 4.
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  // Fail if target has no last move or is already Encored
  if (!defender.lastMoveUsed || defender.volatileStatuses.has(CORE_VOLATILE_IDS.encore)) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Source: Showdown Gen 4 mod — Encore lasts 4-8 turns
  const turnsLeft = ctx.rng.int(4, 8);
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.encore,
    volatileData: { turnsLeft, data: { moveId: defender.lastMoveUsed } },
    messages: [`${defenderName} got an encore!`],
  });
}

function handleHealBlock(ctx: MoveEffectContext): MoveEffectResult {
  // Heal Block: prevent HP recovery for 5 turns
  // Source: Bulbapedia — Heal Block prevents HP recovery for 5 turns
  // Source: Showdown Gen 4 mod — Heal Block lasts 5 turns
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  if (defender.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)) {
    return makeResult({ messages: ["But it failed!"] });
  }
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.healBlock,
    volatileData: { turnsLeft: 5 },
    messages: [`${defenderName} was prevented from healing!`],
  });
}

function handleEmbargo(ctx: MoveEffectContext): MoveEffectResult {
  // Embargo: prevent item use for 5 turns
  // Source: Bulbapedia — Embargo prevents use of held items for 5 turns
  // Source: Showdown Gen 4 mod — Embargo lasts 5 turns
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  if (defender.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)) {
    return makeResult({ messages: ["But it failed!"] });
  }
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.embargo,
    volatileData: { turnsLeft: 5 },
    messages: [`${defenderName} can't use items!`],
  });
}

function handleWorrySeed(ctx: MoveEffectContext): MoveEffectResult {
  // Worry Seed: change target's ability to Insomnia
  // Source: Bulbapedia — Worry Seed: "Changes the target's Ability to Insomnia"
  // Source: Showdown Gen 4 mod — Worry Seed fails vs Insomnia, Truant, Multitype
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  const failAbilities = new Set<string>([
    GEN4_ABILITY_IDS.insomnia,
    GEN4_ABILITY_IDS.truant,
    GEN4_ABILITY_IDS.multitype,
  ]);
  if (failAbilities.has(defender.ability ?? "")) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Direct mutation: set ability immediately
  defender.ability = GEN4_ABILITY_IDS.insomnia;
  // If target is asleep, Insomnia immediately wakes it
  // Source: Showdown Gen 4 mod — Worry Seed cures sleep if the new ability blocks it
  if (defender.pokemon.status === CORE_STATUS_IDS.sleep) {
    defender.pokemon.status = null;
    defender.volatileStatuses.delete(CORE_VOLATILE_IDS.sleepCounter);
    return makeResult({
      messages: [`${defenderName}'s ability changed to Insomnia and it woke up!`],
    });
  }
  return makeResult({
    messages: [`${defenderName}'s ability changed to Insomnia!`],
  });
}

function handleGastroAcid(ctx: MoveEffectContext): MoveEffectResult {
  // Gastro Acid: suppress target's ability (set to empty string)
  // Source: Bulbapedia — Gastro Acid: "suppresses the target's ability"
  // Source: Showdown Gen 4 mod — Gastro Acid fails vs Multitype
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
  if (defender.ability === GEN4_ABILITY_IDS.multitype) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Fail if the ability is already suppressed (prevents double-application from corrupting
  // the saved original ability). Uses loose equality to treat undefined the same as null.
  // Source: Showdown Gen 4 mod — Gastro Acid is idempotent; second use fails
  if (defender.suppressedAbility != null) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Save the original ability so it can be restored on switch-out
  // Source: Showdown Gen 4 mod — Gastro Acid sets suppressedAbility; restored on switch-out
  defender.suppressedAbility = defender.ability;
  defender.ability = "";
  return makeResult({
    messages: [`${defenderName}'s ability was suppressed!`],
  });
}

function handleRest(ctx: MoveEffectContext): MoveEffectResult {
  // Full heal + self-inflict exactly 2-turn sleep (wakes on turn 3 and can act).
  // The engine uses selfVolatileData.turnsLeft as a sleep duration override
  // (see BattleEngine line ~2547-2549), so we MUST set it to avoid random rollSleepTurns().
  // Source: Showdown Gen 4 — Rest sets sleep duration to exactly 2 turns
  // Source: Bulbapedia — Rest: "The user goes to sleep for two turns, fully restoring its HP"
  const { attacker } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;

  // Fail if already at full HP — nothing to restore.
  // Guard: only when calculatedStats is available. When it is null (edge case where stats
  // haven't been computed yet), maxHp falls back to currentHp and the check would always
  // fire incorrectly, so we skip it.
  // Source: Showdown Gen 4 — Rest fails when the user is at full HP
  if (attacker.pokemon.calculatedStats !== null && attacker.pokemon.currentHp >= maxHp) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Fail if Heal Block is active — blocks all HP recovery including Rest
  // Source: Showdown Gen 4 — Heal Block prevents Rest from being used
  if (attacker.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)) {
    return makeResult({ messages: [`${attackerName} can't use healing moves!`] });
  }

  return makeResult({
    healAmount: maxHp,
    selfStatusInflicted: CORE_STATUS_IDS.sleep,
    selfVolatileData: { turnsLeft: 2 },
    messages: [`${attackerName} went to sleep and became healthy!`],
  });
}

function handleHealBellAromatherapy(_ctx: MoveEffectContext, moveId: string): MoveEffectResult {
  // Cure all party members' status conditions (attacker's side only — not the foe's party)
  // Source: Showdown Gen 4 — Heal Bell / Aromatherapy cures user's team status
  // Source: Bulbapedia — "Heal Bell cures all status conditions of the user and the user's party"
  const moveName = moveId === GEN4_MOVE_IDS.healBell ? "Heal Bell" : "Aromatherapy";
  return makeResult({
    statusCuredOnly: { target: BATTLE_EFFECT_TARGETS.attacker },
    messages: [`A bell chimed! ${moveName} cured the team's status!`],
  });
}

function handleSafeguard(ctx: MoveEffectContext): MoveEffectResult {
  // Set Safeguard on attacker's side (5 turns)
  // Source: Showdown Gen 4 — Safeguard prevents status for 5 turns
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    screenSet: {
      screen: CORE_SCREEN_IDS.safeguard,
      turnsLeft: 5,
      side: BATTLE_EFFECT_TARGETS.attacker,
    },
    messages: [`${attackerName}'s team became cloaked in a mystical veil!`],
  });
}

function handleLuckyChant(ctx: MoveEffectContext): MoveEffectResult {
  // Set Lucky Chant on attacker's side (5 turns)
  // Source: Showdown Gen 4 — Lucky Chant prevents crits for 5 turns
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    screenSet: {
      screen: CORE_SCREEN_IDS.luckyChant,
      turnsLeft: 5,
      side: BATTLE_EFFECT_TARGETS.attacker,
    },
    messages: [`${attackerName}'s team is shielded from critical hits!`],
  });
}

function handleTrapping(_ctx: MoveEffectContext): MoveEffectResult {
  // Trapping effect — prevents switching
  // Source: Showdown Gen 4 — Mean Look / Spider Web / Block set TRAPPED flag
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.trapped,
    messages: [],
  });
}

function handleIngrain(ctx: MoveEffectContext): MoveEffectResult {
  // Root into the ground — heal each turn, cannot switch
  // Source: Showdown Gen 4 — Ingrain volatile
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    selfVolatileInflicted: CORE_VOLATILE_IDS.ingrain,
    messages: [`${attackerName} planted its roots!`],
  });
}

function handleAquaRing(ctx: MoveEffectContext): MoveEffectResult {
  // Surround with water — heal each turn
  // Source: Showdown Gen 4 — Aqua Ring volatile
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    selfVolatileInflicted: CORE_VOLATILE_IDS.aquaRing,
    messages: [`${attackerName} surrounded itself with a veil of water!`],
  });
}

function handleStockpile(ctx: MoveEffectContext): MoveEffectResult {
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  const existing = ctx.attacker.volatileStatuses.get(CORE_VOLATILE_IDS.stockpile);
  const layers = Number(existing?.data?.layers ?? 0);
  if (layers >= 3) {
    return makeResult({ messages: ["But it failed!"] });
  }

  const defenseBoostDelta = ctx.attacker.statStages.defense < 6 ? 1 : 0;
  const spDefenseBoostDelta = ctx.attacker.statStages.spDefense < 6 ? 1 : 0;
  const nextState = {
    layers: layers + 1,
    defenseBoostsApplied: Number(existing?.data?.defenseBoostsApplied ?? 0) + defenseBoostDelta,
    spDefenseBoostsApplied:
      Number(existing?.data?.spDefenseBoostsApplied ?? 0) + spDefenseBoostDelta,
  };

  if (existing) {
    ctx.attacker.volatileStatuses.set(CORE_VOLATILE_IDS.stockpile, {
      turnsLeft: -1,
      data: nextState,
    });
    return makeResult({
      statChanges: [
        ...(defenseBoostDelta > 0
          ? [{ target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.defense, stages: 1 }]
          : []),
        ...(spDefenseBoostDelta > 0
          ? [{ target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.spDefense, stages: 1 }]
          : []),
      ],
      messages: [`${attackerName} stockpiled ${layers + 1}!`],
    });
  }

  return makeResult({
    selfVolatileInflicted: CORE_VOLATILE_IDS.stockpile,
    selfVolatileData: { turnsLeft: -1, data: nextState },
    statChanges: [
      ...(defenseBoostDelta > 0
        ? [{ target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.defense, stages: 1 }]
        : []),
      ...(spDefenseBoostDelta > 0
        ? [{ target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.spDefense, stages: 1 }]
        : []),
    ],
    messages: [`${attackerName} stockpiled 1!`],
  });
}

function handleStockpileRelease(ctx: MoveEffectContext, moveId: string): MoveEffectResult {
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  const stockpile = ctx.attacker.volatileStatuses.get(CORE_VOLATILE_IDS.stockpile);
  const layers = Number(stockpile?.data?.layers ?? 0);
  if (layers <= 0) {
    return makeResult({ messages: ["But it failed!"] });
  }

  const defenseBoostsApplied = Number(stockpile?.data?.defenseBoostsApplied ?? 0);
  const spDefenseBoostsApplied = Number(stockpile?.data?.spDefenseBoostsApplied ?? 0);

  return makeResult({
    volatilesToClear: [
      { target: BATTLE_EFFECT_TARGETS.attacker, volatile: CORE_VOLATILE_IDS.stockpile },
    ],
    healAmount:
      moveId === GEN4_MOVE_IDS.swallow
        ? Math.floor(
            (ctx.attacker.pokemon.calculatedStats?.hp ?? ctx.attacker.pokemon.currentHp) *
              ([0.25, 0.5, 1][layers - 1] ?? 1),
          )
        : 0,
    statChanges: [
      ...(defenseBoostsApplied > 0
        ? [
            {
              target: BATTLE_EFFECT_TARGETS.attacker,
              stat: CORE_STAT_IDS.defense,
              stages: -defenseBoostsApplied,
            },
          ]
        : []),
      ...(spDefenseBoostsApplied > 0
        ? [
            {
              target: BATTLE_EFFECT_TARGETS.attacker,
              stat: CORE_STAT_IDS.spDefense,
              stages: -spDefenseBoostsApplied,
            },
          ]
        : []),
    ],
    messages: [
      moveId === GEN4_MOVE_IDS.swallow
        ? `${attackerName} swallowed its stockpile!`
        : `${attackerName} unleashed its stockpiled power!`,
    ],
  });
}

function handlePowerTrick(ctx: MoveEffectContext): MoveEffectResult {
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  if (ctx.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.powerTrick)) {
    ctx.attacker.volatileStatuses.delete(CORE_VOLATILE_IDS.powerTrick);
    return makeResult({ messages: [`${attackerName} switched its power back!`] });
  }
  return makeResult({
    selfVolatileInflicted: CORE_VOLATILE_IDS.powerTrick,
    messages: [`${attackerName} switched its Attack and Defense!`],
  });
}

function handleRecycle(ctx: MoveEffectContext): MoveEffectResult {
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  if (ctx.attacker.pokemon.heldItem || !ctx.attacker.pokemon.lastItem) {
    return makeResult({ messages: ["But it failed!"] });
  }
  ctx.attacker.pokemon.heldItem = ctx.attacker.pokemon.lastItem;
  ctx.attacker.pokemon.lastItem = null;
  return makeResult({
    messages: [`${attackerName} recycled its ${ctx.attacker.pokemon.heldItem}!`],
  });
}

function handleRefresh(ctx: MoveEffectContext): MoveEffectResult {
  // Cure own burn, poison, or paralysis — NOT sleep or freeze
  // Source: Bulbapedia — Refresh: "The user relaxes and lightens its body to
  //   restore its health. It also eliminates all status conditions."
  //   Mechanics: only cures burn, poisoning (including bad poison), and paralysis.
  //   Sleep and freeze cannot be cured by Refresh.
  // Source: Showdown Gen 4 — Refresh onHit: only cures brn/psn/par
  const { attacker } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const curable = [
    CORE_STATUS_IDS.burn,
    CORE_STATUS_IDS.poison,
    CORE_STATUS_IDS.badlyPoisoned,
    CORE_STATUS_IDS.paralysis,
  ];
  if (
    attacker.pokemon.status &&
    curable.includes(attacker.pokemon.status as (typeof curable)[number])
  ) {
    return makeResult({
      statusCuredOnly: { target: BATTLE_EFFECT_TARGETS.attacker },
      messages: [`${attackerName} cured its status condition!`],
    });
  }
  return makeResult({ messages: [] });
}

function handleDestinyBond(ctx: MoveEffectContext): MoveEffectResult {
  // Destiny Bond: if the user faints from the opponent's next move, the attacker faints too
  // Source: Bulbapedia — "If the user faints after using Destiny Bond, the Pokemon
  //   that KO'd it also faints"
  // Source: Showdown Gen 4 — sets destiny-bond volatile
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    selfVolatileInflicted: CORE_VOLATILE_IDS.destinyBond,
    messages: [`${attackerName} is trying to take its foe down with it!`],
  });
}

function handleWish(ctx: MoveEffectContext): MoveEffectResult {
  // Schedule Wish heal — at the end of the next turn, heal active Pokemon
  // by floor(wisher's max HP / 2).
  // Source: Showdown data/moves.ts -- wish condition: { duration: 2, onResidual: heals floor(hp/2) }
  // Source: Bulbapedia -- "At the end of the next turn, the Pokemon in the slot
  //   will be restored by half the maximum HP of the Pokemon that used Wish"
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  const wisherMaxHp = ctx.attacker.pokemon.calculatedStats?.hp ?? ctx.attacker.pokemon.currentHp;
  return makeResult({
    wishSet: { healAmount: Math.floor(wisherMaxHp / 2), turnsLeft: 2 },
    messages: [`${attackerName} made a wish!`],
  });
}

function handleHaze(_ctx: MoveEffectContext): MoveEffectResult {
  // Reset stat stages for both Pokemon
  // Source: Showdown Gen 4 — Haze resets all stat changes for both sides
  return makeResult({
    statStagesReset: { target: BATTLE_EFFECT_TARGETS.both },
    messages: ["All stat changes were eliminated!"],
  });
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Handle Gen 4 status and utility moves.
 *
 * Returns a MoveEffectResult if this is a recognized status/utility move,
 * or null if not recognized (caller should try other handlers).
 *
 * @param ctx - Full move execution context
 * @returns MoveEffectResult if handled, or null if unrecognized
 */
export function handleGen4StatusMove(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case GEN4_MOVE_IDS.taunt:
      return handleTaunt(ctx);
    case GEN4_MOVE_IDS.disable:
      return handleDisable(ctx);
    case GEN4_MOVE_IDS.yawn:
      return handleYawn(ctx);
    case GEN4_MOVE_IDS.encore:
      return handleEncore(ctx);
    case GEN4_MOVE_IDS.healBlock:
      return handleHealBlock(ctx);
    case GEN4_MOVE_IDS.embargo:
      return handleEmbargo(ctx);
    case GEN4_MOVE_IDS.worrySeed:
      return handleWorrySeed(ctx);
    case GEN4_MOVE_IDS.gastroAcid:
      return handleGastroAcid(ctx);
    case GEN4_MOVE_IDS.rest:
      return handleRest(ctx);
    case GEN4_MOVE_IDS.healBell:
    case GEN4_MOVE_IDS.aromatherapy:
      return handleHealBellAromatherapy(ctx, ctx.move.id);
    case GEN4_MOVE_IDS.safeguard:
      return handleSafeguard(ctx);
    case GEN4_MOVE_IDS.luckyChant:
      return handleLuckyChant(ctx);
    case GEN4_MOVE_IDS.block:
    case GEN4_MOVE_IDS.meanLook:
    case GEN4_MOVE_IDS.spiderWeb:
      return handleTrapping(ctx);
    case GEN4_MOVE_IDS.ingrain:
      return handleIngrain(ctx);
    case GEN4_MOVE_IDS.aquaRing:
      return handleAquaRing(ctx);
    case GEN4_MOVE_IDS.stockpile:
      return handleStockpile(ctx);
    case GEN4_MOVE_IDS.spitUp:
    case GEN4_MOVE_IDS.swallow:
      return handleStockpileRelease(ctx, ctx.move.id);
    case GEN4_MOVE_IDS.powerTrick:
      return handlePowerTrick(ctx);
    case GEN4_MOVE_IDS.recycle:
      return handleRecycle(ctx);
    case GEN4_MOVE_IDS.refresh:
      return handleRefresh(ctx);
    case GEN4_MOVE_IDS.destinyBond:
      return handleDestinyBond(ctx);
    case GEN4_MOVE_IDS.wish:
      return handleWish(ctx);
    case GEN4_MOVE_IDS.haze:
      return handleHaze(ctx);
    default:
      return null;
  }
}
