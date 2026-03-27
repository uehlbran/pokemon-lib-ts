import type { MoveData } from "../entities/move";
import type { PokemonSpeciesData } from "../entities/species";

type MovePpResolver = (moveId: string) => number;
const SPECIES_MOVE_PP_RESOLVERS = new WeakMap<PokemonSpeciesData, MovePpResolver>();

export function attachSpeciesMovePpResolver(
  species: PokemonSpeciesData,
  movesById: ReadonlyMap<string, MoveData>,
): void {
  SPECIES_MOVE_PP_RESOLVERS.set(species, (moveId: string) => {
    const move = movesById.get(moveId);
    if (!move) {
      throw new Error(`Move "${moveId}" not found`);
    }
    return move.pp;
  });
}

export function getSpeciesMovePpResolver(species: PokemonSpeciesData): MovePpResolver | null {
  return SPECIES_MOVE_PP_RESOLVERS.get(species) ?? null;
}
