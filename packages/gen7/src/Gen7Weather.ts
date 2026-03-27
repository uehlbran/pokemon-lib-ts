/**
 * Gen 7 weather chip damage and immunity.
 *
 * Gen 7 weather chip damage mechanics are IDENTICAL to Gen 6:
 * - Sandstorm: 1/16 max HP per turn to non-Rock/Ground/Steel types
 * - Hail: 1/16 max HP per turn to non-Ice types
 * - Rain/Sun: no chip damage
 *
 * Immunities:
 * - Type-based: Rock/Ground/Steel for sand; Ice for hail
 * - Ability-based: Magic Guard, Overcoat, Sand Rush, Sand Force, Sand Veil (sand);
 *   Magic Guard, Overcoat, Ice Body, Snow Cloak (hail)
 * - Item-based: Safety Goggles blocks sand and hail chip damage
 *
 * The only Gen 7 weather change from Gen 6 is that Slush Rush grants hail immunity.
 *
 * Source: Showdown data/conditions.ts -- weather end-of-turn damage (same formula Gen 5-7)
 * Source: Bulbapedia -- Weather conditions page
 * Source: Showdown data/abilities.ts -- slushrush.onImmunity: hail immunity (new in Gen 7)
 */

import type { ActivePokemon, BattleState, WeatherEffectResult } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  type PokemonType,
  type WeatherType,
} from "@pokemon-lib-ts/core";

export const GEN7_WEATHER_DAMAGE_MULTIPLIERS = {
  rainWaterBoost: 1.5,
  rainFirePenalty: 0.5,
  sunFireBoost: 1.5,
  sunWaterPenalty: 0.5,
} as const;

// ─── Cloud Nine / Air Lock Weather Suppression ─────────────────────────────

/**
 * Abilities that suppress weather effects for all Pokemon on the field.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() checks for Cloud Nine and Air Lock
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
const WEATHER_SUPPRESSING_ABILITIES: ReadonlySet<string> = new Set([
  CORE_ABILITY_IDS.cloudNine,
  CORE_ABILITY_IDS.airLock,
]);

/**
 * Check if either the attacker or defender has Cloud Nine / Air Lock,
 * which suppresses all weather effects for damage calc purposes.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() scans all active Pokemon
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
export function isWeatherSuppressedGen7(
  pokemon: ActivePokemon | undefined,
  opponent: ActivePokemon | undefined,
): boolean {
  if (pokemon && WEATHER_SUPPRESSING_ABILITIES.has(pokemon.ability)) return true;
  if (opponent && WEATHER_SUPPRESSING_ABILITIES.has(opponent.ability)) return true;
  return false;
}

/**
 * Check if any active Pokemon on the field suppresses weather.
 *
 * Used for end-of-turn weather chip damage and speed calculations.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() checks all active Pokemon
 */
export function isWeatherSuppressedOnFieldGen7(state: {
  sides: { active: ({ ability: string } | null)[] }[];
}): boolean {
  for (const side of state.sides) {
    for (const active of side.active) {
      if (active && WEATHER_SUPPRESSING_ABILITIES.has(active.ability)) return true;
    }
  }
  return false;
}

/**
 * Gen 7 weather duration constants.
 *
 * Same as Gen 6: ability-summoned weather lasts 5 turns (8 with weather rock).
 *
 * Source: Bulbapedia -- Weather (Gen 6+): ability-summoned weather lasts 5 turns
 * Source: Showdown sim/battle.ts -- weather duration = 5 (ability), 8 (rock)
 */
export const ABILITY_WEATHER_TURNS = 5;
export const WEATHER_ROCK_EXTENSION = 3; // Total = 5 + 3 = 8

/**
 * Types immune to sandstorm chip damage in Gen 7.
 *
 * Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
 * Source: Showdown data/conditions.ts -- sandstorm immunity type check
 */
export const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = [
  CORE_TYPE_IDS.rock,
  CORE_TYPE_IDS.ground,
  CORE_TYPE_IDS.steel,
];

/**
 * Types immune to hail chip damage in Gen 7.
 *
 * Source: Bulbapedia -- Hail: "Ice-type Pokemon are unaffected"
 * Source: Showdown data/conditions.ts -- hail immunity type check
 */
export const HAIL_IMMUNE_TYPES: readonly PokemonType[] = [CORE_TYPE_IDS.ice];

/**
 * Abilities that grant immunity to sandstorm chip damage in Gen 7.
 *
 * Same as Gen 6:
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
  CORE_ABILITY_IDS.magicGuard,
  CORE_ABILITY_IDS.overcoat,
  CORE_ABILITY_IDS.sandRush,
  CORE_ABILITY_IDS.sandForce,
  CORE_ABILITY_IDS.sandVeil,
];

/**
 * Abilities that grant immunity to hail chip damage in Gen 7.
 *
 * Gen 7 adds Slush Rush to the Gen 6 hail immunity list.
 *
 * - magic-guard: immune to all indirect damage
 * - overcoat: blocks weather damage
 * - ice-body: immune to hail chip + heals 1/16 in hail
 * - snow-cloak: immune to hail chip + evasion boost in hail
 * - slush-rush: immune to hail chip + 2x speed in hail (new in Gen 7)
 *
 * Source: Showdown data/abilities.ts -- slushrush: onImmunity for hail returns false
 * Source: Bulbapedia -- Slush Rush: "is not damaged by hail"
 */
const HAIL_IMMUNE_ABILITIES: readonly string[] = [
  CORE_ABILITY_IDS.magicGuard,
  CORE_ABILITY_IDS.overcoat,
  CORE_ABILITY_IDS.iceBody,
  CORE_ABILITY_IDS.snowCloak,
  CORE_ABILITY_IDS.slushRush,
];

/**
 * Check whether a Pokemon is immune to the given weather's end-of-turn chip damage.
 *
 * Gen 7 weather chip immunity rules:
 * - Rain/Sun: no chip damage -- returns false immediately
 * - Sandstorm: Rock, Ground, Steel types; several abilities; Safety Goggles
 * - Hail: Ice types; several abilities (including new Slush Rush); Safety Goggles
 *
 * Source: Showdown data/conditions.ts -- weather damage immunity checks
 * Source: Showdown data/items.ts -- safetygoggles: onImmunity weather
 * Source: Bulbapedia -- Weather conditions page, Safety Goggles page
 */
export function isGen7WeatherImmune(
  types: readonly string[],
  weather: WeatherType,
  ability?: string,
  heldItem?: string | null,
): boolean {
  // Rain and Sun have no chip damage
  if (weather !== CORE_WEATHER_IDS.sand && weather !== CORE_WEATHER_IDS.hail) return false;

  // Safety Goggles: immune to sand and hail chip damage
  // Source: Showdown data/items.ts -- safetygoggles: onImmunity for weather damage
  if (heldItem === CORE_ITEM_IDS.safetyGoggles) return true;

  if (weather === CORE_WEATHER_IDS.sand) {
    // Ability-based immunity
    if (ability && SAND_IMMUNE_ABILITIES.includes(ability)) return true;
    // Type-based immunity (Rock, Ground, Steel)
    return types.some((type) => SANDSTORM_IMMUNE_TYPES.includes(type as PokemonType));
  }

  // hail
  // Ability-based immunity (includes Slush Rush in Gen 7)
  if (ability && HAIL_IMMUNE_ABILITIES.includes(ability)) return true;
  // Type-based immunity (Ice)
  return types.some((type) => HAIL_IMMUNE_TYPES.includes(type as PokemonType));
}

/**
 * Apply Gen 7 end-of-turn weather effects.
 *
 * Sandstorm: 1/16 max HP chip damage per turn to non-immune Pokemon.
 * Hail: 1/16 max HP chip damage per turn to non-immune Pokemon.
 * Rain/Sun: No chip damage.
 *
 * Source: Showdown data/conditions.ts -- weather end-of-turn damage (same formula Gen 5-7)
 * Source: Bulbapedia -- Weather conditions page
 */
export function applyGen7WeatherEffects(state: BattleState): WeatherEffectResult[] {
  const results: WeatherEffectResult[] = [];

  // No weather or non-damaging weather
  if (!state.weather) return results;
  const weatherType = state.weather.type;
  if (weatherType !== CORE_WEATHER_IDS.sand && weatherType !== CORE_WEATHER_IDS.hail) {
    return results;
  }

  // Cloud Nine / Air Lock suppresses all weather effects including chip damage
  // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
  if (isWeatherSuppressedOnFieldGen7(state)) return results;

  // Process each side
  for (const side of state.sides) {
    for (const active of side.active) {
      if (!active) continue;

      // Check immunity (type-based, ability-based, and item-based)
      if (isGen7WeatherImmune(active.types, weatherType, active.ability, active.pokemon.heldItem))
        continue;

      // Gen 7: chip damage = 1/16 max HP (minimum 1)
      // Source: Showdown data/conditions.ts -- weather damage = Math.floor(maxHP / 16)
      // Source: Bulbapedia -- Sandstorm/Hail: "1/16 of their maximum HP"
      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      const damage = Math.max(1, Math.floor(maxHp / 16));

      const pokemonName = active.pokemon.nickname ?? active.pokemon.speciesId.toString();

      const message =
        weatherType === CORE_WEATHER_IDS.sand
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
