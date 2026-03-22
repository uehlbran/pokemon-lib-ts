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
 * Creates a `DataManager` pre-loaded with complete Gen 9 data:
 * ~733 Pokemon (#001-#1025, subject to Showdown's Gen 9 availability),
 * 18-type chart (with Fairy), Gen 9 moves (including Tera Blast),
 * items, 25 natures, and abilities (including Protosynthesis, Quark Drive, etc.).
 *
 * Pass the returned instance to `BattleEngine` alongside `Gen9Ruleset`.
 *
 * @returns A `DataManager` instance ready for use with `Gen9Ruleset`.
 */
export function createGen9DataManager(): DataManager {
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
