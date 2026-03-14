import type {
  AbilityData,
  ItemData,
  MoveData,
  NatureData,
  PokemonSpeciesData,
  TypeChart,
} from "../entities";

export interface DataPaths {
  readonly pokemon: string;
  readonly moves: string;
  readonly abilities?: string;
  readonly items?: string;
  readonly natures?: string;
  readonly typeChart: string;
}

export interface RawDataObjects {
  readonly pokemon: PokemonSpeciesData[];
  readonly moves: MoveData[];
  readonly abilities?: AbilityData[];
  readonly items?: ItemData[];
  readonly natures?: NatureData[];
  readonly typeChart: TypeChart;
}
