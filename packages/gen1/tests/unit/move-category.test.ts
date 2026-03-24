import type { PokemonType } from "@pokemon-lib-ts/core";
import { getTypeEffectiveness } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../../src/data";
import { isGen1PhysicalType } from "../../src/Gen1DamageCalc";
import { GEN1_TYPE_CHART } from "../../src/Gen1TypeChart";

/**
 * Gen 1 Move Category and Type Interaction Tests
 *
 * In Gen 1, whether a move is physical or special is determined entirely by TYPE,
 * not by the move itself. This is the "type-based physical/special split":
 *
 * Physical types: Normal, Fighting, Flying, Ground, Rock, Bug, Ghost, Poison (some sources)
 * Special types: Fire, Water, Grass, Electric, Ice, Psychic, Dragon
 *
 * NOTE: In Gen 1, the move data already has category set correctly based on type.
 * These tests verify that the data and any helper functions are consistent.
 */
describe("Gen 1 Move Category by Type", () => {
  // --- Physical Types ---

  it("given a Normal-type move, when checking category, then is physical", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const tackle = dm.getMove("tackle");
    const pound = dm.getMove("pound");
    const hyperBeam = dm.getMove("hyper-beam");
    // Assert
    expect(tackle.category).toBe("physical");
    expect(pound.category).toBe("physical");
    expect(hyperBeam.category).toBe("physical"); // Hyper Beam is Normal-type, so physical in Gen 1!
  });

  it("given a Fighting-type move, when checking category, then is physical or status", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    // Counter is fighting-type but status in the data
    const counter = dm.getMove("counter");
    // Assert
    // Counter is classified as status since it does reflected damage
    expect(["physical", "status"]).toContain(counter.category);
  });

  it("given a Ground-type move, when checking category, then is physical", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const earthquake = dm.getMove("earthquake");
    const dig = dm.getMove("dig");
    // Assert
    expect(earthquake.category).toBe("physical");
    expect(dig.category).toBe("physical");
  });

  it("given a Rock-type move, when checking category, then is physical", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const rockSlide = dm.getMove("rock-slide");
    // Assert
    expect(rockSlide.category).toBe("physical");
  });

  it("given a Flying-type move, when checking category, then is physical", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const fly = dm.getMove("fly");
    // Assert
    expect(fly.category).toBe("physical");
  });

  // --- Special Types ---

  it("given a Fire-type move, when checking category, then is special", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const flamethrower = dm.getMove("flamethrower");
    const fireBlast = dm.getMove("fire-blast");
    // Assert
    expect(flamethrower.category).toBe("special");
    expect(fireBlast.category).toBe("special");
  });

  it("given a Water-type move, when checking category, then is special", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const surf = dm.getMove("surf");
    const hydroPump = dm.getMove("hydro-pump");
    // Assert
    expect(surf.category).toBe("special");
    expect(hydroPump.category).toBe("special");
  });

  it("given an Electric-type move, when checking category, then is special", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const thunderbolt = dm.getMove("thunderbolt");
    const thunder = dm.getMove("thunder");
    // Assert
    expect(thunderbolt.category).toBe("special");
    expect(thunder.category).toBe("special");
  });

  it("given a Grass-type move, when checking category, then is special", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const solarBeam = dm.getMove("solar-beam");
    // Assert
    expect(solarBeam.category).toBe("special");
  });

  it("given an Ice-type move, when checking category, then is special", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const iceBeam = dm.getMove("ice-beam");
    const blizzard = dm.getMove("blizzard");
    // Assert
    expect(iceBeam.category).toBe("special");
    expect(blizzard.category).toBe("special");
  });

  it("given a Psychic-type move, when checking category, then is special", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const psychic = dm.getMove("psychic");
    const confusion = dm.getMove("confusion");
    // Assert
    expect(psychic.category).toBe("special");
    expect(confusion.category).toBe("special");
  });

  // --- Category Consistency Across All Moves ---

  it("given all Gen 1 damaging moves, when checking categories, then physical/special aligns with type", () => {
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
    for (const move of allMoves) {
      if (move.category === "status") continue; // Skip status moves
      if (physicalTypes.has(move.type)) {
        expect(move.category).toBe("physical");
      } else if (specialTypes.has(move.type)) {
        expect(move.category).toBe("special");
      }
      // Poison-type moves could be either (historically varies in interpretation)
    }
  });
});

describe("Gen 1 Type Chart Utilities", () => {
  // --- Type Effectiveness Helper ---

  it("given Gen1TypeChart, when getting effectiveness of Fire vs Grass, then returns 2", () => {
    // Arrange / Act
    const multiplier = getTypeEffectiveness("fire", ["grass"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen1TypeChart, when getting effectiveness of Water vs Fire, then returns 2", () => {
    // Arrange / Act
    const multiplier = getTypeEffectiveness("water", ["fire"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen1TypeChart, when getting effectiveness of Normal vs Ghost, then returns 0", () => {
    // Arrange / Act
    const multiplier = getTypeEffectiveness("normal", ["ghost"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen1TypeChart, when getting effectiveness of Ghost vs Psychic, then returns 0 (Gen 1 bug)", () => {
    // Arrange / Act
    const multiplier = getTypeEffectiveness("ghost", ["psychic"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen1TypeChart, when getting effectiveness against dual type, then multiplies factors", () => {
    // Arrange: Ice vs Dragon/Flying should be 2 * 2 = 4
    // Act
    const multiplier = getTypeEffectiveness("ice", ["dragon", "flying"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(4);
  });

  it("given Gen1TypeChart, when getting effectiveness of Ground vs Grass/Poison, then handles mixed effectiveness", () => {
    // Arrange: Ground vs Grass = 0.5, Ground vs Poison = 2
    // Combined: 0.5 * 2 = 1
    // Act
    const multiplier = getTypeEffectiveness("ground", ["grass", "poison"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(1);
  });

  it("given Gen1TypeChart, when getting effectiveness of Electric vs Ground/Rock, then returns 0 (Ground immunity)", () => {
    // Arrange: Electric vs Ground = 0 (immunity), so the product is 0
    // Act
    const multiplier = getTypeEffectiveness("electric", ["ground", "rock"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen1TypeChart, when getting effectiveness of Fire vs Bug/Grass, then returns 4 (double super effective)", () => {
    // Arrange: Fire vs Bug = 2, Fire vs Grass = 2 -> 2*2 = 4
    // Act
    const multiplier = getTypeEffectiveness("fire", ["bug", "grass"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(4);
  });

  it("given Gen1TypeChart, when getting effectiveness of Normal vs Normal, then returns 1 (neutral)", () => {
    // Arrange / Act
    const multiplier = getTypeEffectiveness("normal", ["normal"], GEN1_TYPE_CHART);
    // Assert
    expect(multiplier).toBe(1);
  });

  it("given Gen1 physical/special split, when classifying types, then physical and special types are correctly identified", () => {
    // Arrange
    const physicalTypes: PokemonType[] = [
      "normal",
      "fighting",
      "flying",
      "ground",
      "rock",
      "bug",
      "ghost",
      "poison",
    ];
    const specialTypes: PokemonType[] = [
      "fire",
      "water",
      "grass",
      "electric",
      "ice",
      "psychic",
      "dragon",
    ];
    // Act / Assert
    for (const t of physicalTypes) {
      expect(isGen1PhysicalType(t)).toBe(true);
    }
    for (const t of specialTypes) {
      expect(isGen1PhysicalType(t)).toBe(false);
    }
  });

  it("given isGen1PhysicalType, when checking individual types, then correctly identifies physical types", () => {
    // Arrange / Act / Assert
    expect(isGen1PhysicalType("normal")).toBe(true);
    expect(isGen1PhysicalType("fighting")).toBe(true);
    expect(isGen1PhysicalType("fire")).toBe(false);
    expect(isGen1PhysicalType("water")).toBe(false);
    expect(isGen1PhysicalType("psychic")).toBe(false);
  });
});
