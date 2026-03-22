import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/**
 * Gen 8 type chart (18 types, identical to Gen 6-7).
 *
 * No type effectiveness changes between Gen 6 and Gen 8.
 * The 18 types are: Normal, Fire, Water, Electric, Grass, Ice, Fighting,
 * Poison, Ground, Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel, Fairy.
 *
 * Source: references/pokemon-showdown/data/typechart.ts (Gen 6+ base chart)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Type/Type_chart
 */
export const GEN8_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/**
 * The 18 types available in Generation 8.
 * Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground,
 * Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel, Fairy.
 *
 * Source: references/pokemon-showdown/data/typechart.ts -- same 18 types as Gen 6-7
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_VIII
 */
export const GEN8_TYPES: readonly PokemonType[] = TYPES_BY_GEN[8] as readonly PokemonType[];
