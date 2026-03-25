import { CORE_MOVE_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen1DataManager,
  GEN1_MOVE_IDS,
  GEN1_SPECIES_IDS,
  GEN1_TYPE_CHART,
  GEN1_TYPES,
} from "../../src";

const SPECIES_IDS = GEN1_SPECIES_IDS;
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN1_MOVE_IDS } as const;
const TYPE_IDS = CORE_TYPE_IDS;

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
    const dataManager = createGen1DataManager();

    const allSpecies = dataManager.getAllSpecies();
    const ids = allSpecies.map((s) => s.id).sort((a, b) => a - b);

    // Source: Gen 1 has National Dex entries #1-151 inclusive, from Bulbasaur through Mew.
    expect(allSpecies.length).toBe(GEN1_DATA_BOUNDS.SPECIES_COUNT);
    expect(ids[0]).toBe(SPECIES_IDS.bulbasaur);
    expect(ids[ids.length - 1]).toBe(SPECIES_IDS.mew);

    const bulbasaur = dataManager.getSpecies(SPECIES_IDS.bulbasaur);
    expect(bulbasaur.displayName).toBe("Bulbasaur");

    const mew = dataManager.getSpecies(SPECIES_IDS.mew);
    expect(mew.displayName).toBe("Mew");

    for (let i = SPECIES_IDS.bulbasaur; i <= SPECIES_IDS.mew; i++) {
      const species = dataManager.getSpecies(i);
      expect(species.id).toBe(i);
    }
  });

  it("given Gen 1 data, when checking Charizard, then has correct base stats and types", () => {
    const dataManager = createGen1DataManager();

    const charizard = dataManager.getSpecies(SPECIES_IDS.charizard);

    expect(charizard.displayName).toBe("Charizard");
    expect(charizard.name).toBe("charizard");
    expect(charizard.types).toEqual([TYPE_IDS.fire, TYPE_IDS.flying]);
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
    const dataManager = createGen1DataManager();

    const allMoves = dataManager.getAllMoves();

    // Source: Gen 1 move data currently includes 165 moves after adding Sharpen coverage.
    expect(allMoves.length).toBe(GEN1_DATA_BOUNDS.MOVE_COUNT);
  });

  it("given Gen 1 data, when checking Flamethrower, then it is Fire type and special category", () => {
    const dataManager = createGen1DataManager();

    const flamethrower = dataManager.getMove(MOVE_IDS.flamethrower);

    expect(flamethrower.type).toBe(TYPE_IDS.fire);
    expect(flamethrower.category).toBe("special");
    expect(flamethrower.power).toBe(95); // Source: Gen 1 Flamethrower base power is 95.
    expect(flamethrower.accuracy).toBe(100);
    expect(flamethrower.pp).toBe(15); // Source: Gen 1 Flamethrower PP is 15 before PP Ups.
    expect(flamethrower.generation).toBe(1);
  });

  it("given Gen 1 data, when checking type chart, then has exactly 15 types", () => {
    const dataManager = createGen1DataManager();

    const chart = dataManager.getTypeChart();
    const typeCount = Object.keys(chart).length;

    // Source: Gen 1 has 15 types; Dark, Steel, and Fairy do not exist yet.
    expect(typeCount).toBe(GEN1_DATA_BOUNDS.TYPE_COUNT);
    expect(GEN1_TYPES.length).toBe(GEN1_DATA_BOUNDS.TYPE_COUNT);
    expect(Object.keys(chart).sort()).toEqual([...GEN1_TYPES].sort());
    expect(Object.keys(chart)).not.toContain(TYPE_IDS.dark);
    expect(Object.keys(chart)).not.toContain(TYPE_IDS.steel);
    expect(Object.keys(chart)).not.toContain(TYPE_IDS.fairy);
  });

  it("given Gen 1 data, when creating a DataManager and loading it, then it can look up Pokemon by name and ID", () => {
    const dataManager = createGen1DataManager();

    const pikachuById = dataManager.getSpecies(SPECIES_IDS.pikachu);

    const pikachuByName = dataManager.getSpeciesByName("pikachu");

    expect(pikachuById.id).toBe(SPECIES_IDS.pikachu);
    expect(pikachuById.displayName).toBe("Pikachu");
    expect(pikachuByName.id).toBe(SPECIES_IDS.pikachu);
    expect(pikachuByName.displayName).toBe("Pikachu");

    // They should be the same data
    expect(pikachuById.id).toBe(pikachuByName.id);
    expect(pikachuById.types).toEqual(pikachuByName.types);
    expect(pikachuById.baseStats).toEqual(pikachuByName.baseStats);
  });

  it("given Gen 1 data, when checking type chart, then Water is super-effective against Fire", () => {
    const chart = GEN1_TYPE_CHART;

    const waterVsFire = chart.water?.fire;

    expect(waterVsFire).toBe(2);
  });

  it("given Gen 1 data, when checking type chart, then Fire is not very effective against Water", () => {
    const chart = GEN1_TYPE_CHART;

    const fireVsWater = chart.fire?.water;

    expect(fireVsWater).toBe(0.5);
  });

  it("given Gen 1 data, when checking type chart, then Normal has no effect on Ghost", () => {
    const chart = GEN1_TYPE_CHART;

    const normalVsGhost = chart.normal?.ghost;

    expect(normalVsGhost).toBe(0);
  });

  it("given Gen 1 data, when checking type chart, then Ghost has no effect on Psychic (Gen 1 bug)", () => {
    const chart = GEN1_TYPE_CHART;

    const ghostVsPsychic = chart.ghost?.psychic;

    expect(ghostVsPsychic).toBe(0);
  });

  it("given Gen 1 data, when checking all species, then all have generation set to 1", () => {
    const dataManager = createGen1DataManager();

    const allSpecies = dataManager.getAllSpecies();

    for (const species of allSpecies) {
      expect(species.generation).toBe(1);
    }
  });

  it("given Gen 1 data, when checking all moves, then all have generation set to 1", () => {
    const dataManager = createGen1DataManager();

    const allMoves = dataManager.getAllMoves();

    for (const move of allMoves) {
      expect(move.generation).toBe(1);
    }
  });

  it("given Gen 1 data, when checking all species, then spAttack equals spDefense (unified Special)", () => {
    const dataManager = createGen1DataManager();

    const allSpecies = dataManager.getAllSpecies();

    // Assert: In Gen 1, Special was a single stat stored in both fields
    for (const species of allSpecies) {
      expect(species.baseStats.spAttack).toBe(species.baseStats.spDefense);
    }
  });

  it("given Gen 1 data, when loading items, then list is empty (no held items in Gen 1)", () => {
    const dataManager = createGen1DataManager();

    const allItems = dataManager.getAllItems();

    expect(allItems.length).toBe(0);
  });

  it("given Gen 1 data, when loading natures, then list is empty (no natures in Gen 1)", () => {
    const dataManager = createGen1DataManager();

    const allNatures = dataManager.getAllNatures();

    expect(allNatures.length).toBe(0);
  });

  it("given Gen 1 data, when checking specific moves, then physical/special split is determined by type", () => {
    const dataManager = createGen1DataManager();

    const tackle = dataManager.getMove(MOVE_IDS.tackle);
    const thunderbolt = dataManager.getMove(MOVE_IDS.thunderbolt);
    const earthquake = dataManager.getMove(MOVE_IDS.earthquake);
    const iceBeam = dataManager.getMove(MOVE_IDS.iceBeam);
    const surf = dataManager.getMove(MOVE_IDS.surf);

    // Assert
    expect(tackle.category).toBe("physical");
    expect(thunderbolt.category).toBe("special");
    expect(earthquake.category).toBe("physical");
    expect(iceBeam.category).toBe("special");
    expect(surf.category).toBe("special");
  });

  it("given Gen 1 data, when checking moves, then all damaging moves have valid power values", () => {
    const dataManager = createGen1DataManager();

    const allMoves = dataManager.getAllMoves();

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
    const dataManager = createGen1DataManager();

    const allMoves = dataManager.getAllMoves();

    // Source: Gen 1 move PP is stored as a positive integer and capped at 40 before PP Ups.
    const invalidMovePp = allMoves
      .filter(
        (move) =>
          !Number.isInteger(move.pp) || move.pp < 1 || move.pp > GEN1_DATA_BOUNDS.MAX_MOVE_PP,
      )
      .map((move) => ({ id: move.id, pp: move.pp }));

    expect(invalidMovePp).toEqual([]);
  });

  it("given Gen 1 data, when checking DataManager state, then reports as loaded", () => {
    const dataManager = createGen1DataManager();

    expect(dataManager.isLoaded()).toBe(true);
  });

  it("given Gen 1 data, when checking move by name, then can look up moves", () => {
    const dataManager = createGen1DataManager();

    const psychic = dataManager.getMove(MOVE_IDS.psychic);
    const hyperBeam = dataManager.getMove(MOVE_IDS.hyperBeam);

    expect(psychic.displayName).toBe("Psychic");
    expect(psychic.type).toBe(TYPE_IDS.psychic);
    // Source: Gen 1 data gives Psychic 90 BP and Hyper Beam 150 BP.
    expect(psychic.power).toBe(90);

    expect(hyperBeam.displayName).toBe("Hyper Beam");
    expect(hyperBeam.type).toBe(TYPE_IDS.normal);
    expect(hyperBeam.power).toBe(150);
  });

  it("given Gen 1 data, when checking non-existent species, then throws error", () => {
    const dataManager = createGen1DataManager();

    expect(() => dataManager.getSpecies(999)).toThrow();
    expect(() => dataManager.getSpecies(0)).toThrow();
    expect(() => dataManager.getSpecies(152)).toThrow();
  });

  it("given Gen 1 data, when checking non-existent move, then throws error", () => {
    const dataManager = createGen1DataManager();

    expect(() => dataManager.getMove("totally-fake-move")).toThrow();
  });
});
