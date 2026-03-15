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

  // --- Steel defensive matchups (all 17 attacking types) ---

  describe("Steel defensive matchups", () => {
    it("given normal attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "normal", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given fire attacking steel, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "fire", "steel");
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given water attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "water", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given electric attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "electric", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given grass attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "grass", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given ice attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ice", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given fighting attacking steel, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "fighting", "steel");
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given poison attacking steel, when checking effectiveness, then returns 0x (Steel is immune to Poison)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "poison", "steel");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given ground attacking steel, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ground", "steel");
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given flying attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "flying", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given psychic attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "psychic", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given bug attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "bug", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given rock attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "rock", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given ghost attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ghost", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given dragon attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "dragon", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given dark attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "dark", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given steel attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "steel", "steel");
      // Assert
      expect(effectiveness).toBe(0.5);
    });
  });

  // --- Dark defensive matchups (all 17 attacking types) ---

  describe("Dark defensive matchups", () => {
    it("given normal attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "normal", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given fire attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "fire", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given water attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "water", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given electric attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "electric", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given grass attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "grass", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ice attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ice", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given fighting attacking dark, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "fighting", "dark");
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given poison attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "poison", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ground attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ground", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given flying attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "flying", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given psychic attacking dark, when checking effectiveness, then returns 0x (Dark is immune to Psychic)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "psychic", "dark");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given bug attacking dark, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "bug", "dark");
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given rock attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "rock", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ghost attacking dark, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ghost", "dark");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given dragon attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "dragon", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given dark attacking dark, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "dark", "dark");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given steel attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "steel", "dark");
      // Assert
      expect(effectiveness).toBe(1);
    });
  });

  // --- Gen 1 -> Gen 2 type chart changes ---

  describe("Gen 1 to Gen 2 type chart changes", () => {
    it("given ghost attacking psychic, when checking effectiveness, then returns 2x (was 0x bug in Gen 1)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ghost", "psychic");
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given bug attacking poison, when checking effectiveness, then returns 0.5x (was 2x in Gen 1)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "bug", "poison");
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given poison attacking bug, when checking effectiveness, then returns 1x (was 2x in Gen 1)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "poison", "bug");
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ice attacking fire, when checking effectiveness, then returns 0.5x (was 1x in Gen 1)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ice", "fire");
      // Assert
      expect(effectiveness).toBe(0.5);
    });
  });

  // --- All Gen 2 type immunities ---

  describe("All Gen 2 type immunities", () => {
    it("given normal attacking ghost, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "normal", "ghost");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given ghost attacking normal, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ghost", "normal");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given fighting attacking ghost, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "fighting", "ghost");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given electric attacking ground, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "electric", "ground");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given ground attacking flying, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "ground", "flying");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given poison attacking steel, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "poison", "steel");
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given psychic attacking dark, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, "psychic", "dark");
      // Assert
      expect(effectiveness).toBe(0);
    });
  });
});
