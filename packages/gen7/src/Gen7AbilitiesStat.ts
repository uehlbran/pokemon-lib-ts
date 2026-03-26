import {
  type AbilityContext,
  type AbilityEffect,
  type AbilityResult,
  BATTLE_ABILITY_EFFECT_TYPES,
  BATTLE_EFFECT_TARGETS,
} from "@pokemon-lib-ts/battle";
import type { MoveCategory } from "@pokemon-lib-ts/core";
import { CORE_STAT_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";

/**
 * Gen 7 stat-modifying, priority, and KO-trigger ability handlers.
 *
 * Carries forward all Gen 6 stat/priority abilities and applies Gen 7 changes:
 *   - Prankster: status moves FAIL vs Dark-type targets (NEW nerf in Gen 7)
 *   - Gale Wings: +1 priority ONLY at full HP (NEW nerf in Gen 7, was unconditional in Gen 6)
 *   - Triage (NEW): +3 priority to healing moves
 *   - Beast Boost (NEW): +1 to highest stat on KO
 *   - Stamina (NEW): +1 Def when hit by any damaging move
 *   - Weak Armor: -1 Def, +2 Speed on physical hit (was +1 Speed in Gen 5-6)
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen7/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The 7 stats eligible for Moody in Gen 5-7 (including accuracy/evasion).
 * Source: Showdown data/mods/gen7/abilities.ts -- Moody iterates all boost IDs
 */
const ALL_MOODY_STATS = [
  "attack",
  "defense",
  "spAttack",
  "spDefense",
  "speed",
  "accuracy",
  "evasion",
] as const;

type MoodyStat = (typeof ALL_MOODY_STATS)[number];

/**
 * The 5 battle stats for Beast Boost (excludes HP, accuracy, evasion).
 * Source: Showdown data/abilities.ts -- beastboost: checks atk/def/spa/spd/spe
 */
const BEAST_BOOST_STATS = ["attack", "defense", "spAttack", "spDefense", "speed"] as const;

type BeastBoostStat = (typeof BEAST_BOOST_STATS)[number];

// ---------------------------------------------------------------------------
// Inactive result sentinel
// ---------------------------------------------------------------------------

const INACTIVE: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the display name for a Pokemon, falling back to speciesId. */
function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

/**
 * Main entry point for Gen 7 stat/priority ability handling.
 */
export function handleGen7StatAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (ctx.trigger) {
    case "on-priority-check":
      return handlePriorityCheck(abilityId, ctx);
    case "on-after-move-used":
      return handleAfterMoveUsed(abilityId, ctx);
    case "on-stat-change":
      return handleStatChange(abilityId, ctx);
    case "on-damage-taken":
      return handleDamageTaken(abilityId, ctx);
    case "on-turn-end":
      return handleTurnEnd(abilityId, ctx);
    case "on-flinch":
      return handleFlinch(abilityId, ctx);
    case "on-item-use":
      return handleItemUse(abilityId, ctx);
    case "on-before-move":
      return handleBeforeMove(abilityId, ctx);
    case "passive-immunity":
      return handlePassiveImmunity(abilityId, ctx);
    default:
      return INACTIVE;
  }
}

// ---------------------------------------------------------------------------
// on-priority-check
// ---------------------------------------------------------------------------

/**
 * Handle "on-priority-check" abilities.
 *
 * Prankster: +1 priority to status moves. In Gen 7, status moves with Prankster
 * priority FAIL against Dark-type targets.
 * Gale Wings (Gen 7): +1 priority to Flying moves ONLY when at full HP.
 * Triage (Gen 7 NEW): +3 priority to healing moves.
 *
 * Source: Showdown data/abilities.ts -- Prankster onModifyPriority
 * Source: Bulbapedia "Prankster" Gen 7 -- "status moves fail against Dark-type targets"
 * Source: Bulbapedia "Gale Wings" Gen 7 -- "only at full HP"
 * Source: Bulbapedia "Triage" Gen 7 -- "+3 priority to healing moves"
 */
function handlePriorityCheck(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "prankster": {
      if (!ctx.move) return INACTIVE;
      // Only boosts status moves
      // Source: Showdown data/abilities.ts -- move.category === 'Status'
      if (ctx.move.category !== "status") return INACTIVE;
      const name = getName(ctx);
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Prankster boosted the move's priority!`],
        priorityBoost: 1,
      };
    }

    case "gale-wings": {
      // Gale Wings (Gen 7): +1 priority to Flying moves ONLY at full HP.
      // This is a Gen 7 nerf: Gen 6 had no HP restriction.
      // Source: Bulbapedia "Gale Wings" Gen 7 -- "only activates when at full HP"
      // Source: Showdown data/abilities.ts -- galeWings: requires pokemon.hp === pokemon.maxhp
      if (!ctx.move) return INACTIVE;
      if (ctx.move.type !== CORE_TYPE_IDS.flying) return INACTIVE;
      // Gen 7 nerf: must be at full HP
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      if (ctx.pokemon.pokemon.currentHp < maxHp) return INACTIVE;
      const name = getName(ctx);
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Gale Wings boosted the move's priority!`],
        priorityBoost: 1,
      };
    }

    case "triage": {
      // Triage (new in Gen 7): +3 priority to healing moves.
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3 for heal moves
      // Source: Bulbapedia "Triage" -- "Increases the priority of healing moves by 3"
      if (!ctx.move) return INACTIVE;
      if (!isHealingMove(ctx.move.id, ctx.move.effect?.type ?? null)) return INACTIVE;
      const name = getName(ctx);
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Triage boosted the move's priority!`],
        priorityBoost: 3,
      };
    }

    case "stall": {
      // Stall: user always goes last in its priority bracket.
      // Handled by the turn order resolver rather than through priority number.
      // Source: Showdown data/abilities.ts -- stall: onModifyPriority: -0.1
      return INACTIVE; // Handled in resolveTurnOrder
    }

    default:
      return INACTIVE;
  }
}

/**
 * Check if a move is considered a "healing move" for Triage.
 * Source: Showdown data/abilities.ts -- triage: move.flags.heal
 * Source: Bulbapedia "Triage" -- lists specific healing moves
 */
function isHealingMove(moveId: string, effectType: string | null): boolean {
  // Drain moves and recovery moves are healing moves
  // Source: Showdown data/moves.ts -- drain moves have flags.heal
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
    // Recovery moves
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

  if (HEALING_MOVES.has(moveId)) return true;
  if (effectType === "drain") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Prankster Dark-type immunity check
// ---------------------------------------------------------------------------

/**
 * Check if a Prankster-boosted status move fails against a Dark-type target.
 *
 * Gen 7 nerf: status moves boosted by Prankster have no effect on Dark-type Pokemon.
 * This is checked separately from priority because the move still gains priority;
 * it just fails on execution.
 *
 * Source: Showdown data/abilities.ts -- prankster: onModifyMove adds
 *   pranksterBoosted flag, then Dark targets check that flag to block the move
 * Source: Bulbapedia "Prankster" Gen 7 -- "Status moves that are boosted by
 *   Prankster will fail against Dark-type targets."
 */
export function isPranksterBlockedByDarkType(
  attackerAbility: string,
  moveCategory: MoveCategory,
  defenderTypes: readonly string[],
): boolean {
  if (attackerAbility !== "prankster") return false;
  if (moveCategory !== "status") return false;
  return defenderTypes.includes("dark");
}

// ---------------------------------------------------------------------------
// Gale Wings full-HP check
// ---------------------------------------------------------------------------

/**
 * Check if Gale Wings grants priority in Gen 7 (requires full HP).
 *
 * Source: Showdown data/abilities.ts -- galeWings Gen 7: requires full HP
 * Source: Bulbapedia "Gale Wings" Gen 7 -- "only at full HP"
 */
export function isGaleWingsActive(
  abilityId: string,
  moveType: string,
  currentHp: number,
  maxHp: number,
): boolean {
  if (abilityId !== "gale-wings") return false;
  if (moveType !== CORE_TYPE_IDS.flying) return false;
  return currentHp >= maxHp;
}

// ---------------------------------------------------------------------------
// Triage priority check
// ---------------------------------------------------------------------------

/**
 * Get the Triage priority bonus for a move (+3 for healing moves, 0 otherwise).
 *
 * Source: Showdown data/abilities.ts -- triage: onModifyPriority +3
 * Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
 */
export function getTriagePriorityBonus(
  abilityId: string,
  moveId: string,
  effectType: string | null,
): number {
  if (abilityId !== "triage") return 0;
  if (!isHealingMove(moveId, effectType)) return 0;
  return 3;
}

// ---------------------------------------------------------------------------
// on-before-move
// ---------------------------------------------------------------------------

/**
 * Handle "on-before-move" abilities.
 *
 * Protean: change the user's type to match the move type before attacking.
 *
 * Source: Bulbapedia "Protean" -- "changes type to match move type before using it"
 * Source: Showdown data/abilities.ts -- protean: onPrepareHit
 */
function handleBeforeMove(abilityId: string, ctx: AbilityContext): AbilityResult {
  if (abilityId !== "protean") return INACTIVE;
  if (!ctx.move) return INACTIVE;

  const moveType = ctx.move.type;
  // Only activates if the Pokemon's types do not already include the move's type
  // Source: Showdown data/abilities.ts -- protean: if type matches, no change
  if (ctx.pokemon.types.includes(moveType)) return INACTIVE;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
        target: BATTLE_EFFECT_TARGETS.self,
        types: [moveType],
      },
    ],
    messages: [`${name}'s Protean changed its type to ${moveType}!`],
  };
}

// ---------------------------------------------------------------------------
// on-after-move-used (KO triggers)
// ---------------------------------------------------------------------------

/**
 * Handle "on-after-move-used" abilities.
 *
 * Moxie: +1 Attack when causing a faint.
 * Beast Boost (new in Gen 7): +1 to highest stat when causing a faint.
 *
 * Source: Showdown data/abilities.ts -- Moxie, Beast Boost onSourceAfterFaint
 */
function handleAfterMoveUsed(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "moxie":
      return handleMoxie(ctx);
    case "beast-boost":
      return handleBeastBoost(ctx);
    default:
      return INACTIVE;
  }
}

/**
 * Moxie: raises Attack by 1 stage when the user's move KOs the target.
 *
 * Source: Showdown data/abilities.ts -- Moxie onSourceAfterFaint
 */
function handleMoxie(ctx: AbilityContext): AbilityResult {
  if (!ctx.opponent) return INACTIVE;
  if (ctx.opponent.pokemon.currentHp > 0) return INACTIVE;

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.attack,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Moxie raised its Attack!`],
  };
}

/**
 * Beast Boost (new in Gen 7): raises the user's HIGHEST stat by +1 when it causes a faint.
 *
 * Highest stat is determined by the Pokemon's CURRENT effective stat values
 * (after stat stage modifiers), NOT base stats.
 * If tied, priority order: Atk > Def > SpA > SpDef > Spe.
 *
 * Source: Showdown data/abilities.ts -- beastboost: onSourceAfterFaint
 *   let dominated = false; for each stat, check if it's strictly greater
 * Source: Bulbapedia "Beast Boost" -- "raises the user's highest stat by one stage"
 */
function handleBeastBoost(ctx: AbilityContext): AbilityResult {
  if (!ctx.opponent) return INACTIVE;
  if (ctx.opponent.pokemon.currentHp > 0) return INACTIVE;

  const stats = ctx.pokemon.pokemon.calculatedStats;
  if (!stats) return INACTIVE;

  // Find highest stat among the 5 battle stats
  // Priority on tie: Atk > Def > SpA > SpDef > Spe
  // Source: Showdown data/abilities.ts -- beastboost uses order: atk, def, spa, spd, spe
  let bestStat: BeastBoostStat = "attack";
  let bestValue = stats.attack;

  for (const stat of BEAST_BOOST_STATS) {
    const value = stats[stat];
    if (value > bestValue) {
      bestValue = value;
      bestStat = stat;
    }
  }

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: bestStat,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Beast Boost raised its ${formatStatName(bestStat)}!`],
  };
}

// ---------------------------------------------------------------------------
// on-stat-change
// ---------------------------------------------------------------------------

/**
 * Handle "on-stat-change" abilities.
 *
 * Defiant: +2 Attack when any stat is lowered by opponent.
 * Competitive: +2 SpAtk when any stat is lowered by opponent.
 * Contrary: ALL stat changes are reversed.
 * Simple: ALL stat changes are doubled.
 *
 * Source: Showdown data/abilities.ts
 */
function handleStatChange(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "defiant":
      return handleDefiant(ctx);
    case "competitive":
      return handleCompetitive(ctx);
    case "contrary":
      return handleContrary();
    case "simple":
      return handleSimple();
    default:
      return INACTIVE;
  }
}

/**
 * Defiant: +2 Attack when any of the user's stats are lowered by an opponent.
 *
 * Source: Showdown data/abilities.ts -- Defiant onAfterEachBoost
 * Source: Bulbapedia -- Defiant: "+2 Attack when any stat lowered by opponent"
 */
function handleDefiant(ctx: AbilityContext): AbilityResult {
  if (!ctx.statChange || ctx.statChange.stages >= 0 || ctx.statChange.source !== "opponent") {
    return INACTIVE;
  }

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.attack,
    stages: 2,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Defiant sharply raised its Attack!`],
  };
}

/**
 * Competitive: +2 SpAtk when any of the user's stats are lowered by an opponent.
 *
 * Source: Showdown data/abilities.ts -- Competitive onAfterEachBoost
 * Source: Bulbapedia -- Competitive: "+2 SpAtk when any stat lowered by opponent"
 */
function handleCompetitive(ctx: AbilityContext): AbilityResult {
  if (!ctx.statChange || ctx.statChange.stages >= 0 || ctx.statChange.source !== "opponent") {
    return INACTIVE;
  }

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.spAttack,
    stages: 2,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Competitive sharply raised its Special Attack!`],
  };
}

/**
 * Contrary: reverses all stat changes.
 *
 * Source: Showdown data/abilities.ts -- Contrary onChangeBoost
 */
function handleContrary(): AbilityResult {
  return {
    activated: true,
    effects: [],
    messages: [],
  };
}

/**
 * Simple: doubles all stat changes.
 *
 * Source: Showdown data/abilities.ts -- Simple onChangeBoost
 */
function handleSimple(): AbilityResult {
  return {
    activated: true,
    effects: [],
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// on-damage-taken
// ---------------------------------------------------------------------------

/**
 * Handle "on-damage-taken" abilities.
 *
 * Justified: +1 Attack when hit by a Dark-type move.
 * Weak Armor (Gen 7): -1 Def, +2 Speed on physical hit (was +1 Speed in Gen 5-6).
 * Stamina (new in Gen 7): +1 Defense when hit by any damaging move.
 * Rattled: +1 Speed when hit by Bug, Ghost, or Dark-type move.
 *
 * Source: Showdown data/abilities.ts -- Justified, Weak Armor, Stamina, Rattled
 */
function handleDamageTaken(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "justified":
      return handleJustified(ctx);
    case "weak-armor":
      return handleWeakArmor(ctx);
    case "stamina":
      return handleStamina(ctx);
    case "rattled":
      return handleRattled(ctx);
    default:
      return INACTIVE;
  }
}

/**
 * Justified: raises Attack by 1 stage when hit by a Dark-type move.
 *
 * Source: Showdown data/abilities.ts -- Justified onDamagingHit
 */
function handleJustified(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return INACTIVE;
  if (ctx.move.type !== "dark") return INACTIVE;

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.attack,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Justified raised its Attack!`],
  };
}

/**
 * Weak Armor (Gen 7): -1 Def, +2 Speed when hit by a physical move.
 * Changed from Gen 5-6 where it was -1 Def, +1 Speed.
 *
 * Source: Showdown data/abilities.ts -- Weak Armor Gen 7: spe +2
 * Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6: spe +1
 * Source: Bulbapedia "Weak Armor" -- "From Generation VII onwards, Speed is
 *   raised by 2 stages instead of 1."
 */
function handleWeakArmor(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return INACTIVE;
  if (ctx.move.category !== "physical") return INACTIVE;

  const name = getName(ctx);
  const defEffect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.defense,
    stages: -1,
  };
  const spdEffect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.speed,
    stages: 2, // Gen 7: +2 Speed (was +1 in Gen 5-6)
  };
  return {
    activated: true,
    effects: [defEffect, spdEffect],
    messages: [`${name}'s Weak Armor lowered its Defense and sharply raised its Speed!`],
  };
}

/**
 * Stamina (new in Gen 7): raises Defense by 1 stage when hit by any damaging move.
 *
 * Source: Showdown data/abilities.ts -- Stamina onDamagingHit
 * Source: Bulbapedia "Stamina" -- "+1 Defense when hit by a damage-dealing move"
 */
function handleStamina(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return INACTIVE;
  // Stamina triggers on any damaging move (physical or special)
  if (ctx.move.category === "status") return INACTIVE;

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.defense,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Stamina raised its Defense!`],
  };
}

/**
 * Rattled: raises Speed by 1 stage when hit by a Bug, Ghost, or Dark-type move.
 *
 * Source: Showdown data/abilities.ts -- Rattled onDamagingHit
 * Source: Bulbapedia "Rattled" -- "+1 Speed when hit by Bug/Ghost/Dark move"
 */
function handleRattled(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return INACTIVE;
  if (ctx.move.type !== "bug" && ctx.move.type !== "ghost" && ctx.move.type !== "dark") {
    return INACTIVE;
  }

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.speed,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Rattled raised its Speed!`],
  };
}

// ---------------------------------------------------------------------------
// on-turn-end
// ---------------------------------------------------------------------------

/**
 * Handle "on-turn-end" abilities.
 *
 * Speed Boost: +1 Speed at end of each turn.
 * Moody: +2 random stat, -1 different random stat at end of turn.
 *
 * Source: Showdown data/abilities.ts -- Speed Boost, Moody onResidual
 */
function handleTurnEnd(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "speed-boost":
      return handleSpeedBoost(ctx);
    case "moody":
      return handleMoody(ctx);
    default:
      return INACTIVE;
  }
}

/**
 * Speed Boost: raises Speed by 1 stage at the end of each turn.
 * Only triggers if turnsOnField > 0.
 *
 * Source: Showdown data/abilities.ts -- Speed Boost onResidual
 */
function handleSpeedBoost(ctx: AbilityContext): AbilityResult {
  if (ctx.pokemon.turnsOnField === 0) return INACTIVE;

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.speed,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Speed Boost raised its Speed!`],
  };
}

/**
 * Moody: raises one random stat by 2 stages and lowers a different random stat
 * by 1 stage at the end of each turn.
 *
 * Gen 5-7: ALL 7 stats eligible (including accuracy/evasion).
 *
 * Source: Showdown data/mods/gen7/abilities.ts -- Moody onResidual (Gen 5-7)
 */
function handleMoody(ctx: AbilityContext): AbilityResult {
  const stages = ctx.pokemon.statStages;
  const name = getName(ctx);

  // Build pool of stats eligible for +2 (not already at +6)
  const plusPool: MoodyStat[] = [];
  for (const stat of ALL_MOODY_STATS) {
    if ((stages[stat] ?? 0) < 6) {
      plusPool.push(stat);
    }
  }

  const raisedStat: MoodyStat | undefined =
    plusPool.length > 0 ? ctx.rng.pick(plusPool) : undefined;

  // Build pool of stats eligible for -1 (not already at -6, different from raised)
  const minusPool: MoodyStat[] = [];
  for (const stat of ALL_MOODY_STATS) {
    if ((stages[stat] ?? 0) > -6 && stat !== raisedStat) {
      minusPool.push(stat);
    }
  }

  const loweredStat: MoodyStat | undefined =
    minusPool.length > 0 ? ctx.rng.pick(minusPool) : undefined;

  const effects: AbilityEffect[] = [];
  const messages: string[] = [];

  if (raisedStat) {
    effects.push({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
      target: BATTLE_EFFECT_TARGETS.self,
      stat: raisedStat,
      stages: 2,
    });
    messages.push(`${name}'s Moody sharply raised its ${formatStatName(raisedStat)}!`);
  }

  if (loweredStat) {
    effects.push({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
      target: BATTLE_EFFECT_TARGETS.self,
      stat: loweredStat,
      stages: -1,
    });
    messages.push(`${name}'s Moody lowered its ${formatStatName(loweredStat)}!`);
  }

  return {
    activated: effects.length > 0,
    effects,
    messages,
  };
}

// ---------------------------------------------------------------------------
// on-flinch
// ---------------------------------------------------------------------------

/**
 * Handle "on-flinch" abilities.
 *
 * Steadfast: +1 Speed when flinched.
 *
 * Source: Showdown data/abilities.ts -- Steadfast onFlinch
 */
function handleFlinch(abilityId: string, ctx: AbilityContext): AbilityResult {
  if (abilityId !== "steadfast") return INACTIVE;

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.speed,
    stages: 1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Steadfast raised its Speed!`],
  };
}

// ---------------------------------------------------------------------------
// on-item-use
// ---------------------------------------------------------------------------

/**
 * Handle "on-item-use" abilities.
 *
 * Unnerve: prevents the opponent from consuming Berries.
 *
 * Source: Showdown data/abilities.ts -- Unnerve onFoeTryEatItem
 */
function handleItemUse(abilityId: string, ctx: AbilityContext): AbilityResult {
  if (abilityId !== "unnerve") return INACTIVE;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [],
    messages: [`${name}'s Unnerve prevents the opponent from eating Berries!`],
  };
}

// ---------------------------------------------------------------------------
// passive-immunity
// ---------------------------------------------------------------------------

/**
 * Handle "passive-immunity" abilities in the stat module.
 * Currently unused -- retained for forward compatibility.
 */
function handlePassiveImmunity(_abilityId: string, _ctx: AbilityContext): AbilityResult {
  return INACTIVE;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Format a stat ID as a human-readable name for messages. */
function formatStatName(stat: string): string {
  switch (stat) {
    case "attack":
      return "Attack";
    case "defense":
      return "Defense";
    case "spAttack":
      return "Special Attack";
    case "spDefense":
      return "Special Defense";
    case "speed":
      return "Speed";
    case "accuracy":
      return "Accuracy";
    case "evasion":
      return "Evasion";
    default:
      return stat;
  }
}

// ---------------------------------------------------------------------------
// Re-exports for testing convenience
// ---------------------------------------------------------------------------

/**
 * Check if a move category qualifies as a status move for Prankster.
 * Exported for testability.
 *
 * Source: Showdown data/abilities.ts -- Prankster checks move.category === 'Status'
 */
export function isPranksterEligible(category: MoveCategory): boolean {
  return category === "status";
}
