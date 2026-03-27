import type { ActivePokemon, BattleState, WeatherEffectResult } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  type PokemonType,
  type WeatherType,
} from "@pokemon-lib-ts/core";

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
 * Used in damage calc where we only have the attacker/defender pair.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() scans all active Pokemon
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
export function isWeatherSuppressedGen5(
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
 * Used for end-of-turn weather chip damage and speed calculations,
 * where we need to scan the entire field rather than just an attacker/defender pair.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() checks all active Pokemon
 */
export function isWeatherSuppressedOnFieldGen5(state: {
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
 * Types immune to sandstorm chip damage in Gen 5.
 * Rock, Ground, and Steel types do not take sandstorm damage.
 *
 * Source: Showdown sim/battle.ts Gen 5 mod -- sandstorm immunity type check
 * Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
 */
export const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = [
  CORE_TYPE_IDS.rock,
  CORE_TYPE_IDS.ground,
  CORE_TYPE_IDS.steel,
];

/**
 * Types immune to hail chip damage in Gen 5.
 * Ice types do not take hail damage.
 *
 * Source: Showdown sim/battle.ts Gen 5 mod -- hail immunity type check
 * Source: Bulbapedia -- Hail: "Ice-type Pokemon are unaffected"
 */
export const HAIL_IMMUNE_TYPES: readonly PokemonType[] = [CORE_TYPE_IDS.ice];

/**
 * Abilities that grant immunity to weather chip damage in Gen 5.
 *
 * - magic-guard: immune to all indirect damage (sand + hail)
 * - overcoat: blocks weather damage (Gen 5 only blocks weather chip; Gen 6+ also blocks powder)
 * - sand-rush: immune to sandstorm chip + 2x speed in sandstorm
 * - sand-force: immune to sandstorm chip + 1.3x Rock/Ground/Steel moves in sandstorm
 * - sand-veil: immune to sandstorm chip + evasion boost in sandstorm
 * - ice-body: immune to hail chip + heals 1/16 in hail
 * - snow-cloak: immune to hail chip + evasion boost in hail
 *
 * Source: Showdown data/abilities.ts -- sandveil.onImmunity / snowcloak.onImmunity each return
 *   false for their respective weather type, which in Showdown's event system means the pokemon
 *   IS immune (the damage is skipped via runStatusImmunity).
 * Source: Bulbapedia -- Sand Veil: "immune to sandstorm damage"; Snow Cloak: "immune to hail damage"
 */
const SAND_IMMUNE_ABILITIES: readonly string[] = [
  CORE_ABILITY_IDS.magicGuard,
  CORE_ABILITY_IDS.overcoat,
  CORE_ABILITY_IDS.sandRush,
  CORE_ABILITY_IDS.sandForce,
  CORE_ABILITY_IDS.sandVeil,
];

const HAIL_IMMUNE_ABILITIES: readonly string[] = [
  CORE_ABILITY_IDS.magicGuard,
  CORE_ABILITY_IDS.overcoat,
  CORE_ABILITY_IDS.iceBody,
  CORE_ABILITY_IDS.snowCloak,
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
  weather: WeatherType,
  ability?: string,
): boolean {
  // Rain and Sun have no chip damage -- immunity concept does not apply
  if (weather !== CORE_WEATHER_IDS.sand && weather !== CORE_WEATHER_IDS.hail) return false;

  if (weather === CORE_WEATHER_IDS.sand) {
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
  if (weatherType !== CORE_WEATHER_IDS.sand && weatherType !== CORE_WEATHER_IDS.hail) {
    return results;
  }

  // Cloud Nine / Air Lock suppresses all weather effects including chip damage
  // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
  if (isWeatherSuppressedOnFieldGen5(state)) return results;

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
