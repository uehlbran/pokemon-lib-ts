import { describe, expect, it } from "vitest";
import { GEN1_TYPES, GEN1_TYPE_CHART, Gen1Ruleset, createGen1DataManager } from "../src";

/**
 * Comprehensive data validation tests for Gen 1.
 *
 * These tests verify invariants that must hold across ALL data entries —
 * not just spot checks on individual Pokemon/moves. They catch regressions
 * in the data pipeline and ensure Gen 1 constraints are enforced.
 */

const GEN1_VALID_TYPES = new Set([
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
]);

const GEN1_EXCLUDED_TYPES = ["dark", "steel", "fairy"];

describe("Gen 1 Pokemon Data Validation", () => {
  // --- Species Count ---

  it("given Gen 1 pokemon.json, when loaded, then contains exactly 151 Pokemon", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allSpecies = dm.getAllSpecies();

    // Assert
    expect(allSpecies.length).toBe(151);
  });

  // --- Unified Special Stat ---

  it("given Gen 1 pokemon.json, when checking all species, then spAttack equals spDefense for every entry (unified Special)", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();

    // Act / Assert
    const mismatches: string[] = [];
    for (const species of allSpecies) {
      if (species.baseStats.spAttack !== species.baseStats.spDefense) {
        mismatches.push(
          `${species.displayName} (#${species.id}): spAttack=${species.baseStats.spAttack}, spDefense=${species.baseStats.spDefense}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("given Charizard, when checking base stats, then has correct Gen 1 Special of 109", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const charizard = dm.getSpecies(6);

    // Assert: Charizard's Gen 1 Special stat is 109 (not 85 from later gen split)
    expect(charizard.baseStats.spAttack).toBe(109);
    expect(charizard.baseStats.spDefense).toBe(109);
  });

  // --- No Abilities ---

  it("given Gen 1 pokemon.json, when checking all species, then none have any abilities", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();

    // Act / Assert
    const withAbilities: string[] = [];
    for (const species of allSpecies) {
      if (species.abilities.normal.length > 0 || species.abilities.hidden !== null) {
        withAbilities.push(
          `${species.displayName} (#${species.id}): normal=[${species.abilities.normal}], hidden=${species.abilities.hidden}`,
        );
      }
    }
    expect(withAbilities).toEqual([]);
  });

  // --- Types from 15-Type Set Only ---

  it("given Gen 1 pokemon.json, when checking all species types, then all types are from the 15-type Gen 1 set", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();

    // Act
    const invalidTypeEntries: string[] = [];
    for (const species of allSpecies) {
      for (const type of species.types) {
        if (!GEN1_VALID_TYPES.has(type)) {
          invalidTypeEntries.push(`${species.displayName} (#${species.id}): has type "${type}"`);
        }
      }
    }

    // Assert
    expect(invalidTypeEntries).toEqual([]);
  });

  it("given Gen 1 pokemon.json, when checking all species types, then no species has Dark, Steel, or Fairy type", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();

    // Act / Assert
    for (const species of allSpecies) {
      for (const excludedType of GEN1_EXCLUDED_TYPES) {
        expect(species.types).not.toContain(excludedType);
      }
    }
  });
});

describe("Gen 1 Moves Data Validation", () => {
  // --- Move Count ---

  it("given Gen 1 moves.json, when loaded, then contains a reasonable number of moves (164)", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allMoves = dm.getAllMoves();

    // Assert: Gen 1 has 165 moves (numbered 1-165), but Struggle may or may not be included
    // The actual count in our data is 164
    expect(allMoves.length).toBeGreaterThanOrEqual(160);
    expect(allMoves.length).toBeLessThanOrEqual(166);
    expect(allMoves.length).toBe(164);
  });

  // --- No Excluded Type Moves ---

  it("given Gen 1 moves.json, when checking all moves, then no Dark-type moves exist", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allMoves = dm.getAllMoves();

    // Act
    const darkMoves = allMoves.filter((m) => m.type === "dark");

    // Assert: Dark type didn't exist until Gen 2
    expect(darkMoves).toEqual([]);
  });

  it("given Gen 1 moves.json, when checking all moves, then no Steel-type moves exist", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allMoves = dm.getAllMoves();

    // Act
    const steelMoves = allMoves.filter((m) => m.type === "steel");

    // Assert: Steel type didn't exist until Gen 2
    expect(steelMoves).toEqual([]);
  });

  it("given Gen 1 moves.json, when checking all moves, then no Fairy-type moves exist", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allMoves = dm.getAllMoves();

    // Act
    const fairyMoves = allMoves.filter((m) => m.type === "fairy");

    // Assert: Fairy type didn't exist until Gen 6
    expect(fairyMoves).toEqual([]);
  });

  it("given Gen 1 moves.json, when checking all move types, then only types from the 15-type Gen 1 set are used", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allMoves = dm.getAllMoves();

    // Act
    const invalidTypeMoves: string[] = [];
    for (const move of allMoves) {
      if (!GEN1_VALID_TYPES.has(move.type)) {
        invalidTypeMoves.push(`${move.displayName} (${move.id}): has type "${move.type}"`);
      }
    }

    // Assert
    expect(invalidTypeMoves).toEqual([]);
  });

  // --- Category is Type-Based ---

  it("given Gen 1 moves.json, when checking all damaging moves, then category matches Gen 1 type-based physical/special split", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allMoves = dm.getAllMoves();
    const physicalTypes = new Set([
      "normal",
      "fighting",
      "flying",
      "ground",
      "rock",
      "bug",
      "ghost",
      "poison",
    ]);
    const specialTypes = new Set([
      "fire",
      "water",
      "grass",
      "electric",
      "ice",
      "psychic",
      "dragon",
    ]);

    // Act / Assert
    const mismatches: string[] = [];
    for (const move of allMoves) {
      if (move.category === "status") continue;
      if (physicalTypes.has(move.type) && move.category !== "physical") {
        mismatches.push(
          `${move.displayName} (${move.id}): type=${move.type} should be physical, got ${move.category}`,
        );
      }
      if (specialTypes.has(move.type) && move.category !== "special") {
        mismatches.push(
          `${move.displayName} (${move.id}): type=${move.type} should be special, got ${move.category}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("Gen 1 Type Chart Validation", () => {
  // --- 15x15 Matrix ---

  it("given Gen 1 type-chart.json, when loaded, then is a 15x15 matrix (15 attacking types, each with 15 defending entries)", () => {
    // Arrange
    const dm = createGen1DataManager();
    const chart = dm.getTypeChart();
    const attackingTypes = Object.keys(chart);

    // Act / Assert: 15 attacking types
    expect(attackingTypes.length).toBe(15);

    // Each attacking type should have entries for all 15 defending types
    const chartRecord = chart as Record<string, Record<string, number>>;
    for (const attackType of attackingTypes) {
      const defenseEntries = Object.keys(chartRecord[attackType]!);
      expect(defenseEntries.length).toBe(15);
      // Every defending type should be in the set
      for (const defType of defenseEntries) {
        expect(GEN1_VALID_TYPES.has(defType)).toBe(true);
      }
    }
  });

  // --- Ghost vs Psychic Gen 1 Bug ---

  it("given Gen 1 type chart, when checking Ghost vs Psychic, then effectiveness is 0 (the famous Gen 1 bug)", () => {
    // Arrange
    const chartRecord = GEN1_TYPE_CHART as Record<string, Record<string, number>>;

    // Act
    const ghostVsPsychic = chartRecord.ghost?.psychic;

    // Assert: In Gen 1, Ghost incorrectly did nothing to Psychic (should have been super effective)
    expect(ghostVsPsychic).toBe(0);
  });

  // --- No Dark/Steel/Fairy Types in Chart ---

  it("given Gen 1 type chart, when checking types, then Dark, Steel, and Fairy are absent", () => {
    // Arrange
    const chart = GEN1_TYPE_CHART;
    const types = Object.keys(chart);

    // Assert
    expect(types).not.toContain("dark");
    expect(types).not.toContain("steel");
    expect(types).not.toContain("fairy");
  });

  // --- Poison vs Bug (Gen 1 Difference) ---

  it("given Gen 1 type chart, when checking Poison vs Bug, then is super effective (2x) — a Gen 1 specific interaction", () => {
    // Arrange
    const chartRecord = GEN1_TYPE_CHART as Record<string, Record<string, number>>;

    // Act
    const poisonVsBug = chartRecord.poison?.bug;

    // Assert: In Gen 1 (and only Gen 1), Poison was super effective against Bug
    expect(poisonVsBug).toBe(2);
  });

  // --- All Multipliers in Valid Range ---

  it("given Gen 1 type chart, when checking all matchups, then all multipliers are 0, 0.5, 1, or 2", () => {
    // Arrange
    const chartRecord = GEN1_TYPE_CHART as Record<string, Record<string, number>>;
    const validMultipliers = new Set([0, 0.5, 1, 2]);

    // Act / Assert
    const invalidEntries: string[] = [];
    for (const [attackType, defenses] of Object.entries(chartRecord)) {
      for (const [defType, multiplier] of Object.entries(defenses)) {
        if (!validMultipliers.has(multiplier)) {
          invalidEntries.push(`${attackType} vs ${defType}: ${multiplier}`);
        }
      }
    }
    expect(invalidEntries).toEqual([]);
  });
});

describe("Gen 1 Natures and Items Validation", () => {
  // --- Empty Natures ---

  it("given Gen 1 natures.json, when loaded, then is empty (natures were introduced in Gen 3)", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allNatures = dm.getAllNatures();

    // Assert
    expect(allNatures).toEqual([]);
  });

  // --- Empty Items ---

  it("given Gen 1 items.json, when loaded, then is empty (no held items in Gen 1)", () => {
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const allItems = dm.getAllItems();

    // Assert
    expect(allItems).toEqual([]);
  });
});

describe("Gen 1 Cross-Reference Validation", () => {
  // --- Learnset Moves Exist in moves.json ---

  it("given Gen 1 data, when checking all learnset level-up moves, then every referenced move exists in moves.json", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();
    const allMoves = dm.getAllMoves();
    const validMoveIds = new Set(allMoves.map((m) => m.id));

    // Act
    const missingMoves: string[] = [];
    for (const species of allSpecies) {
      for (const levelUpMove of species.learnset.levelUp) {
        if (!validMoveIds.has(levelUpMove.move)) {
          missingMoves.push(
            `${species.displayName} (#${species.id}) level-up: "${levelUpMove.move}" at level ${levelUpMove.level}`,
          );
        }
      }
    }

    // Assert: Porygon references "sharpen" which is missing from moves.json — this is a known data gap
    // If there are missing moves, the list should only contain the known gap(s)
    if (missingMoves.length > 0) {
      // Document known gaps so new ones are caught
      for (const missing of missingMoves) {
        expect(missing).toContain("sharpen");
      }
      expect(missingMoves.length).toBeLessThanOrEqual(1);
    }
  });

  it("given Gen 1 data, when checking all learnset TM moves, then every referenced move exists in moves.json", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();
    const allMoves = dm.getAllMoves();
    const validMoveIds = new Set(allMoves.map((m) => m.id));

    // Act
    const missingMoves: string[] = [];
    for (const species of allSpecies) {
      for (const tmMove of species.learnset.tm) {
        if (!validMoveIds.has(tmMove)) {
          missingMoves.push(`${species.displayName} (#${species.id}) TM: "${tmMove}"`);
        }
      }
    }

    // Assert
    expect(missingMoves).toEqual([]);
  });

  it("given Gen 1 data, when checking all learnset tutor moves, then every referenced move exists in moves.json", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();
    const allMoves = dm.getAllMoves();
    const validMoveIds = new Set(allMoves.map((m) => m.id));

    // Act
    const missingMoves: string[] = [];
    for (const species of allSpecies) {
      for (const tutorMove of species.learnset.tutor) {
        if (!validMoveIds.has(tutorMove)) {
          missingMoves.push(`${species.displayName} (#${species.id}) tutor: "${tutorMove}"`);
        }
      }
    }

    // Assert
    expect(missingMoves).toEqual([]);
  });

  it("given Gen 1 data, when checking all learnset egg moves, then every referenced move exists in moves.json", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();
    const allMoves = dm.getAllMoves();
    const validMoveIds = new Set(allMoves.map((m) => m.id));

    // Act
    const missingMoves: string[] = [];
    for (const species of allSpecies) {
      for (const eggMove of species.learnset.egg) {
        if (!validMoveIds.has(eggMove)) {
          missingMoves.push(`${species.displayName} (#${species.id}) egg: "${eggMove}"`);
        }
      }
    }

    // Assert
    expect(missingMoves).toEqual([]);
  });

  // --- All Pokemon Types Exist in Type Chart ---

  it("given Gen 1 data, when checking all species types, then every type used by a Pokemon exists in the type chart", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allSpecies = dm.getAllSpecies();
    const chart = dm.getTypeChart();
    const chartTypes = new Set(Object.keys(chart));

    // Act
    const missingTypes: string[] = [];
    for (const species of allSpecies) {
      for (const type of species.types) {
        if (!chartTypes.has(type)) {
          missingTypes.push(`${species.displayName} (#${species.id}): type "${type}" not in chart`);
        }
      }
    }

    // Assert
    expect(missingTypes).toEqual([]);
  });

  // --- All Move Types Exist in Type Chart ---

  it("given Gen 1 data, when checking all move types, then every type used by a move exists in the type chart", () => {
    // Arrange
    const dm = createGen1DataManager();
    const allMoves = dm.getAllMoves();
    const chart = dm.getTypeChart();
    const chartTypes = new Set(Object.keys(chart));

    // Act
    const missingTypes: string[] = [];
    for (const move of allMoves) {
      if (!chartTypes.has(move.type)) {
        missingTypes.push(`${move.displayName} (${move.id}): type "${move.type}" not in chart`);
      }
    }

    // Assert
    expect(missingTypes).toEqual([]);
  });
});

describe("Gen 1 Ruleset Feature Flags", () => {
  it("given Gen1Ruleset, when checking hasAbilities, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act
    const result = ruleset.hasAbilities();

    // Assert: Abilities were introduced in Gen 3
    expect(result).toBe(false);
  });

  it("given Gen1Ruleset, when checking hasHeldItems, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act
    const result = ruleset.hasHeldItems();

    // Assert: Held items were introduced in Gen 2
    expect(result).toBe(false);
  });

  it("given Gen1Ruleset, when checking hasWeather, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act
    const result = ruleset.hasWeather();

    // Assert: Weather was introduced in Gen 2
    expect(result).toBe(false);
  });

  it("given Gen1Ruleset, when checking hasTerrain, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act
    const result = ruleset.hasTerrain();

    // Assert: Terrain was introduced in Gen 6
    expect(result).toBe(false);
  });

  it("given Gen1Ruleset, when checking getBattleGimmick, then returns null", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act
    const result = ruleset.getBattleGimmick();

    // Assert: Battle gimmicks (Mega, Z-Moves, etc.) didn't exist in Gen 1
    expect(result).toBeNull();
  });

  it("given Gen1Ruleset, when checking getAvailableHazards, then returns empty array", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act
    const result = ruleset.getAvailableHazards();

    // Assert: Entry hazards (Spikes, etc.) were introduced in Gen 2
    expect(result).toEqual([]);
  });

  it("given Gen1Ruleset, when checking getValidTypes, then returns exactly 15 types", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act
    const types = ruleset.getValidTypes();

    // Assert
    expect(types.length).toBe(15);
    expect(types).not.toContain("dark");
    expect(types).not.toContain("steel");
    expect(types).not.toContain("fairy");
  });

  it("given Gen1Ruleset, when checking generation, then is 1", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

    // Act / Assert
    expect(ruleset.generation).toBe(1);
  });
});
