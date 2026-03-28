import type { PokemonType } from "@pokemon-lib-ts/core";
import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN9_TYPE_CHART, GEN9_TYPES } from "../src/Gen9TypeChart.js";

const TYPES = CORE_TYPE_IDS;

/**
 * Type chart tests for Gen 9.
 * Gen 9 uses the same 18-type chart as Gen 6-8 (no type changes).
 *
 * Data files are committed to the repo and always present.
 */
describe("Gen9TypeChart", () => {
  describe("type availability", () => {
    it("given Gen 9 types, when counting, then there are 18 types", () => {
      // Source: Bulbapedia -- Gen 6+ has 18 types (Normal through Fairy)
      // Gen 9 did not add any new types.
      expect(GEN9_TYPES).toHaveLength(18);
    });

    it("given Gen 9 types, when checking for Fairy, then it exists", () => {
      // Source: Bulbapedia -- Fairy type introduced in Gen 6, present in Gen 9
      expect(GEN9_TYPES).toContain(TYPES.fairy);
    });

    it("given Gen 9 types, when checking for all base types, then they all exist", () => {
      // Source: Showdown data/typechart.ts -- all 18 types present
      const expectedTypes = [
        TYPES.normal,
        TYPES.fire,
        TYPES.water,
        TYPES.electric,
        TYPES.grass,
        TYPES.ice,
        TYPES.fighting,
        TYPES.poison,
        TYPES.ground,
        TYPES.flying,
        TYPES.psychic,
        TYPES.bug,
        TYPES.rock,
        TYPES.ghost,
        TYPES.dragon,
        TYPES.dark,
        TYPES.steel,
        TYPES.fairy,
      ];
      for (const type of expectedTypes) {
        expect(GEN9_TYPES).toContain(type);
      }
    });
  });

  describe("type effectiveness", () => {
    /**
     * Helper to look up type effectiveness from the chart.
     * Throws if the attack type or defense type is missing from the chart,
     * ensuring test failures surface actual data problems.
     */
    function getEffectiveness(attackType: PokemonType, defenseType: PokemonType): number {
      const chart = GEN9_TYPE_CHART;
      const attackRow = chart[attackType];
      if (!attackRow) {
        throw new Error(`Attack type "${attackType}" not found in type chart`);
      }
      const value = attackRow[defenseType];
      if (value === undefined) {
        throw new Error(
          `Defense type "${defenseType}" not found in "${attackType}" row of type chart`,
        );
      }
      return value;
    }

    // --- Super effective ---

    it("given Fire attacking Grass, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Fire is super effective against Grass
      // Source: Showdown data/typechart.ts -- fire vs grass = 2
      expect(getEffectiveness(TYPES.fire, TYPES.grass)).toBe(2);
    });

    it("given Fire attacking Ice, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Fire is super effective against Ice
      // Source: Showdown data/typechart.ts -- fire vs ice = 2
      expect(getEffectiveness(TYPES.fire, TYPES.ice)).toBe(2);
    });

    it("given Water attacking Fire, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Water is super effective against Fire
      // Source: Showdown data/typechart.ts -- water vs fire = 2
      expect(getEffectiveness(TYPES.water, TYPES.fire)).toBe(2);
    });

    it("given Fairy attacking Dragon, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Fairy is super effective against Dragon
      // Source: Showdown data/typechart.ts -- fairy vs dragon = 2
      expect(getEffectiveness(TYPES.fairy, TYPES.dragon)).toBe(2);
    });

    it("given Steel attacking Fairy, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Steel is super effective against Fairy
      // Source: Showdown data/typechart.ts -- steel vs fairy = 2
      expect(getEffectiveness(TYPES.steel, TYPES.fairy)).toBe(2);
    });

    // --- Not very effective ---

    it("given Fire attacking Water, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Fire is not very effective against Water
      // Source: Showdown data/typechart.ts -- fire vs water = 0.5
      expect(getEffectiveness(TYPES.fire, TYPES.water)).toBe(0.5);
    });

    it("given Water attacking Water, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Water is not very effective against Water
      // Source: Showdown data/typechart.ts -- water vs water = 0.5
      expect(getEffectiveness(TYPES.water, TYPES.water)).toBe(0.5);
    });

    it("given Fairy attacking Steel, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Steel resists Fairy
      // Source: Showdown data/typechart.ts -- fairy vs steel = 0.5
      expect(getEffectiveness(TYPES.fairy, TYPES.steel)).toBe(0.5);
    });

    it("given Fighting attacking Psychic, when checking effectiveness, then returns 0.5x (not very effective)", () => {
      // Source: Bulbapedia -- Fighting is not very effective against Psychic
      // Source: Showdown data/typechart.ts -- fighting vs psychic = 0.5
      expect(getEffectiveness(TYPES.fighting, TYPES.psychic)).toBe(0.5);
    });

    // --- Immunities ---

    it("given Normal attacking Ghost, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Normal moves have no effect on Ghost types
      // Source: Showdown data/typechart.ts -- normal vs ghost = 0
      expect(getEffectiveness(TYPES.normal, TYPES.ghost)).toBe(0);
    });

    it("given Electric attacking Ground, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Ground types are immune to Electric moves
      // Source: Showdown data/typechart.ts -- electric vs ground = 0
      expect(getEffectiveness(TYPES.electric, TYPES.ground)).toBe(0);
    });

    it("given Dragon attacking Fairy, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Fairy is immune to Dragon-type moves
      // Source: Showdown data/typechart.ts -- dragon vs fairy = 0
      expect(getEffectiveness(TYPES.dragon, TYPES.fairy)).toBe(0);
    });

    it("given Ghost attacking Normal, when checking effectiveness, then returns 0x (immune)", () => {
      // Source: Bulbapedia -- Normal types are immune to Ghost moves
      // Source: Showdown data/typechart.ts -- ghost vs normal = 0
      expect(getEffectiveness(TYPES.ghost, TYPES.normal)).toBe(0);
    });

    // --- Gen 6+ Steel changes ---

    it("given Dark attacking Steel, when checking effectiveness, then returns 1x (neutral in Gen 6+)", () => {
      // Source: Bulbapedia -- Steel no longer resists Dark as of Gen 6
      // Source: Showdown data/typechart.ts -- dark vs steel = 1 in Gen 6+
      expect(getEffectiveness(TYPES.dark, TYPES.steel)).toBe(1);
    });

    it("given Ghost attacking Steel, when checking effectiveness, then returns 1x (neutral in Gen 6+)", () => {
      // Source: Bulbapedia -- Steel no longer resists Ghost as of Gen 6
      // Source: Showdown data/typechart.ts -- ghost vs steel = 1 in Gen 6+
      expect(getEffectiveness(TYPES.ghost, TYPES.steel)).toBe(1);
    });

    // --- Ghost self-interaction ---

    it("given Ghost attacking Ghost, when checking effectiveness, then returns 2x (super effective)", () => {
      // Source: Bulbapedia -- Ghost is super effective against Ghost
      // Source: Showdown data/typechart.ts -- ghost vs ghost = 2
      expect(getEffectiveness(TYPES.ghost, TYPES.ghost)).toBe(2);
    });
  });
});
