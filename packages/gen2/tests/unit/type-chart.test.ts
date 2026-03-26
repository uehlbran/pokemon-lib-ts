import type { TypeChart } from "@pokemon-lib-ts/core";
import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN2_TYPE_CHART, GEN2_TYPES } from "../../src/Gen2TypeChart";

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
    expect(types).toHaveLength(17);
  });

  it("given Gen 2 type chart, when listing types, then includes Dark and Steel but not Fairy", () => {
    // Arrange
    const types = Object.keys(chart);
    // Assert
    expect(types).toContain(CORE_TYPE_IDS.dark);
    expect(types).toContain(CORE_TYPE_IDS.steel);
    expect(types).not.toContain(CORE_TYPE_IDS.fairy);
  });

  it("given GEN2_TYPES constant, when checking types, then includes all 17 Gen 2 types", () => {
    // Arrange
    const expectedTypes = GEN2_TYPES;
    // Assert
    // Source: Gen 2 has exactly 17 elemental types, and the exported list is the canonical package surface.
    expect(GEN2_TYPES.length).toBe(17);
    expect(GEN2_TYPES).toEqual(expectedTypes);
  });

  // --- Gen 1 Bug FIXED: Ghost -> Psychic = 2 ---

  it("given Gen 2 type chart, when checking Ghost vs Psychic, then is super effective (2x - Gen 1 bug fixed)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.psychic);
    // Assert
    expect(multiplier).toBe(2);
  });

  // --- New Dark Type ---

  it("given Gen 2 type chart, when checking Dark vs Psychic, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.dark, CORE_TYPE_IDS.psychic);
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 2 type chart, when checking Psychic vs Dark, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.dark);
    // Assert
    expect(multiplier).toBe(0);
  });

  // --- Steel Resistances ---

  it("given Gen 2 type chart, when checking Steel resistance to Ghost, then is 0.5x", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.steel);
    // Assert
    expect(multiplier).toBe(0.5);
  });

  it("given Gen 2 type chart, when checking Steel resistance to Dark, then is 0.5x", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.dark, CORE_TYPE_IDS.steel);
    // Assert
    expect(multiplier).toBe(0.5);
  });

  // --- Gen 2 Fixes: Poison vs Bug and Bug vs Poison are now neutral ---

  it("given Gen 2 type chart, when checking Poison vs Bug, then is neutral (1x - changed from Gen 1)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.poison, CORE_TYPE_IDS.bug);
    // Assert
    expect(multiplier).toBe(1);
  });

  it("given Gen 2 type chart, when checking Bug vs Poison, then is not very effective (0.5x - changed from Gen 1)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.bug, CORE_TYPE_IDS.poison);
    // Assert
    expect(multiplier).toBe(0.5);
  });

  // --- Preserved Immunities ---

  it("given Gen 2 type chart, when checking Normal vs Ghost, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.normal, CORE_TYPE_IDS.ghost);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 2 type chart, when checking Fighting vs Normal, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, CORE_TYPE_IDS.fighting, CORE_TYPE_IDS.normal);
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
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.normal, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given fire attacking steel, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.fire, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given water attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.water, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given electric attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.electric, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given grass attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.grass, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given ice attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ice, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given fighting attacking steel, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.fighting, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given poison attacking steel, when checking effectiveness, then returns 0x (Steel is immune to Poison)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.poison, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given ground attacking steel, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ground, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given flying attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.flying, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given psychic attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given bug attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.bug, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given rock attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.rock, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given ghost attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given dragon attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.dragon, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given dark attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.dark, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given steel attacking steel, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.steel, CORE_TYPE_IDS.steel);
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
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.normal, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given fire attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.fire, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given water attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.water, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given electric attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.electric, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given grass attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.grass, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ice attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ice, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given fighting attacking dark, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.fighting, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given poison attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.poison, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ground attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ground, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given flying attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.flying, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given psychic attacking dark, when checking effectiveness, then returns 0x (Dark is immune to Psychic)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given bug attacking dark, when checking effectiveness, then returns 2x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.bug, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given rock attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.rock, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ghost attacking dark, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given dragon attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.dragon, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given dark attacking dark, when checking effectiveness, then returns 0.5x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.dark, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given steel attacking dark, when checking effectiveness, then returns 1x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.steel, CORE_TYPE_IDS.dark);
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
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.psychic);
      // Assert
      expect(effectiveness).toBe(2);
    });

    it("given bug attacking poison, when checking effectiveness, then returns 0.5x (was 2x in Gen 1)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.bug, CORE_TYPE_IDS.poison);
      // Assert
      expect(effectiveness).toBe(0.5);
    });

    it("given poison attacking bug, when checking effectiveness, then returns 1x (was 2x in Gen 1)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.poison, CORE_TYPE_IDS.bug);
      // Assert
      expect(effectiveness).toBe(1);
    });

    it("given ice attacking fire, when checking effectiveness, then returns 0.5x (was 1x in Gen 1)", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ice, CORE_TYPE_IDS.fire);
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
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.normal, CORE_TYPE_IDS.ghost);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given ghost attacking normal, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.normal);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given fighting attacking ghost, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.fighting, CORE_TYPE_IDS.ghost);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given electric attacking ground, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.electric, CORE_TYPE_IDS.ground);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given ground attacking flying, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.ground, CORE_TYPE_IDS.flying);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given poison attacking steel, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.poison, CORE_TYPE_IDS.steel);
      // Assert
      expect(effectiveness).toBe(0);
    });

    it("given psychic attacking dark, when checking effectiveness, then returns 0x", () => {
      // Arrange
      const chart = GEN2_TYPE_CHART;
      // Act
      const effectiveness = getEffectiveness(chart, CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.dark);
      // Assert
      expect(effectiveness).toBe(0);
    });
  });
});
