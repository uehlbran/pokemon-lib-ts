/**
 * Gen 4 combat move handlers.
 *
 * Handles Gen 4 moves with complex in-battle combat effects:
 *   - Belly Drum: lose 50% max HP, maximize Attack
 *   - Explosion / Self-Destruct: user faints after dealing damage
 *   - Baton Pass: switch out while passing stat stages and volatile statuses
 *   - Perish Song: 3-turn countdown faint for both Pokemon
 *   - Pain Split: average HP between both Pokemon
 *   - Moonlight / Morning Sun / Synthesis: weather-dependent healing
 *   - Future Sight / Doom Desire: schedules a delayed hit (Psychic/Steel) via source side state
 *   - Whirlwind / Roar: force defender to switch randomly (phazing)
 *   - Counter: return 2x physical damage taken
 *   - Mirror Coat: return 2x special damage taken
 *   - Power Swap: swap Atk/SpAtk stat stages with target
 *   - Guard Swap: swap Def/SpDef stat stages with target
 *   - Heart Swap: swap all stat stages with target
 *   - Acupressure: +2 to a random stat stage
 *   - Curse (Ghost-type only): user loses 1/2 HP, target gets cursed volatile
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import { BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import {
  type BattleStat,
  CORE_MOVE_CATEGORIES,
  CORE_STAT_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { GEN4_ABILITY_IDS, GEN4_MOVE_IDS } from "./data/reference-ids";

// ---------------------------------------------------------------------------
// Helper: empty result
// ---------------------------------------------------------------------------

type MutablePainSplitResult = {
  statusInflicted: null;
  volatileInflicted: VolatileStatus | null;
  statChanges: Array<{ target: string; stat: BattleStat; stages: number }>;
  recoilDamage: number;
  healAmount: number;
  switchOut: boolean;
  messages: string[];
  customDamage?: {
    target: string;
    amount: number;
    source: string;
  } | null;
};

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

function makeMutablePainSplitResult(): MutablePainSplitResult {
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
// Combat Move Handlers
// ---------------------------------------------------------------------------

function handleBellyDrum(ctx: MoveEffectContext): MoveEffectResult {
  // Lose 50% max HP, maximize Attack to +6
  // Fails if Attack is already +6, or if current HP <= half of max HP
  // Source: pokeplatinum/res/battle/scripts/subscripts/subscript_belly_drum.s —
  //   _000: CompareMonDataToValue OPCODE_EQU, BTLSCR_ATTACKER, BATTLEMON_ATTACK_STAGE, 12, _052
  //   (BATTLEMON_ATTACK_STAGE 12 = stage +6 in the 0-12 internal scale; jump _052 = fail)
  //   then: DivideVarByValue BTLVAR_HP_CALC_TEMP, 2
  //   CompareMonDataToVar OPCODE_LTE, BTLSCR_ATTACKER, BATTLEMON_CUR_HP, BTLVAR_HP_CALC_TEMP, _052
  const { attacker } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  if (attacker.statStages.attack >= 6) {
    return makeResult({ messages: ["But it failed!"] });
  }
  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
  const halfHp = Math.floor(maxHp / 2);
  if (attacker.pokemon.currentHp > halfHp) {
    return makeResult({
      recoilDamage: halfHp,
      statChanges: [
        {
          target: BATTLE_EFFECT_TARGETS.attacker,
          stat: CORE_STAT_IDS.attack,
          stages: 6 - attacker.statStages.attack,
        },
      ],
      messages: [`${attackerName} cut its own HP and maximized Attack!`],
    });
  }
  return makeResult({ messages: [`${attackerName} is too weak to use Belly Drum!`] });
}

function handleExplosionSelfDestruct(ctx: MoveEffectContext): MoveEffectResult {
  // Self-KO after damage
  // Source: Showdown Gen 4 — Explosion/Self-Destruct
  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  return makeResult({
    selfFaint: true,
    messages: [`${attackerName} exploded!`],
  });
}

function handleBatonPass(_ctx: MoveEffectContext): MoveEffectResult {
  // Switch out preserving stat changes and volatile statuses
  // Source: Showdown Gen 4 — Baton Pass
  return makeResult({
    switchOut: true,
    batonPass: true,
    messages: [],
  });
}

function handlePerishSong(ctx: MoveEffectContext): MoveEffectResult {
  // Both Pokemon get Perish Song volatile (3-turn countdown), unless immune via Soundproof
  // Source: pokeplatinum/res/battle/scripts/subscripts/subscript_perish_song_start.s —
  //   TryPerishSong loops all battlers, skips any with ABILITY_SOUNDPROOF
  // Source: pokeplatinum/src/battle/battle_script.c BtlCmd_TryPerishSong —
  //   Battler_IgnorableAbility(battleCtx, attacker, i, ABILITY_SOUNDPROOF) == TRUE → skip
  const { attacker, defender } = ctx;
  const attackerImmune = attacker.ability === GEN4_ABILITY_IDS.soundproof;
  const defenderImmune = defender.ability === GEN4_ABILITY_IDS.soundproof;

  const messages: string[] = [];
  if (attackerImmune) {
    const name = attacker.pokemon.nickname ?? "The Pokemon";
    messages.push(`${name}'s Soundproof blocks Perish Song!`);
  }
  if (defenderImmune) {
    const name = defender.pokemon.nickname ?? "The foe";
    messages.push(`${name}'s Soundproof blocks Perish Song!`);
  }
  if (!attackerImmune || !defenderImmune) {
    messages.push("All Pokemon that heard the song will faint in 3 turns!");
  }

  return makeResult({
    ...(attackerImmune
      ? {}
      : {
          selfVolatileInflicted: CORE_VOLATILE_IDS.perishSong,
          selfVolatileData: { turnsLeft: 3 },
        }),
    ...(defenderImmune
      ? {}
      : {
          volatileInflicted: CORE_VOLATILE_IDS.perishSong,
          volatileData: { turnsLeft: 3 },
        }),
    messages,
  });
}

function handlePainSplit(ctx: MoveEffectContext): MoveEffectResult {
  // Pain Split: set both sides to the average HP, capped at each Pokemon's maxHp.
  // Uses event-stream-compatible result fields wherever possible (#311 fix).
  //
  // Source: Showdown Gen 4 — Pain Split sets both to floor((a + b) / 2)
  // Source: Bulbapedia — "each have their HP set to the average of the two"
  const { attacker, defender } = ctx;
  const attackerHp = attacker.pokemon.currentHp;
  const defenderHp = defender.pokemon.currentHp;
  const attackerMaxHp = attacker.pokemon.calculatedStats?.hp ?? attackerHp;
  const defenderMaxHp = defender.pokemon.calculatedStats?.hp ?? defenderHp;
  const average = Math.floor((attackerHp + defenderHp) / 2);
  const newAttackerHp = Math.min(average, attackerMaxHp);
  const newDefenderHp = Math.min(average, defenderMaxHp);

  const result = makeMutablePainSplitResult();
  result.messages.push("The battlers shared their pain!");

  // Attacker HP change: use healAmount (gain) or recoilDamage (loss)
  const attackerDelta = newAttackerHp - attackerHp;
  if (attackerDelta > 0) {
    result.healAmount = attackerDelta;
  } else if (attackerDelta < 0) {
    result.recoilDamage = -attackerDelta;
  }

  // Defender HP change: use customDamage (loss) or direct mutation (gain).
  // MoveEffectResult has no "defender heal" field, so defender healing must be
  // done via direct mutation. This is a known limitation — see #311 comment.
  const defenderDelta = newDefenderHp - defenderHp;
  if (defenderDelta < 0) {
    result.customDamage = {
      target: BATTLE_EFFECT_TARGETS.defender,
      amount: -defenderDelta,
      source: GEN4_MOVE_IDS.painSplit,
    };
  } else if (defenderDelta > 0) {
    // FIXME: Direct mutation for defender healing — MoveEffectResult lacks a
    // defenderHealAmount field. The engine emits no heal event for the defender.
    // A follow-up to add defender healing to MoveEffectResult would fix this.
    defender.pokemon.currentHp = newDefenderHp;
  }

  return result as unknown as MoveEffectResult;
}

function handleWeatherHeal(ctx: MoveEffectContext, moveId: string): MoveEffectResult {
  // Weather-dependent healing
  // Source: Showdown Gen 4 — sun: 2/3, rain/sand/hail: 1/4, else: 1/2
  // Source: Bulbapedia — Weather-based HP recovery moves
  const { attacker, state } = ctx;
  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
  const weather = state.weather?.type ?? null;
  let healFraction: number;
  if (weather === CORE_WEATHER_IDS.sun) {
    healFraction = 2 / 3;
  } else if (
    weather === CORE_WEATHER_IDS.rain ||
    weather === CORE_WEATHER_IDS.sand ||
    weather === CORE_WEATHER_IDS.hail
  ) {
    healFraction = 1 / 4;
  } else {
    healFraction = 1 / 2;
  }
  return makeResult({
    healAmount: Math.max(1, Math.floor(maxHp * healFraction)),
    messages: [],
  });
}

function handleFutureSight(ctx: MoveEffectContext): MoveEffectResult {
  // Future Sight: schedules a hit 3 end-of-turns later. In Gen 4, damage is calculated
  // at USE time (not hit time) — BattleEngine stores launchDamage when scheduling because
  // Gen4Ruleset.recalculatesFutureAttackDamage() returns false.
  // Source: Bulbapedia — "Future Sight hits 2 turns after being used (3 EoT ticks)"
  // Source: Showdown Gen 4 — Future Sight schedules future attack
  const { attacker, state } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const attackerSideIndex = state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === attacker.pokemon),
  );

  // Fail if there's already a future attack pending on the target's side
  // Source: Showdown Gen 4 — Future Sight fails if a future attack is already set
  const targetSideIndex = attackerSideIndex === 0 ? 1 : 0;
  if (state.sides[targetSideIndex].futureAttack) {
    return makeResult({ messages: ["But it failed!"] });
  }

  return makeResult({
    futureAttack: {
      moveId: GEN4_MOVE_IDS.futureSight,
      turnsLeft: 3,
      sourceSide: (attackerSideIndex === 0 ? 0 : 1) as 0 | 1,
    },
    messages: [`${attackerName} foresaw an attack!`],
  });
}

function handleWhirlwindRoar(ctx: MoveEffectContext): MoveEffectResult {
  // Force switch — engine handles phazing logic
  // Source: Showdown Gen 4 — Whirlwind/Roar force random switch (onDragOut handler)
  // Suction Cups: prevents forced switch effects (Whirlwind, Roar)
  // Source: Bulbapedia — Suction Cups: "Prevents the Pokemon from being forced to switch out"
  // Source: Showdown data/abilities.ts — Suction Cups onDragOut
  const { defender } = ctx;
  if (defender.ability === GEN4_ABILITY_IDS.suctionCups) {
    const dName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    return makeResult({ messages: [`${dName} anchored itself with Suction Cups!`] });
  }
  // Ingrain: prevents forced switch (rooted Pokemon cannot be phazed)
  // Source: Showdown Gen 4 — onDragOut checks Ingrain volatile alongside Suction Cups
  // Source: Bulbapedia — Ingrain: "The user can't be switched out by Whirlwind, Roar, etc."
  if (defender.volatileStatuses.has(CORE_VOLATILE_IDS.ingrain)) {
    const dName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
    return makeResult({ messages: [`${dName} anchored itself with its roots!`] });
  }
  // Set both switchOut and forcedSwitch so the engine processes phazing correctly.
  // switchOut alone = voluntary switch; forcedSwitch = opponent forced to swap to random Pokemon.
  return makeResult({
    switchOut: true,
    forcedSwitch: true,
    messages: [],
  });
}

function handleCounter(ctx: MoveEffectContext): MoveEffectResult {
  // Counter: returns 2x the physical damage taken this turn
  // Source: Showdown Gen 4 sim — Counter returns double physical damage received this turn
  // Source: Bulbapedia — "Counter deals damage equal to twice the damage dealt by the
  //   last physical move that hit the user"
  const { attacker } = ctx;
  if (
    attacker.lastDamageTaken <= 0 ||
    attacker.lastDamageCategory !== CORE_MOVE_CATEGORIES.physical
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }
  return makeResult({
    customDamage: {
      target: BATTLE_EFFECT_TARGETS.defender,
      amount: attacker.lastDamageTaken * 2,
      source: GEN4_MOVE_IDS.counter,
    },
    messages: [],
  });
}

function handleMirrorCoat(ctx: MoveEffectContext): MoveEffectResult {
  // Mirror Coat: returns 2x the special damage taken this turn
  // Source: Showdown Gen 4 sim — Mirror Coat returns double special damage received this turn
  // Source: Bulbapedia — "Mirror Coat deals damage equal to twice the damage dealt by the
  //   last special move that hit the user"
  const { attacker } = ctx;
  if (
    attacker.lastDamageTaken <= 0 ||
    attacker.lastDamageCategory !== CORE_MOVE_CATEGORIES.special
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }
  return makeResult({
    customDamage: {
      target: BATTLE_EFFECT_TARGETS.defender,
      amount: attacker.lastDamageTaken * 2,
      source: GEN4_MOVE_IDS.mirrorCoat,
    },
    messages: [],
  });
}

function handlePowerSwap(ctx: MoveEffectContext): MoveEffectResult {
  // Swap Atk and SpAtk stat stages between attacker and defender.
  // Source: Showdown Gen 4 mod — Power Swap swaps Attack and SpAtk stat boosts/drops
  // Source: Bulbapedia — Power Swap: "The user swaps its Attack and Sp. Atk stat
  //   changes with the target's."
  const { attacker, defender } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  const tempAtk = attacker.statStages.attack;
  const tempSpAtk = attacker.statStages.spAttack;
  attacker.statStages.attack = defender.statStages.attack;
  attacker.statStages.spAttack = defender.statStages.spAttack;
  defender.statStages.attack = tempAtk;
  defender.statStages.spAttack = tempSpAtk;

  return makeResult({
    messages: [`${attackerName} switched all changes to its Attack and Sp. Atk with the target!`],
  });
}

function handleGuardSwap(ctx: MoveEffectContext): MoveEffectResult {
  // Swap Def and SpDef stat stages between attacker and defender.
  // Source: Showdown Gen 4 mod — Guard Swap swaps Defense and SpDef stat boosts/drops
  // Source: Bulbapedia — Guard Swap: "The user swaps its Defense and Sp. Def stat
  //   changes with the target's."
  const { attacker, defender } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  const tempDef = attacker.statStages.defense;
  const tempSpDef = attacker.statStages.spDefense;
  attacker.statStages.defense = defender.statStages.defense;
  attacker.statStages.spDefense = defender.statStages.spDefense;
  defender.statStages.defense = tempDef;
  defender.statStages.spDefense = tempSpDef;

  return makeResult({
    messages: [`${attackerName} switched all changes to its Defense and Sp. Def with the target!`],
  });
}

function handleHeartSwap(ctx: MoveEffectContext): MoveEffectResult {
  // Swap ALL stat stages between attacker and defender.
  // Source: Showdown Gen 4 mod — Heart Swap swaps all stat stage changes
  // Source: Bulbapedia — Heart Swap: "The user swaps all stat changes with the target."
  const { attacker, defender } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const allStats: Array<keyof typeof attacker.statStages> = [
    CORE_STAT_IDS.attack,
    CORE_STAT_IDS.defense,
    CORE_STAT_IDS.spAttack,
    CORE_STAT_IDS.spDefense,
    CORE_STAT_IDS.speed,
    CORE_STAT_IDS.accuracy,
    CORE_STAT_IDS.evasion,
  ];
  for (const stat of allStats) {
    const temp = attacker.statStages[stat];
    attacker.statStages[stat] = defender.statStages[stat];
    defender.statStages[stat] = temp;
  }
  return makeResult({
    messages: [`${attackerName} swapped all stat changes with the target!`],
  });
}

function handleAcupressure(ctx: MoveEffectContext): MoveEffectResult {
  // Acupressure: +2 to a random stat stage (from stats not already at +6).
  // Source: Showdown Gen 4 mod — Acupressure boosts a random stat by 2
  // Source: Bulbapedia — Acupressure: "Sharply raises one of the user's stats at random"
  const { attacker, rng } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const allStats: BattleStat[] = [
    CORE_STAT_IDS.attack,
    CORE_STAT_IDS.defense,
    CORE_STAT_IDS.spAttack,
    CORE_STAT_IDS.spDefense,
    CORE_STAT_IDS.speed,
    CORE_STAT_IDS.accuracy,
    CORE_STAT_IDS.evasion,
  ];
  const boostableStats = allStats.filter((stat) => attacker.statStages[stat] < 6);
  if (boostableStats.length === 0) {
    return makeResult({ messages: ["But it failed!"] });
  }
  const chosenIndex = rng.int(0, boostableStats.length - 1);
  const chosen = boostableStats[chosenIndex] as BattleStat;
  return makeResult({
    statChanges: [
      {
        target: BATTLE_EFFECT_TARGETS.attacker,
        stat: chosen,
        stages: 2,
      },
    ],
    messages: [`${attackerName}'s ${chosen} rose sharply!`],
  });
}

function handleGhostCurse(ctx: MoveEffectContext): MoveEffectResult {
  // Curse (Ghost-type): user loses 1/2 max HP, target gets "curse" volatile.
  // Non-Ghost Curse (stat changes) is handled by data-driven effect (stat-change type).
  // Ghost-type Curse is intercepted by ID + type check.
  // Source: Showdown Gen 4 mod — Ghost Curse: user sacrifices 1/2 HP, target gets cursed
  // Source: Bulbapedia — Curse: "If the user is a Ghost-type, the user loses 1/2 of its
  //   maximum HP and the target is cursed."
  const { attacker, defender } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const defenderName = defender.pokemon.nickname ?? "The foe";
  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
  const hpCost = Math.max(1, Math.floor(maxHp / 2));
  // Already cursed — fail
  if (defender.volatileStatuses.has(CORE_VOLATILE_IDS.curse)) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // HP sacrifice uses recoilDamage (direct HP subtraction) not customDamage,
  // because customDamage routes through applyCustomDamage() which checks
  // substitute and survival items — Ghost Curse's HP cost bypasses both.
  // Source: pokeplatinum/res/battle/scripts/subscripts/subscript_curse_ghost.s —
  //   HP_CALC_TEMP = -maxHP/2, BATTLE_SUBSCRIPT_UPDATE_HP on ATTACKER (direct HP change)
  return makeResult({
    recoilDamage: hpCost,
    volatileInflicted: CORE_VOLATILE_IDS.curse,
    messages: [`${attackerName} cut its own HP and laid a curse on ${defenderName}!`],
  });
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Handle Gen 4 combat moves.
 *
 * Returns a MoveEffectResult if this is a recognized combat move,
 * or null if not recognized (caller should try other handlers).
 *
 * For Ghost Curse: returns null if the attacker is not Ghost type
 * (falls through to data-driven stat-change handler).
 *
 * @param ctx - Full move execution context
 * @returns MoveEffectResult if handled, or null if unrecognized
 */
export function handleGen4CombatMove(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case GEN4_MOVE_IDS.bellyDrum:
      return handleBellyDrum(ctx);
    case GEN4_MOVE_IDS.explosion:
    case GEN4_MOVE_IDS.selfDestruct:
      return handleExplosionSelfDestruct(ctx);
    case GEN4_MOVE_IDS.batonPass:
      return handleBatonPass(ctx);
    case GEN4_MOVE_IDS.perishSong:
      return handlePerishSong(ctx);
    case GEN4_MOVE_IDS.painSplit:
      return handlePainSplit(ctx);
    case GEN4_MOVE_IDS.moonlight:
    case GEN4_MOVE_IDS.morningSun:
    case GEN4_MOVE_IDS.synthesis:
      return handleWeatherHeal(ctx, ctx.move.id);
    case GEN4_MOVE_IDS.futureSight:
      return handleFutureSight(ctx);
    case GEN4_MOVE_IDS.whirlwind:
    case GEN4_MOVE_IDS.roar:
      return handleWhirlwindRoar(ctx);
    case GEN4_MOVE_IDS.counter:
      return handleCounter(ctx);
    case GEN4_MOVE_IDS.mirrorCoat:
      return handleMirrorCoat(ctx);
    case GEN4_MOVE_IDS.powerSwap:
      return handlePowerSwap(ctx);
    case GEN4_MOVE_IDS.guardSwap:
      return handleGuardSwap(ctx);
    case GEN4_MOVE_IDS.heartSwap:
      return handleHeartSwap(ctx);
    case GEN4_MOVE_IDS.acupressure:
      return handleAcupressure(ctx);
    case GEN4_MOVE_IDS.curse:
      // Only intercept Ghost-type Curse; non-Ghost falls through to data-driven handler
      if (ctx.attacker.types.includes(CORE_TYPE_IDS.ghost)) {
        return handleGhostCurse(ctx);
      }
      return null;
    default:
      return null;
  }
}
