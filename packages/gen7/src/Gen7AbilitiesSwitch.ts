import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger, WeatherType } from "@pokemon-lib-ts/core";
import { CORE_GENDERS, CORE_STAT_IDS, CORE_WEATHER_IDS } from "@pokemon-lib-ts/core";
import { GEN7_ABILITY_IDS, GEN7_ITEM_IDS, GEN7_SPECIES_IDS } from "./data/reference-ids";

/**
 * Gen 7 switch-in, switch-out, contact, and passive ability handlers.
 *
 * Carries forward all Gen 6 switch/contact abilities with Gen 7 additions:
 *   - Tangling Hair (new): -1 Speed to contact attacker (same as Gooey)
 *   - Weather rocks extend weather set by abilities to 8 turns
 *   - Trace ban list extended: adds Schooling, Comatose, Shields Down,
 *     Disguise, RKS System, Battle Bond, Power Construct
 *   - Mold Breaker / Teravolt / Turboblaze signal for ability suppression
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen7/abilities.ts
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
 * Abilities that cannot be copied by Trace in Gen 7.
 *
 * Source: Showdown data/abilities.ts -- trace.onUpdate
 * Source: Bulbapedia "Trace" Gen 7 -- cannot copy these abilities
 */
export const TRACE_UNCOPYABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN7_ABILITY_IDS.trace,
  GEN7_ABILITY_IDS.multitype,
  GEN7_ABILITY_IDS.forecast,
  GEN7_ABILITY_IDS.illusion,
  GEN7_ABILITY_IDS.flowerGift,
  GEN7_ABILITY_IDS.imposter,
  GEN7_ABILITY_IDS.zenMode,
  GEN7_ABILITY_IDS.stanceChange,
  GEN7_ABILITY_IDS.powerConstruct,
  GEN7_ABILITY_IDS.schooling,
  GEN7_ABILITY_IDS.comatose,
  GEN7_ABILITY_IDS.shieldsDown,
  GEN7_ABILITY_IDS.disguise,
  GEN7_ABILITY_IDS.rksSystem,
  GEN7_ABILITY_IDS.battleBond,
  GEN7_ABILITY_IDS.receiver,
  GEN7_ABILITY_IDS.powerOfAlchemy,
]);

/**
 * Abilities that cannot be overwritten by Mummy.
 *
 * Source: Showdown data/abilities.ts -- { isNonstandard: 'Future' } or cantsuppress
 */
export const UNSUPPRESSABLE_ABILITIES: ReadonlySet<string> = new Set([
  GEN7_ABILITY_IDS.multitype,
  GEN7_ABILITY_IDS.stanceChange,
  GEN7_ABILITY_IDS.schooling,
  GEN7_ABILITY_IDS.comatose,
  GEN7_ABILITY_IDS.shieldsDown,
  GEN7_ABILITY_IDS.disguise,
  GEN7_ABILITY_IDS.rksSystem,
  GEN7_ABILITY_IDS.battleBond,
  GEN7_ABILITY_IDS.powerConstruct,
]);

/**
 * Mold Breaker ability variants.
 *
 * Source: Showdown data/abilities.ts -- moldbreaker/teravolt/turboblaze
 */
export const MOLD_BREAKER_ALIASES: ReadonlySet<string> = new Set([
  GEN7_ABILITY_IDS.moldBreaker,
  GEN7_ABILITY_IDS.teravolt,
  GEN7_ABILITY_IDS.turboblaze,
]);

/**
 * Weather duration extension by weather rocks: 5 turns base, 8 with rock.
 *
 * Source: Bulbapedia -- individual rock item pages
 * Source: Showdown data/items.ts -- damprock/heatrock/smoothrock/icyrock
 */
const WEATHER_ROCK_MAP: Readonly<Record<string, { weather: WeatherType; turns: number }>> = {
  [GEN7_ITEM_IDS.dampRock]: { weather: CORE_WEATHER_IDS.rain, turns: 8 },
  [GEN7_ITEM_IDS.heatRock]: { weather: CORE_WEATHER_IDS.sun, turns: 8 },
  [GEN7_ITEM_IDS.smoothRock]: { weather: CORE_WEATHER_IDS.sand, turns: 8 },
  [GEN7_ITEM_IDS.icyRock]: { weather: CORE_WEATHER_IDS.hail, turns: 8 },
};

const BASE_WEATHER_TURNS = 5;

// ---------------------------------------------------------------------------
// Inactive sentinel
// ---------------------------------------------------------------------------

const NO_EFFECT: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a Gen 7 switch-in/switch-out/contact/passive ability trigger.
 *
 * @param trigger - The ability trigger type
 * @param context - The ability context
 */
export function handleGen7SwitchAbility(
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
    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-switch-in
// ---------------------------------------------------------------------------

/**
 * Handle "on-switch-in" abilities for Gen 7.
 *
 * Source: Showdown data/abilities.ts -- onStart handlers
 */
function handleSwitchIn(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "intimidate": {
      // Source: Showdown data/abilities.ts -- Intimidate lowers opponent's Attack by 1 stage
      // Blocked by Substitute
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
      // Source: Showdown data/abilities.ts -- Pressure onStart message
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is exerting its Pressure!`],
      };
    }

    case "drizzle": {
      // Source: Showdown data/abilities.ts -- Drizzle sets rain, 5 turns (8 with Damp Rock)
      // Source: Bulbapedia -- Drizzle Gen 6+: 5-turn rain on entry
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

    case "drought": {
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

    case "sand-stream": {
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

    case "snow-warning": {
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

    case "download": {
      // Source: Showdown data/abilities.ts -- Download: compare foe Def vs SpDef
      // If foe SpDef <= Def: raise SpA; if foe Def < SpDef: raise Atk
      // Source: Bulbapedia -- Download: checks opponent's lower defensive stat
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
      // Source: Showdown data/abilities.ts -- Trace: copies opponent's ability
      // Gen 7 ban list extends Gen 6 with Schooling, Comatose, Shields Down,
      // Disguise, RKS System, Battle Bond, Power Construct
      // Source: Bulbapedia "Trace" Gen VII -- cannot copy new Gen 7 form-changing abilities
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
      // Source: Showdown data/abilities.ts -- Mold Breaker onStart announcement
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} breaks the mold!`],
      };
    }

    case "teravolt": {
      // Source: Showdown data/abilities.ts -- Teravolt onStart announcement
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is radiating a bursting aura!`],
      };
    }

    case "turboblaze": {
      // Source: Showdown data/abilities.ts -- Turboblaze onStart announcement
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is radiating a blazing aura!`],
      };
    }

    case "imposter": {
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

    case "illusion": {
      // Source: Showdown data/abilities.ts -- Illusion: sets volatile on switch-in
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.self,
            volatile: "illusion",
          },
        ],
        messages: [],
      };
    }

    case "stance-change": {
      // Source: Showdown data/abilities.ts -- Stance Change (Aegislash)
      // Switch-in always resets to Shield Forme
      // Source: Bulbapedia "Stance Change" -- Shield Forme on entry
      if (ctx.pokemon.pokemon.speciesId !== GEN7_SPECIES_IDS.aegislash) return NO_EFFECT;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    // Receiver / Power of Alchemy: copies fallen ally's ability (Doubles only)
    // In singles, never triggers.
    // Source: Showdown data/abilities.ts -- receiver/powerofalchemy: onAllyFaint
    case "receiver":
    case "power-of-alchemy": {
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
 * Handle "on-switch-out" abilities for Gen 7.
 *
 * Source: Showdown data/abilities.ts -- onSwitchOut handlers
 */
function handleSwitchOut(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "regenerator": {
      // Source: Showdown data/abilities.ts -- Regenerator: heals 1/3 max HP on switch-out
      // Source: Bulbapedia -- Regenerator: "Restores 1/3 of its maximum HP upon switching out."
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
      // Source: Showdown data/abilities.ts -- Natural Cure: cures status on switch-out
      // Source: Bulbapedia -- Natural Cure: "All status conditions are healed upon switching out."
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
 * Handle "on-contact" abilities for Gen 7.
 *
 * For DEFENDER-side abilities (Static, Flame Body, Poison Point, Rough Skin,
 * Iron Barbs, Effect Spore, Cute Charm, Aftermath, Mummy, Gooey, Tangling Hair):
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
    case "static": {
      // Source: Showdown data/abilities.ts -- Static: 30% paralysis on contact
      // Source: Bulbapedia -- Static: "30% chance of paralyzing the attacker on contact."
      if (other.pokemon.status) return NO_EFFECT;
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
      // Source: Showdown data/abilities.ts -- Flame Body: 30% burn on contact
      // Source: Bulbapedia -- Flame Body: "30% chance of burning the attacker on contact."
      if (other.pokemon.status) return NO_EFFECT;
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
      // Source: Showdown data/abilities.ts -- Poison Point: 30% poison on contact
      // Source: Bulbapedia -- Poison Point: "30% chance of poisoning the attacker on contact."
      if (other.pokemon.status) return NO_EFFECT;
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
      // Source: Showdown data/abilities.ts -- Rough Skin / Iron Barbs: 1/8 attacker HP on contact
      // Source: Bulbapedia -- Rough Skin: "Damages the attacker for 1/8 of its max HP on contact."
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
      // Source: Showdown data/abilities.ts -- Effect Spore: single random(100) roll
      // 0-9 = sleep, 10-19 = paralysis, 20-29 = poison, 30-99 = nothing
      // Grass types are immune (Gen 5+); Overcoat also blocks
      if (other.pokemon.status) return NO_EFFECT;
      if (other.types.includes("grass")) return NO_EFFECT;
      if (other.ability === "overcoat") return NO_EFFECT;
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
      // Source: Showdown data/abilities.ts -- Cute Charm: 30% infatuation on contact
      // Requires opposite genders, fails if genderless
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
      // Source: Showdown data/abilities.ts -- Aftermath: 1/4 attacker HP if holder fainted
      // Only triggers if the holder has 0 HP (fainted).
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

    case "mummy": {
      // Source: Showdown data/abilities.ts -- Mummy: contact changes attacker's ability to Mummy.
      // Cannot overwrite unsuppressable abilities or Mummy itself.
      const otherAbility = other.ability;
      if (!otherAbility || otherAbility === "mummy" || UNSUPPRESSABLE_ABILITIES.has(otherAbility)) {
        return NO_EFFECT;
      }
      const oppName = getOpponentName(ctx);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.abilityChange,
            target: BATTLE_EFFECT_TARGETS.opponent,
            newAbility: "mummy",
          },
        ],
        messages: [`${oppName}'s ability became Mummy!`],
      };
    }

    case "gooey":
    case "tangling-hair": {
      // Source: Showdown data/abilities.ts -- Gooey / Tangling Hair: -1 Speed to contact attacker
      // Tangling Hair is new in Gen 7 (Alolan Dugtrio), same effect as Gooey.
      // Source: Bulbapedia "Gooey" -- "-1 Speed to attacker on contact"
      // Source: Bulbapedia "Tangling Hair" -- introduced Gen 7, same effect as Gooey
      const abilityName = abilityId === "gooey" ? "Gooey" : "Tangling Hair";
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
            target: BATTLE_EFFECT_TARGETS.opponent,
            stat: CORE_STAT_IDS.speed,
            stages: -1,
          },
        ],
        messages: [`${name}'s ${abilityName} lowered the attacker's Speed!`],
      };
    }

    case "poison-touch": {
      // Source: Showdown data/abilities.ts -- Poison Touch: 30% poison on own contact moves.
      // ATTACKER-side ability: ctx.pokemon = attacker, ctx.opponent = defender.
      if (other.pokemon.status) return NO_EFFECT;
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
      // Source: Showdown data/abilities.ts -- Pickpocket: steals attacker's item on contact.
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

    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// on-status-inflicted
// ---------------------------------------------------------------------------

/**
 * Handle "on-status-inflicted" abilities for Gen 7.
 *
 * Synchronize: copies burn/paralysis/poison back to the source.
 *
 * Source: Showdown data/abilities.ts -- Synchronize onAfterSetStatus
 */
function handleOnStatusInflicted(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = getName(ctx);

  switch (abilityId) {
    case "synchronize": {
      // Source: Showdown data/abilities.ts -- Synchronize: passes burn/paralysis/poison
      // Does NOT spread sleep or freeze.
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
 * Magic Guard prevents all indirect damage:
 *   - Weather chip (sand/hail)
 *   - Status damage (burn/poison)
 *   - Life Orb recoil
 *   - Entry hazard damage
 *   - Leech Seed
 *   - Curse (Ghost)
 *   - Bad Dreams
 *   - Binding moves (Bind, Wrap, etc.)
 *
 * Source: Showdown data/abilities.ts -- magicguard: onDamage (not 'moveDamage')
 * Source: Bulbapedia "Magic Guard" -- "Prevents all damage except from direct attacks."
 */
export function hasMagicGuard(abilityId: string): boolean {
  return abilityId === "magic-guard";
}

/**
 * Check if Overcoat blocks weather damage and powder moves.
 *
 * Source: Showdown data/abilities.ts -- overcoat: onImmunity('powder'), onImmunity('sandstorm'/'hail')
 * Source: Bulbapedia "Overcoat" Gen 6+ -- blocks weather damage AND powder moves
 */
export function hasOvercoat(abilityId: string): boolean {
  return abilityId === "overcoat";
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
  if (abilityId !== "soundproof") return false;
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
  if (abilityId !== "bulletproof") return false;
  return !!moveFlags.bullet;
}

/**
 * Check if Damp prevents Self-Destruct/Explosion/Aftermath.
 *
 * Source: Showdown data/abilities.ts -- damp: prevents Explosion, Self-Destruct, Aftermath
 * Source: Bulbapedia "Damp" -- "Prevents the use of self-destructing moves."
 */
export function isDampBlocked(abilityId: string, moveId: string): boolean {
  if (abilityId !== "damp") return false;
  return moveId === "self-destruct" || moveId === "explosion" || moveId === "mind-blown";
}

/**
 * Check if Shed Skin cures status at end of turn (33% chance).
 *
 * Source: Showdown data/abilities.ts -- shedskin: onResidualOrder, 1/3 chance
 * Source: Bulbapedia "Shed Skin" -- "Has a 1/3 chance of curing status at end of turn."
 */
export function rollShedSkin(abilityId: string, hasStatus: boolean, rngRoll: number): boolean {
  if (abilityId !== "shed-skin") return false;
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
  if (abilityId !== "harvest") return false;
  if (!hasBerry) return false;
  if (weatherType === CORE_WEATHER_IDS.sun) return true;
  return rngRoll < 0.5;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

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
