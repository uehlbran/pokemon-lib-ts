import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import { CORE_STAT_IDS, CORE_TYPE_IDS, type MoveCategory } from "@pokemon-lib-ts/core";

/**
 * Gen 8 stat-modifying, priority, and KO-trigger ability handlers.
 *
 * Carries forward all Gen 7 stat/priority abilities and adds Gen 8 abilities:
 *   - Intrepid Sword (new): +1 Attack on every switch-in (Gen 8 pre-nerf: no once-per-battle limit)
 *   - Dauntless Shield (new): +1 Defense on every switch-in (Gen 8 pre-nerf)
 *   - Cotton Down (new): when hit, lower all adjacent foes' Speed by 1
 *   - Steam Engine (new): +6 Speed when hit by Fire or Water move
 *   - Quick Draw (new): 30% chance to move first
 *   - Moody: Gen 8 excludes accuracy/evasion (only 5 stats eligible, unlike Gen 5-7)
 *
 * Source: Showdown data/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The 5 stats eligible for Moody in Gen 8+ (accuracy/evasion EXCLUDED).
 * Source: Showdown data/abilities.ts -- Moody in Gen 8 only uses atk/def/spa/spd/spe
 * Source: Bulbapedia "Moody" -- "From Generation VIII onwards, Moody can no longer
 *   raise or lower Accuracy or Evasion"
 */
const GEN8_MOODY_STATS = [
  CORE_STAT_IDS.attack,
  CORE_STAT_IDS.defense,
  CORE_STAT_IDS.spAttack,
  CORE_STAT_IDS.spDefense,
  CORE_STAT_IDS.speed,
] as const;

type MoodyStat = (typeof GEN8_MOODY_STATS)[number];

/**
 * The 5 battle stats for Beast Boost (excludes HP, accuracy, evasion).
 * Source: Showdown data/abilities.ts -- beastboost: checks atk/def/spa/spd/spe
 */
const BEAST_BOOST_STATS = [
  CORE_STAT_IDS.attack,
  CORE_STAT_IDS.defense,
  CORE_STAT_IDS.spAttack,
  CORE_STAT_IDS.spDefense,
  CORE_STAT_IDS.speed,
] as const;

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
 * Main entry point for Gen 8 stat/priority ability handling.
 */
export function handleGen8StatAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (ctx.trigger) {
    case "on-priority-check":
      return handlePriorityCheck(abilityId, ctx);
    case "on-switch-in":
      return handleSwitchIn(abilityId, ctx);
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
      return handlePassiveImmunity((_abilityId) => INACTIVE, abilityId, ctx);
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
 * Prankster: +1 priority to status moves. In Gen 7+, status moves with Prankster
 * priority FAIL against Dark-type targets.
 * Gale Wings (Gen 7+): +1 priority to Flying moves ONLY when at full HP.
 * Triage (Gen 7+): +3 priority to healing moves.
 * Quick Draw (new Gen 8): 30% chance to move first.
 *
 * Source: Showdown data/abilities.ts -- Prankster, Gale Wings, Triage, Quick Draw
 */
function handlePriorityCheck(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "prankster": {
      if (!ctx.move) return INACTIVE;
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
      // Gale Wings (Gen 7+): +1 priority to Flying moves ONLY at full HP.
      // Source: Showdown data/abilities.ts -- galeWings: requires pokemon.hp === pokemon.maxhp
      if (!ctx.move) return INACTIVE;
      if (ctx.move.type !== CORE_TYPE_IDS.flying) return INACTIVE;
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
      // Triage: +3 priority to healing moves.
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3 for heal moves
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

    case "quick-draw": {
      // Quick Draw (new in Gen 8): 30% chance to move first.
      // Source: Showdown data/abilities.ts -- quickdraw: onFractionalPriority, 30% chance
      // Source: Bulbapedia "Quick Draw" -- "30% chance to move first in its priority bracket"
      if (!ctx.move) return INACTIVE;
      // Use RNG to check for 30% activation
      if (!ctx.rng.chance(0.3)) return INACTIVE;
      const name = getName(ctx);
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Quick Draw made it move first!`],
      };
    }

    case "stall": {
      // Stall: user always goes last in its priority bracket.
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
 */
function isHealingMove(moveId: string, effectType: string | null): boolean {
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
    // Gen 8 moves with heal flag — Source: Showdown data/moves.ts
    "life-dew",
    "jungle-healing",
  ]);

  if (HEALING_MOVES.has(moveId)) return true;
  if (effectType === "drain") return true;
  // Fallback: treat any move with effectType "heal" as a healing move.
  // This future-proofs against moves added to game data that have the heal flag
  // but are not yet in the HEALING_MOVES allowlist.
  // Source: Showdown data/abilities.ts -- triage: move.flags.heal check
  if (effectType === "heal") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Prankster Dark-type immunity check
// ---------------------------------------------------------------------------

/**
 * Check if a Prankster-boosted status move fails against a Dark-type target.
 *
 * Gen 7+ nerf: status moves boosted by Prankster have no effect on Dark-type Pokemon.
 *
 * Source: Showdown data/abilities.ts -- prankster: Dark targets check pranksterBoosted flag
 * Source: Bulbapedia "Prankster" Gen 7+ -- "status moves fail against Dark-type targets"
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
 * Check if Gale Wings grants priority in Gen 8 (requires full HP, same as Gen 7).
 *
 * Source: Showdown data/abilities.ts -- galeWings: requires full HP
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
// on-switch-in (NEW Gen 8)
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-in" abilities.
 *
 * Intrepid Sword (new in Gen 8): +1 Attack on every switch-in.
 * Dauntless Shield (new in Gen 8): +1 Defense on every switch-in.
 *
 * Note: In Gen 9, these were nerfed to once-per-battle. Gen 8 triggers every switch-in.
 *
 * Source: Showdown data/abilities.ts -- intrepidsword/dauntlessshield: onStart
 * Source: Showdown data/mods/gen8/abilities.ts -- no once flag in Gen 8
 * Source: Bulbapedia "Intrepid Sword" -- "raises Attack by one stage upon entering battle"
 * Source: Bulbapedia "Dauntless Shield" -- "raises Defense by one stage upon entering battle"
 */
function handleSwitchIn(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "intrepid-sword": {
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
        messages: [`${name}'s Intrepid Sword raised its Attack!`],
      };
    }

    case "dauntless-shield": {
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
        messages: [`${name}'s Dauntless Shield raised its Defense!`],
      };
    }

    default:
      return INACTIVE;
  }
}

// ---------------------------------------------------------------------------
// on-before-move
// ---------------------------------------------------------------------------

/**
 * Handle "on-before-move" abilities.
 *
 * Protean/Libero: change the user's type to match the move type before attacking.
 * Libero is new in Gen 8 but mechanically identical to Protean.
 *
 * Source: Showdown data/abilities.ts -- protean/libero: onPrepareHit
 * Source: Bulbapedia "Libero" -- same effect as Protean, introduced in Gen 8
 */
function handleBeforeMove(abilityId: string, ctx: AbilityContext): AbilityResult {
  if (abilityId !== "protean" && abilityId !== "libero") return INACTIVE;
  if (!ctx.move) return INACTIVE;

  const moveType = ctx.move.type;
  if (ctx.pokemon.types.includes(moveType)) return INACTIVE;

  const name = getName(ctx);
  const abilityName = abilityId === "protean" ? "Protean" : "Libero";
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
        target: BATTLE_EFFECT_TARGETS.self,
        types: [moveType],
      },
    ],
    messages: [`${name}'s ${abilityName} changed its type to ${moveType}!`],
  };
}

// ---------------------------------------------------------------------------
// on-after-move-used (KO triggers)
// ---------------------------------------------------------------------------

/**
 * Handle "on-after-move-used" abilities.
 *
 * Moxie: +1 Attack when causing a faint.
 * Beast Boost: +1 to highest stat when causing a faint.
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
 * Beast Boost: raises the user's HIGHEST stat by +1 when it causes a faint.
 *
 * Source: Showdown data/abilities.ts -- beastboost: onSourceAfterFaint
 * Source: Bulbapedia "Beast Boost" -- "raises the user's highest stat by one stage"
 */
function handleBeastBoost(ctx: AbilityContext): AbilityResult {
  if (!ctx.opponent) return INACTIVE;
  if (ctx.opponent.pokemon.currentHp > 0) return INACTIVE;

  const stats = ctx.pokemon.pokemon.calculatedStats;
  if (!stats) return INACTIVE;

  let bestStat: BeastBoostStat = CORE_STAT_IDS.attack;
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
 */
function handleDefiant(ctx: AbilityContext): AbilityResult {
  if (
    !ctx.statChange ||
    ctx.statChange.stages >= 0 ||
    ctx.statChange.source !== BATTLE_EFFECT_TARGETS.opponent
  ) {
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
 */
function handleCompetitive(ctx: AbilityContext): AbilityResult {
  if (
    !ctx.statChange ||
    ctx.statChange.stages >= 0 ||
    ctx.statChange.source !== BATTLE_EFFECT_TARGETS.opponent
  ) {
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

function handleContrary(): AbilityResult {
  return { activated: true, effects: [], messages: [] };
}

function handleSimple(): AbilityResult {
  return { activated: true, effects: [], messages: [] };
}

// ---------------------------------------------------------------------------
// on-damage-taken
// ---------------------------------------------------------------------------

/**
 * Handle "on-damage-taken" abilities.
 *
 * Justified: +1 Attack when hit by a Dark-type move.
 * Weak Armor (Gen 7+): -1 Def, +2 Speed on physical hit.
 * Stamina: +1 Defense when hit by any damaging move.
 * Rattled: +1 Speed when hit by Bug, Ghost, or Dark-type move.
 * Cotton Down (new Gen 8): lower Speed of all adjacent foes by 1 when hit.
 * Steam Engine (new Gen 8): +6 Speed when hit by Fire or Water move.
 *
 * Source: Showdown data/abilities.ts
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
    case "cotton-down":
      return handleCottonDown(ctx);
    case "steam-engine":
      return handleSteamEngine(ctx);
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
 * Weak Armor (Gen 7+): -1 Def, +2 Speed when hit by a physical move.
 *
 * Source: Showdown data/abilities.ts -- Weak Armor Gen 7+: spe +2
 * Source: Bulbapedia "Weak Armor" -- "+2 Speed from Gen VII onwards"
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
    stages: 2,
  };
  return {
    activated: true,
    effects: [defEffect, spdEffect],
    messages: [`${name}'s Weak Armor lowered its Defense and sharply raised its Speed!`],
  };
}

/**
 * Stamina: raises Defense by 1 stage when hit by any damaging move.
 *
 * Source: Showdown data/abilities.ts -- Stamina onDamagingHit
 */
function handleStamina(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return INACTIVE;
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

/**
 * Cotton Down (new in Gen 8): when hit by a damaging move, lowers all adjacent
 * Pokemon's Speed by 1 stage (including allies in doubles, but in singles: just the foe).
 *
 * Source: Showdown data/abilities.ts -- cottondown: onDamagingHit, lowers all adjacent Speed
 * Source: Bulbapedia "Cotton Down" -- "When the Pokemon is hit by an attack, it scatters
 *   cotton fluff around, lowering the Speed stat of all other Pokemon on the field."
 */
function handleCottonDown(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return INACTIVE;
  if (ctx.move.category === "status") return INACTIVE;

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.opponent,
    stat: CORE_STAT_IDS.speed,
    stages: -1,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Cotton Down lowered the opponent's Speed!`],
  };
}

/**
 * Steam Engine (new in Gen 8): raises Speed by 6 stages when hit by Fire or Water move.
 *
 * Source: Showdown data/abilities.ts -- steamengine: onDamagingHit, boost spe: 6
 * Source: Bulbapedia "Steam Engine" -- "raises Speed by 6 stages when hit by a Fire- or
 *   Water-type move"
 */
function handleSteamEngine(ctx: AbilityContext): AbilityResult {
  if (!ctx.move) return INACTIVE;
  if (ctx.move.type !== "fire" && ctx.move.type !== "water") return INACTIVE;

  const name = getName(ctx);
  const effect: AbilityEffect = {
    effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
    target: BATTLE_EFFECT_TARGETS.self,
    stat: CORE_STAT_IDS.speed,
    stages: 6,
  };
  return {
    activated: true,
    effects: [effect],
    messages: [`${name}'s Steam Engine drastically raised its Speed!`],
  };
}

// ---------------------------------------------------------------------------
// on-turn-end
// ---------------------------------------------------------------------------

/**
 * Handle "on-turn-end" abilities.
 *
 * Speed Boost: +1 Speed at end of each turn.
 * Moody (Gen 8): +2 random stat, -1 different random stat at end of turn.
 *   Gen 8 CHANGE: accuracy/evasion excluded from Moody pool.
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
 * Moody (Gen 8): raises one random stat by 2 stages and lowers a different random stat
 * by 1 stage at the end of each turn.
 *
 * Gen 8 CHANGE: Only 5 stats eligible (accuracy/evasion excluded).
 *
 * Source: Showdown data/abilities.ts -- Moody onResidual (Gen 8: no accuracy/evasion)
 * Source: Bulbapedia "Moody" -- "From Generation VIII onwards, Moody can no longer
 *   raise or lower Accuracy or Evasion"
 */
function handleMoody(ctx: AbilityContext): AbilityResult {
  const stages = ctx.pokemon.statStages;
  const name = getName(ctx);

  // Build pool of stats eligible for +2 (not already at +6)
  const plusPool: MoodyStat[] = [];
  for (const stat of GEN8_MOODY_STATS) {
    if ((stages[stat] ?? 0) < 6) {
      plusPool.push(stat);
    }
  }

  const raisedStat: MoodyStat | undefined =
    plusPool.length > 0 ? ctx.rng.pick(plusPool) : undefined;

  // Build pool of stats eligible for -1 (not already at -6, different from raised)
  const minusPool: MoodyStat[] = [];
  for (const stat of GEN8_MOODY_STATS) {
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
// passive-immunity (unused stub)
// ---------------------------------------------------------------------------

function handlePassiveImmunity(
  _fn: (id: string) => AbilityResult,
  _abilityId: string,
  _ctx: AbilityContext,
): AbilityResult {
  return INACTIVE;
}

// ---------------------------------------------------------------------------
// Pure utility functions for new Gen 8 abilities
// ---------------------------------------------------------------------------

/**
 * Check if Intrepid Sword triggers on switch-in.
 * In Gen 8, it triggers every switch-in (no once-per-battle limit).
 *
 * Source: Showdown data/abilities.ts -- intrepidsword: onStart (no once flag in Gen 8)
 * Source: Showdown data/mods/gen9/abilities.ts -- Gen 9 adds once flag
 * Source: Bulbapedia "Intrepid Sword" -- "From Gen IX, only activates once per battle"
 */
export function isIntrepidSwordTrigger(abilityId: string, turnsOnField: number): boolean {
  if (abilityId !== "intrepid-sword") return false;
  return turnsOnField === 0;
}

/**
 * Check if Dauntless Shield triggers on switch-in.
 * In Gen 8, it triggers every switch-in (no once-per-battle limit).
 *
 * Source: Showdown data/abilities.ts -- dauntlessshield: onStart (no once flag in Gen 8)
 * Source: Bulbapedia "Dauntless Shield" -- "From Gen IX, only activates once per battle"
 */
export function isDauntlessShieldTrigger(abilityId: string, turnsOnField: number): boolean {
  if (abilityId !== "dauntless-shield") return false;
  return turnsOnField === 0;
}

/**
 * Check if Cotton Down triggers when hit by a damaging move.
 *
 * Source: Showdown data/abilities.ts -- cottondown: onDamagingHit
 * Source: Bulbapedia "Cotton Down" -- triggers on any damaging move
 */
export function isCottonDownTrigger(abilityId: string): boolean {
  return abilityId === "cotton-down";
}

/**
 * Check if Steam Engine triggers from the incoming move type.
 * Triggers on Fire or Water hits.
 *
 * Source: Showdown data/abilities.ts -- steamengine: onDamagingHit, Fire or Water
 * Source: Bulbapedia "Steam Engine" -- "Fire or Water type move"
 */
export function isSteamEngineTrigger(abilityId: string, moveType: string): boolean {
  if (abilityId !== "steam-engine") return false;
  return moveType === "fire" || moveType === "water";
}

/**
 * Check if Quick Draw activates (30% chance to move first).
 *
 * Source: Showdown data/abilities.ts -- quickdraw: onFractionalPriority, 30% chance
 * Source: Bulbapedia "Quick Draw" -- "30% chance of acting first in its priority bracket"
 *
 * @param rngValue - A float in [0, 1) from the PRNG
 * @returns true if Quick Draw activates (roll < 0.3)
 */
export function isQuickDrawTrigger(abilityId: string, rngValue: number): boolean {
  if (abilityId !== "quick-draw") return false;
  return rngValue < 0.3;
}

// ---------------------------------------------------------------------------
// Re-exports for testing convenience
// ---------------------------------------------------------------------------

/**
 * Check if a move category qualifies as a status move for Prankster.
 *
 * Source: Showdown data/abilities.ts -- Prankster checks move.category === 'Status'
 */
export function isPranksterEligible(category: MoveCategory): boolean {
  return category === "status";
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Format a stat ID as a human-readable name for messages. */
function formatStatName(stat: string): string {
  switch (stat) {
    case CORE_STAT_IDS.attack:
      return "Attack";
    case CORE_STAT_IDS.defense:
      return "Defense";
    case CORE_STAT_IDS.spAttack:
      return "Special Attack";
    case CORE_STAT_IDS.spDefense:
      return "Special Defense";
    case CORE_STAT_IDS.speed:
      return "Speed";
    case CORE_STAT_IDS.accuracy:
      return "Accuracy";
    case CORE_STAT_IDS.evasion:
      return "Evasion";
    default:
      return stat;
  }
}
