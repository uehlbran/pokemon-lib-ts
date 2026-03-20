import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/**
 * Gen 4 type chart (17 types: same as Gen 2-3 — no Fairy).
 *
 * Key Gen 4 differences vs Gen 6+:
 *   - Steel resists Ghost (0.5x) — removed in Gen 6
 *   - Steel resists Dark (0.5x) — removed in Gen 6
 *   - No Fairy type (added in Gen 6)
 *
 * Type chart is identical to Gen 3 (no type effectiveness changes between Gen 3 and Gen 4).
 *
 * Source: pret/pokeplatinum — type effectiveness table
 */
export const GEN4_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/**
 * The 17 types available in Generation 4.
 * Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground,
 * Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel.
 * Fairy does not exist until Gen 6.
 *
 * Source: pret/pokeplatinum — same type list as Gen 2-3, no Fairy
 */
export const GEN4_TYPES: readonly PokemonType[] = TYPES_BY_GEN[4] as readonly PokemonType[];
