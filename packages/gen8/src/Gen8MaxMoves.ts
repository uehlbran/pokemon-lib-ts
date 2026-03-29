/**
 * Gen 8 Max Move system -- type-to-Max-Move name mapping, base power conversion,
 * and secondary effect descriptors.
 *
 * Source: Showdown sim/battle-actions.ts lines 9-29 -- MAX_MOVES table
 * Source: Showdown data/moves.ts -- maxMove.basePower values on individual moves
 * Source: Bulbapedia "Max Move" -- secondary effects per type
 */

import { BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { BattleStat, PokemonType, TerrainType, WeatherType } from "@pokemon-lib-ts/core";
import {
  CORE_MOVE_CATEGORIES,
  CORE_STAT_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";

export const GEN8_MAX_MOVE_EFFECT_TYPES = {
  statBoost: "stat-boost",
  weather: "weather",
  terrain: "terrain",
  protect: "protect",
} as const;

export const GEN8_MAX_MOVE_EFFECT_TARGETS = {
  userSide: "user-side",
  opponent: BATTLE_EFFECT_TARGETS.opponent,
  opponentSide: "opponent-side",
} as const;

/**
 * Describes the secondary effect of a Max Move.
 *
 * - `stat-boost`: Raises or lowers a stat for the user's side or the opponent's side.
 * - `weather`: Sets weather for 5 turns.
 * - `terrain`: Sets terrain for 5 turns.
 * - `protect`: Blocks all moves (Max Guard, from status moves).
 *
 * Source: Bulbapedia "Max Move" -- secondary effects per type
 */
export type MaxMoveEffect =
  | {
      type: (typeof GEN8_MAX_MOVE_EFFECT_TYPES)["statBoost"];
      stat: BattleStat;
      stages: number;
      target:
        | (typeof GEN8_MAX_MOVE_EFFECT_TARGETS)["userSide"]
        | (typeof GEN8_MAX_MOVE_EFFECT_TARGETS)["opponent"]
        | (typeof GEN8_MAX_MOVE_EFFECT_TARGETS)["opponentSide"];
    }
  | { type: (typeof GEN8_MAX_MOVE_EFFECT_TYPES)["weather"]; weather: WeatherType }
  | { type: (typeof GEN8_MAX_MOVE_EFFECT_TYPES)["terrain"]; terrain: TerrainType }
  | { type: (typeof GEN8_MAX_MOVE_EFFECT_TYPES)["protect"] };

/**
 * Mapping from Pokemon type to Max Move name.
 *
 * Source: Showdown sim/battle-actions.ts lines 9-29 -- MAX_MOVES table
 */
// "unknown" (TYPE_MYSTERY) is a move-type sentinel for Curse in Gen 2-4 only.
// No Dynamax move exists for "unknown" type since Curse is "ghost" from Gen 5+.
const MAX_MOVE_NAMES: Readonly<Partial<Record<PokemonType, string>>> = {
  [CORE_TYPE_IDS.normal]: "Max Strike",
  [CORE_TYPE_IDS.fire]: "Max Flare",
  [CORE_TYPE_IDS.water]: "Max Geyser",
  [CORE_TYPE_IDS.electric]: "Max Lightning",
  [CORE_TYPE_IDS.grass]: "Max Overgrowth",
  [CORE_TYPE_IDS.ice]: "Max Hailstorm",
  [CORE_TYPE_IDS.fighting]: "Max Knuckle",
  [CORE_TYPE_IDS.poison]: "Max Ooze",
  [CORE_TYPE_IDS.ground]: "Max Quake",
  [CORE_TYPE_IDS.flying]: "Max Airstream",
  [CORE_TYPE_IDS.psychic]: "Max Mindstorm",
  [CORE_TYPE_IDS.bug]: "Max Flutterby",
  [CORE_TYPE_IDS.rock]: "Max Rockfall",
  [CORE_TYPE_IDS.ghost]: "Max Phantasm",
  [CORE_TYPE_IDS.dragon]: "Max Wyrmwind",
  [CORE_TYPE_IDS.dark]: "Max Darkness",
  [CORE_TYPE_IDS.steel]: "Max Steelspike",
  [CORE_TYPE_IDS.fairy]: "Max Starfall",
};

/**
 * Secondary effects of each Max Move.
 *
 * Source: Bulbapedia "Max Move" -- secondary effects per type
 * Source: Showdown data/moves.ts -- individual Max Move entries
 */
const MAX_MOVE_EFFECTS: Readonly<Record<string, MaxMoveEffect>> = {
  "Max Strike": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.speed,
    stages: -1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.opponentSide,
  },
  "Max Flare": { type: GEN8_MAX_MOVE_EFFECT_TYPES.weather, weather: CORE_WEATHER_IDS.sun },
  "Max Geyser": { type: GEN8_MAX_MOVE_EFFECT_TYPES.weather, weather: CORE_WEATHER_IDS.rain },
  "Max Lightning": { type: GEN8_MAX_MOVE_EFFECT_TYPES.terrain, terrain: CORE_TERRAIN_IDS.electric },
  "Max Overgrowth": { type: GEN8_MAX_MOVE_EFFECT_TYPES.terrain, terrain: CORE_TERRAIN_IDS.grassy },
  "Max Hailstorm": { type: GEN8_MAX_MOVE_EFFECT_TYPES.weather, weather: CORE_WEATHER_IDS.hail },
  "Max Knuckle": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.attack,
    stages: 1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.userSide,
  },
  "Max Ooze": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.spAttack,
    stages: 1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.userSide,
  },
  "Max Quake": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.spDefense,
    stages: 1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.userSide,
  },
  "Max Airstream": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.speed,
    stages: 1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.userSide,
  },
  "Max Mindstorm": { type: GEN8_MAX_MOVE_EFFECT_TYPES.terrain, terrain: CORE_TERRAIN_IDS.psychic },
  "Max Flutterby": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.spAttack,
    stages: -1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.opponentSide,
  },
  "Max Rockfall": { type: GEN8_MAX_MOVE_EFFECT_TYPES.weather, weather: CORE_WEATHER_IDS.sand },
  "Max Phantasm": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.defense,
    stages: -1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.opponent,
  },
  "Max Wyrmwind": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.attack,
    stages: -1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.opponentSide,
  },
  "Max Darkness": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.spDefense,
    stages: -1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.opponentSide,
  },
  "Max Steelspike": {
    type: GEN8_MAX_MOVE_EFFECT_TYPES.statBoost,
    stat: CORE_STAT_IDS.defense,
    stages: 1,
    target: GEN8_MAX_MOVE_EFFECT_TARGETS.userSide,
  },
  "Max Starfall": { type: GEN8_MAX_MOVE_EFFECT_TYPES.terrain, terrain: CORE_TERRAIN_IDS.misty },
  "Max Guard": { type: GEN8_MAX_MOVE_EFFECT_TYPES.protect },
};

/**
 * Returns the Max Move name for a given type.
 *
 * Status moves always become Max Guard regardless of type.
 *
 * Source: Showdown sim/battle-actions.ts lines 9-29 -- MAX_MOVES table
 *
 * @param moveType - The type of the base move
 * @param isStatus - Whether the move is a status move
 * @returns The Max Move name
 */
export function getMaxMoveName(moveType: PokemonType, isStatus: boolean): string {
  if (isStatus) return "Max Guard";
  return MAX_MOVE_NAMES[moveType] ?? "Max Strike";
}

/**
 * Converts a base move's power to its Max Move base power.
 *
 * Poison and Fighting type moves use a lower power table than all other types.
 * Status moves always have 0 base power as Max Guard.
 *
 * Source: Showdown data/moves.ts -- maxMove.basePower values on individual moves
 * Source: Bulbapedia "Max Move" -- base power conversion table
 *
 * @param basePower - The base move's power (0 for status moves)
 * @param moveType - The type of the base move
 * @returns The Max Move base power
 */
export function getMaxMovePower(basePower: number, moveType: PokemonType): number {
  if (basePower === 0) return 0;

  const isPoisonOrFighting =
    moveType === CORE_TYPE_IDS.poison || moveType === CORE_TYPE_IDS.fighting;

  if (isPoisonOrFighting) {
    return getPoisonFightingMaxPower(basePower);
  }
  return getStandardMaxPower(basePower);
}

/**
 * Poison/Fighting Max Move power table.
 *
 * Source: Showdown data/moves.ts -- maxMove.basePower for Poison/Fighting moves
 */
function getPoisonFightingMaxPower(basePower: number): number {
  if (basePower <= 40) return 70;
  if (basePower <= 50) return 75;
  if (basePower <= 60) return 80;
  if (basePower <= 70) return 85;
  if (basePower <= 80) return 90;
  if (basePower <= 90) return 95;
  if (basePower <= 100) return 100;
  if (basePower <= 110) return 105;
  if (basePower <= 120) return 110;
  if (basePower <= 130) return 115;
  if (basePower <= 140) return 120;
  if (basePower <= 150) return 125;
  return 130;
}

/**
 * Standard (non-Poison/non-Fighting) Max Move power table.
 *
 * Source: Showdown data/moves.ts -- maxMove.basePower for standard moves
 */
function getStandardMaxPower(basePower: number): number {
  if (basePower <= 40) return 90;
  if (basePower <= 50) return 100;
  if (basePower <= 60) return 110;
  if (basePower <= 70) return 115;
  if (basePower <= 80) return 120;
  if (basePower <= 90) return 125;
  if (basePower <= 100) return 130;
  if (basePower <= 110) return 135;
  if (basePower <= 120) return 140;
  if (basePower <= 130) return 145;
  if (basePower <= 140) return 150;
  // 145-150 and 155+ both cap at 150
  return 150;
}

/**
 * Returns the secondary effect descriptor for a Max Move, or null for unknown moves.
 *
 * Source: Bulbapedia "Max Move" -- secondary effects per type
 *
 * @param maxMoveName - The Max Move name (e.g., "Max Flare")
 * @returns The secondary effect descriptor, or null if not found
 */
export function getMaxMoveSecondaryEffect(maxMoveName: string): MaxMoveEffect | null {
  return MAX_MOVE_EFFECTS[maxMoveName] ?? null;
}

/**
 * Returns true if the given move should become Max Guard (i.e., it is a status move).
 *
 * Source: Showdown sim/battle-actions.ts -- status moves become Max Guard
 *
 * @param move - Object with a `category` property
 * @returns true if the move is a status move
 */
export function isMaxGuard(move: { category: string }): boolean {
  return move.category === CORE_MOVE_CATEGORIES.status;
}
