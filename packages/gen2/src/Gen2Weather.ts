import type { ActivePokemon, BattleState, WeatherEffectResult } from "@pokemon-lib/battle";
import type { PokemonType, WeatherType } from "@pokemon-lib/core";

/** Types immune to sandstorm damage in Gen 2 */
const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = ["rock", "ground", "steel"];

/**
 * Get the weather-based damage modifier for a move type.
 *
 * Rain Dance:
 * - Water moves: 1.5x
 * - Fire moves: 0.5x
 *
 * Sunny Day:
 * - Fire moves: 1.5x
 * - Water moves: 0.5x
 *
 * Sandstorm:
 * - No damage modifiers to moves (only end-of-turn chip damage)
 *
 * @param moveType - The type of the move being used
 * @param weather - The active weather type
 * @returns The damage multiplier (1.5, 0.5, or 1)
 */
export function getWeatherDamageModifier(moveType: PokemonType, weather: WeatherType): number {
  if (weather === "rain") {
    if (moveType === "water") return 1.5;
    if (moveType === "fire") return 0.5;
  }

  if (weather === "sun") {
    if (moveType === "fire") return 1.5;
    if (moveType === "water") return 0.5;
  }

  return 1;
}

/**
 * Check whether a Pokemon is immune to the given weather's end-of-turn damage.
 *
 * In Gen 2, only sandstorm deals end-of-turn damage:
 * - Rock, Ground, and Steel types are immune
 * - Rain and Sun do NOT deal end-of-turn damage
 *
 * @param types - The Pokemon's type(s)
 * @param weather - The active weather type
 * @returns true if the Pokemon is immune to this weather's damage
 */
export function isWeatherImmune(types: readonly PokemonType[], weather: WeatherType): boolean {
  // Only sandstorm has immunities (because only sandstorm deals end-of-turn damage)
  if (weather !== "sand") return false;

  return types.some((type) => SANDSTORM_IMMUNE_TYPES.includes(type));
}

/**
 * Apply Gen 2 weather end-of-turn effects.
 *
 * Sandstorm: 1/8 max HP damage per turn to Pokemon not Rock/Ground/Steel type.
 * Rain/Sun: No end-of-turn damage (their effects are damage modifiers, handled elsewhere).
 * NO SpDef boost from sandstorm (that's Gen 4+).
 *
 * @param state - The current battle state
 * @returns Array of weather effect results (damage dealt to each affected Pokemon)
 */
export function applyGen2WeatherEffects(state: BattleState): WeatherEffectResult[] {
  const results: WeatherEffectResult[] = [];

  // No weather or non-damaging weather
  if (!state.weather || state.weather.type !== "sand") {
    return results;
  }

  // Process each side
  for (const side of state.sides) {
    for (const active of side.active) {
      if (!active) continue;

      // Check immunity
      if (isWeatherImmune(active.types, "sand")) continue;

      // Calculate 1/8 max HP damage (minimum 1)
      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      const damage = Math.max(1, Math.floor(maxHp / 8));

      const pokemonName = active.pokemon.nickname ?? `Pokemon #${active.pokemon.speciesId}`;

      results.push({
        side: side.index,
        pokemon: pokemonName,
        damage,
        message: `${pokemonName} is buffeted by the sandstorm!`,
      });
    }
  }

  return results;
}
