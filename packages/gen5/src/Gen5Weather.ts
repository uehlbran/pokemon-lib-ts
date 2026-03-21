import type { BattleState, WeatherEffectResult } from "@pokemon-lib-ts/battle";
import type { PokemonType, WeatherType } from "@pokemon-lib-ts/core";

/**
 * Types immune to sandstorm chip damage in Gen 5.
 * Rock, Ground, and Steel types do not take sandstorm damage.
 *
 * Source: Showdown sim/battle.ts Gen 5 mod -- sandstorm immunity type check
 * Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
 */
export const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = ["rock", "ground", "steel"];

/**
 * Types immune to hail chip damage in Gen 5.
 * Ice types do not take hail damage.
 *
 * Source: Showdown sim/battle.ts Gen 5 mod -- hail immunity type check
 * Source: Bulbapedia -- Hail: "Ice-type Pokemon are unaffected"
 */
export const HAIL_IMMUNE_TYPES: readonly PokemonType[] = ["ice"];

/**
 * Abilities that grant immunity to weather chip damage in Gen 5.
 *
 * - magic-guard: immune to all indirect damage (sand + hail)
 * - overcoat: blocks weather damage (Gen 5 only blocks weather chip; Gen 6+ also blocks powder)
 * - sand-rush: immune to sandstorm chip + 2x speed in sandstorm
 * - sand-force: immune to sandstorm chip + 1.3x Rock/Ground/Steel moves in sandstorm
 * - ice-body: immune to hail chip + heals 1/16 in hail
 * - snow-cloak: NOT immune to hail chip (only grants evasion boost)
 *
 * Source: Showdown data/abilities.ts -- immunity checks for weather damage
 * Source: Bulbapedia -- individual ability pages
 */
const SAND_IMMUNE_ABILITIES: readonly string[] = [
  "magic-guard",
  "overcoat",
  "sand-rush",
  "sand-force",
  "sand-veil",
];

const HAIL_IMMUNE_ABILITIES: readonly string[] = [
  "magic-guard",
  "overcoat",
  "ice-body",
  "snow-cloak",
];

/**
 * Check whether a Pokemon is immune to the given weather's end-of-turn chip damage.
 *
 * Gen 5 weather chip damage rules:
 * - Rain/Sun: no chip damage -- returns false immediately (immunity concept does not apply)
 * - Sandstorm: Rock, Ground, and Steel types are immune; several abilities grant immunity
 * - Hail: Ice types are immune; several abilities grant immunity
 *
 * Source: Showdown sim/battle.ts Gen 5 mod -- weather damage immunity checks
 * Source: Bulbapedia -- Weather conditions page
 *
 * @param types - The Pokemon's current type(s)
 * @param weather - The active weather type
 * @param ability - The Pokemon's ability (optional; certain abilities grant immunity)
 * @returns true if the Pokemon takes no chip damage from this weather
 */
export function isGen5WeatherImmune(
  types: readonly string[],
  weather: string,
  ability?: string,
): boolean {
  // Rain and Sun have no chip damage -- immunity concept does not apply
  if (weather !== "sand" && weather !== "hail") return false;

  if (weather === "sand") {
    // Ability-based immunity (Magic Guard, Overcoat, Sand Rush, Sand Force, Sand Veil)
    if (ability && SAND_IMMUNE_ABILITIES.includes(ability)) return true;
    // Type-based immunity (Rock, Ground, Steel)
    return types.some((type) => SANDSTORM_IMMUNE_TYPES.includes(type as PokemonType));
  }

  // hail
  // Ability-based immunity (Magic Guard, Overcoat, Ice Body, Snow Cloak)
  if (ability && HAIL_IMMUNE_ABILITIES.includes(ability)) return true;
  // Type-based immunity (Ice)
  return types.some((type) => HAIL_IMMUNE_TYPES.includes(type as PokemonType));
}

/**
 * Apply Gen 5 end-of-turn weather effects.
 *
 * Sandstorm: 1/16 max HP chip damage per turn to non-immune Pokemon.
 * Hail: 1/16 max HP chip damage per turn to non-immune Pokemon.
 * Rain/Sun: No chip damage (only modify move power, handled in damage calc).
 *
 * KEY GEN 5 DIFFERENCES FROM GEN 4:
 * - Overcoat ability now blocks weather chip damage (NEW -- was introduced in Gen 5)
 * - Sand Rush and Sand Force abilities grant sandstorm immunity (NEW Gen 5 abilities)
 * - Ice Body heals in hail instead of taking damage (grants immunity to hail chip)
 * - Snow Cloak grants hail immunity (evasion boost + chip immunity)
 * - Ability-summoned weather is still indefinite (Gen 6 changed to 5 turns)
 *
 * Source: Showdown data/mods/gen5/conditions.ts -- weather end-of-turn damage
 * Source: Bulbapedia -- Weather conditions page
 *
 * @param state - The current battle state
 * @returns Array of weather effect results (damage dealt to each affected Pokemon)
 */
export function applyGen5WeatherEffects(state: BattleState): WeatherEffectResult[] {
  const results: WeatherEffectResult[] = [];

  // No weather or non-damaging weather (rain/sun have no chip damage)
  if (!state.weather) return results;
  const weatherType = state.weather.type;
  if (weatherType !== "sand" && weatherType !== "hail") return results;

  // Process each side
  for (const side of state.sides) {
    for (const active of side.active) {
      if (!active) continue;

      // Check immunity (type-based and ability-based)
      if (isGen5WeatherImmune(active.types, weatherType, active.ability)) continue;

      // Gen 5: chip damage = 1/16 max HP (minimum 1)
      // Source: Showdown Gen 5 mod -- weather damage = Math.floor(maxHP / 16)
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
