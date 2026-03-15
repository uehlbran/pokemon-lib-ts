import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/** Gen 1 type chart (15 types, no Dark/Steel/Fairy). Includes the Ghost vs Psychic immunity bug. */
export const GEN1_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/** The 15 types available in Generation 1. */
export const GEN1_TYPES: readonly PokemonType[] = TYPES_BY_GEN[1]!;
