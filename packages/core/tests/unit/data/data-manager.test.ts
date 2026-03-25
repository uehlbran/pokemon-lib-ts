import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_NATURES,
  DataManager,
} from "../../../src";
import type { RawDataObjects } from "../../../src/data/types";
import type {
  NatureData,
  TypeChart,
} from "../../../src/entities";
import {
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_SPECIES_IDS,
  GEN8_TYPE_CHART,
  createGen8DataManager,
} from "../../../../gen8/src";

// --- Canonical test fixtures loaded from Gen 8 owned data ---

const gen8DataManager = createGen8DataManager();

const ADAMANT_NATURE = ALL_NATURES.find((nature) => nature.displayName === "Adamant")!;
const HARDY_NATURE = ALL_NATURES.find((nature) => nature.displayName === "Hardy")!;
const TIMID_NATURE = ALL_NATURES.find((nature) => nature.displayName === "Timid")!;

const bulbasaur = gen8DataManager.getSpecies(GEN8_SPECIES_IDS.bulbasaur);
const charmander = gen8DataManager.getSpecies(GEN8_SPECIES_IDS.charmander);
const tackle = gen8DataManager.getMove(GEN8_MOVE_IDS.tackle);
const flamethrower = gen8DataManager.getMove(GEN8_MOVE_IDS.flamethrower);
const overgrow = gen8DataManager.getAbility(GEN8_ABILITY_IDS.overgrow);
const loadedItem = gen8DataManager.getItem(GEN8_ITEM_IDS.eviolite);

const adamant: NatureData = {
  id: ADAMANT_NATURE.id,
  displayName: "Adamant",
  increased: "attack",
  decreased: "spAttack",
  likedFlavor: "spicy",
  dislikedFlavor: "dry",
};

const hardy: NatureData = {
  id: HARDY_NATURE.id,
  displayName: "Hardy",
  increased: null,
  decreased: null,
  likedFlavor: null,
  dislikedFlavor: null,
};

const loadedTypeChart: TypeChart = GEN8_TYPE_CHART;

function createFullData(): RawDataObjects {
  return {
    pokemon: [bulbasaur, charmander],
    moves: [tackle, flamethrower],
    abilities: [overgrow],
    items: [loadedItem],
    natures: [adamant, hardy],
    typeChart: loadedTypeChart,
  };
}

function createMinimalData(): RawDataObjects {
  return {
    pokemon: [bulbasaur],
    moves: [tackle],
    typeChart: loadedTypeChart,
  };
}

describe("DataManager", () => {
  let dm: DataManager;

  beforeEach(() => {
    dm = new DataManager();
  });

  describe("loadFromObjects()", () => {
    it("given unloaded data manager, when full data is loaded, then the loaded flag becomes true", () => {
      expect(dm.isLoaded()).toBe(false);
      dm.loadFromObjects(createFullData());
      expect(dm.isLoaded()).toBe(true);
    });

    it("given minimal raw data, when it is loaded, then only the required entity collections are populated", () => {
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

    it("given a successful load, when a later reload fails validation, then the previous loaded data remains intact", () => {
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

    it("given Charmander's species id, when getSpecies is called, then it returns Charmander's fixture stats", () => {
      const species = dm.getSpecies(4);
      expect(species.name).toBe("charmander");
      expect(species.baseStats.speed).toBe(charmander.baseStats.speed);
    });

    it("given an unknown species id, when getSpecies is called, then it throws a not-found error", () => {
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

    it("given differently cased species names, when getSpeciesByName is called, then the lookup is case-insensitive", () => {
      const species1 = dm.getSpeciesByName("Bulbasaur");
      const species2 = dm.getSpeciesByName("BULBASAUR");
      const species3 = dm.getSpeciesByName("bUlBaSaUr");
      expect(species1.id).toBe(1);
      expect(species2.id).toBe(1);
      expect(species3.id).toBe(1);
    });

    it("given an unknown species name, when getSpeciesByName is called, then it throws a not-found error", () => {
      expect(() => dm.getSpeciesByName("missingno")).toThrow('Species "missingno" not found');
    });
  });

  describe("getMove()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

  it("given a loaded move id, when getMove is called, then it returns the matching move fixture", () => {
      const move = dm.getMove(GEN8_MOVE_IDS.tackle);
      expect(move.displayName).toBe("Tackle");
      expect(move.power).toBe(tackle.power);
      expect(move.category).toBe("physical");
    });

  it("returns move with effect data", () => {
      const move = dm.getMove(GEN8_MOVE_IDS.flamethrower);
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
      const ability = dm.getAbility(GEN8_ABILITY_IDS.overgrow);
      expect(ability.displayName).toBe(overgrow.displayName);
      expect(ability.triggers).toEqual(overgrow.triggers);
    });

  it("throws for non-existent ability", () => {
      expect(() => dm.getAbility(GEN8_ABILITY_IDS.levitate)).toThrow(
        `Ability "${GEN8_ABILITY_IDS.levitate}" not found`,
      );
    });
  });

  describe("getItem()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

  it("given a loaded item id, when getItem is called, then it returns the matching item fixture", () => {
      const item = dm.getItem(loadedItem.id);
      expect(item.displayName).toBe(loadedItem.displayName);
      expect(item.price).toBe(loadedItem.price);
    });

  it("given an unknown item id, when getItem is called, then it throws a not-found error", () => {
      expect(() => dm.getItem(GEN8_ITEM_IDS.masterBall)).toThrow(
        `Item "${GEN8_ITEM_IDS.masterBall}" not found`,
      );
    });
  });

  describe("getNature()", () => {
    beforeEach(() => {
      dm.loadFromObjects(createFullData());
    });

  it("given a loaded nature id, when getNature is called, then it returns the matching nature fixture", () => {
      const nature = dm.getNature(ADAMANT_NATURE.id);
      expect(nature.displayName).toBe("Adamant");
      expect(nature.increased).toBe("attack");
      expect(nature.decreased).toBe("spAttack");
    });

  it("given a neutral nature id, when getNature is called, then both modified stats are null", () => {
      const nature = dm.getNature(HARDY_NATURE.id);
      expect(nature).toEqual(hardy);
    });

  it("given an unknown nature id, when getNature is called, then it throws a not-found error", () => {
      expect(() => dm.getNature(TIMID_NATURE.id)).toThrow(
        `Nature "${TIMID_NATURE.id}" not found`,
      );
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
    it("given loaded species data, when getAllSpecies is called, then it returns every loaded species", () => {
      dm.loadFromObjects(createFullData());
      const all = dm.getAllSpecies();
      expect(all).toHaveLength(2);
      const names = all.map((s) => s.name);
      expect(names).toContain("bulbasaur");
      expect(names).toContain("charmander");
    });

    it("given no loaded species data, when getAllSpecies is called, then it returns an empty array", () => {
      expect(dm.getAllSpecies()).toHaveLength(0);
    });
  });

  describe("getAllMoves()", () => {
  it("returns all loaded moves", () => {
      dm.loadFromObjects(createFullData());
      const all = dm.getAllMoves();
      expect(all).toHaveLength(2);
      const ids = all.map((m) => m.id);
      expect(ids).toContain(GEN8_MOVE_IDS.tackle);
      expect(ids).toContain(GEN8_MOVE_IDS.flamethrower);
    });
  });

  describe("getAllAbilities()", () => {
  it("given loaded ability data, when getAllAbilities is called, then it returns every loaded ability", () => {
      dm.loadFromObjects(createFullData());
      expect(dm.getAllAbilities()).toHaveLength(1);
      expect(dm.getAllAbilities()[0].id).toBe(GEN8_ABILITY_IDS.overgrow);
    });
  });

  describe("getAllItems()", () => {
  it("given loaded item data, when getAllItems is called, then it returns every loaded item", () => {
      dm.loadFromObjects(createFullData());
      expect(dm.getAllItems()).toHaveLength(1);
      expect(dm.getAllItems()[0].id).toBe(loadedItem.id);
    });
  });

  describe("getAllNatures()", () => {
    it("given loaded nature data, when getAllNatures is called, then it returns every loaded nature", () => {
      dm.loadFromObjects(createFullData());
      expect(dm.getAllNatures()).toHaveLength(2);
    });
  });

  describe("unloaded data access", () => {
    it("throws when getting species before loading", () => {
      expect(() => dm.getSpecies(bulbasaur.id)).toThrow();
    });

    it("throws when getting species by name before loading", () => {
      expect(() => dm.getSpeciesByName(bulbasaur.name)).toThrow();
    });

    it("throws when getting move before loading", () => {
      expect(() => dm.getMove(tackle.id)).toThrow();
    });

    it("throws when getting ability before loading", () => {
      expect(() => dm.getAbility(overgrow.id)).toThrow();
    });

    it("given no loaded item data, when getItem is called, then it throws", () => {
      expect(() => dm.getItem(loadedItem.id)).toThrow();
    });

    it("given no loaded nature data, when getNature is called, then it throws", () => {
      expect(() => dm.getNature(ADAMANT_NATURE.id)).toThrow();
    });

    it("throws when getting type chart before loading", () => {
      expect(() => dm.getTypeChart()).toThrow("Type chart not loaded");
    });
  });
});
