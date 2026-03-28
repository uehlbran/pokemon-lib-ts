import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN8_TYPE_CHART, GEN8_TYPES } from "../src/Gen8TypeChart.js";

/**
 * Type chart tests for Gen 8.
 * Gen 8 uses the same 18-type chart as Gen 6-7 (no type changes).
 *
 * Note: These tests require the data/type-chart.json file to exist.
 * They will be skipped if the file hasn't been generated yet.
 */
describe("Gen8TypeChart", () => {
  // Check if type chart data is available; skip if not
  const T = CORE_TYPE_IDS;
  const typeChartAvailable = (() => {
    try {
      // GEN8_TYPE_CHART will throw at import time if JSON is missing
      return GEN8_TYPE_CHART !== undefined && Object.keys(GEN8_TYPE_CHART).length > 0;
    } catch {
      return false;
    }
  })();

  describe.skipIf(!typeChartAvailable)("type availability", () => {
    it("given Gen 8 types, when counting, then there are 18 types", () => {
      // Source: Bulbapedia -- Gen 6+ has 18 types (Normal through Fairy)
      // Gen 8 did not add any new types.
      expect(GEN8_TYPES).toHaveLength(18);
    });

    it("given Gen 8 types, when checking for Fairy, then it exists", () => {
      // Source: Bulbapedia -- Fairy type introduced in Gen 6, present in Gen 8
      expect(GEN8_TYPES).toContain(T.fairy);
    });

    it("given Gen 8 types, when checking for all base types, then they all exist", () => {
      // Source: Showdown data/typechart.ts -- all 18 types present
      const expectedTypes = [
        T.normal,
        T.fire,
        T.water,
        T.electric,
        T.grass,
        T.ice,
        T.fighting,
        T.poison,
        T.ground,
        T.flying,
        T.psychic,
        T.bug,
        T.rock,
        T.ghost,
        T.dragon,
        T.dark,
        T.steel,
        T.fairy,
      ];
      for (const type of expectedTypes) {
        expect(GEN8_TYPES).toContain(type);
      }
    });
  });

  describe.skipIf(!typeChartAvailable)("type effectiveness", () => {
    /**
     * Helper to look up type effectiveness from the chart.
     */
    function getEffectiveness(attackType: string, defenseType: string): number {
      const chart = GEN8_TYPE_CHART;
      return chart[attackType]?.[defenseType] ?? 1;
    }

    // --- Super effective ---

    it("given Fire attacking Grass, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Fire is super effective against Grass
      // Source: Showdown data/typechart.ts -- fire vs grass = 2
      expect(getEffectiveness(T.fire, T.grass)).toBe(2);
    });

    it("given Water attacking Fire, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Water is super effective against Fire
      // Source: Showdown data/typechart.ts -- water vs fire = 2
      expect(getEffectiveness(T.water, T.fire)).toBe(2);
    });

    it("given Fairy attacking Dragon, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Fairy is super effective against Dragon
      // Source: Showdown data/typechart.ts -- fairy vs dragon = 2
      expect(getEffectiveness(T.fairy, T.dragon)).toBe(2);
    });

    it("given Steel attacking Fairy, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Steel is super effective against Fairy
      // Source: Showdown data/typechart.ts -- steel vs fairy = 2
      expect(getEffectiveness(T.steel, T.fairy)).toBe(2);
    });

    // --- Not very effective ---

    it("given Fire attacking Water, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Fire is not very effective against Water
      // Source: Showdown data/typechart.ts -- fire vs water = 0.5
      expect(getEffectiveness(T.fire, T.water)).toBe(0.5);
    });

    it("given Fairy attacking Steel, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Steel resists Fairy
      // Source: Showdown data/typechart.ts -- fairy vs steel = 0.5
      expect(getEffectiveness(T.fairy, T.steel)).toBe(0.5);
    });

    // --- Immunities ---

    it("given Normal attacking Ghost, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Normal moves have no effect on Ghost types
      // Source: Showdown data/typechart.ts -- normal vs ghost = 0
      expect(getEffectiveness(T.normal, T.ghost)).toBe(0);
    });

    it("given Electric attacking Ground, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Ground types are immune to Electric moves
      // Source: Showdown data/typechart.ts -- electric vs ground = 0
      expect(getEffectiveness(T.electric, T.ground)).toBe(0);
    });

    it("given Dragon attacking Fairy, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Fairy is immune to Dragon-type moves
      // Source: Showdown data/typechart.ts -- dragon vs fairy = 0
      expect(getEffectiveness(T.dragon, T.fairy)).toBe(0);
    });

    it("given Ghost attacking Normal, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Normal types are immune to Ghost moves
      // Source: Showdown data/typechart.ts -- ghost vs normal = 0
      expect(getEffectiveness(T.ghost, T.normal)).toBe(0);
    });

    // --- Gen 6+ Steel changes ---

    it("given Dark attacking Steel, when checking effectiveness, then returns 1x (neutral in Gen 6+)", () => {
      // Source: Bulbapedia -- Steel no longer resists Dark as of Gen 6
      // Source: Showdown data/typechart.ts -- dark vs steel = 1 in Gen 6+
      expect(getEffectiveness(T.dark, T.steel)).toBe(1);
    });

    it("given Ghost attacking Steel, when checking effectiveness, then returns 1x (neutral in Gen 6+)", () => {
      // Source: Bulbapedia -- Steel no longer resists Ghost as of Gen 6
      // Source: Showdown data/typechart.ts -- ghost vs steel = 1 in Gen 6+
      expect(getEffectiveness(T.ghost, T.steel)).toBe(1);
    });

    // --- Ghost self-interaction ---

    it("given Ghost attacking Ghost, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Ghost is super effective against Ghost
      // Source: Showdown data/typechart.ts -- ghost vs ghost = 2
      expect(getEffectiveness(T.ghost, T.ghost)).toBe(2);
    });
  });
});
