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

  if (weather === "rain" || weather === "heavy-rain") {
    if (moveType === "water") return 1.5;
    if (moveType === "fire") return weather === "heavy-rain" ? 0 : 0.5;
  }

  if (weather === "sun" || weather === "harsh-sun") {
    if (moveType === "fire") return 1.5;
    if (moveType === "water") return weather === "harsh-sun" ? 0 : 0.5;
  }

  return 1.0;
}
