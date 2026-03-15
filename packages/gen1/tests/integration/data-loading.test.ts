import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_TYPE_CHART, GEN1_TYPES } from "../../src";

describe("Gen 1 Data Integration", () => {
  // --- Species Data ---

  it("given Gen 1 data, when loaded, then all 151 species from Bulbasaur to Mew are present", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allSpecies = dm.getAllSpecies();
    const ids = allSpecies.map((s) => s.id).sort((a, b) => a - b);

    // Assert
    expect(allSpecies.length).toBe(151);
    expect(ids[0]).toBe(1);
    expect(ids[ids.length - 1]).toBe(151);

    // Verify first is Bulbasaur
    const bulbasaur = dm.getSpecies(1);
    expect(bulbasaur.displayName).toBe("Bulbasaur");

    // Verify last is Mew
    const mew = dm.getSpecies(151);
    expect(mew.displayName).toBe("Mew");

    // Verify continuous range
    for (let i = 1; i <= 151; i++) {
      const species = dm.getSpecies(i);
      expect(species.id).toBe(i);
    }
  });

  it("given Gen 1 data, when checking Charizard, then has correct base stats and types", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const charizard = dm.getSpecies(6);

    // Assert
    expect(charizard.displayName).toBe("Charizard");
    expect(charizard.name).toBe("charizard");
    expect(charizard.types).toEqual(["fire", "flying"]);
    expect(charizard.baseStats).toEqual({
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 109,
      spDefense: 109,
      speed: 100,
    });
    expect(charizard.generation).toBe(1);
  });

  it("given Gen 1 data, when checking all moves, then at least 100 moves exist", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allMoves = dm.getAllMoves();

    // Assert: Gen 1 has 165 moves (Sharpen added in bug fix #105)
    expect(allMoves.length).toBeGreaterThanOrEqual(100);
    expect(allMoves.length).toBe(165);
  });

  it("given Gen 1 data, when checking Flamethrower, then it is Fire type and special category", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const flamethrower = dm.getMove("flamethrower");

    // Assert
    expect(flamethrower.type).toBe("fire");
    expect(flamethrower.category).toBe("special");
    expect(flamethrower.power).toBe(95);
    expect(flamethrower.accuracy).toBe(100);
    expect(flamethrower.pp).toBe(15);
    expect(flamethrower.generation).toBe(1);
  });

  it("given Gen 1 data, when checking type chart, then has exactly 15 types", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const chart = dm.getTypeChart();
    const typeCount = Object.keys(chart).length;

    // Assert: Gen 1 has 15 types (no dark, steel, fairy)
    expect(typeCount).toBe(15);
    expect(GEN1_TYPES.length).toBe(15);

    // Verify all expected types are present
    const expectedTypes = [
      "normal",
      "fire",
      "water",
      "electric",
      "grass",
      "ice",
      "fighting",
      "poison",
      "ground",
      "flying",
      "psychic",
      "bug",
      "rock",
      "ghost",
      "dragon",
    ];
    for (const type of expectedTypes) {
      expect(Object.keys(chart)).toContain(type);
    }

    // Verify excluded types are absent
    expect(Object.keys(chart)).not.toContain("dark");
    expect(Object.keys(chart)).not.toContain("steel");
    expect(Object.keys(chart)).not.toContain("fairy");
  });

  it("given Gen 1 data, when creating a DataManager and loading it, then it can look up Pokemon by name and ID", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act: Look up by ID
    const pikachuById = dm.getSpecies(25);

    // Act: Look up by name
    const pikachuByName = dm.getSpeciesByName("pikachu");

    // Assert
    expect(pikachuById.id).toBe(25);
    expect(pikachuById.displayName).toBe("Pikachu");
    expect(pikachuByName.id).toBe(25);
    expect(pikachuByName.displayName).toBe("Pikachu");

    // They should be the same data
    expect(pikachuById.id).toBe(pikachuByName.id);
    expect(pikachuById.types).toEqual(pikachuByName.types);
    expect(pikachuById.baseStats).toEqual(pikachuByName.baseStats);
  });

  it("given Gen 1 data, when checking type chart, then Water is super-effective against Fire", () => {
    // Arrange
    const chart = GEN1_TYPE_CHART;

    // Act
    const waterVsFire = chart.water?.fire;

    // Assert
    expect(waterVsFire).toBe(2);
  });

  it("given Gen 1 data, when checking type chart, then Fire is not very effective against Water", () => {
    // Arrange
    const chart = GEN1_TYPE_CHART;

    // Act
    const fireVsWater = chart.fire?.water;

    // Assert
    expect(fireVsWater).toBe(0.5);
  });

  it("given Gen 1 data, when checking type chart, then Normal has no effect on Ghost", () => {
    // Arrange
    const chart = GEN1_TYPE_CHART;

    // Act
    const normalVsGhost = chart.normal?.ghost;

    // Assert
    expect(normalVsGhost).toBe(0);
  });

  it("given Gen 1 data, when checking type chart, then Ghost has no effect on Psychic (Gen 1 bug)", () => {
    // Arrange: In Gen 1, Ghost was incorrectly immune to Psychic instead of super-effective
    const chart = GEN1_TYPE_CHART;

    // Act
    const ghostVsPsychic = chart.ghost?.psychic;

    // Assert: Gen 1 ghost vs psychic is 0 (bug — fixed in Gen 2)
    expect(ghostVsPsychic).toBe(0);
  });

  it("given Gen 1 data, when checking all species, then all have generation set to 1", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allSpecies = dm.getAllSpecies();

    // Assert
    for (const species of allSpecies) {
      expect(species.generation).toBe(1);
    }
  });

  it("given Gen 1 data, when checking all moves, then all have generation set to 1", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allMoves = dm.getAllMoves();

    // Assert
    for (const move of allMoves) {
      expect(move.generation).toBe(1);
    }
  });

  it("given Gen 1 data, when checking all species, then spAttack equals spDefense (unified Special)", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allSpecies = dm.getAllSpecies();

    // Assert: In Gen 1, Special was a single stat stored in both fields
    for (const species of allSpecies) {
      expect(species.baseStats.spAttack).toBe(species.baseStats.spDefense);
    }
  });

  it("given Gen 1 data, when loading items, then list is empty (no held items in Gen 1)", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allItems = dm.getAllItems();

    // Assert
    expect(allItems.length).toBe(0);
  });

  it("given Gen 1 data, when loading natures, then list is empty (no natures in Gen 1)", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allNatures = dm.getAllNatures();

    // Assert
    expect(allNatures.length).toBe(0);
  });

  it("given Gen 1 data, when checking specific moves, then physical/special split is determined by type", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act: Check several moves
    const tackle = dm.getMove("tackle"); // Normal -> physical
    const thunderbolt = dm.getMove("thunderbolt"); // Electric -> special
    const earthquake = dm.getMove("earthquake"); // Ground -> physical
    const iceBeam = dm.getMove("ice-beam"); // Ice -> special
    const surf = dm.getMove("surf"); // Water -> special

    // Assert
    expect(tackle.category).toBe("physical");
    expect(thunderbolt.category).toBe("special");
    expect(earthquake.category).toBe("physical");
    expect(iceBeam.category).toBe("special");
    expect(surf.category).toBe("special");
  });

  it("given Gen 1 data, when checking moves, then all damaging moves have valid power values", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allMoves = dm.getAllMoves();

    // Assert
    for (const move of allMoves) {
      if (move.category !== "status" && move.power !== null) {
        expect(move.power).toBeGreaterThan(0);
        expect(Number.isFinite(move.power)).toBe(true);
      }
    }
  });

  it("given Gen 1 data, when checking moves, then all moves have valid PP values", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allMoves = dm.getAllMoves();

    // Assert
    for (const move of allMoves) {
      expect(move.pp).toBeGreaterThan(0);
      expect(move.pp).toBeLessThanOrEqual(40);
    }
  });

  it("given Gen 1 data, when checking DataManager state, then reports as loaded", () => {
    // Arrange / Act
    const dm = createGen1DataManager();

    // Assert
    expect(dm.isLoaded()).toBe(true);
  });

  it("given Gen 1 data, when checking move by name, then can look up moves", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const psychic = dm.getMove("psychic");
    const hyperBeam = dm.getMove("hyper-beam");

    // Assert
    expect(psychic.displayName).toBe("Psychic");
    expect(psychic.type).toBe("psychic");
    expect(psychic.power).toBe(90);

    expect(hyperBeam.displayName).toBe("Hyper Beam");
    expect(hyperBeam.type).toBe("normal");
    expect(hyperBeam.power).toBe(150);
  });

  it("given Gen 1 data, when checking non-existent species, then throws error", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act / Assert
    expect(() => dm.getSpecies(999)).toThrow();
    expect(() => dm.getSpecies(0)).toThrow();
    expect(() => dm.getSpecies(152)).toThrow();
  });

  it("given Gen 1 data, when checking non-existent move, then throws error", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act / Assert
    expect(() => dm.getMove("totally-fake-move")).toThrow();
  });
});
