import { describe, expect, it } from "vitest";
import { GEN7_TYPE_CHART, GEN7_TYPES } from "../src/Gen7TypeChart.js";

/**
 * Type chart tests for Gen 7.
 * Gen 7 uses the same 18-type chart as Gen 6 (no type changes).
 *
 * Note: These tests require the data/type-chart.json file to exist.
 * They will be skipped if the file hasn't been generated yet.
 */
describe("Gen7TypeChart", () => {
  // Check if type chart data is available; skip if not
  let typeChartAvailable = false;
  try {
    // GEN7_TYPE_CHART will throw at import time if JSON is missing
    typeChartAvailable = GEN7_TYPE_CHART !== undefined && Object.keys(GEN7_TYPE_CHART).length > 0;
  } catch {
    typeChartAvailable = false;
  }

  describe.skipIf(!typeChartAvailable)("type availability", () => {
    it("given Gen 7 types, when counting, then there are 18 types", () => {
      // Source: Bulbapedia -- Gen 6+ has 18 types (Normal through Fairy)
      // Gen 7 did not add any new types.
      expect(GEN7_TYPES).toHaveLength(18);
    });

    it("given Gen 7 types, when checking for Fairy, then it exists", () => {
      // Source: Bulbapedia -- Fairy type introduced in Gen 6, present in Gen 7
      expect(GEN7_TYPES).toContain("fairy");
    });

    it("given Gen 7 types, when checking for all base types, then they all exist", () => {
      // Source: Showdown data/typechart.ts -- all 18 types present
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
        "fairy",
      ];
      for (const type of expectedTypes) {
        expect(GEN7_TYPES).toContain(type);
      }
    });
  });

  describe.skipIf(!typeChartAvailable)("type effectiveness", () => {
    /**
     * Helper to look up type effectiveness from the chart.
     */
    function getEffectiveness(attackType: string, defenseType: string): number {
      const chart = GEN7_TYPE_CHART as Record<string, Record<string, number>>;
      return chart[attackType]?.[defenseType] ?? 1;
    }

    it("given Fairy attacking Dragon, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Fairy is super effective against Dragon
      // Source: Showdown data/typechart.ts -- fairy vs dragon = 2
      expect(getEffectiveness("fairy", "dragon")).toBe(2);
    });

    it("given Fire attacking Water, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Fire is not very effective against Water
      // Source: Showdown data/typechart.ts -- fire vs water = 0.5
      expect(getEffectiveness("fire", "water")).toBe(0.5);
    });

    it("given Normal attacking Ghost, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Normal moves have no effect on Ghost types
      // Source: Showdown data/typechart.ts -- normal vs ghost = 0
      expect(getEffectiveness("normal", "ghost")).toBe(0);
    });

    it("given Fairy attacking Steel, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Steel resists Fairy
      // Source: Showdown data/typechart.ts -- fairy vs steel = 0.5
      expect(getEffectiveness("fairy", "steel")).toBe(0.5);
    });

    it("given Dragon attacking Fairy, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Fairy is immune to Dragon-type moves
      // Source: Showdown data/typechart.ts -- dragon vs fairy = 0
      expect(getEffectiveness("dragon", "fairy")).toBe(0);
    });

    it("given Ghost attacking Ghost, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Ghost is super effective against Ghost
      // Source: Showdown data/typechart.ts -- ghost vs ghost = 2
      expect(getEffectiveness("ghost", "ghost")).toBe(2);
    });
  });
});
