/**
 * Gen 9 weather chip damage and immunity.
 *
 * The key Gen 9 change: **Snow replaces Hail**. Snow does NOT deal residual damage
 * to non-Ice types. Instead, it boosts Ice-type Defense by 1.5x (handled in
 * the damage calc, not here).
 *
 * Gen 9 weather chip damage:
 * - Sandstorm: 1/16 max HP per turn to non-Rock/Ground/Steel types
 * - Snow: NO chip damage (replaces Hail)
 * - Rain/Sun: no chip damage
 *
 * Immunities:
 * - Type-based: Rock/Ground/Steel for sand
 * - Ability-based: Magic Guard, Overcoat, Sand Rush, Sand Force, Sand Veil (sand)
 * - Item-based: Safety Goggles blocks sand chip damage
 *
 * Source: Showdown data/conditions.ts:696-728 -- Snow weather (no residual damage)
 * Source: Showdown data/conditions.ts -- sandstorm weather (1/16 chip damage)
 * Source: Bulbapedia -- Weather conditions page, Snow replaces Hail in Gen 9
 */

import type { BattleState, WeatherEffectResult } from "@pokemon-lib-ts/battle";
import type { PokemonType, WeatherType } from "@pokemon-lib-ts/core";

/**
 * Gen 9 weather duration constants.
 *
 * Same as Gen 6-8: ability-summoned weather lasts 5 turns (8 with weather rock).
 *
 * Source: Bulbapedia -- Weather (Gen 6+): ability-summoned weather lasts 5 turns
 * Source: Showdown sim/battle.ts -- weather duration = 5 (ability), 8 (rock)
 */
export const ABILITY_WEATHER_TURNS = 5;
export const WEATHER_ROCK_EXTENSION = 3; // Total = 5 + 3 = 8

/**
 * Types immune to sandstorm chip damage in Gen 9.
 *
 * Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
 * Source: Showdown data/conditions.ts -- sandstorm immunity type check
 */
export const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = ["rock", "ground", "steel"];

/**
 * Abilities that grant immunity to sandstorm chip damage in Gen 9.
 *
 * Same as Gen 7-8:
 * - magic-guard: immune to all indirect damage
 * - overcoat: blocks weather damage
 * - sand-rush: immune to sandstorm chip + 2x speed in sandstorm
 * - sand-force: immune to sandstorm chip + 1.3x Rock/Ground/Steel moves in sandstorm
 * - sand-veil: immune to sandstorm chip + evasion boost in sandstorm
 *
 * Source: Showdown data/abilities.ts -- sand-related immunity handlers
 * Source: Bulbapedia -- individual ability pages
 */
const SAND_IMMUNE_ABILITIES: readonly string[] = [
  "magic-guard",
  "overcoat",
  "sand-rush",
  "sand-force",
  "sand-veil",
];

/**
 * Check whether a Pokemon is immune to the given weather's end-of-turn chip damage.
 *
 * Gen 9 weather chip immunity rules:
 * - Snow: no chip damage at all (replaces Hail)
 * - Rain/Sun/harsh-sun/heavy-rain/strong-winds: no chip damage
 * - Sandstorm: Rock, Ground, Steel types; several abilities; Safety Goggles
 *
 * Source: Showdown data/conditions.ts -- weather damage immunity checks
 * Source: Showdown data/items.ts -- safetygoggles: onImmunity weather
 * Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
 */
export function isGen9WeatherImmune(
  types: readonly string[],
  weather: WeatherType,
  ability?: string,
  heldItem?: string | null,
): boolean {
  // Only sandstorm deals chip damage in Gen 9
  // Snow replaced hail and has NO chip damage
  if (weather !== "sand") return false;

  // Safety Goggles: immune to sand chip damage
  // Source: Showdown data/items.ts -- safetygoggles: onImmunity for weather damage
  if (heldItem === "safety-goggles") return true;

  // Ability-based immunity
  if (ability && SAND_IMMUNE_ABILITIES.includes(ability)) return true;

  // Type-based immunity (Rock, Ground, Steel)
  return types.some((type) => SANDSTORM_IMMUNE_TYPES.includes(type as PokemonType));
}

/**
 * Get weather duration based on the weather-setting ability.
 *
 * Returns 5 turns for standard ability-summoned weather, or 8 with a weather rock.
 *
 * Source: Showdown sim/battle.ts -- weather duration logic
 * Source: Bulbapedia -- Weather rocks extend duration to 8 turns
 */
export function getWeatherDuration(hasWeatherRock: boolean): number {
  return hasWeatherRock ? ABILITY_WEATHER_TURNS + WEATHER_ROCK_EXTENSION : ABILITY_WEATHER_TURNS;
}

/**
 * Apply Gen 9 end-of-turn weather effects.
 *
 * Sandstorm: 1/16 max HP chip damage per turn to non-immune Pokemon.
 * Snow: NO chip damage (key Gen 9 change from Hail).
 * Rain/Sun: No chip damage.
 *
 * Note: Ice Body healing in Snow is an ability effect (handled in ability dispatch),
 * not a weather chip effect.
 *
 * Source: Showdown data/conditions.ts -- sandstorm end-of-turn damage
 * Source: Showdown data/conditions.ts:696-728 -- Snow: no onResidual damage
 * Source: Bulbapedia -- Weather conditions page, Snow replaces Hail in Gen 9
 */
export function applyGen9WeatherEffects(state: BattleState): WeatherEffectResult[] {
  const results: WeatherEffectResult[] = [];

  // No weather active
  if (!state.weather) return results;
  const weatherType = state.weather.type;

  // Only sandstorm deals chip damage in Gen 9
  // Snow (which replaced hail) has NO chip damage -- this is the key Gen 9 change
  if (weatherType !== "sand") return results;

  // Process each side
  for (const side of state.sides) {
    for (const active of side.active) {
      if (!active) continue;
      if (active.pokemon.currentHp <= 0) continue;

      // Check immunity (type-based, ability-based, and item-based)
      if (isGen9WeatherImmune(active.types, weatherType, active.ability, active.pokemon.heldItem))
        continue;

      // Gen 9: chip damage = 1/16 max HP (minimum 1)
      // Source: Showdown data/conditions.ts -- weather damage = Math.floor(maxHP / 16)
      // Source: Bulbapedia -- Sandstorm: "1/16 of their maximum HP"
      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      const damage = Math.max(1, Math.floor(maxHp / 16));

      const pokemonName = active.pokemon.nickname ?? active.pokemon.speciesId.toString();

      results.push({
        side: side.index as 0 | 1,
        pokemon: pokemonName,
        damage,
        message: `${pokemonName} is buffeted by the sandstorm!`,
      });
    }
  }

  return results;
}
