import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/**
 * Gen 9 type chart (18 types, identical to Gen 6-8).
 *
 * No type effectiveness changes between Gen 6 and Gen 9.
 * The Stellar Tera Type is NOT a type in the type chart -- it is a Tera-only
 * mechanic that modifies STAB behavior without adding a new type matchup.
 *
 * Source: Showdown data/typechart.ts (Gen 6+ base chart)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Type/Type_chart
 */
export const GEN9_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/**
 * The 18 types available in Generation 9.
 * Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground,
 * Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel, Fairy.
 *
 * Source: Showdown data/typechart.ts -- same 18 types as Gen 6-8
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_IX
 */
export const GEN9_TYPES: readonly PokemonType[] = TYPES_BY_GEN[9] as readonly PokemonType[];
