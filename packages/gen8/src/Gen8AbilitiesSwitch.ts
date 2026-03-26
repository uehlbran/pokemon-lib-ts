import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger, PokemonType, ScreenType, WeatherType } from "@pokemon-lib-ts/core";
import {
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { GEN8_ABILITY_IDS, GEN8_ITEM_IDS } from "./data/reference-ids";

/**
 * Gen 8 switch-in, switch-out, contact, and passive ability handlers.
 *
 * Carries forward all Gen 7 switch/contact abilities plus Gen 8 additions:
 *   - Screen Cleaner: removes Reflect/Light Screen/Aurora Veil from both sides
 *   - Mirror Armor: reflects stat drops back to attacker
 *   - Neutralizing Gas: suppresses all abilities on the field
 *   - Pastel Veil: prevents poison/toxic on holder and allies
 *   - Wandering Spirit: swaps abilities on contact
 *   - Perish Body: both sides get Perish Song on contact
 *   - Gulp Missile: Cramorant form-change and retaliation
 *   - Ice Face: Eiscue blocks first physical hit, reforms in hail
 *   - Hunger Switch: Morpeko toggles form each turn
 *   - Libero: type change before attacking (same as Protean pre-nerf)
 *   - Intrepid Sword / Dauntless Shield: stat boosts on every switch-in
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen8/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

function getOpponentName(ctx: AbilityContext): string {
  if (!ctx.opponent) return "the opposing Pokemon";
  return ctx.opponent.pokemon.nickname ?? String(ctx.opponent.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Abilities that cannot be copied by Trace in Gen 8.
 *
 * Gen 8 adds: Hunger Switch, Gulp Missile, Ice Face, Power Spot,
 * Neutralizing Gas, Intrepid Sword, Dauntless Shield.
 *
 * Source: Showdown data/abilities.ts -- trace.onUpdate
 * Source: Bulbapedia "Trace" Gen 8 -- cannot copy these abilities
 */
export const TRACE_UNCOPYABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN8_ABILITY_IDS.trace,
  GEN8_ABILITY_IDS.multitype,
  GEN8_ABILITY_IDS.forecast,
  GEN8_ABILITY_IDS.illusion,
  GEN8_ABILITY_IDS.flowerGift,
  GEN8_ABILITY_IDS.imposter,
  GEN8_ABILITY_IDS.zenMode,
  GEN8_ABILITY_IDS.stanceChange,
  GEN8_ABILITY_IDS.powerConstruct,
  GEN8_ABILITY_IDS.schooling,
  GEN8_ABILITY_IDS.comatose,
  GEN8_ABILITY_IDS.shieldsDown,
  GEN8_ABILITY_IDS.disguise,
  GEN8_ABILITY_IDS.rksSystem,
  GEN8_ABILITY_IDS.battleBond,
  GEN8_ABILITY_IDS.receiver,
  GEN8_ABILITY_IDS.powerOfAlchemy,
  // Gen 8 additions
  GEN8_ABILITY_IDS.hungerSwitch,
  GEN8_ABILITY_IDS.gulpMissile,
  GEN8_ABILITY_IDS.iceFace,
  GEN8_ABILITY_IDS.neutralizingGas,
  GEN8_ABILITY_IDS.intrepidSword,
  GEN8_ABILITY_IDS.dauntlessShield,
]);

/**
 * Abilities that cannot be overwritten by Mummy or suppressed by Gastro Acid.
 *
 * Gen 8 adds: Gulp Missile, Ice Face, Neutralizing Gas.
 *
 * Source: Showdown data/abilities.ts -- cantsuppress
 */
export const UNSUPPRESSABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN8_ABILITY_IDS.multitype,
  GEN8_ABILITY_IDS.stanceChange,
  GEN8_ABILITY_IDS.schooling,
  GEN8_ABILITY_IDS.comatose,
  GEN8_ABILITY_IDS.shieldsDown,
  GEN8_ABILITY_IDS.disguise,
  GEN8_ABILITY_IDS.rksSystem,
  GEN8_ABILITY_IDS.battleBond,
  GEN8_ABILITY_IDS.powerConstruct,
  // Gen 8 additions
  GEN8_ABILITY_IDS.gulpMissile,
  GEN8_ABILITY_IDS.iceFace,
  GEN8_ABILITY_IDS.neutralizingGas,
]);

/**
 * Abilities immune to Neutralizing Gas suppression.
 *
 * Source: Showdown data/abilities.ts -- Neutralizing Gas onStart
 * Source: Bulbapedia "Neutralizing Gas" -- does not suppress itself,
 *   Comatose, or any ability in the unsuppressable set
 */
export const NEUTRALIZING_GAS_IMMUNE_ABILITIES: ReadonlySet<string> = new Set([
  GEN8_ABILITY_IDS.neutralizingGas,
  GEN8_ABILITY_IDS.comatose,
  GEN8_ABILITY_IDS.multitype,
  GEN8_ABILITY_IDS.stanceChange,
  GEN8_ABILITY_IDS.schooling,
  GEN8_ABILITY_IDS.shieldsDown,
  GEN8_ABILITY_IDS.disguise,
  GEN8_ABILITY_IDS.rksSystem,
  GEN8_ABILITY_IDS.battleBond,
  GEN8_ABILITY_IDS.powerConstruct,
  GEN8_ABILITY_IDS.gulpMissile,
  GEN8_ABILITY_IDS.iceFace,
]);

/**
 * Mold Breaker ability variants.
 *
 * Source: Showdown data/abilities.ts -- moldbreaker/teravolt/turboblaze
 */
export const MOLD_BREAKER_ALIASES: ReadonlySet<string> = new Set([
  GEN8_ABILITY_IDS.moldBreaker,
  GEN8_ABILITY_IDS.teravolt,
  GEN8_ABILITY_IDS.turboblaze,
]);

/**
 * Weather duration extension by weather rocks: 5 turns base, 8 with rock.
 *
 * Source: Bulbapedia -- individual rock item pages
 * Source: Showdown data/items.ts -- damprock/heatrock/smoothrock/icyrock
 */
const WEATHER_ROCK_MAP: Readonly<Record<string, { weather: WeatherType; turns: number }>> = {
  [GEN8_ITEM_IDS.dampRock]: { weather: CORE_WEATHER_IDS.rain, turns: 8 },
  [GEN8_ITEM_IDS.heatRock]: { weather: CORE_WEATHER_IDS.sun, turns: 8 },
  [GEN8_ITEM_IDS.smoothRock]: { weather: CORE_WEATHER_IDS.sand, turns: 8 },
  [GEN8_ITEM_IDS.icyRock]: { weather: CORE_WEATHER_IDS.hail, turns: 8 },
};

const BASE_WEATHER_TURNS = 5;

/**
 * Screen types that Screen Cleaner removes from both sides.
 *
 * Source: Showdown data/abilities.ts -- Screen Cleaner onStart
 */
export const SCREEN_CLEANER_SCREENS: readonly ScreenType[] = [
  CORE_SCREEN_IDS.reflect,
  CORE_SCREEN_IDS.lightScreen,
  CORE_SCREEN_IDS.auroraVeil,
];

// ---------------------------------------------------------------------------
// Inactive sentinel
// ---------------------------------------------------------------------------

const NO_EFFECT: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a Gen 8 switch-in/switch-out/contact/passive ability trigger.
 *
 * @param trigger - The ability trigger type
 * @param context - The ability context
 */
export function handleGen8SwitchAbility(
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
    case "on-status-inflicted":
      return handleOnStatusInflicted(context);
    case "on-before-move":
      return handleBeforeMove(context);
    case "on-turn-end":
      return handleTurnEnd(context);
    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-switch-in
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-in" abilities for Gen 8.
 *
 * Source: Showdown data/abilities.ts -- onStart handlers
 */
function handleSwitchIn(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case GEN8_ABILITY_IDS.intimidate: {
      // Source: Showdown data/abilities.ts -- Intimidate lowers opponent's Attack by 1 stage
      // Blocked by Substitute
      if (!ctx.opponent) return NO_EFFECT;
      if (ctx.opponent.substituteHp > 0) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      const effect: AbilityEffect = {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.opponent,
        stat: "attack",
        stages: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Intimidate cut ${oppName}'s Attack!`],
      };
    }

    case GEN8_ABILITY_IDS.pressure: {
      // Source: Showdown data/abilities.ts -- Pressure onStart message
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is exerting its Pressure!`],
      };
    }

    case GEN8_ABILITY_IDS.drizzle: {
      // Source: Showdown data/abilities.ts -- Drizzle sets rain, 5 turns (8 with Damp Rock)
      const turns = getWeatherTurns(ctx.pokemon.pokemon.heldItem, CORE_WEATHER_IDS.rain);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.rain,
            weatherTurns: turns,
          },
        ],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case GEN8_ABILITY_IDS.drought: {
      // Source: Showdown data/abilities.ts -- Drought sets sun, 5 turns (8 with Heat Rock)
      const turns = getWeatherTurns(ctx.pokemon.pokemon.heldItem, CORE_WEATHER_IDS.sun);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.sun,
            weatherTurns: turns,
          },
        ],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case GEN8_ABILITY_IDS.sandStream: {
      // Source: Showdown data/abilities.ts -- Sand Stream sets sand, 5 turns (8 with Smooth Rock)
      const turns = getWeatherTurns(ctx.pokemon.pokemon.heldItem, CORE_WEATHER_IDS.sand);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.sand,
            weatherTurns: turns,
          },
        ],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    case GEN8_ABILITY_IDS.snowWarning: {
      // Source: Showdown data/abilities.ts -- Snow Warning sets hail, 5 turns (8 with Icy Rock)
      const turns = getWeatherTurns(ctx.pokemon.pokemon.heldItem, CORE_WEATHER_IDS.hail);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.weatherSet,
            target: BATTLE_EFFECT_TARGETS.field,
            weather: CORE_WEATHER_IDS.hail,
            weatherTurns: turns,
          },
        ],
        messages: [`${name}'s Snow Warning made it hail!`],
      };
    }

    case GEN8_ABILITY_IDS.download: {
      // Source: Showdown data/abilities.ts -- Download: compare foe Def vs SpDef
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

    case GEN8_ABILITY_IDS.trace: {
      // Source: Showdown data/abilities.ts -- Trace: copies opponent's ability
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

    case GEN8_ABILITY_IDS.moldBreaker: {
      // Source: Showdown data/abilities.ts -- Mold Breaker onStart announcement
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} breaks the mold!`],
      };
    }

    case GEN8_ABILITY_IDS.teravolt: {
      // Source: Showdown data/abilities.ts -- Teravolt onStart announcement
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is radiating a bursting aura!`],
      };
    }

    case GEN8_ABILITY_IDS.turboblaze: {
      // Source: Showdown data/abilities.ts -- Turboblaze onStart announcement
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is radiating a blazing aura!`],
      };
    }

    case GEN8_ABILITY_IDS.imposter: {
      // Source: Showdown data/abilities.ts -- Imposter: transforms into opponent on switch-in
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

    case GEN8_ABILITY_IDS.illusion: {
      // Source: Showdown data/abilities.ts -- Illusion: sets volatile on switch-in
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

    case GEN8_ABILITY_IDS.stanceChange: {
      // Source: Showdown data/abilities.ts -- Stance Change (Aegislash)
      // Switch-in always resets to Shield Forme
      if (ctx.pokemon.pokemon.speciesId !== 681) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN8_ABILITY_IDS.screenCleaner: {
      // Source: Showdown data/abilities.ts -- Screen Cleaner onStart
      // Removes Reflect, Light Screen, AND Aurora Veil from BOTH sides
      // Source: specs/reference/gen8-ground-truth.md -- Screen Cleaner: both sides + Aurora Veil
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.field },
        ],
        messages: [`${name}'s Screen Cleaner removed all screens!`],
      };
    }

    case GEN8_ABILITY_IDS.neutralizingGas: {
      // Source: Showdown data/abilities.ts -- Neutralizing Gas onStart
      // Suppresses all abilities on the field except unsuppressable ones
      // Source: Bulbapedia "Neutralizing Gas" -- nullifies all abilities while on field
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.field },
        ],
        messages: [`${name}'s Neutralizing Gas filled the area!`],
      };
    }

    case GEN8_ABILITY_IDS.intrepidSword: {
      // Source: Showdown data/mods/gen8/abilities.ts -- Intrepid Sword onStart
      // Gen 8: raises Attack by 1 stage on EVERY switch-in (no once-per-battle limit)
      // Source: specs/reference/gen8-ground-truth.md -- Intrepid Sword: every switch-in
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat: "attack",
            stages: 1,
          },
        ],
        messages: [`${name}'s Intrepid Sword raised its Attack!`],
      };
    }

    case GEN8_ABILITY_IDS.dauntlessShield: {
      // Source: Showdown data/mods/gen8/abilities.ts -- Dauntless Shield onStart
      // Gen 8: raises Defense by 1 stage on EVERY switch-in (no once-per-battle limit)
      // Source: specs/reference/gen8-ground-truth.md -- Dauntless Shield: every switch-in
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.self,
            stat: "defense",
            stages: 1,
          },
        ],
        messages: [`${name}'s Dauntless Shield raised its Defense!`],
      };
    }

    // Receiver / Power of Alchemy: copies fallen ally's ability (Doubles only)
    // In singles, never triggers.
    // Source: Showdown data/abilities.ts -- receiver/powerofalchemy: onAllyFaint
    case GEN8_ABILITY_IDS.receiver:
    case GEN8_ABILITY_IDS.powerOfAlchemy: {
      return NO_EFFECT;
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-switch-out
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-out" abilities for Gen 8.
 *
 * Source: Showdown data/abilities.ts -- onSwitchOut handlers
 */
function handleSwitchOut(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case GEN8_ABILITY_IDS.regenerator: {
      // Source: Showdown data/abilities.ts -- Regenerator: heals 1/3 max HP on switch-out
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

    case GEN8_ABILITY_IDS.naturalCure: {
      // Source: Showdown data/abilities.ts -- Natural Cure: cures status on switch-out
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
 * Handle "on-contact" abilities for Gen 8.
 *
 * For DEFENDER-side abilities (Static, Flame Body, Wandering Spirit, Perish Body, etc.):
 *   - ctx.pokemon = the defender (whose ability fires)
 *   - ctx.opponent = the attacker who made contact
 *
 * For ATTACKER-side abilities (Poison Touch):
 *   - ctx.pokemon = the attacker (whose ability fires)
 *   - ctx.opponent = the defender that was hit
 *
 * Source: Showdown data/abilities.ts -- onDamagingHit / onSourceDamagingHit handlers
 */
function handleOnContact(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const other = ctx.opponent;
  if (!other) return NO_EFFECT;

  const name = getName(ctx);

  switch (abilityId) {
    case GEN8_ABILITY_IDS.static: {
      // Source: Showdown data/abilities.ts -- Static: 30% paralysis on contact
      if (other.pokemon.status) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: CORE_STATUS_IDS.paralysis,
          },
        ],
        messages: [`${name}'s Static paralyzed the attacker!`],
      };
    }

    case GEN8_ABILITY_IDS.flameBody: {
      // Source: Showdown data/abilities.ts -- Flame Body: 30% burn on contact
      if (other.pokemon.status) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: CORE_STATUS_IDS.burn,
          },
        ],
        messages: [`${name}'s Flame Body burned the attacker!`],
      };
    }

    case GEN8_ABILITY_IDS.poisonPoint: {
      // Source: Showdown data/abilities.ts -- Poison Point: 30% poison on contact
      if (other.pokemon.status) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: CORE_STATUS_IDS.poison,
          },
        ],
        messages: [`${name}'s Poison Point poisoned the attacker!`],
      };
    }

    case GEN8_ABILITY_IDS.roughSkin:
    case GEN8_ABILITY_IDS.ironBarbs: {
      // Source: Showdown data/abilities.ts -- Rough Skin / Iron Barbs: 1/8 attacker HP on contact
      const otherMaxHp = other.pokemon.calculatedStats?.hp ?? other.pokemon.currentHp;
      const chipDamage = Math.max(1, Math.floor(otherMaxHp / 8));
      const abilityName = abilityId === GEN8_ABILITY_IDS.roughSkin ? "Rough Skin" : "Iron Barbs";
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

    case GEN8_ABILITY_IDS.effectSpore: {
      // Source: Showdown data/abilities.ts -- Effect Spore: single random(100) roll
      // 0-9 = sleep, 10-19 = paralysis, 20-29 = poison, 30-99 = nothing
      if (other.pokemon.status) return NO_EFFECT;
      if (other.types.includes(CORE_TYPE_IDS.grass)) return NO_EFFECT;
      if (other.ability === GEN8_ABILITY_IDS.overcoat) return NO_EFFECT;
      const roll = Math.floor(ctx.rng.next() * 100);
      if (roll < 10) {
        return {
          activated: true,
          effects: [
            {
              effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
              target: BATTLE_EFFECT_TARGETS.opponent,
              status: CORE_STATUS_IDS.sleep,
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
              status: CORE_STATUS_IDS.paralysis,
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
              status: CORE_STATUS_IDS.poison,
            },
          ],
          messages: [`${name}'s Effect Spore poisoned the attacker!`],
        };
      }
      return NO_EFFECT;
    }

    case GEN8_ABILITY_IDS.cuteCharm: {
      // Source: Showdown data/abilities.ts -- Cute Charm: 30% infatuation on contact
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
            volatile: CORE_VOLATILE_IDS.infatuation,
          },
        ],
        messages: [`${name}'s Cute Charm infatuated the attacker!`],
      };
    }

    case GEN8_ABILITY_IDS.aftermath: {
      // Source: Showdown data/abilities.ts -- Aftermath: 1/4 attacker HP if holder fainted
      if (ctx.pokemon.pokemon.currentHp > 0) return NO_EFFECT;
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

    case GEN8_ABILITY_IDS.mummy: {
      // Source: Showdown data/abilities.ts -- Mummy: contact changes attacker's ability to Mummy
      const otherAbility = other.ability;
      if (
        !otherAbility ||
        otherAbility === GEN8_ABILITY_IDS.mummy ||
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
            newAbility: GEN8_ABILITY_IDS.mummy,
          },
        ],
        messages: [`${oppName}'s ability became Mummy!`],
      };
    }

    case GEN8_ABILITY_IDS.gooey:
    case GEN8_ABILITY_IDS.tanglingHair: {
      // Source: Showdown data/abilities.ts -- Gooey / Tangling Hair: -1 Speed to contact attacker
      const abilityName = abilityId === GEN8_ABILITY_IDS.gooey ? "Gooey" : "Tangling Hair";
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.opponent,
            stat: "speed",
            stages: -1,
          },
        ],
        messages: [`${name}'s ${abilityName} lowered the attacker's Speed!`],
      };
    }

    case GEN8_ABILITY_IDS.poisonTouch: {
      // Source: Showdown data/abilities.ts -- Poison Touch: 30% poison on own contact moves
      if (other.pokemon.status) return NO_EFFECT;
      if (ctx.rng.next() >= 0.3) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            status: CORE_STATUS_IDS.poison,
          },
        ],
        messages: [`${name}'s Poison Touch poisoned the target!`],
      };
    }

    case GEN8_ABILITY_IDS.pickpocket: {
      // Source: Showdown data/abilities.ts -- Pickpocket: steals attacker's item on contact
      if (ctx.pokemon.pokemon.heldItem) return NO_EFFECT;
      if (!other.pokemon.heldItem) return NO_EFFECT;
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Pickpocket stole ${oppName}'s ${other.pokemon.heldItem}!`],
      };
    }

    case GEN8_ABILITY_IDS.wanderingSpirit: {
      // Source: Showdown data/abilities.ts -- Wandering Spirit: swap abilities on contact
      // Doesn't work on unsuppressable abilities
      // Source: Bulbapedia "Wandering Spirit" -- swaps abilities with the attacker on contact
      const otherAbility = other.ability;
      if (!otherAbility || UNSUPPRESSABLE_ABILITIES.has(otherAbility)) {
        return NO_EFFECT;
      }
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.abilityChange,
            target: BATTLE_EFFECT_TARGETS.self,
            newAbility: otherAbility,
          },
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.abilityChange,
            target: BATTLE_EFFECT_TARGETS.opponent,
            newAbility: GEN8_ABILITY_IDS.wanderingSpirit,
          },
        ],
        messages: [`${name} and ${oppName} swapped Abilities!`],
      };
    }

    case GEN8_ABILITY_IDS.perishBody: {
      // Source: Showdown data/abilities.ts -- Perish Body: both get Perish Song on contact
      // Source: Bulbapedia "Perish Body" -- both Pokemon get 3-turn Perish Song countdown
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.self,
            volatile: CORE_VOLATILE_IDS.perishSong,
          },
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.opponent,
            volatile: CORE_VOLATILE_IDS.perishSong,
          },
        ],
        messages: [`${name}'s Perish Body activated!`, `Both Pokemon will faint in 3 turns!`],
      };
    }

    case GEN8_ABILITY_IDS.gulpMissile: {
      // Source: Showdown data/abilities.ts -- Gulp Missile: Cramorant spits projectile when hit
      // Gulping Form (Arrokuda) = 1/4 max HP damage + -1 Defense
      // Gorging Form (Pikachu) = 1/4 max HP damage + paralysis
      // Only triggers if Cramorant is in Gulping or Gorging form
      return handleGulpMissileOnHit(ctx);
    }

    case GEN8_ABILITY_IDS.iceFace: {
      // Source: Showdown data/abilities.ts -- Ice Face: blocks first physical hit
      // Only blocks physical moves; special moves go through
      // Source: Bulbapedia "Ice Face" -- "The Pokemon takes no damage from physical moves once."
      return handleIceFaceOnHit(ctx);
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-status-inflicted
// ---------------------------------------------------------------------------

/**
 * Handle "on-status-inflicted" abilities for Gen 8.
 *
 * Source: Showdown data/abilities.ts -- onAfterSetStatus / onSetStatus handlers
 */
function handleOnStatusInflicted(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case GEN8_ABILITY_IDS.synchronize: {
      // Source: Showdown data/abilities.ts -- Synchronize: passes burn/paralysis/poison
      if (!ctx.opponent) return NO_EFFECT;
      const status = ctx.pokemon.pokemon.status;
      if (!status) return NO_EFFECT;
      if (
        status !== CORE_STATUS_IDS.burn &&
        status !== CORE_STATUS_IDS.paralysis &&
        status !== CORE_STATUS_IDS.poison
      ) {
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
// on-before-move
// ---------------------------------------------------------------------------

/**
 * Handle "on-before-move" abilities for Gen 8.
 *
 * Source: Showdown data/abilities.ts -- onPrepareHit / onModifyType handlers
 */
function handleBeforeMove(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case GEN8_ABILITY_IDS.libero:
    case GEN8_ABILITY_IDS.protean: {
      // Source: Showdown data/abilities.ts -- Libero/Protean: changes type before attacking
      // Gen 8: activates on every move use (no once-per-switchin limit)
      // Source: specs/reference/gen8-ground-truth.md -- Libero/Protean: no once-per-switchin limit
      if (!ctx.move) return NO_EFFECT;
      const moveType = ctx.move.type as PokemonType;
      if (!moveType) return NO_EFFECT;

      // Don't change type if already that monotype
      if (ctx.pokemon.types.length === 1 && ctx.pokemon.types[0] === moveType) {
        return NO_EFFECT;
      }

      const name = getName(ctx);
      const abilityName = abilityId === GEN8_ABILITY_IDS.libero ? "Libero" : "Protean";
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

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-turn-end
// ---------------------------------------------------------------------------

/**
 * Handle "on-turn-end" abilities for Gen 8.
 *
 * Source: Showdown data/abilities.ts -- onResidual handlers
 */
function handleTurnEnd(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case GEN8_ABILITY_IDS.hungerSwitch: {
      // Source: Showdown data/abilities.ts -- Hunger Switch: Morpeko toggles form each turn
      // Changes between Full Belly Mode and Hangry Mode
      // Source: Bulbapedia "Hunger Switch" -- Morpeko (species 877) only
      if (ctx.pokemon.pokemon.speciesId !== 877) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} transformed!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// Gulp Missile sub-handler
// ---------------------------------------------------------------------------

/**
 * Handle Gulp Missile when Cramorant is hit while in Gulping or Gorging form.
 *
 * Cramorant species ID: 845
 * Gulping Form (Arrokuda): 25% damage to attacker + Defense -1
 * Gorging Form (Pikachu): 25% damage to attacker + paralysis
 *
 * Source: Showdown data/abilities.ts -- Gulp Missile onDamagingHit
 * Source: Bulbapedia "Gulp Missile"
 */
function handleGulpMissileOnHit(ctx: AbilityContext): AbilityResult {
  if (!ctx.opponent) return NO_EFFECT;
  // Only for Cramorant (species 845)
  if (ctx.pokemon.pokemon.speciesId !== 845) return NO_EFFECT;

  const name = getName(ctx);
  const otherMaxHp = ctx.opponent.pokemon.calculatedStats?.hp ?? ctx.opponent.pokemon.currentHp;
  const chipDamage = Math.max(1, Math.floor(otherMaxHp / 4));

  // Determine form from volatile status data
  // The engine should set a "gulp-missile-gulping" or "gulp-missile-gorging" volatile
  const isGulping = ctx.pokemon.volatileStatuses.has("gulp-missile-gulping" as never);
  const isGorging = ctx.pokemon.volatileStatuses.has("gulp-missile-gorging" as never);

  if (!isGulping && !isGorging) return NO_EFFECT;

  const effects: AbilityEffect[] = [
    {
      effectType: BATTLE_ABILITY_EFFECT_TYPES.chipDamage,
      target: BATTLE_EFFECT_TARGETS.opponent,
      value: chipDamage,
    },
  ];

  if (isGulping) {
    // Arrokuda form: Defense -1
    effects.push({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
      target: BATTLE_EFFECT_TARGETS.opponent,
      stat: "defense",
      stages: -1,
    });
  } else {
    // Pikachu form: paralysis
    if (!ctx.opponent.pokemon.status) {
      effects.push({
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statusInflict,
        target: BATTLE_EFFECT_TARGETS.opponent,
        status: CORE_STATUS_IDS.paralysis,
      });
    }
  }

  return {
    activated: true,
    effects,
    messages: [`${name} spat out its catch!`],
  };
}

// ---------------------------------------------------------------------------
// Ice Face sub-handler
// ---------------------------------------------------------------------------

/**
 * Handle Ice Face when Eiscue is hit by a physical move while in Ice Face form.
 *
 * Eiscue species ID: 875
 * Blocks the first physical hit and changes to Noice Face form.
 * Reforms to Ice Face form in hail (handled separately).
 *
 * Source: Showdown data/abilities.ts -- Ice Face onDamage
 * Source: Bulbapedia "Ice Face"
 */
function handleIceFaceOnHit(ctx: AbilityContext): AbilityResult {
  // Only for Eiscue (species 875)
  if (ctx.pokemon.pokemon.speciesId !== 875) return NO_EFFECT;

  // Only blocks physical moves
  if (!ctx.move || ctx.move.category !== "physical") return NO_EFFECT;

  // Check if Ice Face is active (not broken)
  if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.iceFaceBroken)) return NO_EFFECT;

  const name = getName(ctx);
  return {
    activated: true,
    effects: [
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
        target: BATTLE_EFFECT_TARGETS.self,
      },
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
        target: BATTLE_EFFECT_TARGETS.self,
        volatile: CORE_VOLATILE_IDS.iceFaceBroken,
      },
    ],
    messages: [`${name}'s Ice Face absorbed the damage!`],
  };
}

// ---------------------------------------------------------------------------
// Passive ability checks (exported for direct use)
// ---------------------------------------------------------------------------

/**
 * Check if an ability is a Mold Breaker variant.
 *
 * Source: Showdown data/abilities.ts -- moldbreaker/teravolt/turboblaze
 */
export function isMoldBreakerAbility(abilityId: string): boolean {
  return MOLD_BREAKER_ALIASES.has(abilityId);
}

/**
 * Check if Magic Guard blocks indirect damage for a Pokemon.
 *
 * Source: Showdown data/abilities.ts -- magicguard: onDamage (not 'moveDamage')
 * Source: Bulbapedia "Magic Guard" -- "Prevents all damage except from direct attacks."
 */
export function hasMagicGuard(abilityId: string): boolean {
  return abilityId === GEN8_ABILITY_IDS.magicGuard;
}

/**
 * Check if Overcoat blocks weather damage and powder moves.
 *
 * Source: Showdown data/abilities.ts -- overcoat: onImmunity('powder'), onImmunity('sandstorm'/'hail')
 * Source: Bulbapedia "Overcoat" Gen 6+ -- blocks weather damage AND powder moves
 */
export function hasOvercoat(abilityId: string): boolean {
  return abilityId === GEN8_ABILITY_IDS.overcoat;
}

/**
 * Check if Soundproof blocks a move by its sound-based flag.
 *
 * Source: Showdown data/abilities.ts -- soundproof: move.flags['sound']
 * Source: Bulbapedia "Soundproof" -- "Gives immunity to sound-based moves."
 */
export function isSoundproofBlocked(
  abilityId: string,
  moveFlags: Record<string, boolean>,
): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.soundproof) return false;
  return !!moveFlags.sound;
}

/**
 * Check if Bulletproof blocks a move by its ball/bomb flag.
 *
 * Source: Showdown data/abilities.ts -- bulletproof: move.flags['bullet']
 * Source: Bulbapedia "Bulletproof" -- "Protects from ball and bomb moves."
 */
export function isBulletproofBlocked(
  abilityId: string,
  moveFlags: Record<string, boolean>,
): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.bulletproof) return false;
  return !!moveFlags.bullet;
}

/**
 * Check if Damp prevents Self-Destruct/Explosion/Aftermath/Mind Blown.
 *
 * Source: Showdown data/abilities.ts -- damp: prevents Explosion, Self-Destruct, Aftermath, Mind Blown
 * Source: Bulbapedia "Damp" -- "Prevents the use of self-destructing moves."
 */
export function isDampBlocked(abilityId: string, moveId: string): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.damp) return false;
  return moveId === "self-destruct" || moveId === "explosion" || moveId === "mind-blown";
}

/**
 * Check if Shed Skin cures status at end of turn (33% chance).
 *
 * Source: Showdown data/abilities.ts -- shedskin: onResidualOrder, 1/3 chance
 * Source: Bulbapedia "Shed Skin" -- "Has a 1/3 chance of curing status at end of turn."
 */
export function rollShedSkin(abilityId: string, hasStatus: boolean, rngRoll: number): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.shedSkin) return false;
  if (!hasStatus) return false;
  return rngRoll < 1 / 3;
}

/**
 * Check if Harvest restores a consumed berry at end of turn.
 * 50% chance normally, 100% in sun.
 *
 * Source: Showdown data/abilities.ts -- harvest: onResidualOrder
 * Source: Bulbapedia "Harvest" -- "50% (100% in sun) chance to restore consumed berry"
 */
export function rollHarvest(
  abilityId: string,
  hasBerry: boolean,
  weatherType: string | null,
  rngRoll: number,
): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.harvest) return false;
  if (!hasBerry) return false;
  if (weatherType === CORE_WEATHER_IDS.sun) return true;
  return rngRoll < 0.5;
}

/**
 * Get the weather duration considering weather rock items.
 *
 * Source: Showdown data/items.ts -- damprock/heatrock/smoothrock/icyrock
 * Source: Bulbapedia -- each rock extends weather to 8 turns
 */
function getWeatherTurns(heldItem: string | null, weatherType: WeatherType): number {
  if (!heldItem) return BASE_WEATHER_TURNS;
  const rock = WEATHER_ROCK_MAP[heldItem];
  if (rock && rock.weather === weatherType) return rock.turns;
  return BASE_WEATHER_TURNS;
}

/**
 * Exported version for testing.
 */
export function getWeatherDuration(heldItem: string | null, weatherType: WeatherType): number {
  return getWeatherTurns(heldItem, weatherType);
}

// ---------------------------------------------------------------------------
// New Gen 8 ability checks (exported for direct use)
// ---------------------------------------------------------------------------

/**
 * Check if Screen Cleaner should remove screens on switch-in.
 *
 * Source: Showdown data/abilities.ts -- Screen Cleaner onStart
 * Source: specs/reference/gen8-ground-truth.md -- removes from BOTH sides
 */
export function isScreenCleaner(abilityId: string): boolean {
  return abilityId === GEN8_ABILITY_IDS.screenCleaner;
}

/**
 * Get the list of screen types that Screen Cleaner removes.
 *
 * Source: Showdown data/abilities.ts -- Screen Cleaner onStart: Reflect, Light Screen, Aurora Veil
 */
export function getScreenCleanerTargets(): readonly ScreenType[] {
  return SCREEN_CLEANER_SCREENS;
}

/**
 * Check if Mirror Armor should reflect a stat drop.
 * Only reflects stat drops caused by an opponent's move or ability.
 *
 * Source: Showdown data/abilities.ts -- Mirror Armor onTryBoost
 * Source: Bulbapedia "Mirror Armor" -- "Bounces back only stat-lowering effects"
 *
 * @param abilityId - The ability ID of the defender
 * @param stages - The signed stage delta (negative = drop)
 * @param source - Whether the stat change is from self or opponent
 * @returns true if the stat drop should be reflected back to the source
 */
export function shouldMirrorArmorReflect(
  abilityId: string,
  stages: number,
  source: "self" | "opponent",
): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.mirrorArmor) return false;
  // Only reflects drops (negative stages) from the opponent
  if (stages >= 0) return false;
  if (source !== "opponent") return false;
  return true;
}

/**
 * Check if Neutralizing Gas is active on the field.
 * Returns true if any active Pokemon on either side has Neutralizing Gas.
 *
 * Source: Showdown data/abilities.ts -- Neutralizing Gas: while on field, suppresses abilities
 * Source: Bulbapedia "Neutralizing Gas" -- affects all Pokemon on the field
 *
 * @param sideAbilities - Array of ability IDs of all active Pokemon on the field (both sides)
 */
export function isNeutralizingGasActive(sideAbilities: readonly string[]): boolean {
  return sideAbilities.some((a) => a === GEN8_ABILITY_IDS.neutralizingGas);
}

/**
 * Check if an ability is immune to Neutralizing Gas suppression.
 *
 * Source: Showdown data/abilities.ts -- Neutralizing Gas exceptions
 */
export function isNeutralizingGasImmune(abilityId: string): boolean {
  return NEUTRALIZING_GAS_IMMUNE_ABILITIES.has(abilityId);
}

/**
 * Check if Pastel Veil blocks a poison/toxic status condition.
 * Blocks for the holder AND allies.
 *
 * Source: Showdown data/abilities.ts -- Pastel Veil onAllySetStatus
 * Source: Bulbapedia "Pastel Veil" -- prevents poisoning for holder and allies
 *
 * @param activeSideAbilities - Abilities of all active Pokemon on the same side
 * @param status - The status being inflicted
 * @returns true if Pastel Veil blocks the status
 */
export function isPastelVeilBlocking(
  activeSideAbilities: readonly string[],
  status: string,
): boolean {
  if (status !== CORE_STATUS_IDS.poison && status !== CORE_STATUS_IDS.badlyPoisoned) {
    return false;
  }
  return activeSideAbilities.some((a) => a === GEN8_ABILITY_IDS.pastelVeil);
}

/**
 * Check if Wandering Spirit should swap abilities on contact.
 *
 * Source: Showdown data/abilities.ts -- Wandering Spirit onDamagingHit
 * Source: Bulbapedia "Wandering Spirit" -- swaps on contact
 */
export function shouldWanderingSpiritSwap(
  abilityId: string,
  trigger: AbilityTrigger,
  contactMade: boolean,
): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.wanderingSpirit) return false;
  if (trigger !== "on-contact") return false;
  return contactMade;
}

/**
 * Check if Perish Body should trigger on contact.
 *
 * Source: Showdown data/abilities.ts -- Perish Body onDamagingHit
 * Source: Bulbapedia "Perish Body" -- triggers on contact
 */
export function shouldPerishBodyTrigger(
  abilityId: string,
  trigger: AbilityTrigger,
  contactMade: boolean,
): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.perishBody) return false;
  if (trigger !== "on-contact") return false;
  return contactMade;
}

/**
 * Check if a Pokemon is Cramorant with Gulp Missile.
 *
 * Source: Showdown data/abilities.ts -- Gulp Missile: species check
 */
export function isCramorantWithGulpMissile(speciesId: number, abilityId: string): boolean {
  return speciesId === 845 && abilityId === GEN8_ABILITY_IDS.gulpMissile;
}

/**
 * Get the effect when Gulp Missile triggers (Cramorant spits projectile).
 *
 * @param form - "gulping" (Arrokuda) or "gorging" (Pikachu)
 * @param attackerMaxHp - Attacker's max HP for damage calculation
 * @returns Object with damage amount and secondary effect
 *
 * Source: Showdown data/abilities.ts -- Gulp Missile secondary effects
 * Source: Bulbapedia "Gulp Missile" -- 1/4 max HP damage
 */
export function getGulpMissileResult(
  form: "gulping" | "gorging",
  attackerMaxHp: number,
): { damage: number; secondaryEffect: "defense-drop" | "paralysis" } {
  const damage = Math.max(1, Math.floor(attackerMaxHp / 4));
  return {
    damage,
    secondaryEffect: form === "gulping" ? "defense-drop" : "paralysis",
  };
}

/**
 * Check if Eiscue's Ice Face is currently active (not broken).
 *
 * Source: Showdown data/abilities.ts -- Ice Face onDamage
 * Source: Bulbapedia "Ice Face" -- active when in Ice Face form
 *
 * @param speciesId - Pokemon species ID (875 = Eiscue)
 * @param abilityId - The ability ID
 * @param hasIceFaceBroken - Whether the ice-face-broken volatile is set
 */
export function isIceFaceActive(
  speciesId: number,
  abilityId: string,
  hasIceFaceBroken: boolean,
): boolean {
  if (speciesId !== 875) return false;
  if (abilityId !== GEN8_ABILITY_IDS.iceFace) return false;
  return !hasIceFaceBroken;
}

/**
 * Check if Eiscue's Ice Face should reform in hail.
 *
 * Source: Showdown data/abilities.ts -- Ice Face: reforms in Hail
 * Source: Bulbapedia "Ice Face" -- "If Hail is active, it will reform."
 */
export function shouldIceFaceReform(abilityId: string, weather: string | null): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.iceFace) return false;
  return weather === CORE_WEATHER_IDS.hail;
}

/**
 * Check if Hunger Switch should toggle Morpeko's form.
 *
 * Source: Showdown data/abilities.ts -- Hunger Switch onResidual
 * Source: Bulbapedia "Hunger Switch" -- Morpeko (species 877) toggles each turn
 */
export function shouldHungerSwitchToggle(abilityId: string, speciesId: number): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.hungerSwitch) return false;
  return speciesId === 877;
}

/**
 * Check if Libero/Protean should change the user's type.
 * In Gen 8, both activate on every move use (no once-per-switchin limit).
 *
 * Source: Showdown data/mods/gen8/ -- no once-per-switchin check for Protean/Libero
 * Source: specs/reference/gen8-ground-truth.md -- Libero/Protean pre-nerf
 */
export function isLiberoActive(abilityId: string): boolean {
  return abilityId === GEN8_ABILITY_IDS.libero || abilityId === GEN8_ABILITY_IDS.protean;
}
