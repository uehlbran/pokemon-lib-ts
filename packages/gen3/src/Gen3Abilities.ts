import type { AbilityContext, AbilityEffect, AbilityResult } from "@pokemon-lib-ts/battle";
import type { AbilityTrigger } from "@pokemon-lib-ts/core";

/**
 * Gen 3 Abilities — applyAbility dispatch.
 *
 * Handles triggers that the battle engine currently calls:
 *   - "on-switch-in": Intimidate, Drizzle, Drought, Sand Stream
 *
 * Other triggers (on-contact, on-turn-end, on-switch-out) require engine hooks
 * not yet implemented. Those abilities are noted as stubs below.
 *
 * Note: Snow Warning is NOT a Gen 3 ability. It was introduced in Gen 4 with
 * Abomasnow in Diamond/Pearl. Do not implement it here.
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects
 */

/**
 * Dispatch an ability trigger for Gen 3.
 *
 * Only "on-switch-in" is currently supported by the battle engine.
 * Other triggers return { activated: false } since the engine has no hooks for them.
 */
export function applyGen3Ability(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
  const abilityId = context.pokemon.ability;

  switch (trigger) {
    case "on-switch-in":
      return handleSwitchIn(abilityId, context);
    // --- Stubs for triggers the engine does not yet call ---
    // on-contact: Static, Flame Body, Poison Point, Effect Spore, Cute Charm, Rough Skin
    // on-turn-end: Speed Boost, Rain Dish, Shed Skin
    // on-switch-out: Natural Cure
    // on-damage: Sturdy (Gen 5+ version), Color Change
    // on-before-move: Truant
    // These require engine hooks that don't exist yet. Do NOT add fake engine behavior.
    default:
      return { activated: false, effects: [], messages: [] };
  }
}

/**
 * Handle "on-switch-in" abilities for Gen 3.
 *
 * Implemented:
 *   - Intimidate: lowers opponent's Attack by 1 stage
 *   - Drizzle: sets permanent rain
 *   - Drought: sets permanent sun
 *   - Sand Stream: sets permanent sandstorm
 *
 * Not implemented (require more engine support or volatile state tracking):
 *   - Trace: copies opponent's ability (needs engine to apply ability change)
 *   - Cloud Nine / Air Lock: suppresses weather (needs weather suppression system)
 *
 * NOTE on engine limitations: The battle engine currently calls applyAbility("on-switch-in")
 * at BattleEngine.ts:190 but discards the returned AbilityResult entirely (no variable
 * assignment). This means returned effects and messages are computed correctly here but
 * are not acted upon by the engine. Until the engine processes AbilityResult.effects, none
 * of the switch-in abilities below actually change game state.
 *
 * Source: pret/pokeemerald src/battle_util.c — AbilityBattleEffects ABILITYEFFECT_ON_SWITCHIN
 */
function handleSwitchIn(abilityId: string, context: AbilityContext): AbilityResult {
  switch (abilityId) {
    case "intimidate": {
      // Source: pret/pokeemerald ABILITY_INTIMIDATE — lowers opponent's Attack by 1 stage on switch-in
      // NOTE: The engine currently discards AbilityResult from on-switch-in (BattleEngine.ts ~190).
      // The -1 Atk effect is returned correctly in this data structure but is not actually applied
      // until the engine processes AbilityResult.effects.
      if (!context.opponent) return { activated: false, effects: [], messages: [] };
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const oppName =
        context.opponent.pokemon.nickname ?? String(context.opponent.pokemon.speciesId);
      // The engine must apply the stat change based on the effect.
      // AbilityEffectType "stat-change" — target "opponent", lowers Attack by 1 stage.
      const effect: AbilityEffect = {
        effectType: "stat-change",
        target: "opponent",
        stat: "attack",
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
      // NOTE: The engine currently discards AbilityResult from on-switch-in (BattleEngine.ts ~190).
      // Weather is not actually set until the engine processes AbilityResult.effects.
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: "weather-set",
        target: "field",
        weather: "rain",
        weatherTurns: 0, // Gen 3: permanent weather from abilities (0 = infinite)
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drizzle made it rain!`],
      };
    }

    case "drought": {
      // Source: pret/pokeemerald ABILITY_DROUGHT — sets permanent sun on switch-in
      // NOTE: The engine currently discards AbilityResult from on-switch-in (BattleEngine.ts ~190).
      // Weather is not actually set until the engine processes AbilityResult.effects.
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: "weather-set",
        target: "field",
        weather: "sun",
        weatherTurns: 0,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Drought intensified the sun's rays!`],
      };
    }

    case "sand-stream": {
      // Source: pret/pokeemerald ABILITY_SAND_STREAM — sets permanent sandstorm on switch-in
      // NOTE: The engine currently discards AbilityResult from on-switch-in (BattleEngine.ts ~190).
      // Weather is not actually set until the engine processes AbilityResult.effects.
      const name = context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
      const effect: AbilityEffect = {
        effectType: "weather-set",
        target: "field",
        weather: "sand",
        weatherTurns: 0,
      };
      return {
        activated: true,
        effects: [effect],
        messages: [`${name}'s Sand Stream whipped up a sandstorm!`],
      };
    }

    // All other switch-in abilities return not activated for now.
    // Examples that exist in Gen 3 but are not yet implemented:
    //   - Trace (copies opponent's ability)
    //   - Cloud Nine / Air Lock (suppresses weather effects)
    default:
      return { activated: false, effects: [], messages: [] };
  }
}
