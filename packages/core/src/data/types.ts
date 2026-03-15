import type {
  AbilityData,
  ItemData,
  MoveData,
  NatureData,
  PokemonSpeciesData,
  TypeChart,
} from "../entities";

/**
 * File-system paths to each per-generation data JSON file.
 * Used by build-time import scripts to locate the raw source files before
 * transformation. Not used at runtime — `RawDataObjects` is the runtime shape.
 */
export interface DataPaths {
  /** Absolute or relative path to `pokemon.json` */
  readonly pokemon: string;
  /** Absolute or relative path to `moves.json` */
  readonly moves: string;
  /** Absolute or relative path to `abilities.json`; omit for Gen 1–2 */
  readonly abilities?: string;
  /** Absolute or relative path to `items.json`; omit for Gen 1 */
  readonly items?: string;
  /** Absolute or relative path to `natures.json`; omit for Gen 1–2 */
  readonly natures?: string;
  /** Absolute or relative path to `type-chart.json` */
  readonly typeChart: string;
}

/**
 * The deserialized in-memory representation of a generation's full data bundle.
 * Passed directly to `DataManager.loadFromObjects()`.
 *
 * `abilities`, `items`, and `natures` are optional to accommodate generations
 * that lack those mechanics (e.g., Gen 1 has no abilities, natures, or held items;
 * Gen 2 has items but no natures or abilities).
 */
export interface RawDataObjects {
  /** All species in this generation (e.g., 151 for Gen 1, 251 for Gen 2) */
  readonly pokemon: PokemonSpeciesData[];
  /** All moves available in this generation */
  readonly moves: MoveData[];
  /** Ability data; omit (or pass empty array) for Gen 1–2 */
  readonly abilities?: AbilityData[];
  /** Held item data; omit (or pass empty array) for Gen 1 */
  readonly items?: ItemData[];
  /** Nature data; omit (or pass empty array) for Gen 1–2 */
  readonly natures?: NatureData[];
  /** Type-effectiveness chart for this generation */
  readonly typeChart: TypeChart;
}
