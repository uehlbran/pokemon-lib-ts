/**
 * Gen 8 G-Max Move data -- species associations, types, and effects.
 *
 * Source: Showdown data/moves.ts lines 6955-7760 -- all gmaxXxx entries
 * Source: Bulbapedia "Gigantamax" -- species-specific G-Max Moves
 */

import type { BattleStat, EntryHazardType, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_HAZARD_IDS,
  CORE_MOVE_IDS,
  CORE_SCREEN_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { GEN8_MOVE_IDS } from "./data/reference-ids";

export const GEN8_GMAX_EFFECT_TYPES = {
  statusRandom: "status-random",
  residual: "residual",
  trap: "trap",
  critBoost: "crit-boost",
  infatuateFoes: "infatuate-foes",
  ppDeduct: "pp-deduct",
  ignoreAbility: "ignore-ability",
  healAllies: "heal-allies",
  statChange: "stat-change",
  confuseFoes: "confuse-foes",
  pseudoWeather: "pseudo-weather",
  status: "status",
  tormentFoes: "torment-foes",
  bypassProtect: "bypass-protect",
  restoreBerries: "restore-berries",
  sideCondition: "side-condition",
  yawn: "yawn",
  hazard: "hazard",
  cureAllies: "cure-allies",
  trapFoes: "trap-foes",
} as const;

export const GEN8_GMAX_EFFECT_TARGETS = {
  foes: "foes",
} as const;

export const GEN8_GMAX_DAMAGE_FRACTIONS = {
  oneSixth: "1/6",
} as const;

export const GEN8_GMAX_HAZARD_IDS = {
  gmaxSteelsurge: CORE_HAZARD_IDS.gmaxSteelsurge,
  stealthRock: CORE_HAZARD_IDS.stealthRock,
} as const;

export const GEN8_GMAX_PSEUDO_WEATHER_IDS = {
  gravity: CORE_MOVE_IDS.gravity,
} as const;

export const GEN8_GMAX_STATUS_IDS = {
  sleep: CORE_STATUS_IDS.sleep,
  paralysis: CORE_STATUS_IDS.paralysis,
  poison: CORE_STATUS_IDS.poison,
} as const;

export const GEN8_GMAX_TRAP_MOVE_IDS = {
  fireSpin: GEN8_MOVE_IDS.fireSpin,
  sandTomb: GEN8_MOVE_IDS.sandTomb,
} as const;

export const GEN8_GMAX_SIDE_CONDITION_IDS = {
  auroraVeil: CORE_SCREEN_IDS.auroraVeil,
} as const;

/**
 * Describes the unique effect of a G-Max Move.
 *
 * Source: Showdown data/moves.ts -- individual G-Max move effect implementations
 */
export type GMaxMoveEffectType =
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.statusRandom;
      statuses: readonly PrimaryStatus[];
    }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.residual;
      duration: number;
      damage: (typeof GEN8_GMAX_DAMAGE_FRACTIONS)[keyof typeof GEN8_GMAX_DAMAGE_FRACTIONS];
      immunity: readonly PokemonType[];
    }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.trap;
      trapType: (typeof GEN8_GMAX_TRAP_MOVE_IDS)[keyof typeof GEN8_GMAX_TRAP_MOVE_IDS];
    }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.critBoost; layers: number }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.infatuateFoes }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.ppDeduct; amount: number }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.ignoreAbility }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.healAllies;
      fraction: (typeof GEN8_GMAX_DAMAGE_FRACTIONS)[keyof typeof GEN8_GMAX_DAMAGE_FRACTIONS];
    }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.statChange;
      stat: BattleStat;
      stages: number;
      target: (typeof GEN8_GMAX_EFFECT_TARGETS)[keyof typeof GEN8_GMAX_EFFECT_TARGETS];
    }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.confuseFoes }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.pseudoWeather;
      condition: (typeof GEN8_GMAX_PSEUDO_WEATHER_IDS)[keyof typeof GEN8_GMAX_PSEUDO_WEATHER_IDS];
    }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.status;
      status: PrimaryStatus;
    }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.tormentFoes }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.bypassProtect }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.restoreBerries; chance: number }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.sideCondition;
      condition: (typeof GEN8_GMAX_SIDE_CONDITION_IDS)[keyof typeof GEN8_GMAX_SIDE_CONDITION_IDS];
    }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.yawn; chance: number }
  | {
      type: typeof GEN8_GMAX_EFFECT_TYPES.hazard;
      hazard: EntryHazardType;
    }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.cureAllies }
  | { type: typeof GEN8_GMAX_EFFECT_TYPES.trapFoes };

/**
 * Data for a single G-Max Move.
 */
export interface GMaxMoveData {
  /** The species name that has access to this G-Max Move */
  readonly species: string;
  /** The type of the G-Max Move */
  readonly moveType: PokemonType;
  /** The unique effect of this G-Max Move */
  readonly effect: GMaxMoveEffectType;
  /** Override base power (for the trio starters: Rillaboom, Cinderace, Inteleon) */
  readonly basePower?: number;
}

/**
 * Complete G-Max Move table.
 *
 * Source: Showdown data/moves.ts lines 6955-7760 (all gmaxXxx entries)
 * Source: Bulbapedia "Gigantamax" -- species list and effects
 */
export const GMAX_MOVES: Readonly<Record<string, GMaxMoveData>> = {
  "gmax-befuddle": {
    species: "Butterfree",
    moveType: CORE_TYPE_IDS.bug,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.statusRandom,
      statuses: [
        GEN8_GMAX_STATUS_IDS.sleep,
        GEN8_GMAX_STATUS_IDS.paralysis,
        GEN8_GMAX_STATUS_IDS.poison,
      ],
    },
  },
  "gmax-cannonade": {
    species: "Blastoise",
    moveType: CORE_TYPE_IDS.water,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.residual,
      duration: 4,
      damage: GEN8_GMAX_DAMAGE_FRACTIONS.oneSixth,
      immunity: [CORE_TYPE_IDS.water],
    },
  },
  "gmax-centiferno": {
    species: "Centiskorch",
    moveType: CORE_TYPE_IDS.fire,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.trap, trapType: GEN8_GMAX_TRAP_MOVE_IDS.fireSpin },
  },
  "gmax-chi-strike": {
    species: "Machamp",
    moveType: CORE_TYPE_IDS.fighting,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.critBoost, layers: 1 },
  },
  "gmax-cuddle": {
    species: "Eevee",
    moveType: CORE_TYPE_IDS.normal,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.infatuateFoes },
  },
  "gmax-depletion": {
    species: "Duraludon",
    moveType: CORE_TYPE_IDS.dragon,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.ppDeduct, amount: 2 },
  },
  "gmax-drum-solo": {
    species: "Rillaboom",
    moveType: CORE_TYPE_IDS.grass,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.ignoreAbility },
    basePower: 160,
  },
  "gmax-finale": {
    species: "Alcremie",
    moveType: CORE_TYPE_IDS.fairy,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.healAllies,
      fraction: GEN8_GMAX_DAMAGE_FRACTIONS.oneSixth,
    },
  },
  "gmax-fireball": {
    species: "Cinderace",
    moveType: CORE_TYPE_IDS.fire,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.ignoreAbility },
    basePower: 160,
  },
  "gmax-foam-burst": {
    species: "Kingler",
    moveType: CORE_TYPE_IDS.water,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.statChange,
      stat: CORE_STAT_IDS.speed,
      stages: -2,
      target: GEN8_GMAX_EFFECT_TARGETS.foes,
    },
  },
  "gmax-gold-rush": {
    species: "Meowth",
    moveType: CORE_TYPE_IDS.normal,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.confuseFoes },
  },
  "gmax-gravitas": {
    species: "Orbeetle",
    moveType: CORE_TYPE_IDS.psychic,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.pseudoWeather,
      condition: GEN8_GMAX_PSEUDO_WEATHER_IDS.gravity,
    },
  },
  "gmax-hydrosnipe": {
    species: "Inteleon",
    moveType: CORE_TYPE_IDS.water,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.ignoreAbility },
    basePower: 160,
  },
  "gmax-malodor": {
    species: "Garbodor",
    moveType: CORE_TYPE_IDS.poison,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.status, status: GEN8_GMAX_STATUS_IDS.poison },
  },
  "gmax-meltdown": {
    species: "Melmetal",
    moveType: CORE_TYPE_IDS.steel,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.tormentFoes },
  },
  "gmax-one-blow": {
    species: "Urshifu",
    moveType: CORE_TYPE_IDS.dark,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.bypassProtect },
  },
  "gmax-rapid-flow": {
    species: "Urshifu-Rapid-Strike",
    moveType: CORE_TYPE_IDS.water,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.bypassProtect },
  },
  "gmax-replenish": {
    species: "Snorlax",
    moveType: CORE_TYPE_IDS.normal,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.restoreBerries, chance: 0.5 },
  },
  "gmax-resonance": {
    species: "Lapras",
    moveType: CORE_TYPE_IDS.ice,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.sideCondition,
      condition: GEN8_GMAX_SIDE_CONDITION_IDS.auroraVeil,
    },
  },
  "gmax-sandblast": {
    species: "Sandaconda",
    moveType: CORE_TYPE_IDS.ground,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.trap, trapType: GEN8_GMAX_TRAP_MOVE_IDS.sandTomb },
  },
  "gmax-smite": {
    species: "Hatterene",
    moveType: CORE_TYPE_IDS.fairy,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.confuseFoes },
  },
  "gmax-snooze": {
    species: "Grimmsnarl",
    moveType: CORE_TYPE_IDS.dark,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.yawn, chance: 0.5 },
  },
  "gmax-steelsurge": {
    species: "Copperajah",
    moveType: CORE_TYPE_IDS.steel,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.hazard, hazard: GEN8_GMAX_HAZARD_IDS.gmaxSteelsurge },
  },
  "gmax-stonesurge": {
    species: "Drednaw",
    moveType: CORE_TYPE_IDS.water,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.hazard, hazard: GEN8_GMAX_HAZARD_IDS.stealthRock },
  },
  "gmax-stun-shock": {
    species: "Toxtricity",
    moveType: CORE_TYPE_IDS.electric,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.statusRandom,
      statuses: [GEN8_GMAX_STATUS_IDS.paralysis, GEN8_GMAX_STATUS_IDS.poison],
    },
  },
  "gmax-sweetness": {
    species: "Appletun",
    moveType: CORE_TYPE_IDS.grass,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.cureAllies },
  },
  "gmax-tartness": {
    species: "Flapple",
    moveType: CORE_TYPE_IDS.grass,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.statChange,
      stat: CORE_STAT_IDS.evasion,
      stages: -1,
      target: GEN8_GMAX_EFFECT_TARGETS.foes,
    },
  },
  "gmax-terror": {
    species: "Gengar",
    moveType: CORE_TYPE_IDS.ghost,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.trapFoes },
  },
  "gmax-vine-lash": {
    species: "Venusaur",
    moveType: CORE_TYPE_IDS.grass,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.residual,
      duration: 4,
      damage: GEN8_GMAX_DAMAGE_FRACTIONS.oneSixth,
      immunity: [CORE_TYPE_IDS.grass],
    },
  },
  "gmax-volcalith": {
    species: "Coalossal",
    moveType: CORE_TYPE_IDS.rock,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.residual,
      duration: 4,
      damage: GEN8_GMAX_DAMAGE_FRACTIONS.oneSixth,
      immunity: [CORE_TYPE_IDS.rock],
    },
  },
  "gmax-volt-crash": {
    species: "Pikachu",
    moveType: CORE_TYPE_IDS.electric,
    effect: { type: GEN8_GMAX_EFFECT_TYPES.status, status: GEN8_GMAX_STATUS_IDS.paralysis },
  },
  "gmax-wildfire": {
    species: "Charizard",
    moveType: CORE_TYPE_IDS.fire,
    effect: {
      type: GEN8_GMAX_EFFECT_TYPES.residual,
      duration: 4,
      damage: GEN8_GMAX_DAMAGE_FRACTIONS.oneSixth,
      immunity: [CORE_TYPE_IDS.fire],
    },
  },
};

/**
 * Index of species name (lowercase) to G-Max move ID for fast lookup.
 */
const SPECIES_TO_GMAX: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(GMAX_MOVES).map(([id, data]) => [data.species.toLowerCase(), id]),
);

/**
 * Returns the G-Max move data for a given species, or null if the species
 * does not have a G-Max form.
 *
 * Accepts species name (string, case-insensitive) or species ID (number, currently
 * not mapped -- returns null for numeric IDs as species-to-ID mapping is data-dependent).
 *
 * Source: Showdown data/moves.ts -- G-Max move entries per species
 *
 * @param speciesId - Species name or numeric ID
 * @returns GMaxMoveData if found, null otherwise
 */
export function getGMaxMove(speciesId: number | string): GMaxMoveData | null {
  if (typeof speciesId === "number") {
    // Numeric IDs require a data lookup not available here;
    // callers should resolve the species name first.
    return null;
  }
  const key = speciesId.toLowerCase();
  const gmaxId = SPECIES_TO_GMAX[key];
  if (!gmaxId) return null;
  return GMAX_MOVES[gmaxId] ?? null;
}

/**
 * Returns the canonical G-Max move ID for a given species, or null if the species
 * does not have a G-Max form.
 */
export function getGMaxMoveId(speciesId: number | string): string | null {
  if (typeof speciesId === "number") {
    return null;
  }

  return SPECIES_TO_GMAX[speciesId.toLowerCase()] ?? null;
}

/**
 * Converts a canonical G-Max move ID into its display name.
 *
 * Example: "gmax-wildfire" -> "G-Max Wildfire"
 */
export function getGMaxMoveDisplayName(gmaxMoveId: string): string {
  const suffix = gmaxMoveId.replace(/^gmax-/, "");
  const words = suffix
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return `G-Max ${words.join(" ")}`;
}

/**
 * Returns true if the given species data has a Gigantamax form.
 *
 * Source: Game mechanic -- only certain species can Gigantamax
 *
 * @param species - Object with an optional `gigantamaxForm` property
 * @returns true if the species has Gigantamax data
 */
export function isGigantamaxEligible(species: { gigantamaxForm?: unknown }): boolean {
  return species.gigantamaxForm != null;
}

/**
 * Returns G-Max move data by move ID (e.g., "gmax-wildfire"), or null if not found.
 *
 * Source: Showdown data/moves.ts -- G-Max move entries
 *
 * @param gmaxMoveId - The G-Max move ID
 * @returns GMaxMoveData if found, null otherwise
 */
export function getGMaxMoveEffect(gmaxMoveId: string): GMaxMoveData | null {
  return GMAX_MOVES[gmaxMoveId] ?? null;
}
