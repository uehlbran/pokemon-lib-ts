import type {
  ItemData,
  MoveData,
  NatureData,
  PokemonSpeciesData,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import itemsData from "../../data/items.json";
import movesData from "../../data/moves.json";
import naturesData from "../../data/natures.json";
import pokemonData from "../../data/pokemon.json";
import typeChartData from "../../data/type-chart.json";

/**
 * Creates a `DataManager` pre-loaded with complete Gen 1 data:
 * 151 Pokémon, 165 moves, 15-type chart, and stub empty arrays for
 * items and natures (Gen 1 has no held items or natures).
 *
 * Pass the returned instance to `BattleEngine` alongside `Gen1Ruleset`.
 *
 * @returns A `DataManager` instance ready for use with `Gen1Ruleset`.
 */
export function createGen1DataManager(): DataManager {
  const dm = new DataManager();
  dm.loadFromObjects({
    pokemon: pokemonData as unknown as PokemonSpeciesData[],
    moves: movesData as unknown as MoveData[],
    typeChart: typeChartData as unknown as TypeChart,
    items: itemsData as unknown as ItemData[],
    natures: naturesData as unknown as NatureData[],
  });
  return dm;
}
