import type { TypeChart } from "@pokemon-lib/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../src/data";

/**
 * Helper to get a type effectiveness multiplier from the chart.
 * attackType -> defenderType
 */
function getEffectiveness(chart: TypeChart, attackType: string, defenderType: string): number {
  return (chart as Record<string, Record<string, number>>)[attackType]?.[defenderType] ?? 1;
}

describe("Gen 1 Type Chart", () => {
  const dm = createGen1DataManager();
  const chart = dm.getTypeChart();

  // --- Type Count ---

  it("given Gen 1 type chart, when counting types, then has exactly 15 attacking types", () => {
    // Arrange / Act
    const types = Object.keys(chart);
    // Assert
    expect(types.length).toBe(15);
  });

  it("given Gen 1 type chart, when listing types, then includes all 15 Gen 1 types", () => {
    // Arrange
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
    // Act
    const types = Object.keys(chart);
    // Assert
    for (const t of expectedTypes) {
      expect(types).toContain(t);
    }
  });

  // --- Famous Gen 1 Bug: Ghost vs Psychic = 0 (immunity) ---

  it("given Gen 1 type chart, when checking Ghost vs Psychic, then is immune (0x - the famous bug)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ghost", "psychic");
    // Assert: The famous Gen 1 bug where Ghost moves don't affect Psychic types
    // In reality Ghost should be super effective against Psychic, but due to a
    // programming error it was coded as 0 (immune)
    expect(multiplier).toBe(0);
  });

  // --- Gen 1 Specific: Poison super effective vs Bug ---

  it("given Gen 1 type chart, when checking Poison vs Bug, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "poison", "bug");
    // Assert: In Gen 1, Poison was super effective against Bug (changed in later gens)
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Bug vs Poison, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "bug", "poison");
    // Assert: Bug was super effective against Poison in Gen 1
    expect(multiplier).toBe(2);
  });

  // --- Normal Type Immunities ---

  it("given Gen 1 type chart, when checking Normal vs Ghost, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "normal", "ghost");
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Ghost vs Normal, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ghost", "normal");
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Fighting vs Ghost, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fighting", "ghost");
    // Assert
    expect(multiplier).toBe(0);
  });

  // --- Ground Immunity ---

  it("given Gen 1 type chart, when checking Electric vs Ground, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "electric", "ground");
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Ground vs Flying, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ground", "flying");
    // Assert
    expect(multiplier).toBe(0);
  });

  // --- Classic Starter Triangle ---

  it("given Gen 1 type chart, when checking Fire vs Grass, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fire", "grass");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Water vs Fire, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "water", "fire");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Grass vs Water, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "grass", "water");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Reverse Starter Triangle (not very effective) ---

  it("given Gen 1 type chart, when checking Fire vs Water, then is not very effective (0.5x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fire", "water");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  it("given Gen 1 type chart, when checking Water vs Grass, then is not very effective (0.5x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "water", "grass");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  it("given Gen 1 type chart, when checking Grass vs Fire, then is not very effective (0.5x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "grass", "fire");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  // --- Psychic Dominance (Gen 1 meta-defining) ---

  it("given Gen 1 type chart, when checking Psychic vs Fighting, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "psychic", "fighting");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Psychic vs Poison, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "psychic", "poison");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Ice Type ---

  it("given Gen 1 type chart, when checking Ice vs Dragon, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ice", "dragon");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Ice vs Flying, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ice", "flying");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Ice vs Grass, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ice", "grass");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Ice vs Ground, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ice", "ground");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Dragon Type (only Dragon is SE against Dragon in Gen 1) ---

  it("given Gen 1 type chart, when checking Dragon vs Dragon, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "dragon", "dragon");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Ghost Type ---

  it("given Gen 1 type chart, when checking Ghost vs Ghost, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ghost", "ghost");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Ground Type ---

  it("given Gen 1 type chart, when checking Ground vs Electric, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ground", "electric");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Ground vs Fire, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ground", "fire");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Ground vs Poison, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ground", "poison");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Ground vs Rock, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ground", "rock");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Rock Type ---

  it("given Gen 1 type chart, when checking Rock vs Fire, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "rock", "fire");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Rock vs Flying, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "rock", "flying");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Rock vs Ice, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "rock", "ice");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Rock vs Bug, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "rock", "bug");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Flying Type ---

  it("given Gen 1 type chart, when checking Flying vs Bug, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "flying", "bug");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Flying vs Grass, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "flying", "grass");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Flying vs Fighting, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "flying", "fighting");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Neutral Matchups ---

  it("given Gen 1 type chart, when checking Normal vs Normal, then is neutral (1x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "normal", "normal");
    // Assert
    expect(multiplier).toBe(1);
  });

  it("given Gen 1 type chart, when checking Fire vs Fire, then is not very effective (0.5x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fire", "fire");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  // --- Resistances ---

  it("given Gen 1 type chart, when checking Normal vs Rock, then is not very effective (0.5x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "normal", "rock");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  it("given Gen 1 type chart, when checking Fire vs Rock, then is not very effective (0.5x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fire", "rock");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  // --- Validate all diagonal entries are defined ---

  it("given Gen 1 type chart, when checking all types against themselves, then multiplier is defined", () => {
    // Arrange
    const types = Object.keys(chart);
    // Act / Assert
    for (const t of types) {
      const multiplier = getEffectiveness(chart, t, t);
      expect(multiplier).toBeDefined();
      expect([0, 0.5, 1, 2]).toContain(multiplier);
    }
  });

  // --- Validate multipliers are in valid range ---

  it("given Gen 1 type chart, when checking all matchups, then multipliers are 0, 0.5, 1, or 2", () => {
    // Arrange
    const types = Object.keys(chart);
    const validMultipliers = [0, 0.5, 1, 2];
    // Act / Assert
    for (const attackType of types) {
      for (const defenderType of types) {
        const multiplier = getEffectiveness(chart, attackType, defenderType);
        expect(validMultipliers).toContain(multiplier);
      }
    }
  });

  // --- Fire Type Matchups ---

  it("given Gen 1 type chart, when checking Fire vs Bug, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fire", "bug");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Fire vs Ice, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fire", "ice");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Electric Type ---

  it("given Gen 1 type chart, when checking Electric vs Water, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "electric", "water");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Electric vs Flying, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "electric", "flying");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Fighting Type ---

  it("given Gen 1 type chart, when checking Fighting vs Normal, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fighting", "normal");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Fighting vs Ice, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fighting", "ice");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Fighting vs Rock, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fighting", "rock");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Bug Type ---

  it("given Gen 1 type chart, when checking Bug vs Grass, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "bug", "grass");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Bug vs Psychic, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "bug", "psychic");
    // Assert: Bug was one of the few things super effective against Psychic in Gen 1
    expect(multiplier).toBe(2);
  });

  // --- Water Type ---

  it("given Gen 1 type chart, when checking Water vs Ground, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "water", "ground");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Water vs Rock, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "water", "rock");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Grass Type ---

  it("given Gen 1 type chart, when checking Grass vs Ground, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "grass", "ground");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Grass vs Rock, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "grass", "rock");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Poison Type (Gen 1 specific: SE vs Bug) ---

  it("given Gen 1 type chart, when checking Poison vs Grass, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "poison", "grass");
    // Assert
    expect(multiplier).toBe(2);
  });
});
