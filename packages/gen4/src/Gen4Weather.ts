import type { BattleState, WeatherEffectResult } from "@pokemon-lib-ts/battle";
import type { PokemonType, WeatherType } from "@pokemon-lib-ts/core";

/**
 * Types immune to sandstorm chip damage in Gen 4.
 * Rock, Ground, and Steel types do not take sandstorm damage.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — sandstorm immunity type check
 * Source: pret/pokeplatinum — same immunity list as Gen 3
 */
export const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = ["rock", "ground", "steel"];

/**
 * Types immune to hail chip damage in Gen 4.
 * Ice types do not take hail damage.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — hail immunity type check
 * Source: pret/pokeplatinum — same immunity list as Gen 3
 */
export const HAIL_IMMUNE_TYPES: readonly PokemonType[] = ["ice"];

/**
 * Check whether a Pokemon is immune to the given weather's end-of-turn chip damage.
 *
 * Gen 4 weather chip damage rules:
 * - Rain/Sun: no chip damage — returns false immediately (immunity concept does not apply)
 * - Sandstorm: Rock, Ground, and Steel types are immune
 * - Hail: Ice types are immune
 * - Magic Guard: completely ignores weather chip damage (NEW vs Gen 3) — only for sand/hail
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — weather damage immunity checks
 * Source: Bulbapedia — Magic Guard: immune to all indirect damage including weather
 *
 * @param types - The Pokemon's current type(s)
 * @param weather - The active weather type
 * @param ability - The Pokemon's ability (optional; "magic-guard" grants immunity)
 * @returns true if the Pokemon takes no chip damage from this weather
 */
export function isGen4WeatherImmune(
  types: readonly PokemonType[],
  weather: WeatherType,
  ability?: string,
): boolean {
  // Rain and Sun have no chip damage — immunity concept does not apply
  if (weather !== "sand" && weather !== "hail") return false;

  // Magic Guard: immune to all indirect damage, including weather chip
  // Only applies to sand/hail (checked after the early-return above so this
  // does not spuriously return true for rain/sun).
  // Source: Bulbapedia — Magic Guard: prevents all indirect damage
  // Source: Showdown — magic-guard check before weather damage loop
  if (ability === "magic-guard") return true;

  if (weather === "sand") {
    return types.some((type) => SANDSTORM_IMMUNE_TYPES.includes(type));
  }
  // hail
  return types.some((type) => HAIL_IMMUNE_TYPES.includes(type));
}

/**
 * Apply Gen 4 end-of-turn weather effects.
 *
 * Sandstorm: 1/16 max HP chip damage per turn to non-Rock/Ground/Steel types.
 * Hail: 1/16 max HP chip damage per turn to non-Ice types.
 * Rain/Sun: No chip damage (only modify move power, handled in damage calc).
 *
 * KEY GEN 4 DIFFERENCES FROM GEN 3:
 * - Magic Guard ability grants full immunity to weather chip damage (NEW)
 * - Rock-type SpDef +50% in sandstorm is handled in damage calc, not here
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — weather end-of-turn damage
 * Source: pret/pokeplatinum — weather damage = maxHP / 16, same as Gen 3
 *
 * @param state - The current battle state
 * @returns Array of weather effect results (damage dealt to each affected Pokemon)
 */
export function applyGen4WeatherEffects(state: BattleState): WeatherEffectResult[] {
  const results: WeatherEffectResult[] = [];

  // No weather or non-damaging weather (rain/sun have no chip damage)
  if (!state.weather) return results;
  const weatherType = state.weather.type;
  if (weatherType !== "sand" && weatherType !== "hail") return results;

  // Process each side
  for (const side of state.sides) {
    for (const active of side.active) {
      if (!active) continue;

      // Check immunity (type-based and Magic Guard)
      if (isGen4WeatherImmune(active.types, weatherType, active.ability)) continue;

      // Gen 4: chip damage = 1/16 max HP (minimum 1)
      // Source: Showdown Gen 4 mod — weather damage = Math.floor(maxHP / 16)
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
