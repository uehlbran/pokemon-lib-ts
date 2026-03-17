import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/**
 * Gen 3 type chart (17 types: same as Gen 2 — no Fairy).
 *
 * Key Gen 3 differences vs Gen 6+:
 *   - Steel resists Ghost (0.5x) — removed in Gen 6
 *   - Steel resists Dark (0.5x) — removed in Gen 6
 *   - Steel resists Water (0.5x) — removed in Gen 6
 *   - Steel resists Electric (0.5x) — removed in Gen 6
 *
 * Source: pret/pokeemerald src/data/battle/type_effectiveness.h
 */
export const GEN3_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/**
 * The 17 types available in Generation 3.
 * Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground,
 * Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel.
 * Fairy does not exist until Gen 6.
 *
 * Source: pret/pokeemerald — same type list as Gen 2, no Fairy
 */
export const GEN3_TYPES: readonly PokemonType[] = TYPES_BY_GEN[3] as readonly PokemonType[];
