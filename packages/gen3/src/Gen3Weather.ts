import type { BattleState, WeatherEffectResult } from "@pokemon-lib-ts/battle";
import type { PokemonType, WeatherType } from "@pokemon-lib-ts/core";

/**
 * Types immune to sandstorm chip damage in Gen 3.
 * Rock, Ground, and Steel types do not take sandstorm damage.
 *
 * Source: pret/pokeemerald src/battle_util.c — sandstorm immunity type check
 */
export const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = ["rock", "ground", "steel"];

/**
 * Types immune to hail chip damage in Gen 3.
 * Ice types do not take hail damage.
 *
 * Source: pret/pokeemerald src/battle_util.c — hail immunity type check
 */
export const HAIL_IMMUNE_TYPES: readonly PokemonType[] = ["ice"];

/**
 * Check whether a Pokemon is immune to the given weather's end-of-turn chip damage.
 *
 * Gen 3 weather chip damage rules:
 * - Sandstorm: Rock, Ground, and Steel types are immune
 * - Hail: Ice types are immune
 * - Rain/Sun: no chip damage, always return false
 *
 * Source: pret/pokeemerald src/battle_util.c — weather damage immunity checks
 *
 * @param types - The Pokemon's current type(s)
 * @param weather - The active weather type
 * @returns true if the Pokemon takes no chip damage from this weather
 */
export function isGen3WeatherImmune(types: readonly PokemonType[], weather: WeatherType): boolean {
  if (weather === "sand") {
    return types.some((type) => SANDSTORM_IMMUNE_TYPES.includes(type));
  }
  if (weather === "hail") {
    return types.some((type) => HAIL_IMMUNE_TYPES.includes(type));
  }
  // Rain and Sun have no chip damage
  return false;
}

/**
 * Apply Gen 3 end-of-turn weather effects.
 *
 * Sandstorm: 1/16 max HP chip damage per turn to non-Rock/Ground/Steel types.
 * Hail: 1/16 max HP chip damage per turn to non-Ice types. (New in Gen 3.)
 * Rain/Sun: No chip damage (only modify move power, handled in damage calc).
 *
 * IMPORTANT DIFFERENCES from Gen 2:
 * - Sandstorm chip = 1/16 (Gen 2 used 1/8)
 * - NO SpDef boost for Rock-types in sandstorm — that was added in Gen 4 (Diamond/Pearl)
 * - Hail is brand new in Gen 3
 *
 * Source: pret/pokeemerald src/battle_util.c — weather end-of-turn damage
 *
 * @param state - The current battle state
 * @returns Array of weather effect results (damage dealt to each affected Pokemon)
 */
export function applyGen3WeatherEffects(state: BattleState): WeatherEffectResult[] {
  const results: WeatherEffectResult[] = [];

  // No weather or non-damaging weather (rain/sun have no chip damage)
  if (!state.weather) return results;
  const weatherType = state.weather.type;
  if (weatherType !== "sand" && weatherType !== "hail") return results;

  // Process each side
  for (const side of state.sides) {
    for (const active of side.active) {
      if (!active) continue;

      // Check immunity
      if (isGen3WeatherImmune(active.types, weatherType)) continue;

      // Gen 3: chip damage = 1/16 max HP (minimum 1)
      // Source: pret/pokeemerald src/battle_util.c — weather damage = maxHP / 16
      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      const damage = Math.max(1, Math.floor(maxHp / 16));

      const pokemonName = active.pokemon.nickname ?? active.pokemon.speciesId.toString();

      const message =
        weatherType === "sand"
          ? `${pokemonName} is buffeted by the sandstorm!`
          : `${pokemonName} is pelted by hail!`;

      results.push({
        side: side.index,
        pokemon: pokemonName,
        damage,
        message,
      });
    }
  }

  return results;
}
