import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_TYPE_CHART, GEN1_TYPES } from "../../src";

const GEN1_SPECIES = {
  BULBASAUR: { id: 1, name: "bulbasaur", displayName: "Bulbasaur" },
  CHARIZARD: { id: 6, name: "charizard", displayName: "Charizard" },
  PIKACHU: { id: 25, name: "pikachu", displayName: "Pikachu" },
  MEW: { id: 151, name: "mew", displayName: "Mew" },
} as const;

const GEN1_MOVES = {
  FLAMETHROWER: "flamethrower",
  TACKLE: "tackle",
  THUNDERBOLT: "thunderbolt",
  EARTHQUAKE: "earthquake",
  ICE_BEAM: "ice-beam",
  SURF: "surf",
  PSYCHIC: "psychic",
  HYPER_BEAM: "hyper-beam",
} as const;

const GEN1_DATA_BOUNDS = {
  SPECIES_COUNT: 151,
  MOVE_COUNT: 165,
  TYPE_COUNT: 15,
  MAX_MOVE_PP: 40,
  MAX_MOVE_POWER: 255,
} as const;

describe("Gen 1 Data Integration", () => {
  // --- Species Data ---

  it("given Gen 1 data, when loaded, then all 151 species from Bulbasaur to Mew are present", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allSpecies = dm.getAllSpecies();
    const ids = allSpecies.map((s) => s.id).sort((a, b) => a - b);

    // Assert
    // Source: Gen 1 has National Dex entries #1-151 inclusive, from Bulbasaur through Mew.
    expect(allSpecies.length).toBe(GEN1_DATA_BOUNDS.SPECIES_COUNT);
    expect(ids[0]).toBe(GEN1_SPECIES.BULBASAUR.id);
    expect(ids[ids.length - 1]).toBe(GEN1_SPECIES.MEW.id);

    // Verify first is Bulbasaur
    const bulbasaur = dm.getSpecies(GEN1_SPECIES.BULBASAUR.id);
    expect(bulbasaur.displayName).toBe(GEN1_SPECIES.BULBASAUR.displayName);

    // Verify last is Mew
    const mew = dm.getSpecies(GEN1_SPECIES.MEW.id);
    expect(mew.displayName).toBe(GEN1_SPECIES.MEW.displayName);

    // Verify continuous range
    for (let i = GEN1_SPECIES.BULBASAUR.id; i <= GEN1_SPECIES.MEW.id; i++) {
      const species = dm.getSpecies(i);
      expect(species.id).toBe(i);
    }
  });

  it("given Gen 1 data, when checking Charizard, then has correct base stats and types", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const charizard = dm.getSpecies(GEN1_SPECIES.CHARIZARD.id);

    // Assert
    expect(charizard.displayName).toBe(GEN1_SPECIES.CHARIZARD.displayName);
    expect(charizard.name).toBe(GEN1_SPECIES.CHARIZARD.name);
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

    // Source: Gen 1 move data currently includes 165 moves after adding Sharpen coverage.
    expect(allMoves.length).toBe(GEN1_DATA_BOUNDS.MOVE_COUNT);
  });

  it("given Gen 1 data, when checking Flamethrower, then it is Fire type and special category", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const flamethrower = dm.getMove(GEN1_MOVES.FLAMETHROWER);

    // Assert
    expect(flamethrower.type).toBe("fire");
    expect(flamethrower.category).toBe("special");
    expect(flamethrower.power).toBe(95); // Source: Gen 1 Flamethrower base power is 95.
    expect(flamethrower.accuracy).toBe(100);
    expect(flamethrower.pp).toBe(15); // Source: Gen 1 Flamethrower PP is 15 before PP Ups.
    expect(flamethrower.generation).toBe(1);
  });

  it("given Gen 1 data, when checking type chart, then has exactly 15 types", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const chart = dm.getTypeChart();
    const typeCount = Object.keys(chart).length;

    // Source: Gen 1 has 15 types; Dark, Steel, and Fairy do not exist yet.
    expect(typeCount).toBe(GEN1_DATA_BOUNDS.TYPE_COUNT);
    expect(GEN1_TYPES.length).toBe(GEN1_DATA_BOUNDS.TYPE_COUNT);
    expect(Object.keys(chart).sort()).toEqual([...GEN1_TYPES].sort());
  });

  it("given Gen 1 data, when creating a DataManager and loading it, then it can look up Pokemon by name and ID", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act: Look up by ID
    const pikachuById = dm.getSpecies(GEN1_SPECIES.PIKACHU.id);

    // Act: Look up by name
    const pikachuByName = dm.getSpeciesByName(GEN1_SPECIES.PIKACHU.name);

    // Assert
    expect(pikachuById.id).toBe(GEN1_SPECIES.PIKACHU.id);
    expect(pikachuById.displayName).toBe(GEN1_SPECIES.PIKACHU.displayName);
    expect(pikachuByName.id).toBe(GEN1_SPECIES.PIKACHU.id);
    expect(pikachuByName.displayName).toBe(GEN1_SPECIES.PIKACHU.displayName);

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
    const tackle = dm.getMove(GEN1_MOVES.TACKLE); // Normal -> physical
    const thunderbolt = dm.getMove(GEN1_MOVES.THUNDERBOLT); // Electric -> special
    const earthquake = dm.getMove(GEN1_MOVES.EARTHQUAKE); // Ground -> physical
    const iceBeam = dm.getMove(GEN1_MOVES.ICE_BEAM); // Ice -> special
    const surf = dm.getMove(GEN1_MOVES.SURF); // Water -> special

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

    // Source: base-game move power is a finite integer on the 1-255 scale for damaging moves.
    const invalidDamagingMoves = allMoves
      .filter((move) => move.category !== "status" && move.power !== null)
      .filter(
        (move) =>
          !Number.isInteger(move.power) ||
          move.power < 1 ||
          move.power > GEN1_DATA_BOUNDS.MAX_MOVE_POWER,
      )
      .map((move) => ({ id: move.id, power: move.power }));

    expect(invalidDamagingMoves).toEqual([]);
  });

  it("given Gen 1 data, when checking moves, then all moves have valid PP values", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allMoves = dm.getAllMoves();

    // Source: Gen 1 move PP is stored as a positive integer and capped at 40 before PP Ups.
    const invalidMovePp = allMoves
      .filter((move) => !Number.isInteger(move.pp) || move.pp < 1 || move.pp > GEN1_DATA_BOUNDS.MAX_MOVE_PP)
      .map((move) => ({ id: move.id, pp: move.pp }));

    expect(invalidMovePp).toEqual([]);
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
    const psychic = dm.getMove(GEN1_MOVES.PSYCHIC);
    const hyperBeam = dm.getMove(GEN1_MOVES.HYPER_BEAM);

    // Assert
    expect(psychic.displayName).toBe("Psychic");
    expect(psychic.type).toBe("psychic");
    // Source: Gen 1 data gives Psychic 90 BP and Hyper Beam 150 BP.
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
