import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_GENDERS,
  CORE_STAT_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { GEN5_ABILITY_IDS } from "./data/reference-ids";

/**
 * Gen 5 switch-in, contact, switch-out, and passive ability handlers.
 *
 * Called from Gen5Abilities.ts dispatch based on trigger type.
 *
 * Covers:
 *   - on-switch-in: Intimidate, Pressure, Drizzle, Drought, Sand Stream,
 *     Snow Warning, Download, Trace, Mold Breaker, Teravolt, Turboblaze, Imposter
 *   - on-switch-out: Regenerator, Natural Cure
 *   - on-contact: Static, Flame Body, Poison Point, Rough Skin, Iron Barbs,
 *     Effect Spore, Cute Charm, Aftermath, Mummy, Poison Touch, Pickpocket
 *   - on-damage-taken: Cursed Body, Rattled, Illusion (reveal)
 *   - on-status-inflicted: Synchronize
 *   - passive-immunity: Levitate, Flash Fire, Water Absorb, Volt Absorb,
 *     Motor Drive, Dry Skin, Overcoat, Sap Sipper, Magic Guard,
 *     Storm Drain, Lightning Rod, Sand Rush
 *   - on-stat-change: Big Pecks (stub — context does not carry which stat changed yet)
 *   - on-accuracy-check: Victory Star
 *   - trapping: Shadow Tag, Arena Trap, Magnet Pull
 *
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 * Source: references/pokemon-showdown/data/abilities.ts
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
  GEN5_ABILITY_IDS.moldBreaker,
  GEN5_ABILITY_IDS.teravolt,
  GEN5_ABILITY_IDS.turboblaze,
]);

/**
 * Abilities that cannot be overwritten by Mummy or suppressed by Gastro Acid in Gen 5.
 *
 * Only Multitype and Zen Mode are truly unsuppressable in Gen 5.
 * Abilities like Wonder Guard, Truant, etc. CAN be suppressed/overwritten in Gen 5.
 * Later gens added more unsuppressable abilities (Stance Change in Gen 6, Schooling in
 * Gen 7, etc.) but those do not apply here.
 *
 * Source: Showdown data/abilities.ts — Gen 5: only Multitype and Zen Mode have
 *   cantsuppress behavior. Other abilities on the Gen 8+ list (stance-change,
 *   schooling, etc.) were introduced in later generations.
 * Source: Bulbapedia — Mummy: "Cannot overwrite Multitype" (Gen 5)
 * Source: Bulbapedia — Zen Mode: "Cannot be suppressed" (Gen 5)
 */
export const UNSUPPRESSABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN5_ABILITY_IDS.multitype,
  GEN5_ABILITY_IDS.zenMode,
]);

export const TRACE_UNCOPYABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN5_ABILITY_IDS.trace,
  GEN5_ABILITY_IDS.multitype,
  GEN5_ABILITY_IDS.forecast,
  GEN5_ABILITY_IDS.illusion,
  GEN5_ABILITY_IDS.flowerGift,
  GEN5_ABILITY_IDS.imposter,
  GEN5_ABILITY_IDS.zenMode,
]);

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

const NO_EFFECT: AbilityResult = { activated: false, effects: [], messages: [] };

/**
 * Dispatch a Gen 5 switch-in/contact/passive ability trigger.
 *
 * @param trigger - The ability trigger type
 * @param context - The ability context
 */
export function handleGen5SwitchAbility(
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
 * Handle "on-switch-in" abilities for Gen 5.
 *
 * Source: Showdown data/abilities.ts — onStart handlers
 * Source: Showdown data/mods/gen5/abilities.ts — Gen 5 overrides
 */
function handleSwitchIn(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "intimidate": {
      // Source: Showdown data/abilities.ts — Intimidate lowers opponent's Attack by 1 stage
      // Source: Showdown Gen 5 — Intimidate is blocked by Substitute
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
      // Source: Showdown Gen 5 — Drizzle sets permanent rain (-1 turns)
      // Gen 5: weather from abilities is permanent
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.rain,
            weatherTurns: -1,
          },
        ],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case "drought": {
      // Source: Showdown Gen 5 — Drought sets permanent sun (-1 turns)
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.sun,
            weatherTurns: -1,
          },
        ],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case "sand-stream": {
      // Source: Showdown Gen 5 — Sand Stream sets permanent sandstorm (-1 turns)
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.sand,
            weatherTurns: -1,
          },
        ],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    case "snow-warning": {
      // Source: Showdown Gen 5 — Snow Warning sets permanent hail (-1 turns)
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.hail,
            weatherTurns: -1,
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
      const stat = raisesAtk ? CORE_STAT_IDS.attack : CORE_STAT_IDS.spAttack;
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
      // Gen 5 ban list: trace, multitype, forecast, illusion, flower-gift, imposter, zen-mode
      // Source: Bulbapedia — Trace cannot copy Multitype, Forecast, Trace, Illusion, Imposter,
      //   Zen Mode, Flower Gift (Gen 5)
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
      // The actual transformation is handled by the engine; we emit the signal here.
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
      // The actual disguise logic is handled by the engine reading the volatile.
      // We set the "illusion" volatile status here as a signal.
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

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-switch-out
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-out" abilities for Gen 5.
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
 * Handle "on-contact" abilities for Gen 5.
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
      // Source: Bulbapedia — Iron Barbs (Gen 5 new): identical to Rough Skin mechanically
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
      // Source: Showdown data/abilities.ts — Effect Spore: single this.random(100) roll
      //   < 11 = sleep, < 21 = poison, else (< 30) = paralysis
      //   i.e., sleep=11%, poison=10%, paralysis=9%, total=30%
      // Note: Bulbapedia says "10% each" but Showdown uses asymmetric thresholds.
      //   We follow Showdown as primary authority for Gen 5.
      const otherStatus = other.pokemon.status;
      if (otherStatus) return NO_EFFECT;
      // Grass types are immune to Effect Spore in Gen 5+
      // Source: Showdown data/abilities.ts — Gen 5+: Grass-types immune to spore/powder effects
      if (other.types.includes("grass")) return NO_EFFECT;
      // Overcoat blocks Effect Spore in Gen 6+, but NOT in Gen 5
      // Source: Showdown data/mods/gen5/abilities.ts — Overcoat only blocks weather, not spore
      const roll = Math.floor(ctx.rng.next() * 100);
      if (roll < 11) {
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
      if (roll < 21) {
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
      if (roll < 30) {
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
      return NO_EFFECT;
    }

    case "cute-charm": {
      // Source: Showdown data/abilities.ts — Cute Charm: 30% infatuation on contact
      // Requires opposite genders, fails if genderless
      // Source: Bulbapedia — Cute Charm: "30% chance of infatuating attacking Pokemon of
      //   opposite gender."
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      const defenderGender = ctx.pokemon.pokemon.gender;
      const attackerGender = other.pokemon.gender;
      if (
        !defenderGender ||
        !attackerGender ||
        defenderGender === CORE_GENDERS.genderless ||
        attackerGender === CORE_GENDERS.genderless ||
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
      // Source: Showdown data/abilities.ts — Aftermath: 1/4 attacker HP if holder fainted by
      //   contact move. Only triggers if the holder has 0 HP (fainted).
      // Source: Bulbapedia — Aftermath: "Damages the attacker for 1/4 of its max HP if the
      //   holder faints from a contact move."
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
      // Source: Showdown data/abilities.ts — Mummy (Gen 5 new): contact changes attacker's
      //   ability to Mummy. Cannot overwrite unsuppressable abilities or Mummy itself.
      // Source: Bulbapedia — Mummy: "Contact with the Pokemon changes the attacker's
      //   Ability to Mummy."
      const otherAbility = other.ability;
      if (
        !otherAbility ||
        otherAbility === GEN5_ABILITY_IDS.mummy ||
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
            newAbility: GEN5_ABILITY_IDS.mummy,
          },
        ],
        messages: [`${oppName}'s ability became Mummy!`],
      };
    }

    case "poison-touch": {
      // Source: Showdown data/abilities.ts — Poison Touch (Gen 5 new): 30% poison on own
      //   contact moves. This is an ATTACKER-side ability.
      //   ctx.pokemon = attacker, ctx.opponent = defender
      // Source: Bulbapedia — Poison Touch: "May poison a target when making contact."
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
      // Source: Showdown data/abilities.ts — Pickpocket (Gen 5 new): steals attacker's item
      //   on contact. Only if holder has no item and attacker has an item.
      //   ctx.pokemon = defender with Pickpocket, ctx.opponent = attacker
      // Source: Bulbapedia — Pickpocket: "Steals an item from an attacker that made contact."
      if (ctx.pokemon.pokemon.heldItem) return NO_EFFECT;
      if (!other.pokemon.heldItem) return NO_EFFECT;
      const stolenItem = other.pokemon.heldItem;
      const oppName = getOpponentName(ctx);

      // Direct mutation: AbilityResult has no itemTransfer field, so we mutate
      // the Pokemon objects directly (same pattern as Knock Off in Gen5MoveEffectsBehavior).
      ctx.pokemon.pokemon.heldItem = stolenItem;
      other.pokemon.heldItem = null;

      // Unburden: if the victim (attacker) has Unburden, set the volatile.
      // Source: Showdown data/abilities.ts — Unburden activates when item is lost by any means.
      // Source: Bulbapedia — Unburden: "Doubles Speed when held item is used or lost."
      if (
        other.ability === GEN5_ABILITY_IDS.unburden &&
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
 * Handle "on-damage-taken" abilities for Gen 5.
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
      // Source: Bulbapedia — Cursed Body (Gen 5 new): "30% chance of disabling the attacker's move."
      if (!ctx.opponent) return NO_EFFECT;
      // Cannot disable if attacker already has a disabled move
      if (ctx.opponent.volatileStatuses.has(CORE_VOLATILE_IDS.disable)) return NO_EFFECT;
      // Source: Showdown data/abilities.ts — randomChance(3, 10) = 30%
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            volatile: CORE_VOLATILE_IDS.disable,
            data: { turnsLeft: 4 },
          },
        ],
        messages: [`${name}'s Cursed Body disabled the attacker's move!`],
      };
    }

    case "rattled": {
      // Source: Showdown data/abilities.ts — Rattled (Gen 5 new): +1 Speed when hit by
      //   Bug/Dark/Ghost move
      // Source: Bulbapedia — Rattled: "Raises Speed by 1 stage when hit by Bug-, Dark-,
      //   or Ghost-type move."
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
      // Source: Bulbapedia — Illusion: "The disguise breaks when the Pokemon is hit by
      //   a damaging move."
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
 * Handle "on-status-inflicted" abilities for Gen 5.
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
      // opponent's MOVE. It passes the same status back to the source.
      // Does NOT spread sleep or freeze (excluded in Showdown).
      // Does NOT trigger when poisoned by Toxic Spikes (entry hazard).
      //
      // Source: Showdown data/abilities.ts — Synchronize: onAfterSetStatus
      //   if (!source || source === target) return;    <- must be opponent-caused
      //   if (effect.id === 'toxicspikes') return;    <- Toxic Spikes excluded
      //   if (status.id === 'slp' || status.id === 'frz') return;
      //   source.trySetStatus(status, target, { id: 'synchronize' })
      // Source: Bulbapedia — Synchronize: "Passes burn, paralysis, or poison to the foe."
      if (!ctx.opponent) return NO_EFFECT;
      const status = ctx.pokemon.pokemon.status;
      if (!status) return NO_EFFECT;
      // Only spreads burn, paralysis, poison (not sleep, freeze, badly-poisoned)
      if (status !== "burn" && status !== "paralysis" && status !== "poison") return NO_EFFECT;
      // Toxic Spikes poison is excluded — the entry hazard code sets a "hazard-status-source"
      // volatile marker when Toxic Spikes inflicts status.
      // Source: Showdown data/abilities.ts — Synchronize: if (effect.id === 'toxicspikes') return;
      if (ctx.pokemon.volatileStatuses.has("hazard-status-source")) {
        // Remove the marker volatile so it doesn't persist
        ctx.pokemon.volatileStatuses.delete("hazard-status-source");
        return NO_EFFECT;
      }
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
 * Handle "passive-immunity" abilities for Gen 5.
 *
 * Fires when a move would hit a Pokemon and the ability grants immunity.
 * `context.pokemon` is the defender, `context.move` is the incoming move.
 *
 * Source: Showdown data/abilities.ts — onTryHit handlers
 */
function handlePassiveImmunity(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const moveType = ctx.move?.type;

  switch (abilityId) {
    case "levitate": {
      // Source: Showdown data/abilities.ts — Levitate: immune to Ground moves
      // Source: Bulbapedia — Levitate: "Gives immunity to Ground-type moves."
      if (moveType !== "ground") return NO_EFFECT;
      return { activated: true, effects: [], messages: [] };
    }

    case "flash-fire": {
      // Source: Showdown data/abilities.ts — Flash Fire: Fire immune + volatile boost
      // Source: Bulbapedia — Flash Fire: "Powers up Fire moves by 50% when hit by Fire."
      if (moveType !== "fire") return NO_EFFECT;
      // Frozen Pokemon cannot activate Flash Fire; the Fire move thaws them instead
      // Source: Showdown — frozen Pokemon cannot activate Flash Fire
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
      // Source: Bulbapedia — Water Absorb: "Heals 1/4 max HP when hit by Water-type moves."
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
      // Source: Bulbapedia — Volt Absorb: "Heals 1/4 max HP when hit by Electric-type moves."
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
      // Source: Bulbapedia — Motor Drive: "Raises Speed by 1 when hit by Electric-type moves."
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
      // Source: Bulbapedia — Dry Skin: "Immune to Water; heals 1/4 max HP."
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
      // Source: Showdown data/mods/gen5/abilities.ts — Overcoat's weather immunity is handled
      // by the weather module, not the passive-immunity ability hook.
      return NO_EFFECT;
    }

    case "sand-rush": {
      // Source: Showdown data/abilities.ts — Sand Rush's weather immunity is handled by the
      // weather module, while speed doubling is handled in getEffectiveSpeed.
      // Source: Bulbapedia — Sand Rush: "Doubles Speed in sandstorm. Immune to sandstorm damage."
      return NO_EFFECT;
    }

    case "sap-sipper": {
      // Source: Showdown data/abilities.ts — Sap Sipper: Grass immune + Atk +1
      // Source: Bulbapedia — Sap Sipper (Gen 5 new): "Immune to Grass; raises Attack by 1."
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
      // Source: Bulbapedia — Magic Guard: "The Pokemon only takes damage from attacks."
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
      // Source: Bulbapedia — Storm Drain (Gen 5+): Water immune + SpAtk +1
      // Gen 5 updated from redirect-only (Gen 4) to immunity + SpAtk boost
      // Source: Showdown data/abilities.ts — Storm Drain onTryHit
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
      // Source: Bulbapedia — Lightning Rod (Gen 5+): Electric immune + SpAtk +1
      // Gen 5 updated from redirect-only (Gen 3-4) to immunity + SpAtk boost
      // Source: Showdown data/abilities.ts — Lightning Rod onTryHit
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

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-stat-change
// ---------------------------------------------------------------------------

/**
 * Handle "on-stat-change" abilities for Gen 5.
 *
 * Source: Showdown data/abilities.ts — onTryBoost handlers
 */
function handleOnStatChange(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case "big-pecks": {
      // Big Pecks only blocks Defense drops. It must NOT fire for other stats or boosts.
      // Gate on: stat === "defense" AND stages < 0 (a drop, not a boost).
      //
      // Source: Showdown data/abilities.ts — Big Pecks onTryBoost:
      //   if (boost.def && boost.def < 0) { delete boost.def; ... }
      // Source: Bulbapedia — Big Pecks (Gen 5 new): "Prevents Defense from being lowered."
      if (ctx.statChange?.stat !== CORE_STAT_IDS.defense || (ctx.statChange?.stages ?? 0) >= 0) {
        return NO_EFFECT;
      }
      const name = getName(ctx);
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Big Pecks prevents its Defense from being lowered!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-accuracy-check
// ---------------------------------------------------------------------------

/**
 * Handle "on-accuracy-check" abilities for Gen 5.
 *
 * Source: Showdown data/abilities.ts — onAnyModifyAccuracy handlers
 */
function handleOnAccuracyCheck(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case "victory-star": {
      // Source: Showdown data/abilities.ts — Victory Star: accuracy * 4506/4096 (approx 1.1x)
      // Source: Bulbapedia — Victory Star (Gen 5 new): "Raises accuracy of user and allies by 10%."
      // The actual accuracy modification is in the accuracy check; this signals activation.
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
      // Source: Bulbapedia — Shadow Tag: "Prevents the foe from escaping."
      return trapped.ability !== "shadow-tag";

    case "arena-trap":
      // Source: Showdown data/abilities.ts — Arena Trap traps grounded opponents
      // Source: Bulbapedia — Arena Trap: "Prevents grounded foes from escaping."
      return isGrounded;

    case "magnet-pull":
      // Source: Showdown data/abilities.ts — Magnet Pull traps Steel types
      // Source: Bulbapedia — Magnet Pull: "Prevents Steel-type foes from escaping."
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
