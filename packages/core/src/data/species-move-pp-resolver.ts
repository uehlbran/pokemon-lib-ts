import type { MoveData } from "../entities/move";
import type { PokemonSpeciesData } from "../entities/species";

const SPECIES_MOVE_PP_RESOLVER = Symbol("speciesMovePpResolver");

type MovePpResolver = (moveId: string) => number;

type SpeciesWithMovePpResolver = PokemonSpeciesData & {
  [SPECIES_MOVE_PP_RESOLVER]?: MovePpResolver;
};

export function attachSpeciesMovePpResolver(
  species: PokemonSpeciesData,
  movesById: ReadonlyMap<string, MoveData>,
): void {
  Object.defineProperty(species, SPECIES_MOVE_PP_RESOLVER, {
    value: (moveId: string) => {
      const move = movesById.get(moveId);
      if (!move) {
        throw new Error(`Move "${moveId}" not found`);
      }
      return move.pp;
    },
    enumerable: false,
    configurable: true,
  });
}

export function getSpeciesMovePpResolver(species: PokemonSpeciesData): MovePpResolver | null {
  return (species as SpeciesWithMovePpResolver)[SPECIES_MOVE_PP_RESOLVER] ?? null;
}
