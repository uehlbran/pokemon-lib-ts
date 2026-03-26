import type {
  AbilityContext,
  AbilityEffect,
  AbilityResult,
  ActivePokemon,
} from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  PokemonType,
  PrimaryStatus,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";

const ABILITY_EFFECT = BATTLE_ABILITY_EFFECT_TYPES;
const EFFECT_TARGET = BATTLE_EFFECT_TARGETS;

/**
 * Gen 3 Abilities — applyAbility dispatch.
 *
 * Handles triggers:
 *   - "on-switch-in": Intimidate, Drizzle, Drought, Sand Stream, Trace, Pressure
 *   - "on-contact": Static, Flame Body, Poison Point, Rough Skin, Effect Spore, Cute Charm
 *   - "on-turn-end": Speed Boost, Rain Dish, Shed Skin
 *   - "passive-immunity": Volt Absorb, Water Absorb, Flash Fire, Levitate, Lightning Rod, Soundproof, Sturdy
 *   - "on-before-move": Truant
 *   - "on-damage-taken": Color Change
 *   - "on-status-inflicted": Synchronize
 *
 * Note: Snow Warning is NOT a Gen 3 ability. It was introduced in Gen 4 with
 * Abomasnow in Diamond/Pearl. Do not implement it here.
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects
 */

// ─── Status / Volatile Immunity Maps ────────────────────────────────────────

/**
 * Ability-based status immunities in Gen 3.
 *
 * Source: pret/pokeemerald src/battle_util.c — ability checks in CanBeStatusd
 * Source: Bulbapedia — individual ability immunity listings
 */
export const GEN3_ABILITY_STATUS_IMMUNITIES: ReadonlyMap<string, readonly PrimaryStatus[]> =
  new Map<string, readonly PrimaryStatus[]>([
    ["immunity", ["poison", "badly-poisoned"]],
    ["insomnia", ["sleep"]],
    ["vital-spirit", ["sleep"]],
    ["limber", ["paralysis"]],
    ["water-veil", ["burn"]],
    ["magma-armor", ["freeze"]],
    // Own Tempo prevents confusion (volatile, not primary status — handled separately)
  ]);

/**
 * Ability-based volatile status immunities in Gen 3.
 *
 * Source: pret/pokeemerald src/battle_util.c — ability checks for volatile statuses
 * Source: Bulbapedia — Inner Focus, Own Tempo, Oblivious
 */
export const GEN3_ABILITY_VOLATILE_IMMUNITIES: ReadonlyMap<string, readonly VolatileStatus[]> =
  new Map<string, readonly VolatileStatus[]>([
    ["inner-focus", ["flinch"]],
    ["own-tempo", ["confusion"]],
    ["oblivious", ["infatuation"]],
  ]);

/**
 * Check whether an ability blocks a primary status in Gen 3.
 *
 * @param abilityId - The target's ability
 * @param status - The status being inflicted
 * @returns true if the ability blocks the status
 *
 * Source: pret/pokeemerald src/battle_util.c — ability immunity checks
 */
export function isGen3AbilityStatusImmune(abilityId: string, status: PrimaryStatus): boolean {
  const immunities = GEN3_ABILITY_STATUS_IMMUNITIES.get(abilityId);
  if (!immunities) return false;
  return immunities.includes(status);
}

/**
 * Check whether an ability blocks a volatile status in Gen 3.
 *
 * @param abilityId - The target's ability
 * @param volatile - The volatile status being inflicted
 * @returns true if the ability blocks the volatile
 *
 * Source: pret/pokeemerald src/battle_util.c — ability volatile immunity checks
 */
export function isGen3VolatileBlockedByAbility(
  abilityId: string,
  volatile: VolatileStatus,
): boolean {
  const immunities = GEN3_ABILITY_VOLATILE_IMMUNITIES.get(abilityId);
  if (!immunities) return false;
  return immunities.includes(volatile);
}

// ─── Contact Status Helper ──────────────────────────────────────────────────

/**
 * Check whether a contact-ability status (e.g., Static's paralysis) can be
 * inflicted on the target, considering both type immunities and ability immunities.
 *
 * This is the Gen 3 equivalent of canInflictGen4Status for contact ability triggers.
 *
 * Source: pret/pokeemerald src/battle_util.c — contact ability infliction checks
 */
function canInflictContactStatus(status: PrimaryStatus, target: ActivePokemon): boolean {
  // Already has a primary status
  if (target.pokemon.status !== null) return false;

  // Type immunities
  // Source: pret/pokeemerald src/battle_util.c — type-based status immunities
  // NOTE: No Electric-type paralysis immunity in Gen 3. That was added in Gen 6.
  // Source: Bulbapedia — "In Generation VI onward, Electric-type Pokemon are immune to paralysis."
  const typeImmunities: Record<string, readonly string[]> = {
    burn: ["fire"],
    poison: ["poison", "steel"],
    "badly-poisoned": ["poison", "steel"],
    freeze: ["ice"],
    // No paralysis immunity for Electric types in Gen 3
  };
  const immuneTypes = typeImmunities[status];
  if (immuneTypes) {
    for (const type of target.types) {
      if (immuneTypes.includes(type)) return false;
    }
  }

  // Ability immunities
  if (isGen3AbilityStatusImmune(target.ability, status)) return false;

  return true;
}

// ─── Stat-Drop Immunity ─────────────────────────────────────────────────────

/**
 * Check whether an ability blocks a stat drop for a specific stat in Gen 3.
 *
 * - Clear Body / White Smoke: block ALL stat drops from opponents
 * - Hyper Cutter: blocks Attack drops from opponents
 * - Keen Eye: blocks Accuracy drops from opponents
 *
 * Note: these abilities only block drops from OPPONENT sources.
 * Self-inflicted drops (e.g., Superpower, Close Combat) are not blocked.
 * The `certain` parameter in pokeemerald gates this — moves that forcibly lower
 * stats on the user (like Overheat) set certain=TRUE, bypassing these checks.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:6987-7033
 *   - ABILITY_CLEAR_BODY / ABILITY_WHITE_SMOKE: block all stat drops (!certain)
 *   - ABILITY_KEEN_EYE: block accuracy drops (!certain && statId == STAT_ACC)
 *   - ABILITY_HYPER_CUTTER: block attack drops (!certain && statId == STAT_ATK)
 */
export function isGen3StatDropBlocked(abilityId: string, stat: string): boolean {
  // Clear Body / White Smoke: block ALL stat drops
  if (abilityId === "clear-body" || abilityId === "white-smoke") {
    return true;
  }
  // Hyper Cutter: blocks Attack drops only
  if (abilityId === "hyper-cutter" && stat === "attack") {
    return true;
  }
  // Keen Eye: blocks Accuracy drops only
  if (abilityId === "keen-eye" && stat === "accuracy") {
    return true;
  }
  return false;
}

// ─── Weather Suppression ────────────────────────────────────────────────────

/**
 * Abilities that suppress weather effects while the holder is on the field.
 *
 * When a Pokemon with one of these abilities is active, all weather effects
 * (damage, type modifiers, weather-dependent accuracy/moves) are treated as
 * if no weather is present.
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_CLOUD_NINE / ABILITY_AIR_LOCK
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
export const WEATHER_SUPPRESSING_ABILITIES: ReadonlySet<string> = new Set([
  "cloud-nine",
  "air-lock",
]);

/**
 * Check if weather effects are suppressed by an active Pokemon's ability.
 *
 * Returns true if either the pokemon or opponent has Cloud Nine / Air Lock,
 * meaning weather should be treated as absent for damage, accuracy, and
 * end-of-turn weather effects.
 *
 * Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT macro
 *   checks IsAbilityOnField(ABILITY_CLOUD_NINE) || IsAbilityOnField(ABILITY_AIR_LOCK)
 */
export function isWeatherSuppressedGen3(
  pokemon: ActivePokemon | undefined,
  opponent: ActivePokemon | undefined,
): boolean {
  if (pokemon && WEATHER_SUPPRESSING_ABILITIES.has(pokemon.ability)) return true;
  if (opponent && WEATHER_SUPPRESSING_ABILITIES.has(opponent.ability)) return true;
  return false;
}

// ─── Forecast Helper ────────────────────────────────────────────────────────

/**
 * Determine Castform's type based on weather.
 *
 * Forecast changes Castform's type and form:
 *   - Sun → Fire
 *   - Rain → Water
 *   - Hail → Ice
 *   - No weather / Sandstorm → Normal
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_FORECAST / GetCastformForm
 * Source: Bulbapedia — "Forecast changes Castform's type based on the weather"
 */
function getForecastType(weather: string | null): PokemonType {
  switch (weather) {
    case "sun":
      return "fire";
    case "rain":
      return "water";
    case "hail":
      return "ice";
    default:
      return "normal"; // Sandstorm and no weather both → Normal
  }
}

// ─── Main Dispatch ──────────────────────────────────────────────────────────

/**
 * Dispatch an ability trigger for Gen 3.
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects
 */
export function applyGen3Ability(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
  const abilityId = context.pokemon.ability;

  switch (trigger) {
    case CORE_ABILITY_TRIGGER_IDS.onSwitchIn:
      return handleSwitchIn(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onContact:
      return handleOnContact(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onTurnEnd:
      return handleTurnEnd(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.passiveImmunity:
      return handlePassiveImmunity(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onBeforeMove:
      return handleBeforeMove(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onDamageTaken:
      return handleDamageTaken(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onStatusInflicted:
      return handleStatusInflicted(abilityId, context);
    case CORE_ABILITY_TRIGGER_IDS.onWeatherChange:
      return handleWeatherChange(abilityId, context);
    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ─── On-Switch-In ───────────────────────────────────────────────────────────

/**
 * Handle "on-switch-in" abilities for Gen 3.
 *
 * Implemented:
 *   - Intimidate: lowers opponent's Attack by 1 stage
 *   - Drizzle: sets permanent rain
 *   - Drought: sets permanent sun
 *   - Sand Stream: sets permanent sandstorm
 *   - Trace: copies opponent's ability
 *   - Pressure: announces on switch-in (PP cost handled via getPPCost)
 *
 * Not implemented (require more engine support):
 *   - Cloud Nine / Air Lock: suppresses weather (needs weather suppression system)
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects ABILITYEFFECT_ON_SWITCHIN
 */
function handleSwitchIn(abilityId: string, context: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "intimidate": {
      // Source: pret/pokeemerald ABILITY_INTIMIDATE — lowers opponent's Attack by 1 stage
      // Source: pret/pokeemerald src/battle_script_commands.c:4141-4145 — stat drop blocked by
      //   Clear Body, White Smoke, Hyper Cutter (for Attack), and Keen Eye (for Accuracy)
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);

      // Check if opponent's ability blocks the Attack drop
      // Source: pret/pokeemerald src/battle_script_commands.c:4142-4145
      if (isGen3StatDropBlocked(context.opponent.ability, "attack")) {
        return {
          activated: true,
          effects: [],
          messages: [
            `${name}'s Intimidate!`,
            `${oppName}'s ${context.opponent.ability === "hyper-cutter" ? "Hyper Cutter" : context.opponent.ability === "clear-body" ? "Clear Body" : "White Smoke"} prevents stat loss!`,
          ],
        };
      }

      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.statChange,
        target: EFFECT_TARGET.opponent,
        stat: CORE_STAT_IDS.attack,
        stages: -1,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Intimidate cut ${oppName}'s Attack!`],
      };
    }

    case "drizzle": {
      // Source: pret/pokeemerald ABILITY_DRIZZLE — sets permanent rain on switch-in
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.weatherSet,
        target: EFFECT_TARGET.field,
        weather: "rain",
        weatherTurns: -1, // Gen 3: permanent weather from abilities (-1 = infinite)
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case "drought": {
      // Source: pret/pokeemerald ABILITY_DROUGHT — sets permanent sun on switch-in
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.weatherSet,
        target: EFFECT_TARGET.field,
        weather: "sun",
        weatherTurns: -1, // Gen 3: permanent weather from abilities (-1 = infinite)
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case "sand-stream": {
      // Source: pret/pokeemerald ABILITY_SAND_STREAM — sets permanent sandstorm on switch-in
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.weatherSet,
        target: EFFECT_TARGET.field,
        weather: "sand",
        weatherTurns: -1, // Gen 3: permanent weather from abilities (-1 = infinite)
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    case "trace": {
      // Trace: copies the opponent's ability on switch-in.
      //
      // Source: pret/pokeemerald src/battle_util.c:3020-3060 — ABILITYEFFECT_TRACE
      //   pokeemerald checks gBattleMons[target].ability != ABILITY_TRACE &&
      //   gBattleMons[target].ability != ABILITY_NONE.
      //   Trace CANNOT copy Trace on the original cartridge.
      //
      // Source: Showdown data/mods/gen3/abilities.ts — trace.onStart copies foe ability (blocks trace)
      // Source: Bulbapedia/Trace — "Trace cannot copy Trace"
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const uncopyable = ["trace", CORE_ABILITY_IDS.none]; // Trace cannot copy itself or the repo's "no ability" sentinel
      const opponentAbility = context.opponent.ability;
      if (!opponentAbility || uncopyable.includes(opponentAbility)) {
        return { activated: false, effects: [], messages: [] };
      }
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: ABILITY_EFFECT.abilityChange,
        target: EFFECT_TARGET.self,
        newAbility: opponentAbility,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name} traced ${oppName}'s ${opponentAbility}!`],
      };
    }

    case "pressure": {
      // Pressure: announced on switch-in, no immediate effect.
      // The actual PP doubling is handled via getPPCost() in Gen3Ruleset.
      // Source: pret/pokeemerald — ABILITY_PRESSURE announces on entry
      // Source: Bulbapedia — "Pressure is announced on entry"
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      return {
        activated: true,
        effects: [],
        messages: [`${name} is exerting its Pressure!`],
      };
    }

    case "cloud-nine":
    case "air-lock": {
      // Cloud Nine / Air Lock: suppress all weather effects while on the field.
      // The actual suppression is handled by isWeatherSuppressedGen3() checks in
      // damage calc, accuracy, and weather effects. The switch-in handler just
      // announces the ability.
      //
      // Source: pret/pokeemerald src/battle_util.c — ABILITY_CLOUD_NINE / ABILITY_AIR_LOCK
      //   triggers ABILITYEFFECT_ON_SWITCHIN announcement
      // Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const abilityDisplayName = abilityId === "cloud-nine" ? "Cloud Nine" : "Air Lock";
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s ${abilityDisplayName} negates the weather!`],
      };
    }

    case "forecast": {
      // Forecast: Castform changes type and form based on weather.
      // On switch-in, set Castform's type to match the current weather.
      // If weather is suppressed (Cloud Nine/Air Lock), Castform stays Normal.
      //
      // Gen 3: Forecast only has an effect on Castform (speciesId 351). If Trace copies
      // Forecast onto another species, the copied Forecast is inert (no type change).
      //
      // Source: pret/pokeemerald src/battle_util.c — ABILITY_FORECAST / GetCastformForm
      //   pokeemerald explicitly checks IS_CASTFORM_SPECIES before changing type/form.
      // Source: Bulbapedia — "Forecast changes Castform's type based on the weather"
      if (context.pokemon.pokemon.speciesId !== 351) {
        // Non-Castform holder (e.g., via Trace) — Forecast has no effect
        return { activated: false, effects: [], messages: [] };
      }
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const weather = context.state.weather?.type ?? null;

      // Weather is suppressed if Cloud Nine / Air Lock is on the field
      const suppressed = isWeatherSuppressedGen3(context.pokemon, context.opponent);
      const effectiveWeather = suppressed ? null : weather;
      const newType = getForecastType(effectiveWeather);

      // Only activate if the type would actually change
      const currentTypes = context.pokemon.types;
      if (currentTypes.length === 1 && currentTypes[0] === newType) {
        return { activated: false, effects: [], messages: [] };
      }
      if (currentTypes.length === 0 && newType === "normal") {
        return { activated: false, effects: [], messages: [] };
      }

      return {
        activated: true,
        effects: [
          { effectType: ABILITY_EFFECT.typeChange, target: EFFECT_TARGET.self, types: [newType] },
        ],
        messages: [`${name} transformed into the ${newType} type!`],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ─── On-Contact ─────────────────────────────────────────────────────────────

/**
 * Handle "on-contact" abilities for Gen 3.
 *
 * When the defending Pokemon (context.pokemon) is hit by a contact move,
 * these abilities may trigger effects on the attacker (context.opponent).
 *
 * Implemented:
 *   - Static: 33.3% (1/3) chance to paralyze attacker
 *   - Flame Body: 33.3% (1/3) chance to burn attacker
 *   - Poison Point: 33.3% (1/3) chance to poison attacker
 *   - Rough Skin: 1/16 attacker's max HP chip damage (Gen 3 = 1/16, Gen 4+ = 1/8)
 *   - Effect Spore: 10% chance total; if triggered, 1/3 each for poison/paralysis/sleep
 *   - Cute Charm: 33.3% (1/3) chance to infatuate attacker (requires opposite gender)
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects contact checks
 */
function handleOnContact(abilityId: string, context: AbilityContext): AbilityResult {
  const attacker = context.opponent;
  if (!attacker) return { activated: false, effects: [], messages: [] };

  switch (abilityId) {
    case "static": {
      // Source: pret/pokeemerald src/battle_util.c:2821-2827 — Static: (Random() % 3) == 0 = 33.3%
      // Note: Gen 3 uses 1/3 (33.3%), NOT 30%. Gen 4+ changed to % 10 < 3 (30%).
      if (attacker.pokemon.status) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 1 / 3) return { activated: false, effects: [], messages: [] };
      if (!canInflictContactStatus("paralysis", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statusInflict,
            target: EFFECT_TARGET.opponent,
            status: CORE_STATUS_IDS.paralysis,
          },
        ],
        messages: [],
      };
    }

    case "flame-body": {
      // Source: pret/pokeemerald src/battle_util.c:2836-2842 — Flame Body: (Random() % 3) == 0 = 33.3%
      // Note: Gen 3 uses 1/3 (33.3%), NOT 30%. Gen 4+ changed to % 10 < 3 (30%).
      if (attacker.pokemon.status) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 1 / 3) return { activated: false, effects: [], messages: [] };
      if (!canInflictContactStatus("burn", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statusInflict,
            target: EFFECT_TARGET.opponent,
            status: CORE_STATUS_IDS.burn,
          },
        ],
        messages: [],
      };
    }

    case "poison-point": {
      // Source: pret/pokeemerald src/battle_util.c:2806-2812 — Poison Point: (Random() % 3) == 0 = 33.3%
      // Note: Gen 3 uses 1/3 (33.3%), NOT 30%. Gen 4+ changed to % 10 < 3 (30%).
      if (attacker.pokemon.status) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 1 / 3) return { activated: false, effects: [], messages: [] };
      if (!canInflictContactStatus("poison", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statusInflict,
            target: EFFECT_TARGET.opponent,
            status: CORE_STATUS_IDS.poison,
          },
        ],
        messages: [],
      };
    }

    case "rough-skin": {
      // Source: pret/pokeemerald — Rough Skin: deals 1/16 attacker's max HP on contact
      // Gen 3 uses 1/16 (Gen 4+ uses 1/8)
      // Source: Bulbapedia — "In Generation III, it causes 1/16 of the attacker's maximum HP"
      const attackerMaxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      const chipDamage = Math.max(1, Math.floor(attackerMaxHp / 16));
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.chipDamage,
            target: EFFECT_TARGET.opponent,
            value: chipDamage,
          },
        ],
        messages: [],
      };
    }

    case "effect-spore": {
      // Source: pret/pokeemerald src/battle_util.c:2782-2804 — Effect Spore:
      //   (Random() % 10) == 0 = 10% total trigger chance (NOT 30%)
      //   Then picks MOVE_EFFECT via (Random() & 3), rerolling 0, giving equal 1/3 for each:
      //     1 = MOVE_EFFECT_SLEEP, 2 = MOVE_EFFECT_POISON, 3 = MOVE_EFFECT_BURN → PARALYSIS
      // Note: Gen 3 uses 10% total (3.33% per status). Gen 4+ uses 30% total (10% per status).
      if (attacker.pokemon.status) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 0.1) return { activated: false, effects: [], messages: [] };
      // Pick one of three statuses with equal probability (1/3 each)
      // Source: pokeemerald — do { r = Random() & 3; } while (r == 0); → 1, 2, or 3
      const roll = context.rng.next();
      if (roll < 1 / 3) {
        // MOVE_EFFECT_SLEEP (value 1)
        if (!canInflictContactStatus("sleep", attacker))
          return { activated: false, effects: [], messages: [] };
        return {
          activated: true,
          effects: [
            {
              effectType: ABILITY_EFFECT.statusInflict,
              target: EFFECT_TARGET.opponent,
              status: CORE_STATUS_IDS.sleep,
            },
          ],
          messages: [],
        };
      }
      if (roll < 2 / 3) {
        // MOVE_EFFECT_POISON (value 2)
        if (!canInflictContactStatus("poison", attacker))
          return { activated: false, effects: [], messages: [] };
        return {
          activated: true,
          effects: [
            {
              effectType: ABILITY_EFFECT.statusInflict,
              target: EFFECT_TARGET.opponent,
              status: CORE_STATUS_IDS.poison,
            },
          ],
          messages: [],
        };
      }
      // MOVE_EFFECT_BURN → replaced with MOVE_EFFECT_PARALYSIS (value 3 → adjusted to paralysis)
      if (!canInflictContactStatus("paralysis", attacker))
        return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statusInflict,
            target: EFFECT_TARGET.opponent,
            status: CORE_STATUS_IDS.paralysis,
          },
        ],
        messages: [],
      };
    }

    case "cute-charm": {
      // Source: pret/pokeemerald src/battle_util.c:2851-2858 — Cute Charm: (Random() % 3) == 0 = 33.3%
      // Note: Gen 3 uses 1/3 (33.3%), NOT 30%. Gen 4+ changed to % 10 < 3 (30%).
      if (context.rng.next() >= 1 / 3) return { activated: false, effects: [], messages: [] };
      const defenderGender = context.pokemon.pokemon.gender;
      const attackerGender = attacker.pokemon.gender;
      if (
        !defenderGender ||
        !attackerGender ||
        defenderGender === CORE_GENDERS.genderless ||
        attackerGender === CORE_GENDERS.genderless ||
        defenderGender === attackerGender
      ) {
        return { activated: false, effects: [], messages: [] };
      }
      // Oblivious blocks infatuation
      if (isGen3VolatileBlockedByAbility(attacker.ability, "infatuation")) {
        return { activated: false, effects: [], messages: [] };
      }
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.volatileInflict,
            target: EFFECT_TARGET.opponent,
            volatile: CORE_VOLATILE_IDS.infatuation,
          },
        ],
        messages: [],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ─── On-Turn-End ────────────────────────────────────────────────────────────

/**
 * Handle "on-turn-end" abilities for Gen 3.
 *
 * Implemented:
 *   - Truant: toggle the "truant-turn" volatile (loafing <-> acting)
 *   - Speed Boost: +1 Speed each turn
 *   - Rain Dish: heal 1/16 max HP in rain
 *   - Shed Skin: 1/3 chance to cure primary status
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects end-of-turn
 */
function handleTurnEnd(abilityId: string, context: AbilityContext): AbilityResult {
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  const weather = context.state.weather?.type ?? null;
  const maxHp = context.pokemon.pokemon.calculatedStats?.hp ?? context.pokemon.pokemon.currentHp;

  switch (abilityId) {
    case "truant": {
      // Source: pret/pokeemerald src/battle_util.c — Truant toggle at ABILITYEFFECT_ENDTURN, not at move execution
      // Toggle the "truant-turn" volatile: if present, remove it (next turn can act);
      // if absent, set it (next turn will loaf). This fires every turn regardless of
      // whether the Pokemon successfully moved (e.g., even if paralyzed/frozen/asleep).
      const hasTruantTurn = context.pokemon.volatileStatuses.has("truant-turn");
      if (hasTruantTurn) {
        context.pokemon.volatileStatuses.delete("truant-turn");
      } else {
        context.pokemon.volatileStatuses.set("truant-turn", { turnsLeft: -1 });
      }
      // The toggle itself is silent — no message is emitted.
      return { activated: true, effects: [], messages: [] };
    }

    case "speed-boost": {
      // Source: pret/pokeemerald src/battle_util.c:2642-2643 — Speed Boost:
      //   gDisableStructs[battler].isFirstTurn != 2 — does NOT activate on the first turn
      //   after switching in.
      // turnsOnField is 0 on the first end-of-turn after switch-in (incremented after EoT).
      // Source: Bulbapedia — "Speed Boost raises Speed by 1 at the end of each turn"
      //   (but confirmed by decomp: not on the very first turn)
      if (context.pokemon.turnsOnField === 0) {
        return { activated: false, effects: [], messages: [] };
      }
      return {
        activated: true,
        effects: [
          {
            effectType: ABILITY_EFFECT.statChange,
            target: EFFECT_TARGET.self,
            stat: CORE_STAT_IDS.speed,
            stages: 1,
          },
        ],
        messages: [`${name}'s Speed Boost raised its Speed!`],
      };
    }

    case "rain-dish": {
      // Source: pret/pokeemerald — Rain Dish: heal 1/16 max HP in rain
      // Source: Bulbapedia — Rain Dish heals 1/16 each turn during rain
      // Cloud Nine / Air Lock suppress weather, so Rain Dish does not activate.
      // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT check
      const effectiveWeatherForRainDish = isWeatherSuppressedGen3(context.pokemon, context.opponent)
        ? null
        : weather;
      if (effectiveWeatherForRainDish !== "rain")
        return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmt }],
        messages: [`${name}'s Rain Dish restored some HP!`],
      };
    }

    case "shed-skin": {
      // Source: pret/pokeemerald — Shed Skin: 1/3 chance to cure status each turn
      // Source: Bulbapedia — Shed Skin has a 1/3 chance of curing a status at end of turn
      if (!context.pokemon.pokemon.status) return { activated: false, effects: [], messages: [] };
      if (context.rng.next() >= 1 / 3) return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.statusCure, target: EFFECT_TARGET.self }],
        messages: [`${name}'s Shed Skin cured its status!`],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ─── Passive Immunity ───────────────────────────────────────────────────────

/**
 * Handle "passive-immunity" abilities for Gen 3.
 *
 * Fires when a move would hit a Pokemon and the ability grants immunity to
 * the move's type. context.pokemon is the defender (whose ability grants
 * immunity), context.move is the incoming move.
 *
 * Returns activated: true if the ability absorbs/negates the move.
 *
 * Gen 3 specifics:
 *   - Lightning Rod: only redirects in doubles (NO SpAtk boost — Gen 5+ feature)
 *     In singles, Lightning Rod does nothing (the move would already target you).
 *     Implemented here as a no-effect immunity for Electric moves.
 *   - Soundproof: blocks sound-based moves (list per pokeemerald)
 *   - Sturdy: only blocks OHKO moves (Dragon Rage effect, Fissure, Horn Drill, Guillotine, Sheer Cold)
 *     Does NOT act as a Focus Sash (that's Gen 5+).
 *   - Volt Absorb, Water Absorb: heal 1/4 max HP
 *   - Flash Fire: absorbs Fire moves, sets volatile for 50% Fire boost
 *   - Levitate: immune to Ground moves
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects passive immunity checks
 */
function handlePassiveImmunity(abilityId: string, context: AbilityContext): AbilityResult {
  const moveType = context.move?.type;
  if (!moveType) return { activated: false, effects: [], messages: [] };

  const maxHp = context.pokemon.pokemon.calculatedStats?.hp ?? context.pokemon.pokemon.currentHp;
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case "volt-absorb": {
      // Source: pret/pokeemerald — Volt Absorb: Electric moves heal 1/4 max HP
      // Source: Bulbapedia — Volt Absorb absorbs Electric moves and heals 1/4 max HP
      if (moveType !== "electric") return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmt }],
        messages: [`${name}'s Volt Absorb restored HP!`],
      };
    }

    case "water-absorb": {
      // Source: pret/pokeemerald — Water Absorb: Water moves heal 1/4 max HP
      // Source: Bulbapedia — Water Absorb absorbs Water moves and heals 1/4 max HP
      if (moveType !== "water") return { activated: false, effects: [], messages: [] };
      const healAmt = Math.max(1, Math.floor(maxHp / 4));
      return {
        activated: true,
        effects: [{ effectType: ABILITY_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmt }],
        messages: [`${name}'s Water Absorb restored HP!`],
      };
    }

    case "flash-fire": {
      // Source: pret/pokeemerald — Flash Fire: absorbs Fire moves, boosts Fire power by 50%
      // Source: Bulbapedia — Flash Fire grants immunity to Fire and powers up Fire-type moves
      if (moveType !== "fire") return { activated: false, effects: [], messages: [] };
      const hasBoost = context.pokemon.volatileStatuses.has("flash-fire");
      const effects: AbilityEffect[] = [];
      if (!hasBoost) {
        effects.push({
          effectType: ABILITY_EFFECT.volatileInflict,
          target: EFFECT_TARGET.self,
          volatile: CORE_VOLATILE_IDS.flashFire,
        });
      }
      return {
        activated: true,
        effects,
        messages: [
          hasBoost
            ? `${name}'s Flash Fire is already boosted!`
            : `${name}'s Flash Fire was activated!`,
        ],
      };
    }

    case "levitate": {
      // Source: pret/pokeemerald — Levitate: Ground moves have no effect
      // Source: Bulbapedia — Levitate grants Ground immunity
      if (moveType !== "ground") return { activated: false, effects: [], messages: [] };
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Levitate makes Ground moves miss!`],
      };
    }

    case "lightning-rod": {
      // Source: pret/pokeemerald — Lightning Rod: in Gen 3, redirects Electric moves in doubles.
      //   In singles, Lightning Rod has NO immunity effect and NO SpAtk boost.
      //   The SpAtk boost was added in Gen 5.
      // Source: Bulbapedia — "In Generation III-IV, Lightning Rod does not grant immunity."
      //
      // Lightning Rod does NOT negate Electric moves in Gen 3. It only redirects
      // in doubles. In singles, it does nothing. Return not activated.
      return { activated: false, effects: [], messages: [] };
    }

    case "soundproof": {
      // Source: pret/pokeemerald — Soundproof: blocks sound-based moves
      // Source: Bulbapedia — Soundproof makes the Pokemon immune to sound-based moves
      // Use the move's flags.sound metadata for detection rather than a hardcoded list,
      // so future moves with the sound flag are automatically handled.
      if (!context.move?.flags?.sound) {
        return { activated: false, effects: [], messages: [] };
      }
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Soundproof blocks sound-based moves!`],
      };
    }

    case "sturdy": {
      // Source: pret/pokeemerald — Sturdy: blocks OHKO moves (Fissure, Horn Drill, Guillotine, Sheer Cold)
      // In Gen 3-4, Sturdy ONLY blocks OHKO moves. The Focus Sash effect (surviving
      // any hit at full HP) was added in Gen 5.
      // Source: Bulbapedia — "In Generation III-IV, Sturdy only blocks one-hit knockout moves."
      // Use move effect metadata for detection rather than a hardcoded move-ID list.
      if (context.move?.effect?.type !== "ohko") {
        return { activated: false, effects: [], messages: [] };
      }
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Sturdy prevented the OHKO!`],
      };
    }

    default:
      return { activated: false, effects: [], messages: [] };
  }
}

// ─── On-Before-Move ──────────────────────────────────────────────────────

/**
 * Handle "on-before-move" abilities for Gen 3.
 *
 * Implemented:
 *   - Truant: alternates between acting and loafing each turn.
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects ABILITYEFFECT_MOVES_BLOCK
 */
function handleBeforeMove(abilityId: string, context: AbilityContext): AbilityResult {
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  if (abilityId === "truant") {
    // Truant: check if the "truant-turn" volatile is present. If so, block the move.
    // The toggle itself happens at end of turn (handleTurnEnd), not here.
    //
    // Source: pret/pokeemerald src/battle_util.c — Truant toggle at ABILITYEFFECT_ENDTURN, not at move execution
    // Source: Bulbapedia — "Truant causes the Pokemon to use a move only every other turn"
    const hasTruantTurn = context.pokemon.volatileStatuses.has("truant-turn");
    if (hasTruantTurn) {
      // This is the "loaf" turn — block the move. Do NOT toggle here;
      // the toggle fires at end of turn regardless of whether the move executed.
      return {
        activated: true,
        movePrevented: true,
        effects: [],
        messages: [`${name} is loafing around!`],
      };
    }
    // No truant-turn volatile — move proceeds normally.
    return { activated: false, effects: [], messages: [] };
  }
  return { activated: false, effects: [], messages: [] };
}

// ─── On-Damage-Taken ─────────────────────────────────────────────────────

/**
 * Handle "on-damage-taken" abilities for Gen 3.
 *
 * Implemented:
 *   - Color Change: changes the holder's type to match the type of the move that hit it.
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects ABILITYEFFECT_ON_DAMAGE
 */
function handleDamageTaken(abilityId: string, context: AbilityContext): AbilityResult {
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  if (abilityId === "color-change") {
    // Color Change: changes the holder's type to match the type of the move that just hit it.
    // Only activates on damaging moves. Does not activate if the holder is already
    // purely that type (already mono-typed to that type).
    //
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
    // Source: Bulbapedia — "Color Change changes the user's type to that of the move that hits it"
    const moveType = context.move?.type;
    if (!moveType) return { activated: false, effects: [], messages: [] };
    // Don't change if already that type (pokeemerald IS_BATTLER_OF_TYPE checks both slots)
    // Source: pret/pokeemerald src/battle_util.c — gBattleMons[battler].types[0/1] == type
    const currentTypes = context.pokemon.types;
    if (currentTypes.includes(moveType as PokemonType)) {
      return { activated: false, effects: [], messages: [] };
    }
    return {
      activated: true,
      effects: [
        {
          effectType: ABILITY_EFFECT.typeChange,
          target: EFFECT_TARGET.self,
          types: [moveType as PokemonType],
        },
      ],
      messages: [`${name}'s Color Change made it the ${moveType} type!`],
    };
  }
  return { activated: false, effects: [], messages: [] };
}

// ─── On-Status-Inflicted ─────────────────────────────────────────────────

/**
 * Handle "on-status-inflicted" abilities for Gen 3.
 *
 * Implemented:
 *   - Synchronize: when the holder receives a burn, paralysis, or poison,
 *     the opponent also receives the same status condition.
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects ABILITYEFFECT_SYNCHRONIZE
 */
function handleStatusInflicted(abilityId: string, context: AbilityContext): AbilityResult {
  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  if (abilityId === "synchronize") {
    // Synchronize: when the holder receives a burn, paralysis, or poison, the
    // opponent also receives the same status condition.
    // Synchronize does NOT activate for sleep or freeze.
    //
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    // Source: Bulbapedia — "Synchronize passes burn, paralysis, and poison to the opponent"
    const status = context.pokemon.pokemon.status;
    if (!status) return { activated: false, effects: [], messages: [] };
    // Only burn, paralysis, poison, and badly-poisoned are Synchronized
    const syncableStatuses: readonly PrimaryStatus[] = [
      "burn",
      "paralysis",
      "poison",
      "badly-poisoned",
    ];
    if (!syncableStatuses.includes(status)) {
      return { activated: false, effects: [], messages: [] };
    }
    // Cannot synchronize if opponent has no valid target or already has a status
    if (!context.opponent) return { activated: false, effects: [], messages: [] };
    if (context.opponent.pokemon.status !== null) {
      return { activated: false, effects: [], messages: [] };
    }
    const oppName = context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
    // In Gen 3, Synchronize converts badly-poisoned -> regular poison before mirroring.
    // Source: pret/pokeemerald src/battle_util.c — synchronizeMoveEffect == MOVE_EFFECT_TOXIC
    //   sets synchronizeMoveEffect = MOVE_EFFECT_POISON (lines 2976-2977, 2992-2993)
    const mirroredStatus = status === "badly-poisoned" ? "poison" : status;
    return {
      activated: true,
      effects: [
        {
          effectType: ABILITY_EFFECT.statusInflict,
          target: EFFECT_TARGET.opponent,
          status: mirroredStatus,
        },
      ],
      messages: [`${name}'s Synchronize shared its ${mirroredStatus} with ${oppName}!`],
    };
  }
  return { activated: false, effects: [], messages: [] };
}

// ─── On-Weather-Change ──────────────────────────────────────────────────────

/**
 * Handle "on-weather-change" abilities for Gen 3.
 *
 * Only Forecast is relevant: Castform changes type when weather changes mid-battle.
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_FORECAST / GetCastformForm
 * Source: Bulbapedia — "Forecast changes Castform's type based on the weather"
 */
function handleWeatherChange(abilityId: string, context: AbilityContext): AbilityResult {
  if (abilityId !== "forecast") return { activated: false, effects: [], messages: [] };

  // Forecast only has an effect on Castform (speciesId 351).
  // Source: pret/pokeemerald — IS_CASTFORM_SPECIES guard
  if (context.pokemon.pokemon.speciesId !== 351) {
    return { activated: false, effects: [], messages: [] };
  }

  const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
  const weather = context.state?.weather?.type ?? null;

  // Weather is suppressed if Cloud Nine / Air Lock is on the field
  const suppressed = isWeatherSuppressedGen3(context.pokemon, context.opponent);
  const effectiveWeather = suppressed ? null : weather;
  const newType = getForecastType(effectiveWeather);

  // Only activate if the type would actually change
  const currentTypes = context.pokemon.types;
  if (currentTypes.length === 1 && currentTypes[0] === newType) {
    return { activated: false, effects: [], messages: [] };
  }
  if (currentTypes.length === 0 && newType === "normal") {
    return { activated: false, effects: [], messages: [] };
  }

  return {
    activated: true,
    effects: [
      { effectType: ABILITY_EFFECT.typeChange, target: EFFECT_TARGET.self, types: [newType] },
    ],
    messages: [`${name} transformed into the ${newType} type!`],
  };
}
