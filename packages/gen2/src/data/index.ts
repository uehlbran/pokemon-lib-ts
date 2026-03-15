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
 * Creates a `DataManager` pre-loaded with complete Gen 2 data:
 * 251 Pokémon, 251 moves, 17-type chart (adds Dark and Steel),
 * Gen 2 held items (Leftovers, berries, type-boosting items), and a
 * stub empty array for natures (Gen 2 has no natures).
 *
 * Pass the returned instance to `BattleEngine` alongside `Gen2Ruleset`.
 *
 * @returns A `DataManager` instance ready for use with `Gen2Ruleset`.
 */
export function createGen2DataManager(): DataManager {
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
