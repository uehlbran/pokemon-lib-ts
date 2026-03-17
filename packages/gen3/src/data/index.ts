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
 * Creates a `DataManager` pre-loaded with complete Gen 3 data:
 * 386 Pokémon, 370 moves, 17-type chart, 106 items, 25 natures,
 * and 76 Gen 3 abilities (introduced in Generation III).
 *
 * Pass the returned instance to `BattleEngine` alongside `Gen3Ruleset`.
 *
 * @returns A `DataManager` instance ready for use with `Gen3Ruleset`.
 */
export function createGen3DataManager(): DataManager {
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
