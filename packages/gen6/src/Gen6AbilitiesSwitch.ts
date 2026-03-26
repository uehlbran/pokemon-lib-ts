import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger, MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { CORE_STAT_IDS, CORE_VOLATILE_IDS, CORE_WEATHER_IDS } from "@pokemon-lib-ts/core";
import { GEN6_ABILITY_IDS, GEN6_MOVE_IDS } from "./data/reference-ids";

/**
 * Gen 6 switch-in, contact, switch-out, and passive ability handlers.
 *
 * Called from Gen6Abilities.ts dispatch based on trigger type.
 *
 * Covers:
 *   - on-switch-in: Intimidate, Pressure, Drizzle, Drought, Sand Stream,
 *     Snow Warning, Download, Trace, Mold Breaker, Teravolt, Turboblaze,
 *     Imposter, Stance Change (new Gen 6)
 *   - on-switch-out: Regenerator, Natural Cure
 *   - on-contact: Static, Flame Body, Poison Point, Rough Skin, Iron Barbs,
 *     Effect Spore, Cute Charm, Aftermath, Mummy, Poison Touch, Pickpocket
 *   - on-damage-taken: Cursed Body, Rattled, Illusion (reveal)
 *   - on-status-inflicted: Synchronize
 *   - passive-immunity: Levitate, Flash Fire, Water Absorb, Volt Absorb,
 *     Motor Drive, Dry Skin, Overcoat (Gen 6: also blocks powder), Sap Sipper,
 *     Magic Guard, Storm Drain, Lightning Rod, Sand Rush,
 *     Bulletproof (new Gen 6: blocks ball/bomb moves)
 *   - on-stat-change: Big Pecks, Flower Veil (new Gen 6), Aroma Veil (new Gen 6)
 *   - on-accuracy-check: Victory Star
 *   - passive-immunity: Sweet Veil (new Gen 6: blocks sleep)
 *
 * Gen 6 changes from Gen 5:
 *   - Weather abilities (Drizzle, Drought, Sand Stream, Snow Warning) now set
 *     5-turn weather instead of permanent weather.
 *   - Overcoat also blocks powder moves (e.g., Sleep Powder, Spore, Stun Spore).
 *   - New abilities: Stance Change (Aegislash), Aroma Veil (blocks Taunt/Encore etc.),
 *     Sweet Veil (blocks sleep), Flower Veil (blocks stat drops for Grass-type allies),
 *     Bulletproof (blocks ball/bomb moves).
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 */

// ---------------------------------------------------------------------------
// Helper: get display name from ActivePokemon
// ---------------------------------------------------------------------------

function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

function getOpponentName(ctx: AbilityContext): string {
  if (!ctx.opponent) return "the opposing Pokemon";
  return ctx.opponent.pokemon.nickname ?? String(ctx.opponent.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Mold Breaker variants
// Source: Showdown data/abilities.ts — onModifyMove: move.ignoreAbility = true
// ---------------------------------------------------------------------------
export const MOLD_BREAKER_ALIASES: ReadonlySet<string> = new Set([
  GEN6_ABILITY_IDS.moldBreaker,
  GEN6_ABILITY_IDS.teravolt,
  GEN6_ABILITY_IDS.turboblaze,
]);

/**
 * Abilities that cannot be overwritten by Mummy in Gen 6.
 * Gen 6 only has three unsuppressable abilities: Multitype, Stance Change, and Zen Mode.
 * Later gens added more (Schooling, Disguise, RKS System, etc.) but those don't exist in Gen 6.
 *
 * Source: Showdown data/mods/gen6/abilities.ts — cantsuppress flag for Gen 6
 * Source: Showdown data/abilities.ts — { cantsuppress: 1 } flag
 */
export const UNSUPPRESSABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN6_ABILITY_IDS.multitype,
  GEN6_ABILITY_IDS.stanceChange,
  GEN6_ABILITY_IDS.zenMode,
]);

export const TRACE_UNCOPYABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN6_ABILITY_IDS.trace,
  GEN6_ABILITY_IDS.multitype,
  GEN6_ABILITY_IDS.forecast,
  GEN6_ABILITY_IDS.illusion,
  GEN6_ABILITY_IDS.flowerGift,
  GEN6_ABILITY_IDS.imposter,
  GEN6_ABILITY_IDS.zenMode,
  GEN6_ABILITY_IDS.stanceChange,
]);

// Bulletproof uses the move.flags.bullet flag (see handler and isBulletproofBlocked).
// Source: Showdown data/abilities.ts — bulletproof: `move.flags['bullet']`
// Source: Bulbapedia -- Bulletproof: "Protects from ball and bomb moves."

/**
 * Move IDs that Aroma Veil blocks (mental interference moves).
 * Source: Showdown data/abilities.ts — aromaveil: blocks moves targeting mental freedom
 */
export const AROMA_VEIL_BLOCKED_MOVES: ReadonlySet<string> = new Set([
  GEN6_MOVE_IDS.taunt,
  GEN6_MOVE_IDS.encore,
  GEN6_MOVE_IDS.torment,
  GEN6_MOVE_IDS.disable,
  GEN6_MOVE_IDS.healBlock,
  GEN6_MOVE_IDS.attract,
]);

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

const NO_EFFECT: AbilityResult = { activated: false, effects: [], messages: [] };

/**
 * Dispatch a Gen 6 switch-in/contact/passive ability trigger.
 *
 * @param trigger - The ability trigger type
 * @param context - The ability context
 */
export function handleGen6SwitchAbility(
  trigger: AbilityTrigger,
  context: AbilityContext,
): AbilityResult {
  switch (trigger) {
    case "on-switch-in":
      return handleSwitchIn(context);
    case "on-switch-out":
      return handleSwitchOut(context);
    case "on-contact":
      return handleOnContact(context);
    case "on-damage-taken":
      return handleOnDamageTaken(context);
    case "on-status-inflicted":
      return handleOnStatusInflicted(context);
    case "passive-immunity":
      return handlePassiveImmunity(context);
    case "on-stat-change":
      return handleOnStatChange(context);
    case "on-accuracy-check":
      return handleOnAccuracyCheck(context);
    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-switch-in
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-in" abilities for Gen 6.
 *
 * Source: Showdown data/abilities.ts — onStart handlers
 * Source: Showdown data/mods/gen6/abilities.ts — Gen 6 overrides
 */
function handleSwitchIn(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "intimidate": {
      // Source: Showdown data/abilities.ts — Intimidate lowers opponent's Attack by 1 stage
      // Source: Showdown Gen 6 — Intimidate is blocked by Substitute (same as Gen 5)
      if (!ctx.opponent) return NO_EFFECT;
      if (ctx.opponent.substituteHp > 0) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      const effect: AbilityEffect = {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.opponent,
        stat: CORE_STAT_IDS.attack,
        stages: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Intimidate cut ${oppName}'s Attack!`],
      };
    }

    case "pressure": {
      // Source: Showdown data/abilities.ts — Pressure onStart message
      // PP cost increase handled elsewhere (getPPCost)
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is exerting its Pressure!`],
      };
    }

    case "drizzle": {
      // Source: Showdown data/mods/gen6/abilities.ts — Drizzle sets 5-turn rain in Gen 6
      // Gen 6 change: weather from abilities now lasts 5 turns (not permanent as in Gen 5)
      // Source: Bulbapedia — Drizzle Gen VI: "Summons rain for 5 turns on entry."
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.rain,
            weatherTurns: 5,
          },
        ],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case "drought": {
      // Source: Showdown data/mods/gen6/abilities.ts — Drought sets 5-turn sun in Gen 6
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.sun,
            weatherTurns: 5,
          },
        ],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case "sand-stream": {
      // Source: Showdown data/mods/gen6/abilities.ts — Sand Stream sets 5-turn sandstorm in Gen 6
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.sand,
            weatherTurns: 5,
          },
        ],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    case "snow-warning": {
      // Source: Showdown data/mods/gen6/abilities.ts — Snow Warning sets 5-turn hail in Gen 6
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.hail,
            weatherTurns: 5,
          },
        ],
        messages: [`${name}'s Snow Warning made it hail!`],
      };
    }

    case "download": {
      // Source: Showdown data/abilities.ts — Download: compare foe Def vs SpDef
      // If foe Def < foe SpDef, raise Atk; otherwise raise SpAtk
      // Source: Bulbapedia — Download: "Adjusts power based on the foe's lowest Defense stat."
      if (!ctx.opponent) return NO_EFFECT;
      const foeStats = ctx.opponent.pokemon.calculatedStats;
      if (!foeStats) return NO_EFFECT;

      const raisesAtk = foeStats.defense < foeStats.spDefense;
      const stat = raisesAtk ? ("attack" as const) : ("spAttack" as const);
      const statName = raisesAtk ? "Attack" : "Sp. Atk";
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat,
            stages: 1,
          },
        ],
        messages: [`${name}'s Download raised its ${statName}!`],
      };
    }

    case "trace": {
      // Source: Showdown data/abilities.ts — Trace: copies opponent's ability
      // Gen 6 ban list adds Stance Change to the Gen 5 list.
      // Power Construct is Gen 7-only and is not part of the Gen 6 surface.
      if (!ctx.opponent) return NO_EFFECT;
      const opponentAbility = ctx.opponent.ability;
      if (!opponentAbility || TRACE_UNCOPYABLE_ABILITIES.has(opponentAbility)) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.abilityChange,
            target: BATTLE_EFFECT_TARGETS.self,
            newAbility: opponentAbility,
          },
        ],
        messages: [`${name} traced ${oppName}'s ${opponentAbility}!`],
      };
    }

    case "mold-breaker": {
      // Source: Showdown data/abilities.ts — Mold Breaker switch-in announcement
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} breaks the mold!`],
      };
    }

    case "teravolt": {
      // Source: Showdown data/abilities.ts — Teravolt onStart announcement
      // Functionally identical to Mold Breaker; separate message
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is radiating a bursting aura!`],
      };
    }

    case "turboblaze": {
      // Source: Showdown data/abilities.ts — Turboblaze onStart announcement
      // Functionally identical to Mold Breaker; separate message
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is radiating a blazing aura!`],
      };
    }

    case "imposter": {
      // Source: Showdown data/abilities.ts — Imposter: transforms into opponent on switch-in
      // Source: Bulbapedia — Imposter (Ditto): "The Pokemon transforms into the opposing Pokemon
      //   it is facing as soon as it is sent out."
      if (!ctx.opponent) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} transformed into ${oppName}!`],
      };
    }

    case "illusion": {
      // Source: Showdown data/abilities.ts — Illusion: sets volatile on switch-in
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.self,
            volatile: CORE_VOLATILE_IDS.illusion,
          },
        ],
        messages: [],
      };
    }

    case "stance-change": {
      // Source: Showdown data/abilities.ts — Stance Change (Gen 6 new): Aegislash
      // Changes Aegislash between Shield Forme and Blade Forme depending on move used.
      // Switch-in is always Shield Forme; the form change on attack is handled by on-before-move.
      // Source: Bulbapedia — Stance Change: "Changes from Shield Forme to Blade Forme before
      //   using an attack move and from Blade Forme to Shield Forme when using King's Shield."
      // Only species 681 (Aegislash) has Stance Change
      if (ctx.pokemon.pokemon.speciesId !== 681) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-switch-out
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-out" abilities for Gen 6.
 *
 * Source: Showdown data/abilities.ts — onSwitchOut handlers
 */
function handleSwitchOut(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "regenerator": {
      // Source: Showdown data/abilities.ts — Regenerator: heals 1/3 max HP on switch-out
      // Source: Bulbapedia — Regenerator: "Restores 1/3 of its maximum HP upon switching out."
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const healAmount = Math.max(1, Math.floor(maxHp / 3));
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.heal,
            target: BATTLE_EFFECT_TARGETS.self,
            value: healAmount,
          },
        ],
        messages: [`${name}'s Regenerator restored its HP!`],
      };
    }

    case "natural-cure": {
      // Source: Showdown data/abilities.ts — Natural Cure: cures status on switch-out
      // Source: Bulbapedia — Natural Cure: "All status conditions are healed upon switching out."
      if (!ctx.pokemon.pokemon.status) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusCure,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [`${name}'s Natural Cure cured its status!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-contact
// ---------------------------------------------------------------------------

/**
 * Handle "on-contact" abilities for Gen 6.
 *
 * For DEFENDER-side abilities (Static, Flame Body, Poison Point, Rough Skin,
 * Iron Barbs, Effect Spore, Cute Charm, Aftermath, Mummy, Pickpocket):
 *   - ctx.pokemon = the defender (whose ability fires)
 *   - ctx.opponent = the attacker who made contact
 *
 * For ATTACKER-side abilities (Poison Touch):
 *   - ctx.pokemon = the attacker (whose ability fires)
 *   - ctx.opponent = the defender that was hit
 *
 * Source: Showdown data/abilities.ts — onDamagingHit / onSourceDamagingHit handlers
 */
function handleOnContact(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const other = ctx.opponent;
  if (!other) return NO_EFFECT;

  const name = getName(ctx);

  switch (abilityId) {
    case "static": {
      // Source: Showdown data/abilities.ts — Static: 30% paralysis on contact
      // Source: Bulbapedia — Static: "30% chance of paralyzing the attacker on contact."
      const otherStatus = other.pokemon.status;
      if (otherStatus) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: "paralysis",
          },
        ],
        messages: [`${name}'s Static paralyzed the attacker!`],
      };
    }

    case "flame-body": {
      // Source: Showdown data/abilities.ts — Flame Body: 30% burn on contact
      // Source: Bulbapedia — Flame Body: "30% chance of burning the attacker on contact."
      const otherStatus = other.pokemon.status;
      if (otherStatus) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: "burn",
          },
        ],
        messages: [`${name}'s Flame Body burned the attacker!`],
      };
    }

    case "poison-point": {
      // Source: Showdown data/abilities.ts — Poison Point: 30% poison on contact
      // Source: Bulbapedia — Poison Point: "30% chance of poisoning the attacker on contact."
      const otherStatus = other.pokemon.status;
      if (otherStatus) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: "poison",
          },
        ],
        messages: [`${name}'s Poison Point poisoned the attacker!`],
      };
    }

    case "rough-skin":
    case "iron-barbs": {
      // Source: Showdown data/abilities.ts — Rough Skin / Iron Barbs: 1/8 attacker HP on contact
      // Source: Bulbapedia — Rough Skin: "Damages the attacker for 1/8 of its max HP on contact."
      const otherMaxHp = other.pokemon.calculatedStats?.hp ?? other.pokemon.currentHp;
      const chipDamage = Math.max(1, Math.floor(otherMaxHp / 8));
      const abilityName = abilityId === "rough-skin" ? "Rough Skin" : "Iron Barbs";
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.chipDamage,
            target: BATTLE_EFFECT_TARGETS.opponent,
            value: chipDamage,
          },
        ],
        messages: [`${name}'s ${abilityName} hurt the attacker!`],
      };
    }

    case "effect-spore": {
      // Source: Showdown data/abilities.ts — Effect Spore: single random(100) roll
      // 0-9 = sleep, 10-19 = paralysis, 20-29 = poison, 30-99 = nothing
      // Grass types are immune (Gen 5+); Overcoat also blocks in Gen 6+
      // Source: Showdown data/abilities.ts — Gen 5+: Grass-types immune to spore/powder
      // Source: Showdown data/abilities.ts — Gen 6: Overcoat blocks Effect Spore
      const otherStatus = other.pokemon.status;
      if (otherStatus) return NO_EFFECT;
      if (other.types.includes("grass")) return NO_EFFECT;
      // Overcoat blocks powder/spore moves in Gen 6 (including Effect Spore)
      // Source: Showdown data/mods/gen6/abilities.ts — overcoat: blocks powder flag
      if (other.ability === GEN6_ABILITY_IDS.overcoat) return NO_EFFECT;
      const roll = Math.floor(ctx.rng.next() * 100);
      if (roll < 10) {
        return {
          activated: true,
          effects: [
            {
              effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
              target: BATTLE_EFFECT_TARGETS.opponent,
              status: "sleep",
            },
          ],
          messages: [`${name}'s Effect Spore put the attacker to sleep!`],
        };
      }
      if (roll < 20) {
        return {
          activated: true,
          effects: [
            {
              effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
              target: BATTLE_EFFECT_TARGETS.opponent,
              status: "paralysis",
            },
          ],
          messages: [`${name}'s Effect Spore paralyzed the attacker!`],
        };
      }
      if (roll < 30) {
        return {
          activated: true,
          effects: [
            {
              effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
              target: BATTLE_EFFECT_TARGETS.opponent,
              status: "poison",
            },
          ],
          messages: [`${name}'s Effect Spore poisoned the attacker!`],
        };
      }
      return NO_EFFECT;
    }

    case "cute-charm": {
      // Source: Showdown data/abilities.ts — Cute Charm: 30% infatuation on contact
      // Requires opposite genders, fails if genderless
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      const defenderGender = ctx.pokemon.pokemon.gender;
      const attackerGender = other.pokemon.gender;
      if (
        !defenderGender ||
        !attackerGender ||
        defenderGender === "genderless" ||
        attackerGender === "genderless" ||
        defenderGender === attackerGender
      ) {
        return NO_EFFECT;
      }
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            volatile: "infatuation",
          },
        ],
        messages: [`${name}'s Cute Charm infatuated the attacker!`],
      };
    }

    case "aftermath": {
      // Source: Showdown data/abilities.ts — Aftermath: 1/4 attacker HP if holder fainted
      //   by contact move. Only triggers if the holder has 0 HP (fainted).
      const holderHp = ctx.pokemon.pokemon.currentHp;
      if (holderHp > 0) return NO_EFFECT;
      const otherMaxHp = other.pokemon.calculatedStats?.hp ?? other.pokemon.currentHp;
      const chipDamage = Math.max(1, Math.floor(otherMaxHp / 4));
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.chipDamage,
            target: BATTLE_EFFECT_TARGETS.opponent,
            value: chipDamage,
          },
        ],
        messages: [`${name}'s Aftermath hurt the attacker!`],
      };
    }

    case "mummy": {
      // Source: Showdown data/abilities.ts — Mummy: contact changes attacker's ability to Mummy.
      // Cannot overwrite unsuppressable abilities or Mummy itself.
      const otherAbility = other.ability;
      if (
        !otherAbility ||
        otherAbility === GEN6_ABILITY_IDS.mummy ||
        UNSUPPRESSABLE_ABILITIES.has(otherAbility)
      ) {
        return NO_EFFECT;
      }
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.abilityChange,
            target: BATTLE_EFFECT_TARGETS.opponent,
            newAbility: GEN6_ABILITY_IDS.mummy,
          },
        ],
        messages: [`${oppName}'s ability became Mummy!`],
      };
    }

    case "poison-touch": {
      // Source: Showdown data/abilities.ts — Poison Touch: 30% poison on own contact moves.
      // This is an ATTACKER-side ability; ctx.pokemon = attacker, ctx.opponent = defender.
      const otherStatus = other.pokemon.status;
      if (otherStatus) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: "poison",
          },
        ],
        messages: [`${name}'s Poison Touch poisoned the target!`],
      };
    }

    case "pickpocket": {
      // Source: Showdown data/abilities.ts — Pickpocket: steals attacker's item on contact.
      // Only if holder has no item and attacker has an item.
      // ctx.pokemon = defender with Pickpocket, ctx.opponent = attacker
      if (ctx.pokemon.pokemon.heldItem) return NO_EFFECT;
      if (!other.pokemon.heldItem) return NO_EFFECT;
      const stolenItem = other.pokemon.heldItem;
      const oppName = getOpponentName(ctx);

      ctx.pokemon.pokemon.heldItem = stolenItem;
      other.pokemon.heldItem = null;

      // Unburden activates if the victim (attacker) loses its item
      if (
        other.ability === GEN6_ABILITY_IDS.unburden &&
        !other.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
      ) {
        other.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
      }

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Pickpocket stole ${oppName}'s ${stolenItem}!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-damage-taken
// ---------------------------------------------------------------------------

/**
 * Handle "on-damage-taken" abilities for Gen 6.
 *
 * Fires when a Pokemon takes damage from a move. `context.pokemon` is the
 * defender (whose ability fires), `context.opponent` is the attacker.
 *
 * Source: Showdown data/abilities.ts — onDamagingHit / onAfterSetStatus handlers
 */
function handleOnDamageTaken(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "cursed-body": {
      // Source: Showdown data/abilities.ts — Cursed Body: 30% to disable attacker's move
      // Source: Bulbapedia — Cursed Body: "30% chance of disabling the attacker's move."
      if (!ctx.opponent) return NO_EFFECT;
      if (ctx.opponent.volatileStatuses.has("disable")) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            volatile: "disable",
            data: { turnsLeft: 4 },
          },
        ],
        messages: [`${name}'s Cursed Body disabled the attacker's move!`],
      };
    }

    case "rattled": {
      // Source: Showdown data/abilities.ts — Rattled: +1 Speed when hit by Bug/Dark/Ghost move
      const moveType = ctx.move?.type;
      if (!moveType) return NO_EFFECT;
      const rattledTypes: PokemonType[] = ["bug", "dark", "ghost"];
      if (!rattledTypes.includes(moveType)) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat: CORE_STAT_IDS.speed,
            stages: 1,
          },
        ],
        messages: [`${name}'s Rattled raised its Speed!`],
      };
    }

    case "illusion": {
      // Source: Showdown data/abilities.ts — Illusion: breaks on damaging hit
      if (!ctx.pokemon.volatileStatuses.has("illusion")) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Illusion was broken!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-status-inflicted
// ---------------------------------------------------------------------------

/**
 * Handle "on-status-inflicted" abilities for Gen 6.
 *
 * Fires when a Pokemon receives a primary status condition.
 * `context.pokemon` is the Pokemon that was statused.
 * `context.opponent` is the source that inflicted the status (if any).
 */
function handleOnStatusInflicted(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "synchronize": {
      // Synchronize fires when the holder receives burn, paralysis, or poison from an
      // opponent. It passes the same status back to the source.
      // Does NOT spread sleep or freeze.
      // Source: Showdown data/abilities.ts — Synchronize: onAfterSetStatus
      if (!ctx.opponent) return NO_EFFECT;
      const status = ctx.pokemon.pokemon.status;
      if (!status) return NO_EFFECT;
      if (status !== "burn" && status !== "paralysis" && status !== "poison") return NO_EFFECT;
      if (ctx.opponent.pokemon.status) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status,
          },
        ],
        messages: [`${name}'s Synchronize spread ${status}!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// passive-immunity
// ---------------------------------------------------------------------------

/**
 * Handle "passive-immunity" abilities for Gen 6.
 *
 * Gen 6 additions:
 *   - Overcoat: now also blocks powder/spore moves (in addition to weather damage)
 *   - Bulletproof: new ability that blocks ball/bomb moves
 *   - Sweet Veil: new ability that blocks sleep
 *
 * Fires when a move would hit a Pokemon and the ability grants immunity.
 * `context.pokemon` is the defender, `context.move` is the incoming move.
 *
 * Source: Showdown data/abilities.ts — onTryHit handlers
 * Source: Showdown data/mods/gen6/abilities.ts — Gen 6 overrides
 */
function handlePassiveImmunity(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const moveType = ctx.move?.type;

  switch (abilityId) {
    case "levitate": {
      // Source: Showdown data/abilities.ts — Levitate: immune to Ground moves
      // Gravity and Iron Ball grounding handled in Gen6Abilities.ts passive-immunity case
      if (moveType !== "ground") return NO_EFFECT;
      return { activated: true, effects: [], messages: [] };
    }

    case "flash-fire": {
      // Source: Showdown data/abilities.ts — Flash Fire: Fire immune + volatile boost
      if (moveType !== "fire") return NO_EFFECT;
      // Frozen Pokemon cannot activate Flash Fire; the Fire move thaws them instead
      if (ctx.pokemon.pokemon.status === "freeze") return NO_EFFECT;
      const hasBoost = ctx.pokemon.volatileStatuses.has("flash-fire");
      const effects: AbilityEffect[] = [];
      if (!hasBoost) {
        effects.push({
          effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
          target: BATTLE_EFFECT_TARGETS.self,
          volatile: "flash-fire",
        });
      }
      const ffName = getName(ctx);
      return {
        activated: true,
        effects,
        messages: [
          hasBoost
            ? `${ffName}'s Flash Fire is already boosted!`
            : `${ffName}'s Flash Fire was activated!`,
        ],
      };
    }

    case "water-absorb": {
      // Source: Showdown data/abilities.ts — Water Absorb: Water immune + heal 1/4 HP
      if (moveType !== "water") return NO_EFFECT;
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.heal,
            target: BATTLE_EFFECT_TARGETS.self,
            value: healAmt,
          },
        ],
        messages: [],
      };
    }

    case "volt-absorb": {
      // Source: Showdown data/abilities.ts — Volt Absorb: Electric immune + heal 1/4 HP
      if (moveType !== "electric") return NO_EFFECT;
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.heal,
            target: BATTLE_EFFECT_TARGETS.self,
            value: healAmt,
          },
        ],
        messages: [],
      };
    }

    case "motor-drive": {
      // Source: Showdown data/abilities.ts — Motor Drive: Electric immune + Speed +1
      if (moveType !== "electric") return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat: CORE_STAT_IDS.speed,
            stages: 1,
          },
        ],
        messages: [],
      };
    }

    case "dry-skin": {
      // Source: Showdown data/abilities.ts — Dry Skin: Water immune + heal 1/4 HP
      // (Fire weakness is in damage calc, not here)
      if (moveType !== "water") return NO_EFFECT;
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.heal,
            target: BATTLE_EFFECT_TARGETS.self,
            value: healAmt,
          },
        ],
        messages: [],
      };
    }

    case "overcoat": {
      // Source: Showdown data/mods/gen6/abilities.ts — Overcoat Gen 6:
      //   blocks weather chip damage AND powder/spore moves (both flags: weather + powder)
      // Gen 5: only blocked weather damage. Gen 6 added powder immunity.
      // Source: Bulbapedia — Overcoat Gen VI: "Protects from weather damage and powder moves."
      const isPowderMove = ctx.move?.flags?.powder === true;
      if (isPowderMove) {
        const name = getName(ctx);
        return {
          activated: true,
          effects: [
            { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
          ],
          messages: [`${name}'s Overcoat protected it from the powder move!`],
        };
      }
      // Weather immunity is handled by the weather module, not the passive-immunity hook.
      return NO_EFFECT;
    }

    case "sand-rush": {
      // Source: Showdown data/abilities.ts — Sand Rush's weather immunity is handled by the
      // weather module, while speed doubling is handled in getEffectiveSpeed.
      return NO_EFFECT;
    }

    case "sap-sipper": {
      // Source: Showdown data/abilities.ts — Sap Sipper: Grass immune + Atk +1
      if (moveType !== "grass") return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat: CORE_STAT_IDS.attack,
            stages: 1,
          },
        ],
        messages: [],
      };
    }

    case "magic-guard": {
      // Source: Showdown data/abilities.ts — Magic Guard: immune to all indirect damage
      // This is a passive flag checked by engine when applying indirect damage.
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case "storm-drain": {
      // Source: Showdown data/abilities.ts — Storm Drain: Water immune + SpAtk +1
      if (moveType !== "water") return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat: CORE_STAT_IDS.spAttack,
            stages: 1,
          },
        ],
        messages: [],
      };
    }

    case "lightning-rod": {
      // Source: Showdown data/abilities.ts — Lightning Rod: Electric immune + SpAtk +1
      if (moveType !== "electric") return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat: CORE_STAT_IDS.spAttack,
            stages: 1,
          },
        ],
        messages: [],
      };
    }

    case "bulletproof": {
      // Source: Showdown data/abilities.ts — Bulletproof (Gen 6 new):
      //   blocks moves with the "bullet" flag (ball/bomb moves)
      // Source: Bulbapedia — Bulletproof: "Protects the Pokemon from some ball and bomb moves."
      if (!ctx.move) return NO_EFFECT;
      if (!ctx.move.flags?.bullet) return NO_EFFECT;
      const name = getName(ctx);
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Bulletproof protected it!`],
      };
    }

    case "sweet-veil": {
      // Source: Showdown data/abilities.ts — Sweet Veil (Gen 6 new):
      //   prevents sleep status on self and allies
      // Source: Bulbapedia — Sweet Veil: "Prevents the Pokemon and its allies from falling asleep."
      // For passive-immunity, this blocks any move that would inflict sleep.
      // Uses effect-based detection instead of a hardcoded move list.
      if (!ctx.move) return NO_EFFECT;
      if (!moveInflictsSleep(ctx.move)) return NO_EFFECT;
      const name = getName(ctx);
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Sweet Veil prevents sleep!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-stat-change
// ---------------------------------------------------------------------------

/**
 * Handle "on-stat-change" abilities for Gen 6.
 *
 * Source: Showdown data/abilities.ts — onTryBoost handlers
 */
function handleOnStatChange(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "big-pecks": {
      // Big Pecks only blocks Defense drops.
      // Source: Showdown data/abilities.ts — Big Pecks onTryBoost:
      //   if (boost.def && boost.def < 0) { delete boost.def; ... }
      if (ctx.statChange?.stat !== "defense" || (ctx.statChange?.stages ?? 0) >= 0) {
        return NO_EFFECT;
      }
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Big Pecks prevents its Defense from being lowered!`],
      };
    }

    case "flower-veil": {
      // Source: Showdown data/abilities.ts — Flower Veil (Gen 6 new):
      //   blocks stat drops from opponents for Grass-type Pokemon.
      // Source: Bulbapedia — Flower Veil: "Prevents lowering of ally Grass-type Pokemon's
      //   stats and protects them from status conditions."
      // In singles, protects the holder only if it's Grass type.
      const holderTypes = ctx.pokemon.types;
      if (!holderTypes.includes("grass")) return NO_EFFECT;
      // Only block drops (negative stages) caused by the opponent
      if ((ctx.statChange?.stages ?? 0) >= 0) return NO_EFFECT;
      // Only block opponent-caused drops (not self-inflicted drops like Superpower)
      if (!ctx.opponent) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Flower Veil prevented its stats from being lowered!`],
      };
    }

    case "aroma-veil": {
      // Source: Showdown data/abilities.ts — Aroma Veil (Gen 6 new):
      //   blocks mental interference moves (Taunt, Encore, Torment, Disable, etc.)
      // For on-stat-change this is a no-op; Aroma Veil blocks move effects, not stat changes.
      // The primary Aroma Veil logic is in passive-immunity (blocking specific move IDs).
      return NO_EFFECT;
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-accuracy-check
// ---------------------------------------------------------------------------

/**
 * Handle "on-accuracy-check" abilities for Gen 6.
 *
 * Source: Showdown data/abilities.ts — onAnyModifyAccuracy handlers
 */
function handleOnAccuracyCheck(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case "victory-star": {
      // Source: Showdown data/abilities.ts — Victory Star: accuracy * 4506/4096 (~1.1x)
      // Source: Bulbapedia — Victory Star: "Raises accuracy of user and allies by 10%."
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// Aroma Veil: block mental interference moves (passive-immunity helper)
// ---------------------------------------------------------------------------

/**
 * Check if Aroma Veil blocks a move targeting the holder.
 *
 * Source: Showdown data/abilities.ts — aromaveil onTryHit:
 *   `if (move.affectedByImmunities && target.isAlly(this.effectState.target))`
 * Source: Bulbapedia — Aroma Veil: "Protects the user and allies from moves that
 *   target the mind."
 *
 * @param moveId - The ID of the incoming move
 * @returns true if Aroma Veil blocks this move
 */
export function isAromaVeilBlocked(moveId: string): boolean {
  return AROMA_VEIL_BLOCKED_MOVES.has(moveId);
}

// ---------------------------------------------------------------------------
// Sweet Veil helper: detect sleep-inflicting moves by effect
// ---------------------------------------------------------------------------

/**
 * Returns whether a move would inflict sleep on the target, based on its effect data.
 * Checks for:
 *   - status-guaranteed with status === "sleep"
 *   - status-chance with status === "sleep"
 *   - volatile-status with status === "yawn" (Yawn causes sleep next turn)
 *   - multi effects containing any of the above
 *
 * Source: Showdown data/abilities.ts -- sweetveil: checks for sleep status infliction
 * Source: Bulbapedia "Sweet Veil" -- "Prevents the Pokemon and its allies from falling asleep."
 */
function moveInflictsSleep(move: MoveData): boolean {
  const effect = move.effect;
  if (!effect) return false;
  return effectCausesSleep(effect);
}

/**
 * Recursively checks whether a MoveEffect inflicts sleep.
 */
function effectCausesSleep(effect: NonNullable<MoveData["effect"]>): boolean {
  switch (effect.type) {
    case "status-guaranteed":
      return effect.status === "sleep";
    case "status-chance":
      return effect.status === "sleep";
    case "volatile-status":
      // Yawn causes sleep the following turn
      return effect.status === "yawn";
    case "multi":
      return effect.effects.some((e) => effectCausesSleep(e));
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Trapping ability checks (exported for engine use)
// ---------------------------------------------------------------------------

/**
 * Check if a trapping ability prevents the opponent from switching.
 *
 * @returns `true` if the opponent is trapped and cannot switch out
 *
 * Source: Showdown data/abilities.ts — onFoeTrapPokemon handlers
 */
export function isTrappedByAbility(
  trapper: { ability: string },
  trapped: { ability: string; types: readonly PokemonType[] },
  isGrounded: boolean,
): boolean {
  switch (trapper.ability) {
    case "shadow-tag":
      // Source: Showdown data/abilities.ts — Shadow Tag traps unless opponent also has Shadow Tag
      return trapped.ability !== "shadow-tag";

    case "arena-trap":
      // Source: Showdown data/abilities.ts — Arena Trap traps grounded opponents
      return isGrounded;

    case "magnet-pull":
      // Source: Showdown data/abilities.ts — Magnet Pull traps Steel types
      return trapped.types.includes("steel");

    default:
      return false;
  }
}

/**
 * Check if an ability is a Mold Breaker variant (ignores target's ability).
 * Includes Mold Breaker, Teravolt, and Turboblaze.
 *
 * Source: Showdown data/abilities.ts — onModifyMove: move.ignoreAbility = true
 */
export function isMoldBreakerAbility(abilityId: string): boolean {
  return MOLD_BREAKER_ALIASES.has(abilityId);
}

/**
 * Get the Victory Star accuracy multiplier.
 * Returns 4506/4096 (Showdown's chain multiply value for ~1.1x).
 *
 * Source: Showdown data/abilities.ts — victorystar.onAnyModifyAccuracy: chainModify([4506, 4096])
 * 4506 / 4096 = 1.1000976... which is Showdown's way of representing ~1.1x.
 */
export const VICTORY_STAR_ACCURACY_MULTIPLIER = 4506 / 4096;

/**
 * Returns whether a move is blocked by Bulletproof.
 * Uses the move.flags.bullet flag instead of a hardcoded move list.
 *
 * Source: Showdown data/abilities.ts — bulletproof: move.flags['bullet']
 * Source: Bulbapedia "Bulletproof" -- "Protects from ball and bomb moves."
 */
export function isBulletproofBlocked(
  abilityId: string,
  moveFlags: Record<string, boolean>,
): boolean {
  if (abilityId !== "bulletproof") return false;
  return !!moveFlags.bullet;
}
