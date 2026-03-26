/**
 * Gen 8 G-Max Move data -- species associations, types, and effects.
 *
 * Source: Showdown data/moves.ts lines 6955-7760 -- all gmaxXxx entries
 * Source: Bulbapedia "Gigantamax" -- species-specific G-Max Moves
 */

import type { PokemonType } from "@pokemon-lib-ts/core";

/**
 * Describes the unique effect of a G-Max Move.
 *
 * Source: Showdown data/moves.ts -- individual G-Max move effect implementations
 */
export type GMaxMoveEffectType =
  | { type: "status-random"; statuses: readonly string[] }
  | { type: "residual"; duration: number; damage: string; immunity: readonly string[] }
  | { type: "trap"; trapType: string }
  | { type: "crit-boost"; layers: number }
  | { type: "infatuate-foes" }
  | { type: "pp-deduct"; amount: number }
  | { type: "ignore-ability" }
  | { type: "heal-allies"; fraction: string }
  | { type: "stat-change"; stat: string; stages: number; target: string }
  | { type: "confuse-foes" }
  | { type: "pseudo-weather"; condition: string }
  | { type: "status"; status: string }
  | { type: "torment-foes" }
  | { type: "bypass-protect" }
  | { type: "restore-berries"; chance: number }
  | { type: "side-condition"; condition: string }
  | { type: "yawn"; chance: number }
  | { type: "hazard"; hazard: string }
  | { type: "cure-allies" }
  | { type: "trap-foes" };

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
    moveType: "bug",
    effect: { type: "status-random", statuses: ["slp", "par", "psn"] },
  },
  "gmax-cannonade": {
    species: "Blastoise",
    moveType: "water",
    effect: { type: "residual", duration: 4, damage: "1/6", immunity: ["water"] },
  },
  "gmax-centiferno": {
    species: "Centiskorch",
    moveType: "fire",
    effect: { type: "trap", trapType: "fire-spin" },
  },
  "gmax-chi-strike": {
    species: "Machamp",
    moveType: "fighting",
    effect: { type: "crit-boost", layers: 1 },
  },
  "gmax-cuddle": {
    species: "Eevee",
    moveType: "normal",
    effect: { type: "infatuate-foes" },
  },
  "gmax-depletion": {
    species: "Duraludon",
    moveType: "dragon",
    effect: { type: "pp-deduct", amount: 2 },
  },
  "gmax-drum-solo": {
    species: "Rillaboom",
    moveType: "grass",
    effect: { type: "ignore-ability" },
    basePower: 160,
  },
  "gmax-finale": {
    species: "Alcremie",
    moveType: "fairy",
    effect: { type: "heal-allies", fraction: "1/6" },
  },
  "gmax-fireball": {
    species: "Cinderace",
    moveType: "fire",
    effect: { type: "ignore-ability" },
    basePower: 160,
  },
  "gmax-foam-burst": {
    species: "Kingler",
    moveType: "water",
    effect: { type: "stat-change", stat: "spe", stages: -2, target: "foes" },
  },
  "gmax-gold-rush": {
    species: "Meowth",
    moveType: "normal",
    effect: { type: "confuse-foes" },
  },
  "gmax-gravitas": {
    species: "Orbeetle",
    moveType: "psychic",
    effect: { type: "pseudo-weather", condition: "gravity" },
  },
  "gmax-hydrosnipe": {
    species: "Inteleon",
    moveType: "water",
    effect: { type: "ignore-ability" },
    basePower: 160,
  },
  "gmax-malodor": {
    species: "Garbodor",
    moveType: "poison",
    effect: { type: "status", status: "psn" },
  },
  "gmax-meltdown": {
    species: "Melmetal",
    moveType: "steel",
    effect: { type: "torment-foes" },
  },
  "gmax-one-blow": {
    species: "Urshifu",
    moveType: "dark",
    effect: { type: "bypass-protect" },
  },
  "gmax-rapid-flow": {
    species: "Urshifu-Rapid-Strike",
    moveType: "water",
    effect: { type: "bypass-protect" },
  },
  "gmax-replenish": {
    species: "Snorlax",
    moveType: "normal",
    effect: { type: "restore-berries", chance: 0.5 },
  },
  "gmax-resonance": {
    species: "Lapras",
    moveType: "ice",
    effect: { type: "side-condition", condition: "aurora-veil" },
  },
  "gmax-sandblast": {
    species: "Sandaconda",
    moveType: "ground",
    effect: { type: "trap", trapType: "sand-tomb" },
  },
  "gmax-smite": {
    species: "Hatterene",
    moveType: "fairy",
    effect: { type: "confuse-foes" },
  },
  "gmax-snooze": {
    species: "Grimmsnarl",
    moveType: "dark",
    effect: { type: "yawn", chance: 0.5 },
  },
  "gmax-steelsurge": {
    species: "Copperajah",
    moveType: "steel",
    effect: { type: "hazard", hazard: "gmax-steelsurge" },
  },
  "gmax-stonesurge": {
    species: "Drednaw",
    moveType: "water",
    effect: { type: "hazard", hazard: "stealth-rock" },
  },
  "gmax-stun-shock": {
    species: "Toxtricity",
    moveType: "electric",
    effect: { type: "status-random", statuses: ["par", "psn"] },
  },
  "gmax-sweetness": {
    species: "Appletun",
    moveType: "grass",
    effect: { type: "cure-allies" },
  },
  "gmax-tartness": {
    species: "Flapple",
    moveType: "grass",
    effect: { type: "stat-change", stat: "eva", stages: -1, target: "foes" },
  },
  "gmax-terror": {
    species: "Gengar",
    moveType: "ghost",
    effect: { type: "trap-foes" },
  },
  "gmax-vine-lash": {
    species: "Venusaur",
    moveType: "grass",
    effect: { type: "residual", duration: 4, damage: "1/6", immunity: ["grass"] },
  },
  "gmax-volcalith": {
    species: "Coalossal",
    moveType: "rock",
    effect: { type: "residual", duration: 4, damage: "1/6", immunity: ["rock"] },
  },
  "gmax-volt-crash": {
    species: "Pikachu",
    moveType: "electric",
    effect: { type: "status", status: "par" },
  },
  "gmax-wildfire": {
    species: "Charizard",
    moveType: "fire",
    effect: { type: "residual", duration: 4, damage: "1/6", immunity: ["fire"] },
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
