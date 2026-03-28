import { CORE_TYPE_IDS, CORE_WEATHER_IDS } from "../constants/reference-ids";
import type { PokemonType } from "../entities/types";
import type { WeatherType } from "../entities/weather";

/**
 * Apply a modifier to a value with integer truncation.
 * This is the standard way damage modifiers are applied in Pokemon.
 *
 * Source: pret/pokeemerald src/pokemon.c:3100 APPLY_STAT_MOD — integer multiply then divide pattern
 * Source: Showdown sim/battle-actions.ts — modifier application with Math.floor
 */
export function applyDamageModifier(value: number, modifier: number): number {
  return Math.floor(value * modifier);
}

/**
 * Apply a chain of modifiers to a value.
 * Each modifier is applied with floor truncation in sequence.
 */
export function applyDamageModifierChain(value: number, modifiers: readonly number[]): number {
  let result = value;
  for (const mod of modifiers) {
    result = applyDamageModifier(result, mod);
  }
  return result;
}

/**
 * Apply a 4096-based modifier using Showdown's fixed-point rounding convention.
 *
 * Equivalent to Showdown's `modify(value, modifier/4096)` for positive integers:
 *   `floor((value * modifier + 2047) / 4096)`
 *
 * Source: references/pokemon-showdown/sim/battle.ts modify() method
 * Source: references/pokemon-showdown/sim/dex.ts trunc() -- num >>> 0
 */
export function pokeRound(value: number, modifier: number): number {
  return Math.floor((value * modifier + 2047) / 4096);
}

/**
 * STAB (Same Type Attack Bonus) modifier.
 *
 * Source: pret/pokeemerald src/pokemon.c — CalculateBaseDamage: damage = damage * 150 / 100 for STAB
 * Source: Showdown sim/battle-actions.ts — Adaptability: STAB = 2.0 instead of 1.5 (Gen 4+)
 *
 * @returns 1.5 normally, 2.0 with Adaptability ability, 1.0 if no STAB
 */
export function getStabModifier(
  moveType: PokemonType,
  attackerTypes: readonly PokemonType[],
  hasAdaptability = false,
): number {
  const isStab = attackerTypes.includes(moveType);
  if (!isStab) return 1.0;
  return hasAdaptability ? 2.0 : 1.5;
}

/**
 * Weather damage modifier for moves.
 *
 * Source: pret/pokeemerald src/pokemon.c — CalculateBaseDamage weather checks
 * Source: Showdown sim/battle-actions.ts — weather modifier logic
 *
 * Rain:  Water moves x 1.5, Fire moves x 0.5
 * Sun:   Fire moves x 1.5, Water moves x 0.5
 * Other: No damage modification (sand/snow damage is applied at turn end)
 * Heavy rain / harsh sun (Gen 6+): opposing type does 0 damage (Showdown source)
 */
export function getWeatherDamageModifier(
  moveType: PokemonType,
  weather: WeatherType | null,
): number {
  if (!weather) return 1.0;

  if (weather === CORE_WEATHER_IDS.rain || weather === CORE_WEATHER_IDS.heavyRain) {
    if (moveType === CORE_TYPE_IDS.water) return 1.5;
    if (moveType === CORE_TYPE_IDS.fire) return weather === CORE_WEATHER_IDS.heavyRain ? 0 : 0.5;
  }

  if (weather === CORE_WEATHER_IDS.sun || weather === CORE_WEATHER_IDS.harshSun) {
    if (moveType === CORE_TYPE_IDS.fire) return 1.5;
    if (moveType === CORE_TYPE_IDS.water) return weather === CORE_WEATHER_IDS.harshSun ? 0 : 0.5;
  }

  return 1.0;
}
