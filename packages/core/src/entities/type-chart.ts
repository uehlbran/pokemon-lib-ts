import type { PokemonType } from "./types";

/**
 * Type effectiveness chart — a mapping from attacking type to defending type to multiplier.
 * Multiplier values: 0 (immune), 0.5 (not very effective), 1 (neutral), 2 (super effective).
 *
 * For dual-typed defenders, multiply the two multipliers together:
 * e.g., Ice vs. Dragon/Flying = 2 * 2 = 4 (double super effective).
 *
 * The type chart has changed across generations:
 * - Gen 1: No Dark, Steel, Fairy. Ghost was bugged (0x vs Psychic, should be 2x).
 * - Gen 2-5: Added Dark and Steel. Fixed Ghost vs Psychic.
 * - Gen 6+: Added Fairy. Steel lost resistance to Ghost and Dark.
 *
 * The core library provides the full Gen 6+ chart.
 * Battle library gen plugins can provide their own charts.
 */
export type TypeChart = Record<PokemonType, Record<PokemonType, number>>;

/**
 * Broader lookup shape used by damage-calculation helpers and synthetic tests.
 * Keeps the public strict chart type intact while allowing callers that build
 * ad-hoc chart records for targeted matchups.
 */
export type TypeChartLookup = TypeChart | Record<string, Record<string, number>>;
