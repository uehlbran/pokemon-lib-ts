import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/**
 * Gen 5 type chart (17 types: same as Gen 2-4 -- no Fairy).
 *
 * Key Gen 5 differences vs Gen 6+:
 *   - Steel resists Ghost (0.5x) -- removed in Gen 6
 *   - Steel resists Dark (0.5x) -- removed in Gen 6
 *   - No Fairy type (added in Gen 6)
 *
 * Type chart is identical to Gen 2-4 (no type effectiveness changes between Gen 2 and Gen 5).
 *
 * Source: references/pokemon-showdown/data/mods/gen5/typechart.ts
 */
export const GEN5_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/**
 * The 17 types available in Generation 5.
 * Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground,
 * Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel.
 * Fairy does not exist until Gen 6.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- same type list as Gen 2-4, no Fairy
 */
export const GEN5_TYPES: readonly PokemonType[] = TYPES_BY_GEN[5] as readonly PokemonType[];
