import type {
  AbilityData,
  ItemData,
  MoveData,
  NatureData,
  PokemonSpeciesData,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import abilitiesData from "../../data/abilities.json";
import itemsData from "../../data/items.json";
import movesData from "../../data/moves.json";
import naturesData from "../../data/natures.json";
import pokemonData from "../../data/pokemon.json";
import typeChartData from "../../data/type-chart.json";

export { GEN8_TYPE_CHART, GEN8_TYPES } from "../Gen8TypeChart.js";
export * from "./reference-ids.js";

/**
 * Creates a `DataManager` pre-loaded with complete Gen 8 data:
 * ~905 Pokemon (#001-#905, including Galarian/Hisuian forms),
 * 18-type chart (with Fairy), Gen 8 moves, items, 25 natures,
 * and abilities (including Libero, Intrepid Sword, etc.).
 *
 * Pass the returned instance to `BattleEngine` alongside `Gen8Ruleset`.
 *
 * @returns A `DataManager` instance ready for use with `Gen8Ruleset`.
 */
export function createGen8DataManager(): DataManager {
  const dm = new DataManager();
  dm.loadFromObjects({
    pokemon: pokemonData as unknown as PokemonSpeciesData[],
    moves: movesData as unknown as MoveData[],
    abilities: abilitiesData as unknown as AbilityData[],
    items: itemsData as unknown as ItemData[],
    natures: naturesData as unknown as NatureData[],
    typeChart: typeChartData as unknown as TypeChart,
  });
  return dm;
}
