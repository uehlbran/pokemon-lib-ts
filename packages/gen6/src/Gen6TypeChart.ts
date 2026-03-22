import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import typeChartData from "../data/type-chart.json";

/**
 * Gen 6 type chart (18 types: adds Fairy).
 *
 * Key Gen 6 type chart changes vs Gen 5:
 *   - Fairy type added (18th type)
 *   - Steel loses resistance to Ghost (now neutral, was 0.5x)
 *   - Steel loses resistance to Dark (now neutral, was 0.5x)
 *   - Fairy: SE vs Dragon/Fighting/Dark; resisted by Fire/Poison/Steel
 *   - Fairy: immune to Dragon; resists Fighting/Bug/Dark; weak to Poison/Steel
 *
 * Source: references/pokemon-showdown/data/typechart.ts (Gen 6+ base chart)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Fairy_(type)
 */
export const GEN6_TYPE_CHART: TypeChart = typeChartData as unknown as TypeChart;

/**
 * The 18 types available in Generation 6.
 * Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground,
 * Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel, Fairy.
 *
 * Source: references/pokemon-showdown/data/typechart.ts -- Fairy type added in Gen 6
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_VI
 */
export const GEN6_TYPES: readonly PokemonType[] = TYPES_BY_GEN[6] as readonly PokemonType[];
