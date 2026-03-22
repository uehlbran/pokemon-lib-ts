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
 * Creates a `DataManager` pre-loaded with complete Gen 7 data:
 * 807 Pokemon (#001-#807; Meltan/Melmetal #808-#809 excluded -- see note below),
 * 690 moves, 18-type chart (with Fairy), 339 items (including Z-Crystals),
 * 25 natures, and 233 abilities (including Beast Boost, Disguise, Schooling, etc.).
 *
 * Note: Meltan (#808) and Melmetal (#809) are excluded because they are not
 * available in PokeAPI's species endpoint. They were introduced as cross-game
 * Pokemon via Pokemon GO and Pokemon: Let's Go and were retroactively assigned
 * to Generation 7, but are not part of the standard Gen 7 data pipeline.
 *
 * Pass the returned instance to `BattleEngine` alongside `Gen7Ruleset`.
 *
 * @returns A `DataManager` instance ready for use with `Gen7Ruleset`.
 */
export function createGen7DataManager(): DataManager {
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
