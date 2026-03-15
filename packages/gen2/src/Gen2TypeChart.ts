import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/** Gen 2 type chart (17 types, adds Dark/Steel — no Fairy). Ghost vs Psychic bug is FIXED. */
export const GEN2_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/** The 17 types available in Generation 2. */
export const GEN2_TYPES: readonly PokemonType[] = TYPES_BY_GEN[2]!;
