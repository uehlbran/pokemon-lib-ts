import type {
  AbilityContext,
  AbilityEffect,
  AbilityResult,
  ActivePokemon,
} from "@pokemon-lib-ts/battle";
import { CORE_TERRAIN_IDS, CORE_VOLATILE_IDS, CORE_WEATHER_IDS } from "@pokemon-lib-ts/core";
import {
  GEN9_ORICHALCUM_HADRON_MULTIPLIER,
  GEN9_STAT_ABILITY_SPEED_MULTIPLIER,
  GEN9_STAT_ABILITY_STANDARD_MULTIPLIER,
} from "./constants/mechanics.js";
import { GEN9_ABILITY_IDS, GEN9_ITEM_IDS } from "./data/reference-ids.js";

/**
 * Gen 9 stat-boosting abilities: Protosynthesis, Quark Drive.
 *
 * Both abilities share the same boost mechanic (30% for non-Speed stats, 50% for Speed)
 * but differ in their activation trigger:
 *   - Protosynthesis: activates in Sun or with Booster Energy
 *   - Quark Drive: activates on Electric Terrain or with Booster Energy
 *
 * Also includes Orichalcum Pulse and Hadron Engine stat modifications
 * (the weather/terrain setting is handled in Gen9AbilitiesSwitch.ts; the
 * in-battle stat modification multipliers are computed here).
 *
 * Source: Showdown data/abilities.ts:3427-3493 (Protosynthesis)
 * Source: Showdown data/abilities.ts:3564-3629 (Quark Drive)
 * Source: Showdown data/abilities.ts:3016-3035 (Orichalcum Pulse)
 * Source: Showdown data/abilities.ts:1725-1742 (Hadron Engine)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The 5 non-HP stats eligible for Protosynthesis/Quark Drive boost.
 * Source: Showdown data/abilities.ts:3440-3455 -- iterates atk/def/spa/spd/spe
 */
export type BoostableStat = "attack" | "defense" | "spAttack" | "spDefense" | "speed";

const BOOSTABLE_STATS: readonly BoostableStat[] = [
  "attack",
  "defense",
  "spAttack",
  "spDefense",
  "speed",
];

// ---------------------------------------------------------------------------
// Inactive sentinel
// ---------------------------------------------------------------------------

const INACTIVE: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Shared boost logic
// ---------------------------------------------------------------------------

/**
 * Determine which stat to boost based on the Pokemon's base stats (highest wins).
 * Ties are broken by stat order: Atk > Def > SpA > SpD > Spe.
 *
 * Source: Showdown data/abilities.ts:3440-3455 -- uses base stats (before EVs/nature)
 *   "let dominated = false" loop compares stats in order; first highest wins.
 */
export function getHighestBaseStat(pokemon: ActivePokemon): BoostableStat {
  const species = pokemon.transformedSpecies ?? undefined;
  const baseStats = species?.baseStats ?? pokemon.pokemon.calculatedStats;
  if (!baseStats) return "attack";

  let highestStat: BoostableStat = "attack";
  let highestVal = baseStats.attack;

  for (const stat of BOOSTABLE_STATS) {
    const val = baseStats[stat];
    if (val > highestVal) {
      highestVal = val;
      highestStat = stat;
    }
  }

  return highestStat;
}

/**
 * Get the boost multiplier for a stat.
 * Speed gets 50% (1.5x), all other stats get ~30% (5325/4096).
 *
 * Source: Showdown data/abilities.ts:3480-3483
 *   "if (bestStat === 'spe') return this.chainModify(1.5)"
 *   "return this.chainModify([5325, 4096])"
 */
export function getBoostMultiplier(stat: BoostableStat): number {
  return stat === "speed"
    ? GEN9_STAT_ABILITY_SPEED_MULTIPLIER
    : GEN9_STAT_ABILITY_STANDARD_MULTIPLIER;
}

/**
 * Human-readable stat display names for messages.
 */
const STAT_DISPLAY_NAMES: Record<BoostableStat, string> = {
  attack: "Attack",
  defense: "Defense",
  spAttack: "Sp. Atk",
  spDefense: "Sp. Def",
  speed: "Speed",
};

// ---------------------------------------------------------------------------
// Protosynthesis
// ---------------------------------------------------------------------------

/**
 * Check if Protosynthesis should activate.
 * Conditions: Sun weather active OR holding Booster Energy.
 *
 * Source: Showdown data/abilities.ts:3427-3440
 *   onStart: checks for weather === "sunnyday" || "desolateland" || Booster Energy
 */
export function shouldProtosynthesisActivate(ctx: AbilityContext): {
  activate: boolean;
  consumeBoosterEnergy: boolean;
} {
  // Already active
  if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.protosynthesis)) {
    return { activate: false, consumeBoosterEnergy: false };
  }

  // Check Sun weather
  const weather = ctx.state.weather?.type;
  if (weather === CORE_WEATHER_IDS.sun || weather === CORE_WEATHER_IDS.harshSun) {
    return { activate: true, consumeBoosterEnergy: false };
  }

  // Check Booster Energy
  if (ctx.pokemon.pokemon.heldItem === GEN9_ITEM_IDS.boosterEnergy) {
    return { activate: true, consumeBoosterEnergy: true };
  }

  return { activate: false, consumeBoosterEnergy: false };
}

/**
 * Handle Protosynthesis ability activation on switch-in or weather change.
 *
 * Source: Showdown data/abilities.ts:3427-3493
 */
export function handleProtosynthesis(ctx: AbilityContext): AbilityResult {
  const { trigger } = ctx;

  if (trigger === "on-switch-in" || trigger === "on-weather-change") {
    const { activate, consumeBoosterEnergy } = shouldProtosynthesisActivate(ctx);
    if (!activate) return INACTIVE;

    const boostedStat = getHighestBaseStat(ctx.pokemon);
    const name = getName(ctx);

    const effects: AbilityEffect[] = [
      {
        effectType: "volatile-inflict",
        target: "self",
        volatile: CORE_VOLATILE_IDS.protosynthesis,
        data: { boostedStat, fromBoosterEnergy: consumeBoosterEnergy },
      },
    ];

    const messages: string[] = [];
    if (consumeBoosterEnergy) {
      messages.push(`${name} used its Booster Energy to activate Protosynthesis!`);
    }
    messages.push(`${name}'s Protosynthesis boosted its ${STAT_DISPLAY_NAMES[boostedStat]}!`);

    return { activated: true, effects, messages };
  }

  return INACTIVE;
}

// ---------------------------------------------------------------------------
// Quark Drive
// ---------------------------------------------------------------------------

/**
 * Check if Quark Drive should activate.
 * Conditions: Electric Terrain active OR holding Booster Energy.
 *
 * Source: Showdown data/abilities.ts:3564-3580
 *   onStart: checks for terrain === "electricterrain" || Booster Energy
 */
export function shouldQuarkDriveActivate(ctx: AbilityContext): {
  activate: boolean;
  consumeBoosterEnergy: boolean;
} {
  // Already active
  if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.quarkDrive)) {
    return { activate: false, consumeBoosterEnergy: false };
  }

  // Check Electric Terrain
  if (ctx.state.terrain?.type === CORE_TERRAIN_IDS.electric) {
    return { activate: true, consumeBoosterEnergy: false };
  }

  // Check Booster Energy
  if (ctx.pokemon.pokemon.heldItem === GEN9_ITEM_IDS.boosterEnergy) {
    return { activate: true, consumeBoosterEnergy: true };
  }

  return { activate: false, consumeBoosterEnergy: false };
}

/**
 * Handle Quark Drive ability activation on switch-in or terrain change.
 *
 * Source: Showdown data/abilities.ts:3564-3629
 */
export function handleQuarkDrive(ctx: AbilityContext): AbilityResult {
  const { trigger } = ctx;

  if (trigger === "on-switch-in" || trigger === "on-terrain-change") {
    const { activate, consumeBoosterEnergy } = shouldQuarkDriveActivate(ctx);
    if (!activate) return INACTIVE;

    const boostedStat = getHighestBaseStat(ctx.pokemon);
    const name = getName(ctx);

    const effects: AbilityEffect[] = [
      {
        effectType: "volatile-inflict",
        target: "self",
        volatile: CORE_VOLATILE_IDS.quarkDrive,
        data: { boostedStat, fromBoosterEnergy: consumeBoosterEnergy },
      },
    ];

    const messages: string[] = [];
    if (consumeBoosterEnergy) {
      messages.push(`${name} used its Booster Energy to activate Quark Drive!`);
    }
    messages.push(`${name}'s Quark Drive boosted its ${STAT_DISPLAY_NAMES[boostedStat]}!`);

    return { activated: true, effects, messages };
  }

  return INACTIVE;
}

// ---------------------------------------------------------------------------
// Orichalcum Pulse stat modifier
// ---------------------------------------------------------------------------

/**
 * Get the Attack multiplier for Orichalcum Pulse in Sun.
 *
 * Source: Showdown data/abilities.ts:3028-3033
 *   "return this.chainModify([5461, 4096])" -- ~1.333x
 *
 * @returns 5461/4096 (~1.333x) if in Sun, 1 otherwise
 */
export function getOrichalcumPulseMultiplier(weatherType: string | undefined): number {
  if (weatherType === CORE_WEATHER_IDS.sun || weatherType === CORE_WEATHER_IDS.harshSun) {
    return GEN9_ORICHALCUM_HADRON_MULTIPLIER;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Hadron Engine stat modifier
// ---------------------------------------------------------------------------

/**
 * Get the Special Attack multiplier for Hadron Engine on Electric Terrain.
 *
 * Source: Showdown data/abilities.ts:1733-1740
 *   "return this.chainModify([5461, 4096])" -- ~1.333x
 *
 * @returns 5461/4096 (~1.333x) if on Electric Terrain, 1 otherwise
 */
export function getHadronEngineMultiplier(terrainType: string | undefined): number {
  if (terrainType === CORE_TERRAIN_IDS.electric) {
    return GEN9_ORICHALCUM_HADRON_MULTIPLIER;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

/**
 * Main entry point for Gen 9 stat-boosting ability handlers.
 */
export function handleGen9StatAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case GEN9_ABILITY_IDS.protosynthesis:
      return handleProtosynthesis(ctx);
    case GEN9_ABILITY_IDS.quarkDrive:
      return handleQuarkDrive(ctx);
    default:
      return INACTIVE;
  }
}
