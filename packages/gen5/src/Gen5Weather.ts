import type { BattleEvent } from "@pokemon-lib-ts/battle";

/**
 * Gen 5 weather effects.
 *
 * Stub -- will be fully implemented in Wave 2.
 *
 * Gen 5 weather mechanics:
 *   - Drizzle/Drought/Sand Stream/Snow Warning: infinite duration from ability
 *     (Gen 6 changed these to 5 turns)
 *   - Weather rocks (Damp Rock, Heat Rock, etc.): extend manual weather to 8 turns
 *   - Rain: boosts Water 1.5x, weakens Fire 0.5x, Thunder/Hurricane always hit
 *   - Sun: boosts Fire 1.5x, weakens Water 0.5x, SolarBeam skips charge
 *   - Sandstorm: 1/16 HP damage (Rock/Ground/Steel immune), Rock SpDef +50%
 *   - Hail: 1/16 HP damage (Ice immune), Blizzard always hits
 *
 * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts
 */
export function applyGen5WeatherEffects(): BattleEvent[] {
  // Stub -- implemented in Wave 2
  return [];
}
