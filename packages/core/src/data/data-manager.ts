import type {
  AbilityData,
  ItemData,
  MoveData,
  NatureData,
  NatureId,
  PokemonSpeciesData,
  TypeChart,
} from "../entities";
import type { RawDataObjects } from "./types";

/**
 * Loads per-generation Pokémon data into memory and provides typed accessors.
 *
 * Each gen package ships a pre-populated `DataManager` via its `createGenNDataManager()`
 * factory. Consumers that need custom data can construct a `DataManager` directly and
 * call `loadFromObjects()` with their own data.
 *
 * All accessor methods (e.g., `getSpecies`, `getMove`) throw if the requested entity
 * is not found — call `isLoaded()` first if you need to guard against unloaded state.
 */
export class DataManager {
  private speciesById = new Map<number, PokemonSpeciesData>();
  private speciesByName = new Map<string, PokemonSpeciesData>();
  private movesById = new Map<string, MoveData>();
  private abilitiesById = new Map<string, AbilityData>();
  private itemsById = new Map<string, ItemData>();
  private naturesById = new Map<string, NatureData>();
  private typeChart: TypeChart | null = null;
  private loaded = false;

  /**
   * Populates the manager from a `RawDataObjects` bundle. Replaces any previously
   * loaded data. Called automatically by the gen-package factory functions.
   *
   * @param data - The data bundle to load. `abilities`, `items`, and `natures` are
   *   optional — pass empty arrays or omit them for generations that lack these features
   *   (e.g., Gen 1 has no abilities or natures).
   */
  loadFromObjects(data: RawDataObjects): void {
    const speciesById = new Map<number, PokemonSpeciesData>();
    const speciesByName = new Map<string, PokemonSpeciesData>();
    const movesById = new Map<string, MoveData>();
    const abilitiesById = new Map<string, AbilityData>();
    const itemsById = new Map<string, ItemData>();
    const naturesById = new Map<string, NatureData>();

    // Load pokemon
    for (const species of data.pokemon) {
      speciesById.set(species.id, species);
      speciesByName.set(species.name.toLowerCase(), species);
    }

    // Load moves
    for (const move of data.moves) {
      movesById.set(move.id, move);
    }

    // Load abilities (optional)
    if (data.abilities) {
      for (const ability of data.abilities) {
        abilitiesById.set(ability.id, ability);
      }
    }

    // Load items (optional)
    if (data.items) {
      for (const item of data.items) {
        itemsById.set(item.id, item);
      }
    }

    // Load natures (optional)
    if (data.natures) {
      for (const nature of data.natures) {
        naturesById.set(nature.id, nature);
      }
    }

    // Load type chart
    const typeChart = data.typeChart;

    // Swap the fully built snapshot only after every load step succeeds, so a
    // malformed bundle cannot leave the manager partially populated.
    this.speciesById = speciesById;
    this.speciesByName = speciesByName;
    this.movesById = movesById;
    this.abilitiesById = abilitiesById;
    this.itemsById = itemsById;
    this.naturesById = naturesById;
    this.typeChart = typeChart;
    this.loaded = true;
  }

  /**
   * Returns `true` if `loadFromObjects()` has been called at least once.
   * Accessor methods will throw if called before data is loaded.
   *
   * @returns `true` when data has been loaded; `false` otherwise.
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Returns the species data for the given National Pokédex number.
   *
   * @param id - National Pokédex number (e.g., 1 for Bulbasaur, 151 for Mew).
   *   Valid range depends on the generation (Gen 1: 1–151, Gen 2: 1–251, etc.).
   * @returns The species data object.
   * @throws If no species with the given ID exists in the loaded data.
   */
  getSpecies(id: number): PokemonSpeciesData {
    const species = this.speciesById.get(id);
    if (!species) throw new Error(`Species with id ${id} not found`);
    return species;
  }

  /**
   * Returns the species data for the given Pokémon name (case-insensitive).
   *
   * @param name - Species name (e.g., `"Charizard"`, `"charizard"`).
   * @returns The species data object.
   * @throws If no species with the given name exists in the loaded data.
   */
  getSpeciesByName(name: string): PokemonSpeciesData {
    const species = this.speciesByName.get(name.toLowerCase());
    if (!species) throw new Error(`Species "${name}" not found`);
    return species;
  }

  /**
   * Returns the move data for the given move ID.
   *
   * @param id - Move ID string (e.g., `"tackle"`, `"fire-blast"`).
   * @returns The move data object.
   * @throws If no move with the given ID exists in the loaded data.
   */
  getMove(id: string): MoveData {
    const move = this.movesById.get(id);
    if (!move) throw new Error(`Move "${id}" not found`);
    return move;
  }

  /**
   * Returns the ability data for the given ability ID.
   *
   * @param id - Ability ID string (e.g., `"intimidate"`, `"levitate"`).
   * @returns The ability data object.
   * @throws If no ability with the given ID exists in the loaded data.
   *   This includes generations without abilities (Gen 1–2) where the abilities map is empty.
   */
  getAbility(id: string): AbilityData {
    const ability = this.abilitiesById.get(id);
    if (!ability) throw new Error(`Ability "${id}" not found`);
    return ability;
  }

  /**
   * Returns the item data for the given item ID.
   *
   * @param id - Item ID string (e.g., `"leftovers"`, `"choice-band"`).
   * @returns The item data object.
   * @throws If no item with the given ID exists in the loaded data.
   *   This includes Gen 1 which has no held items.
   */
  getItem(id: string): ItemData {
    const item = this.itemsById.get(id);
    if (!item) throw new Error(`Item "${id}" not found`);
    return item;
  }

  /**
   * Returns the nature data for the given nature ID.
   *
   * @param id - Nature ID string (e.g., `"adamant"`, `"modest"`, `"timid"`).
   * @returns The nature data object including the stat it boosts and the stat it lowers.
   * @throws If no nature with the given ID exists in the loaded data.
   *   This includes Gen 1–2 which have no natures.
   */
  getNature(id: NatureId): NatureData {
    const nature = this.naturesById.get(id);
    if (!nature) throw new Error(`Nature "${id}" not found`);
    return nature;
  }

  /**
   * Returns the full type-effectiveness chart for this generation.
   *
   * @returns The type chart as a nested map: `typeChart[attackType][defenseType] = multiplier`.
   *   Multipliers are one of: `0`, `0.5`, `1`, `2`.
   * @throws If the type chart has not been loaded (i.e., `loadFromObjects()` was not called).
   */
  getTypeChart(): TypeChart {
    if (!this.typeChart) throw new Error("Type chart not loaded");
    return this.typeChart;
  }

  /**
   * Returns all loaded species in insertion order.
   *
   * @returns An array of all `PokemonSpeciesData` objects in this generation's dataset.
   */
  getAllSpecies(): PokemonSpeciesData[] {
    return [...this.speciesById.values()];
  }

  /**
   * Returns all loaded moves in insertion order.
   *
   * @returns An array of all `MoveData` objects in this generation's dataset.
   */
  getAllMoves(): MoveData[] {
    return [...this.movesById.values()];
  }

  /**
   * Returns all loaded abilities in insertion order.
   *
   * @returns An array of all `AbilityData` objects in this generation's dataset.
   *   Returns an empty array for generations without abilities (Gen 1–2).
   */
  getAllAbilities(): AbilityData[] {
    return [...this.abilitiesById.values()];
  }

  /**
   * Returns all loaded items in insertion order.
   *
   * @returns An array of all `ItemData` objects in this generation's dataset.
   *   Returns an empty array for Gen 1 which has no held items.
   */
  getAllItems(): ItemData[] {
    return [...this.itemsById.values()];
  }

  /**
   * Returns all loaded natures in insertion order.
   *
   * @returns An array of all `NatureData` objects in this generation's dataset.
   *   Returns an empty array for Gen 1–2 which have no natures.
   */
  getAllNatures(): NatureData[] {
    return [...this.naturesById.values()];
  }
}
