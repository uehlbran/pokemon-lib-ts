import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { MoveCategory, VolatileStatus } from "@pokemon-lib-ts/core";
import { CORE_STAT_IDS, CORE_TYPE_IDS, CORE_VOLATILE_IDS } from "@pokemon-lib-ts/core";
import { GEN6_MOVE_IDS, GEN6_SPECIES_IDS } from "./data/reference-ids";

/**
 * Gen 6 stat-modifying and priority ability handlers.
 *
 * Carries forward all Gen 5 stat/priority abilities and adds Gen 6 newcomers:
 *   - Competitive: +2 SpAtk when any stat is lowered by opponent (existed in Gen 5, carried forward)
 *   - Gale Wings: +1 priority to Flying moves (NO HP check in Gen 6; Gen 7 added full-HP restriction)
 *   - Protean: type changes to match move type before attacking
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
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
 * Main entry point for Gen 6 stat/priority ability handling.
 */
export function handleGen6StatAbility(ctx: AbilityContext): AbilityResult {
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
 * Prankster: +1 priority to status moves.
 * Gale Wings (Gen 6): +1 priority to Flying moves. NO HP restriction in Gen 6.
 *
 * Source: Showdown data/abilities.ts -- Prankster onModifyPriority
 * Source: Bulbapedia "Gale Wings" Gen 6 -- "Gives +1 priority to Flying-type moves."
 *   Gen 7 added: "only when the user is at full HP."
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
      // Gale Wings (Gen 6): +1 priority to ALL Flying-type moves.
      // IMPORTANT: Gen 6 has NO HP restriction. Gen 7 added the full-HP check.
      // Source: Bulbapedia "Gale Wings" -- "In Generations VI, Flying-type moves used
      //   by a Pokemon with Gale Wings will have their priority increased by 1."
      // Source: Showdown data/mods/gen6/abilities.ts -- galeWings has no HP check
      if (!ctx.move) return INACTIVE;
      if (ctx.move.type !== CORE_TYPE_IDS.flying) return INACTIVE;
      const name = getName(ctx);
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Gale Wings boosted the move's priority!`],
        priorityBoost: 1,
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
 * Protean: change the user's type to match the move type before attacking.
 *
 * Source: Bulbapedia "Protean" Gen 6 -- "When a Pokemon with Protean uses a move,
 *   it changes its type to match the type of the move it is about to use."
 * Source: Showdown data/abilities.ts -- protean: onPrepareHit
 */
function handleBeforeMove(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "protean": {
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

    case "stance-change": {
      // Source: Showdown data/abilities.ts -- stancechange onBeforeMove:
      //   If using King's Shield and in Blade Forme => change to Shield Forme
      //   If using a damaging move and in Shield Forme => change to Blade Forme
      // Source: Bulbapedia "Stance Change" -- "Changes from Shield Forme to Blade Forme
      //   before using an attack move and from Blade Forme to Shield Forme when using
      //   King's Shield."
      // Only Aegislash (species 681) has Stance Change
      if (ctx.pokemon.pokemon.speciesId !== GEN6_SPECIES_IDS.aegislash) return INACTIVE;
      if (!ctx.move) return INACTIVE;

      const name = getName(ctx);
      const isBladeForm = ctx.pokemon.volatileStatuses.has(
        CORE_VOLATILE_IDS.stanceChangeBlade as VolatileStatus,
      );

      if (ctx.move.id === GEN6_MOVE_IDS.kingsShield && isBladeForm) {
        // Blade -> Shield: remove blade volatile
        return {
          activated: true,
          effects: [
            {
              effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileRemove,
              target: BATTLE_EFFECT_TARGETS.self,
              volatile: CORE_VOLATILE_IDS.stanceChangeBlade as VolatileStatus,
            },
          ],
          messages: [`${name} changed to Shield Forme!`],
        };
      }

      if (ctx.move.category !== "status" && !isBladeForm) {
        // Shield -> Blade: add blade volatile
        return {
          activated: true,
          effects: [
            {
              effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
              target: BATTLE_EFFECT_TARGETS.self,
              volatile: CORE_VOLATILE_IDS.stanceChangeBlade as VolatileStatus,
            },
          ],
          messages: [`${name} changed to Blade Forme!`],
        };
      }

      return INACTIVE;
    }

    default:
      return INACTIVE;
  }
}

// ---------------------------------------------------------------------------
// on-after-move-used
// ---------------------------------------------------------------------------

/**
 * Handle "on-after-move-used" abilities.
 *
 * Moxie: raises Attack by 1 stage when the user's move KOs the target.
 *
 * Source: Showdown data/abilities.ts -- Moxie onSourceAfterFaint
 */
function handleAfterMoveUsed(abilityId: string, ctx: AbilityContext): AbilityResult {
  if (abilityId !== "moxie") return INACTIVE;
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
 * Weak Armor (Gen 5-6): -1 Def, +1 Speed on physical hit.
 *
 * Source: Showdown data/abilities.ts -- Justified, Weak Armor
 * Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6: spe +1
 */
function handleDamageTaken(abilityId: string, ctx: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "justified":
      return handleJustified(ctx);
    case "weak-armor":
      return handleWeakArmor(ctx);
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
 * Weak Armor: -1 Def, +1 Speed when hit by a physical move.
 * Gen 5-6: +1 Speed. Gen 7+: +2 Speed.
 *
 * Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6 override
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
    stages: 1,
  };
  return {
    activated: true,
    effects: [defEffect, spdEffect],
    messages: [`${name}'s Weak Armor lowered its Defense and raised its Speed!`],
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
