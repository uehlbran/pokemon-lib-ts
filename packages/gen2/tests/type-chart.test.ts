import type { TypeChart } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN2_TYPE_CHART, GEN2_TYPES } from "../src/Gen2TypeChart";

/**
 * Helper to get a type effectiveness multiplier from the chart.
 * attackType -> defenderType
 */
function getEffectiveness(chart: TypeChart, attackType: string, defenderType: string): number {
  return (chart as Record<string, Record<string, number>>)[attackType]?.[defenderType] ?? 1;
}

describe("Gen 2 Type Chart", () => {
  const chart = GEN2_TYPE_CHART;

  // --- Type Count ---

  it("given Gen 2 type chart, when counting types, then has exactly 17 attacking types", () => {
    // Arrange / Act
    const types = Object.keys(chart);
    // Assert
    expect(types.length).toBe(17);
  });

  it("given Gen 2 type chart, when listing types, then includes Dark and Steel but not Fairy", () => {
    // Arrange
    const types = Object.keys(chart);
    // Assert
    expect(types).toContain("dark");
    expect(types).toContain("steel");
    expect(types).not.toContain("fairy");
  });

  it("given GEN2_TYPES constant, when checking types, then includes all 17 Gen 2 types", () => {
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
      "dark",
      "steel",
    ];
    // Assert
    expect(GEN2_TYPES.length).toBe(17);
    for (const t of expectedTypes) {
      expect(GEN2_TYPES).toContain(t);
    }
  });

  // --- Gen 1 Bug FIXED: Ghost -> Psychic = 2 ---

  it("given Gen 2 type chart, when checking Ghost vs Psychic, then is super effective (2x - Gen 1 bug fixed)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ghost", "psychic");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- New Dark Type ---

  it("given Gen 2 type chart, when checking Dark vs Psychic, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "dark", "psychic");
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 2 type chart, when checking Psychic vs Dark, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "psychic", "dark");
    // Assert
    expect(multiplier).toBe(0);
  });

  // --- Steel Resistances ---

  it("given Gen 2 type chart, when checking Steel resistance to Ghost, then is 0.5x", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "ghost", "steel");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  it("given Gen 2 type chart, when checking Steel resistance to Dark, then is 0.5x", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "dark", "steel");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  // --- Gen 2 Fixes: Poison vs Bug and Bug vs Poison are now neutral ---

  it("given Gen 2 type chart, when checking Poison vs Bug, then is neutral (1x - changed from Gen 1)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "poison", "bug");
    // Assert
    expect(multiplier).toBe(1);
  });

  it("given Gen 2 type chart, when checking Bug vs Poison, then is not very effective (0.5x - changed from Gen 1)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "bug", "poison");
    // Assert
    expect(multiplier).toBe(0.5);
  });

  // --- Preserved Immunities ---

  it("given Gen 2 type chart, when checking Normal vs Ghost, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "normal", "ghost");
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 2 type chart, when checking Fighting vs Normal, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, "fighting", "normal");
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- Validate multipliers are in valid range ---

  it("given Gen 2 type chart, when checking all matchups, then multipliers are 0, 0.5, 1, or 2", () => {
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
});
