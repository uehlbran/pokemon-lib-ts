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

export class DataManager {
  private speciesById = new Map<number, PokemonSpeciesData>();
  private speciesByName = new Map<string, PokemonSpeciesData>();
  private movesById = new Map<string, MoveData>();
  private abilitiesById = new Map<string, AbilityData>();
  private itemsById = new Map<string, ItemData>();
  private naturesById = new Map<string, NatureData>();
  private typeChart: TypeChart | null = null;
  private loaded = false;

  loadFromObjects(data: RawDataObjects): void {
    // Load pokemon
    for (const species of data.pokemon) {
      this.speciesById.set(species.id, species);
      this.speciesByName.set(species.name.toLowerCase(), species);
    }

    // Load moves
    for (const move of data.moves) {
      this.movesById.set(move.id, move);
    }

    // Load abilities (optional)
    if (data.abilities) {
      for (const ability of data.abilities) {
        this.abilitiesById.set(ability.id, ability);
      }
    }

    // Load items (optional)
    if (data.items) {
      for (const item of data.items) {
        this.itemsById.set(item.id, item);
      }
    }

    // Load natures (optional)
    if (data.natures) {
      for (const nature of data.natures) {
        this.naturesById.set(nature.id, nature);
      }
    }

    // Load type chart
    this.typeChart = data.typeChart;
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getSpecies(id: number): PokemonSpeciesData {
    const species = this.speciesById.get(id);
    if (!species) throw new Error(`Species with id ${id} not found`);
    return species;
  }

  getSpeciesByName(name: string): PokemonSpeciesData {
    const species = this.speciesByName.get(name.toLowerCase());
    if (!species) throw new Error(`Species "${name}" not found`);
    return species;
  }

  getMove(id: string): MoveData {
    const move = this.movesById.get(id);
    if (!move) throw new Error(`Move "${id}" not found`);
    return move;
  }

  getAbility(id: string): AbilityData {
    const ability = this.abilitiesById.get(id);
    if (!ability) throw new Error(`Ability "${id}" not found`);
    return ability;
  }

  getItem(id: string): ItemData {
    const item = this.itemsById.get(id);
    if (!item) throw new Error(`Item "${id}" not found`);
    return item;
  }

  getNature(id: NatureId): NatureData {
    const nature = this.naturesById.get(id);
    if (!nature) throw new Error(`Nature "${id}" not found`);
    return nature;
  }

  getTypeChart(): TypeChart {
    if (!this.typeChart) throw new Error("Type chart not loaded");
    return this.typeChart;
  }

  getAllSpecies(): PokemonSpeciesData[] {
    return [...this.speciesById.values()];
  }

  getAllMoves(): MoveData[] {
    return [...this.movesById.values()];
  }

  getAllAbilities(): AbilityData[] {
    return [...this.abilitiesById.values()];
  }

  getAllItems(): ItemData[] {
    return [...this.itemsById.values()];
  }

  getAllNatures(): NatureData[] {
    return [...this.naturesById.values()];
  }
}
