import { beforeEach, describe, expect, it } from "vitest";
import { DataManager } from "../../../src/data/data-manager";
import type { RawDataObjects } from "../../../src/data/types";
import type {
  AbilityData,
  ItemData,
  MoveData,
  NatureData,
  PokemonSpeciesData,
  TypeChart,
} from "../../../src/entities";

// --- Minimal test fixtures ---

const bulbasaur: PokemonSpeciesData = {
  id: 1,
  name: "bulbasaur",
  displayName: "Bulbasaur",
  types: ["grass", "poison"],
  baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
  abilities: { normal: ["overgrow"], hidden: "chlorophyll" },
  genderRatio: 87.5,
  catchRate: 45,
  baseExp: 64,
  expGroup: "medium-slow",
  evYield: { spAttack: 1 },
  eggGroups: ["monster", "grass"],
  learnset: { levelUp: [{ level: 1, move: "tackle" }], tm: [], egg: [], tutor: [] },
  evolution: { from: null, to: [{ speciesId: 2, method: "level-up", level: 16 }] },
  dimensions: { height: 0.7, weight: 6.9 },
  spriteKey: "bulbasaur",
  baseFriendship: 50,
  generation: 1,
  isLegendary: false,
  isMythical: false,
};

const charmander: PokemonSpeciesData = {
  id: 4,
  name: "charmander",
  displayName: "Charmander",
  types: ["fire"],
  baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
  abilities: { normal: ["blaze"], hidden: "solar-power" },
  genderRatio: 87.5,
  catchRate: 45,
  baseExp: 62,
  expGroup: "medium-slow",
  evYield: { speed: 1 },
  eggGroups: ["monster", "dragon"],
  learnset: { levelUp: [{ level: 1, move: "scratch" }], tm: [], egg: [], tutor: [] },
  evolution: { from: null, to: [{ speciesId: 5, method: "level-up", level: 16 }] },
  dimensions: { height: 0.6, weight: 8.5 },
  spriteKey: "charmander",
  baseFriendship: 50,
  generation: 1,
  isLegendary: false,
  isMythical: false,
};

const tackle: MoveData = {
  id: "tackle",
  displayName: "Tackle",
  type: "normal",
  category: "physical",
  power: 40,
  accuracy: 100,
  pp: 35,
  priority: 0,
  target: "adjacent-foe",
  flags: {
    contact: true,
    sound: false,
    bullet: false,
    pulse: false,
    punch: false,
    bite: false,
    wind: false,
    slicing: false,
    powder: false,
    protect: true,
    mirror: true,
    snatch: false,
    gravity: false,
    defrost: false,
    recharge: false,
    charge: false,
    bypassSubstitute: false,
  },
  effect: null,
  description: "A physical attack in which the user charges and slams into the target.",
  generation: 1,
};

const flamethrower: MoveData = {
  id: "flamethrower",
  displayName: "Flamethrower",
  type: "fire",
  category: "special",
  power: 90,
  accuracy: 100,
  pp: 15,
  priority: 0,
  target: "adjacent-foe",
  flags: {
    contact: false,
    sound: false,
    bullet: false,
    pulse: false,
    punch: false,
    bite: false,
    wind: false,
    slicing: false,
    powder: false,
    protect: true,
    mirror: true,
    snatch: false,
    gravity: false,
    defrost: true,
    recharge: false,
    charge: false,
    bypassSubstitute: false,
  },
  effect: { type: "status-chance", status: "burn", chance: 10 },
  description: "The target is scorched with an intense blast of fire.",
  generation: 1,
};

const overgrow: AbilityData = {
  id: "overgrow",
  displayName: "Overgrow",
  description: "Powers up Grass-type moves when the Pokemon's HP is low.",
  triggers: ["on-hp-threshold"],
  generation: 3,
  suppressible: true,
  copyable: true,
  swappable: true,
};

const potion: ItemData = {
  id: "potion",
  displayName: "Potion",
  description: "Restores 20 HP.",
  category: "medicine",
  pocket: "medicine",
  price: 200,
  battleUsable: true,
  fieldUsable: true,
  useEffect: { type: "heal-hp", amount: 20 },
  generation: 1,
  spriteKey: "potion",
};

const adamant: NatureData = {
  id: "adamant",
  displayName: "Adamant",
  increased: "attack",
  decreased: "spAttack",
  likedFlavor: "spicy",
  dislikedFlavor: "dry",
};

const hardy: NatureData = {
  id: "hardy",
  displayName: "Hardy",
  increased: null,
  decreased: null,
  likedFlavor: null,
  dislikedFlavor: null,
};

const minimalTypeChart: TypeChart = {
  normal: {
    normal: 1,
    fire: 1,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 1,
    fighting: 1,
    poison: 1,
    ground: 1,
    flying: 1,
    psychic: 1,
    bug: 1,
    rock: 0.5,
    ghost: 0,
    dragon: 1,
    dark: 1,
    steel: 0.5,
    fairy: 1,
  },
  fire: {
    normal: 1,
    fire: 0.5,
    water: 0.5,
    electric: 1,
    grass: 2,
    ice: 2,
    fighting: 1,
    poison: 1,
    ground: 1,
    flying: 1,
    psychic: 1,
    bug: 2,
    rock: 0.5,
    ghost: 1,
    dragon: 0.5,
    dark: 1,
    steel: 2,
    fairy: 1,
  },
  water: {
    normal: 1,
    fire: 2,
    water: 0.5,
    electric: 1,
    grass: 0.5,
    ice: 1,
    fighting: 1,
    poison: 1,
    ground: 2,
    flying: 1,
    psychic: 1,
    bug: 1,
    rock: 2,
    ghost: 1,
    dragon: 0.5,
    dark: 1,
    steel: 1,
    fairy: 1,
  },
  electric: {
    normal: 1,
    fire: 1,
    water: 2,
    electric: 0.5,
    grass: 0.5,
    ice: 1,
    fighting: 1,
    poison: 1,
    ground: 0,
    flying: 2,
    psychic: 1,
    bug: 1,
    rock: 1,
    ghost: 1,
    dragon: 0.5,
    dark: 1,
    steel: 1,
    fairy: 1,
  },
  grass: {
    normal: 1,
    fire: 0.5,
    water: 2,
    electric: 1,
    grass: 0.5,
    ice: 1,
    fighting: 1,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    psychic: 1,
    bug: 0.5,
    rock: 2,
    ghost: 1,
    dragon: 0.5,
    dark: 1,
    steel: 0.5,
    fairy: 1,
  },
  ice: {
    normal: 1,
    fire: 0.5,
    water: 0.5,
    electric: 1,
    grass: 2,
    ice: 0.5,
    fighting: 1,
    poison: 1,
    ground: 2,
    flying: 2,
    psychic: 1,
    bug: 1,
    rock: 1,
    ghost: 1,
    dragon: 2,
    dark: 1,
    steel: 0.5,
    fairy: 1,
  },
  fighting: {
    normal: 2,
    fire: 1,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 2,
    fighting: 1,
    poison: 0.5,
    ground: 1,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dragon: 1,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: {
    normal: 1,
    fire: 1,
    water: 1,
    electric: 1,
    grass: 2,
    ice: 1,
    fighting: 1,
    poison: 0.5,
    ground: 0.5,
    flying: 1,
    psychic: 1,
    bug: 1,
    rock: 0.5,
    ghost: 0.5,
    dragon: 1,
    dark: 1,
    steel: 0,
    fairy: 2,
  },
  ground: {
    normal: 1,
    fire: 2,
    water: 1,
    electric: 2,
    grass: 0.5,
    ice: 1,
    fighting: 1,
    poison: 2,
    ground: 1,
    flying: 0,
    psychic: 1,
    bug: 0.5,
    rock: 2,
    ghost: 1,
    dragon: 1,
    dark: 1,
    steel: 2,
    fairy: 1,
  },
  flying: {
    normal: 1,
    fire: 1,
    water: 1,
    electric: 0.5,
    grass: 2,
    ice: 1,
    fighting: 2,
    poison: 1,
    ground: 1,
    flying: 1,
    psychic: 1,
    bug: 2,
    rock: 0.5,
    ghost: 1,
    dragon: 1,
    dark: 1,
    steel: 0.5,
    fairy: 1,
  },
  psychic: {
    normal: 1,
    fire: 1,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 1,
    fighting: 2,
    poison: 2,
    ground: 1,
    flying: 1,
    psychic: 0.5,
    bug: 1,
    rock: 1,
    ghost: 1,
    dragon: 1,
    dark: 0,
    steel: 0.5,
    fairy: 1,
  },
  bug: {
    normal: 1,
    fire: 0.5,
    water: 1,
    electric: 1,
    grass: 2,
    ice: 1,
    fighting: 0.5,
    poison: 0.5,
    ground: 1,
    flying: 0.5,
    psychic: 2,
    bug: 1,
    rock: 1,
    ghost: 0.5,
    dragon: 1,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: {
    normal: 1,
    fire: 2,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 2,
    fighting: 0.5,
    poison: 1,
    ground: 0.5,
    flying: 2,
    psychic: 1,
    bug: 2,
    rock: 1,
    ghost: 1,
    dragon: 1,
    dark: 1,
    steel: 0.5,
    fairy: 1,
  },
  ghost: {
    normal: 0,
    fire: 1,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 1,
    fighting: 1,
    poison: 1,
    ground: 1,
    flying: 1,
    psychic: 2,
    bug: 1,
    rock: 1,
    ghost: 2,
    dragon: 1,
    dark: 0.5,
    steel: 1,
    fairy: 1,
  },
  dragon: {
    normal: 1,
    fire: 1,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 1,
    fighting: 1,
    poison: 1,
    ground: 1,
    flying: 1,
    psychic: 1,
    bug: 1,
    rock: 1,
    ghost: 1,
    dragon: 2,
    dark: 1,
    steel: 0.5,
    fairy: 0,
  },
  dark: {
    normal: 1,
    fire: 1,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 1,
    fighting: 0.5,
    poison: 1,
    ground: 1,
    flying: 1,
    psychic: 2,
    bug: 1,
    rock: 1,
    ghost: 2,
    dragon: 1,
    dark: 0.5,
    steel: 0.5,
    fairy: 0.5,
  },
  steel: {
    normal: 1,
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    grass: 1,
    ice: 2,
    fighting: 1,
    poison: 1,
    ground: 1,
    flying: 1,
    psychic: 1,
    bug: 1,
    rock: 2,
    ghost: 1,
    dragon: 1,
    dark: 1,
    steel: 0.5,
    fairy: 2,
  },
  fairy: {
    normal: 1,
    fire: 0.5,
    water: 1,
    electric: 1,
    grass: 1,
    ice: 1,
    fighting: 2,
    poison: 0.5,
    ground: 1,
    flying: 1,
    psychic: 1,
    bug: 1,
    rock: 1,
    ghost: 1,
    dragon: 2,
    dark: 2,
    steel: 0.5,
    fairy: 1,
  },
};

function createFullData(): RawDataObjects {
  return {
    pokemon: [bulbasaur, charmander],
    moves: [tackle, flamethrower],
    abilities: [overgrow],
    items: [potion],
    natures: [adamant, hardy],
    typeChart: minimalTypeChart,
  };
}

function createMinimalData(): RawDataObjects {
  return {
    pokemon: [bulbasaur],
    moves: [tackle],
    typeChart: minimalTypeChart,
  };
}

describe("DataManager", () => {
  let dm: DataManager;

  beforeEach(() => {
    dm = new DataManager();
  });

  describe("loadFromObjects()", () => {
    it("sets loaded flag to true after loading", () => {
      expect(dm.isLoaded()).toBe(false);
      dm.loadFromObjects(createFullData());
      expect(dm.isLoaded()).toBe(true);
    });

    it("loads data with only required fields (no abilities, items, natures)", () => {
      dm.loadFromObjects(createMinimalData());
      expect(dm.isLoaded()).toBe(true);
      expect(dm.getAllSpecies()).toHaveLength(1);
      expect(dm.getAllMoves()).toHaveLength(1);
      expect(dm.getAllAbilities()).toHaveLength(0);
      expect(dm.getAllItems()).toHaveLength(0);
      expect(dm.getAllNatures()).toHaveLength(0);
    });

    it("replaces previously loaded entities instead of retaining stale data", () => {
      // Arrange
      dm.loadFromObjects(createFullData());

      // Act
      dm.loadFromObjects(createMinimalData());

      // Assert
      // Derived from createMinimalData(): the second load only keeps Bulbasaur and Tackle.
      expect(dm.getAllSpecies().map((species) => species.name)).toEqual([bulbasaur.name]);
      expect(dm.getAllMoves().map((move) => move.id)).toEqual([tackle.id]);
      expect(dm.getAllAbilities()).toHaveLength(0);
      expect(dm.getAllItems()).toHaveLength(0);
      expect(dm.getAllNatures()).toHaveLength(0);
      expect(() => dm.getSpecies(charmander.id)).toThrow();
      expect(() => dm.getMove(flamethrower.id)).toThrow();
    });

    it("keeps the last good data if a reload fails midway", () => {
      dm.loadFromObjects(createFullData());

      const invalidData: RawDataObjects = {
        ...createMinimalData(),
        pokemon: [{ ...bulbasaur, name: undefined as unknown as string }],
      };

      expect(() => dm.loadFromObjects(invalidData)).toThrow();

      // Derived from the first successful full load: the transactional reload must leave it intact.
      expect(dm.isLoaded()).toBe(true);
      expect(dm.getAllSpecies()).toHaveLength(2);
      expect(dm.getSpecies(bulbasaur.id)).toBe(bulbasaur);
      expect(dm.getSpecies(charmander.id)).toBe(charmander);
      expect(dm.getAllMoves()).toHaveLength(2);
      expect(dm.getMove(tackle.id)).toBe(tackle);
      expect(dm.getMove(flamethrower.id)).toBe(flamethrower);
    });
  });

  describe("getSpecies()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

    it("returns correct species by id", () => {
      const species = dm.getSpecies(1);
      expect(species.name).toBe("bulbasaur");
      expect(species.displayName).toBe("Bulbasaur");
      expect(species.types).toEqual(["grass", "poison"]);
    });

    it("returns correct species for different id", () => {
      const species = dm.getSpecies(4);
      expect(species.name).toBe("charmander");
      expect(species.baseStats.speed).toBe(65);
    });

    it("throws for non-existent id", () => {
      expect(() => dm.getSpecies(999)).toThrow("Species with id 999 not found");
    });
  });

  describe("getSpeciesByName()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

    it("returns correct species by lowercase name", () => {
      const species = dm.getSpeciesByName("bulbasaur");
      expect(species.id).toBe(1);
    });

    it("is case-insensitive", () => {
      const species1 = dm.getSpeciesByName("Bulbasaur");
      const species2 = dm.getSpeciesByName("BULBASAUR");
      const species3 = dm.getSpeciesByName("bUlBaSaUr");
      expect(species1.id).toBe(1);
      expect(species2.id).toBe(1);
      expect(species3.id).toBe(1);
    });

    it("throws for non-existent name", () => {
      expect(() => dm.getSpeciesByName("missingno")).toThrow('Species "missingno" not found');
    });
  });

  describe("getMove()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

    it("returns correct move by id", () => {
      const move = dm.getMove("tackle");
      expect(move.displayName).toBe("Tackle");
      expect(move.power).toBe(40);
      expect(move.category).toBe("physical");
    });

    it("returns move with effect data", () => {
      const move = dm.getMove("flamethrower");
      expect(move.effect).not.toBeNull();
      expect(move.effect?.type).toBe("status-chance");
    });

    it("throws for non-existent move", () => {
      expect(() => dm.getMove("hyperbeam")).toThrow('Move "hyperbeam" not found');
    });
  });

  describe("getAbility()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

    it("returns correct ability by id", () => {
      const ability = dm.getAbility("overgrow");
      expect(ability.displayName).toBe("Overgrow");
      expect(ability.triggers).toContain("on-hp-threshold");
    });

    it("throws for non-existent ability", () => {
      expect(() => dm.getAbility("levitate")).toThrow('Ability "levitate" not found');
    });
  });

  describe("getItem()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

    it("returns correct item by id", () => {
      const item = dm.getItem("potion");
      expect(item.displayName).toBe("Potion");
      expect(item.price).toBe(200);
    });

    it("throws for non-existent item", () => {
      expect(() => dm.getItem("master-ball")).toThrow('Item "master-ball" not found');
    });
  });

  describe("getNature()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

    it("returns correct nature by id", () => {
      const nature = dm.getNature("adamant");
      expect(nature.displayName).toBe("Adamant");
      expect(nature.increased).toBe("attack");
      expect(nature.decreased).toBe("spAttack");
    });

    it("returns neutral nature correctly", () => {
      const nature = dm.getNature("hardy");
      expect(nature.increased).toBeNull();
      expect(nature.decreased).toBeNull();
    });

    it("throws for non-existent nature", () => {
      expect(() => dm.getNature("timid")).toThrow('Nature "timid" not found');
    });
  });

  describe("getTypeChart()", () => {
    it("returns loaded type chart", () => {
      dm.loadFromObjects(createFullData());
      const chart = dm.getTypeChart();
      expect(chart.fire.grass).toBe(2);
      expect(chart.water.fire).toBe(2);
      expect(chart.normal.ghost).toBe(0);
      expect(chart.electric.ground).toBe(0);
    });

    it("throws when type chart not loaded", () => {
      expect(() => dm.getTypeChart()).toThrow("Type chart not loaded");
    });
  });

  describe("getAllSpecies()", () => {
    it("returns all loaded species", () => {
      dm.loadFromObjects(createFullData());
      const all = dm.getAllSpecies();
      expect(all).toHaveLength(2);
      const names = all.map((s) => s.name);
      expect(names).toContain("bulbasaur");
      expect(names).toContain("charmander");
    });

    it("returns empty array when no data loaded", () => {
      expect(dm.getAllSpecies()).toHaveLength(0);
    });
  });

  describe("getAllMoves()", () => {
    it("returns all loaded moves", () => {
      dm.loadFromObjects(createFullData());
      const all = dm.getAllMoves();
      expect(all).toHaveLength(2);
      const ids = all.map((m) => m.id);
      expect(ids).toContain("tackle");
      expect(ids).toContain("flamethrower");
    });
  });

  describe("getAllAbilities()", () => {
    it("returns all loaded abilities", () => {
      dm.loadFromObjects(createFullData());
      expect(dm.getAllAbilities()).toHaveLength(1);
      expect(dm.getAllAbilities()[0].id).toBe("overgrow");
    });
  });

  describe("getAllItems()", () => {
    it("returns all loaded items", () => {
      dm.loadFromObjects(createFullData());
      expect(dm.getAllItems()).toHaveLength(1);
      expect(dm.getAllItems()[0].id).toBe("potion");
    });
  });

  describe("getAllNatures()", () => {
    it("returns all loaded natures", () => {
      dm.loadFromObjects(createFullData());
      expect(dm.getAllNatures()).toHaveLength(2);
    });
  });

  describe("unloaded data access", () => {
    it("throws when getting species before loading", () => {
      expect(() => dm.getSpecies(1)).toThrow();
    });

    it("throws when getting species by name before loading", () => {
      expect(() => dm.getSpeciesByName("bulbasaur")).toThrow();
    });

    it("throws when getting move before loading", () => {
      expect(() => dm.getMove("tackle")).toThrow();
    });

    it("throws when getting ability before loading", () => {
      expect(() => dm.getAbility("overgrow")).toThrow();
    });

    it("throws when getting item before loading", () => {
      expect(() => dm.getItem("potion")).toThrow();
    });

    it("throws when getting nature before loading", () => {
      expect(() => dm.getNature("adamant")).toThrow();
    });

    it("throws when getting type chart before loading", () => {
      expect(() => dm.getTypeChart()).toThrow("Type chart not loaded");
    });
  });
});
