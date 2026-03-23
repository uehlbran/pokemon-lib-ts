import type { ActivePokemon, BattleState, WeatherEffectResult } from "@pokemon-lib-ts/battle";
import type { PokemonType, WeatherType } from "@pokemon-lib-ts/core";

// ─── Cloud Nine / Air Lock Weather Suppression ─────────────────────────────

/**
 * Abilities that suppress weather effects for all Pokemon on the field.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() checks for Cloud Nine and Air Lock
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
const WEATHER_SUPPRESSING_ABILITIES: ReadonlySet<string> = new Set(["cloud-nine", "air-lock"]);

/**
 * Check if either the attacker or defender has Cloud Nine / Air Lock,
 * which suppresses all weather effects for damage calc purposes.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() scans all active Pokemon
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
export function isWeatherSuppressedGen6(
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
export function isWeatherSuppressedOnFieldGen6(state: {
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
 * Gen 6 weather duration constants.
 *
 * In Gen 6, ability-summoned weather was nerfed from permanent (Gen 5) to 5 turns.
 * Weather rocks extend the duration by 3 turns for a total of 8 turns.
 *
 * Source: Bulbapedia -- "Weather" Gen 6 section: "weather-inducing Abilities now
 *   only cause the weather to last for five turns, instead of being permanent."
 * Source: Showdown sim/battle.ts -- Gen 6 weather duration = 5 (ability), 8 (rock)
 */
export const ABILITY_WEATHER_TURNS = 5;
export const WEATHER_ROCK_EXTENSION = 3; // Total = ABILITY_WEATHER_TURNS + WEATHER_ROCK_EXTENSION = 8

/**
 * Types immune to sandstorm chip damage in Gen 6.
 * Rock, Ground, and Steel types do not take sandstorm damage.
 *
 * Source: Showdown sim/battle.ts Gen 6 -- sandstorm immunity type check
 * Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
 */
export const SANDSTORM_IMMUNE_TYPES: readonly PokemonType[] = ["rock", "ground", "steel"];

/**
 * Types immune to hail chip damage in Gen 6.
 * Ice types do not take hail damage.
 *
 * Source: Showdown sim/battle.ts Gen 6 -- hail immunity type check
 * Source: Bulbapedia -- Hail: "Ice-type Pokemon are unaffected"
 */
export const HAIL_IMMUNE_TYPES: readonly PokemonType[] = ["ice"];

/**
 * Abilities that grant immunity to sandstorm chip damage in Gen 6.
 *
 * - magic-guard: immune to all indirect damage (sand + hail)
 * - overcoat: blocks weather damage (Gen 5+ blocks weather chip; Gen 6+ also blocks powder moves)
 * - sand-rush: immune to sandstorm chip + 2x speed in sandstorm
 * - sand-force: immune to sandstorm chip + 1.3x Rock/Ground/Steel moves in sandstorm
 * - sand-veil: immune to sandstorm chip + evasion boost in sandstorm
 *
 * Source: Showdown data/abilities.ts -- sandveil.onImmunity / sandrush.onImmunity each return
 *   false for sandstorm, meaning the pokemon IS immune (damage is skipped).
 * Source: Bulbapedia -- Sand Veil: "immune to sandstorm damage"; Sand Rush: "immune to sandstorm damage"
 */
const SAND_IMMUNE_ABILITIES: readonly string[] = [
  "magic-guard",
  "overcoat",
  "sand-rush",
  "sand-force",
  "sand-veil",
];

/**
 * Abilities that grant immunity to hail chip damage in Gen 6.
 *
 * - magic-guard: immune to all indirect damage (sand + hail)
 * - overcoat: blocks weather damage
 * - ice-body: immune to hail chip + heals 1/16 in hail
 * - snow-cloak: immune to hail chip + evasion boost in hail
 *
 * Source: Showdown data/abilities.ts -- snowcloak.onImmunity / icebody.onImmunity each return
 *   false for hail, meaning the pokemon IS immune.
 * Source: Bulbapedia -- Snow Cloak: "immune to hail damage"; Ice Body: "unaffected by hail"
 */
const HAIL_IMMUNE_ABILITIES: readonly string[] = [
  "magic-guard",
  "overcoat",
  "ice-body",
  "snow-cloak",
];

/**
 * Check whether a Pokemon is immune to the given weather's end-of-turn chip damage.
 *
 * Gen 6 weather chip damage rules:
 * - Rain/Sun: no chip damage -- returns false immediately (immunity concept does not apply)
 * - Sandstorm: Rock, Ground, and Steel types are immune; several abilities grant immunity
 * - Hail: Ice types are immune; several abilities grant immunity
 * - Safety Goggles: blocks sand and hail chip damage (new in Gen 6)
 *
 * Gen 6 chip damage rules are identical to Gen 5 -- the Gen 6 weather nerf only changed
 * duration (5 turns instead of permanent), not the chip damage mechanics.
 *
 * Source: Showdown sim/battle.ts Gen 6 -- weather damage immunity checks
 * Source: Showdown data/items.ts -- safetygoggles: onImmunity weather: prevents chip damage
 * Source: Bulbapedia -- Weather conditions page
 * Source: Bulbapedia "Safety Goggles" -- "holder is unaffected by weather damage"
 *
 * @param types - The Pokemon's current type(s)
 * @param weather - The active weather type
 * @param ability - The Pokemon's ability (optional; certain abilities grant immunity)
 * @param heldItem - The Pokemon's held item (optional; Safety Goggles grants immunity)
 * @returns true if the Pokemon takes no chip damage from this weather
 */
export function isGen6WeatherImmune(
  types: readonly string[],
  weather: WeatherType,
  ability?: string,
  heldItem?: string | null,
): boolean {
  // Rain and Sun have no chip damage -- immunity concept does not apply
  if (weather !== "sand" && weather !== "hail") return false;

  // Safety Goggles: immune to sand and hail chip damage in Gen 6
  // Source: Showdown data/items.ts -- safetygoggles: onImmunity for weather damage
  if (heldItem === "safety-goggles") return true;

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
 * Apply Gen 6 end-of-turn weather effects.
 *
 * Sandstorm: 1/16 max HP chip damage per turn to non-immune Pokemon.
 * Hail: 1/16 max HP chip damage per turn to non-immune Pokemon.
 * Rain/Sun: No chip damage (only modify move power, handled in damage calc).
 *
 * KEY GEN 6 DIFFERENCES FROM GEN 5:
 * - Weather chip damage mechanics are IDENTICAL to Gen 5
 * - The only Gen 6 weather change is DURATION: ability-summoned weather now lasts
 *   5 turns (was permanent in Gen 5). Weather rocks extend to 8 turns.
 * - Duration is handled by the BattleEngine via turnsLeft, not by this function.
 *
 * Source: Showdown data/conditions.ts -- weather end-of-turn damage (same formula Gen 5-6)
 * Source: Bulbapedia -- Weather conditions page
 *
 * @param state - The current battle state
 * @returns Array of weather effect results (damage dealt to each affected Pokemon)
 */
export function applyGen6WeatherEffects(state: BattleState): WeatherEffectResult[] {
  const results: WeatherEffectResult[] = [];

  // No weather or non-damaging weather (rain/sun have no chip damage)
  if (!state.weather) return results;
  const weatherType = state.weather.type;
  if (weatherType !== "sand" && weatherType !== "hail") return results;

  // Cloud Nine / Air Lock suppresses all weather effects including chip damage
  // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
  if (isWeatherSuppressedOnFieldGen6(state)) return results;

  // Process each side
  for (const side of state.sides) {
    for (const active of side.active) {
      if (!active) continue;

      // Check immunity (type-based, ability-based, and item-based including Safety Goggles)
      if (isGen6WeatherImmune(active.types, weatherType, active.ability, active.pokemon.heldItem))
        continue;

      // Gen 6: chip damage = 1/16 max HP (minimum 1)
      // Source: Showdown Gen 6 -- weather damage = Math.floor(maxHP / 16)
      // Source: Bulbapedia -- Sandstorm/Hail: "1/16 of their maximum HP"
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
