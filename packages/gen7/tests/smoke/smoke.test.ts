import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen7Ruleset } from "../../src/Gen7Ruleset.js";

/**
 * Smoke tests for Gen7Ruleset scaffold.
 * These verify that the ruleset can be instantiated and returns correct
 * metadata values without requiring data files to exist.
 */
describe("Gen7Ruleset", () => {
  /**
   * Create a Gen7Ruleset with an empty DataManager (no data files needed).
   * This avoids import errors when data JSON files haven't been generated yet.
   */
  function createTestRuleset(): Gen7Ruleset {
    return new Gen7Ruleset(new DataManager());
  }

  describe("instantiation", () => {
    it("given Gen7Ruleset class, when instantiated with empty DataManager, then succeeds without error", () => {
      const ruleset = createTestRuleset();
      expect(ruleset).toBeDefined();
    });
  });

  describe("generation", () => {
    it("given a Gen7Ruleset, when checking generation, then returns 7", () => {
      // Source: Gen 7 = Sun/Moon/Ultra Sun/Ultra Moon
      const ruleset = createTestRuleset();
      expect(ruleset.generation).toBe(7);
    });
  });

  describe("name", () => {
    it('given a Gen7Ruleset, when checking name, then contains "Gen 7"', () => {
      const ruleset = createTestRuleset();
      expect(ruleset.name).toContain("Gen 7");
    });

    it('given a Gen7Ruleset, when checking name, then contains "Sun/Moon"', () => {
      // Source: Gen 7 covers Sun, Moon, Ultra Sun, Ultra Moon
      const ruleset = createTestRuleset();
      expect(ruleset.name).toContain("Sun/Moon");
    });
  });

  describe("hasTerrain", () => {
    it("given a Gen7Ruleset, when checking hasTerrain, then returns true", () => {
      // Source: Bulbapedia -- Terrain system active in Gen 6+ (enhanced in Gen 7)
      const ruleset = createTestRuleset();
      expect(ruleset.hasTerrain()).toBe(true);
    });
  });

  describe("getAvailableHazards", () => {
    it('given a Gen7Ruleset, when getting hazards, then includes "sticky-web"', () => {
      // Source: Bulbapedia -- Sticky Web introduced in Gen 6, still present in Gen 7
      const ruleset = createTestRuleset();
      const hazards = ruleset.getAvailableHazards();
      expect(hazards).toContain("sticky-web");
    });

    it("given a Gen7Ruleset, when getting hazards, then includes all four hazard types", () => {
      // Source: Showdown data/moves.ts -- Gen 7 has stealth-rock, spikes, toxic-spikes, sticky-web
      const ruleset = createTestRuleset();
      const hazards = ruleset.getAvailableHazards();
      expect(hazards).toContain("stealth-rock");
      expect(hazards).toContain("spikes");
      expect(hazards).toContain("toxic-spikes");
      expect(hazards).toContain("sticky-web");
    });
  });

  describe("getConfusionSelfHitChance", () => {
    it("given a Gen7Ruleset, when getting confusion self-hit chance, then returns approximately 1/3", () => {
      // Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting
      //   itself in confusion has decreased from 50% to approximately 33%."
      const ruleset = createTestRuleset();
      expect(ruleset.getConfusionSelfHitChance()).toBeCloseTo(1 / 3, 10);
    });

    it("given a Gen7Ruleset, when getting confusion self-hit chance, then differs from Gen 6 (50%)", () => {
      // Source: Bulbapedia -- Gen 6 = 50%, Gen 7 = 33%
      const ruleset = createTestRuleset();
      const chance = ruleset.getConfusionSelfHitChance();
      expect(chance).not.toBe(0.5);
      expect(chance).toBeLessThan(0.5);
    });
  });

  describe("getStatusCatchModifiers", () => {
    it("given a Gen7Ruleset, when getting status catch modifiers, then sleep modifier is 2.5x", () => {
      // Source: Bulbapedia -- Catch rate: Gen 5+ uses 2.5x for sleep/freeze
      // Access through rollCatchAttempt indirectly -- we test the public interface
      const ruleset = createTestRuleset();
      // The getStatusCatchModifiers is protected, so we verify via behavior
      // For scaffold smoke tests, we use a type assertion to access it
      const modifiers = (ruleset as any).getStatusCatchModifiers();
      expect(modifiers.sleep).toBe(2.5);
    });

    it("given a Gen7Ruleset, when getting status catch modifiers, then freeze modifier is 2.5x", () => {
      // Source: Bulbapedia -- Catch rate: Gen 5+ uses 2.5x for sleep/freeze
      const ruleset = createTestRuleset();
      const modifiers = (ruleset as any).getStatusCatchModifiers();
      expect(modifiers.freeze).toBe(2.5);
    });
  });

  describe("recalculatesFutureAttackDamage", () => {
    it("given a Gen7Ruleset, when checking future attack damage recalculation, then returns true", () => {
      // Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
      //   Future Sight or Doom Desire hits, not when it is used."
      const ruleset = createTestRuleset();
      expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
    });
  });

  describe("hasAbilities", () => {
    it("given a Gen7Ruleset, when checking hasAbilities, then returns true", () => {
      // Source: Abilities have existed since Gen 3
      const ruleset = createTestRuleset();
      expect(ruleset.hasAbilities()).toBe(true);
    });
  });

  describe("hasHeldItems", () => {
    it("given a Gen7Ruleset, when checking hasHeldItems, then returns true", () => {
      // Source: Held items have existed since Gen 2
      const ruleset = createTestRuleset();
      expect(ruleset.hasHeldItems()).toBe(true);
    });
  });

  describe("getBattleGimmick", () => {
    it("given a Gen7Ruleset, when getting battle gimmick for zmove, then returns Gen7ZMove instance", () => {
      // Source: Showdown sim/battle-actions.ts -- Z-Moves are a Gen 7 BattleGimmick
      const ruleset = createTestRuleset();
      const gimmick = ruleset.getBattleGimmick("zmove");
      expect(gimmick).not.toBeNull();
      expect(gimmick!.name).toBe("Z-Move");
    });

    it("given a Gen7Ruleset, when getting battle gimmick for mega, then returns Gen7MegaEvolution instance", () => {
      // Source: Bulbapedia "Mega Evolution" -- available in Gen 7 (Sun/Moon/USUM)
      const ruleset = createTestRuleset();
      const gimmick = ruleset.getBattleGimmick("mega");
      expect(gimmick).not.toBeNull();
      expect(gimmick!.name).toBe("Mega Evolution");
    });
  });
});
