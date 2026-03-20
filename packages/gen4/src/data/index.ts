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

/**
 * Creates a `DataManager` pre-loaded with complete Gen 4 data:
 * 493 Pokemon, 467 moves, 17-type chart, items, 25 natures,
 * and Gen 4 abilities.
 *
 * Pass the returned instance to `BattleEngine` alongside `Gen4Ruleset`.
 *
 * @returns A `DataManager` instance ready for use with `Gen4Ruleset`.
 */
export function createGen4DataManager(): DataManager {
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
