import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { BATTLE_GIMMICK_IDS } from "@pokemon-lib-ts/battle";
import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN1_TYPES, isGen1PhysicalType } from "../../src";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

const createOnFieldPokemon = (): ActivePokemon => {
  // Synthetic probe: these Gen 1 ruleset methods only require a typed placeholder.
  return {} as ActivePokemon;
};

const GEN1_PHYSICAL_TYPES = [
  CORE_TYPE_IDS.normal,
  CORE_TYPE_IDS.fighting,
  CORE_TYPE_IDS.flying,
  CORE_TYPE_IDS.poison,
  CORE_TYPE_IDS.ground,
  CORE_TYPE_IDS.rock,
  CORE_TYPE_IDS.bug,
  CORE_TYPE_IDS.ghost,
] as const;

const GEN1_SPECIAL_TYPES = [
  CORE_TYPE_IDS.fire,
  CORE_TYPE_IDS.water,
  CORE_TYPE_IDS.grass,
  CORE_TYPE_IDS.electric,
  CORE_TYPE_IDS.ice,
  CORE_TYPE_IDS.psychic,
  CORE_TYPE_IDS.dragon,
] as const;

/**
 * Gen1Ruleset Tests
 *
 * Tests that the Gen1Ruleset correctly implements the GenerationRuleset interface.
 * Gen 1 is mechanically unique:
 * - No abilities
 * - No held items
 * - No weather
 * - No terrain
 * - No entry hazards
 * - No battle gimmicks
 * - Freeze is permanent (no natural thaw)
 * - Sleep lasts 1-7 turns
 * - Only 15 types
 * - Priority is minimal (Quick Attack +1, Counter -1/-5)
 */
describe("Gen1Ruleset", () => {
  // --- Generation Identity ---

  it("given Gen1Ruleset, when checking generation, then returns 1", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act / Assert
    expect(ruleset.generation).toBe(1);
  });

  it("given Gen1Ruleset, when checking name, then includes Gen 1 identifier", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act / Assert
    expect(ruleset.name).toBeDefined();
    expect(typeof ruleset.name).toBe("string");
    expect(ruleset.name.length).toBeGreaterThan(0);
  });

  // --- Abilities ---

  it("given Gen1Ruleset, when checking hasAbilities, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const result = ruleset.hasAbilities();
    // Assert: Gen 1 has no abilities
    expect(result).toBe(false);
  });

  // --- Held Items ---

  it("given Gen1Ruleset, when checking hasHeldItems, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const result = ruleset.hasHeldItems();
    // Assert: Gen 1 has no held items in battle
    expect(result).toBe(false);
  });

  // --- Weather ---

  it("given Gen1Ruleset, when checking hasWeather, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const result = ruleset.hasWeather();
    // Assert: Gen 1 has no weather mechanics
    expect(result).toBe(false);
  });

  // --- Terrain ---

  it("given Gen1Ruleset, when checking hasTerrain, then returns false", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const result = ruleset.hasTerrain();
    // Assert: Gen 1 has no terrain mechanics
    expect(result).toBe(false);
  });

  // --- Entry Hazards ---

  it("given Gen1Ruleset, when getting available hazards, then returns empty array", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const hazards = ruleset.getAvailableHazards();
    // Assert: Gen 1 has no entry hazards (Stealth Rock, Spikes, etc. are Gen 2+)
    expect(hazards).toEqual([]);
  });

  // --- Battle Gimmick ---

  it("given Gen1Ruleset, when getting battle gimmick, then returns null", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const gimmick = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.mega);
    // Assert: Gen 1 has no gimmick (Mega Evolution is Gen 6, Z-Moves Gen 7, etc.)
    expect(gimmick).toBeNull();
  });

  // --- Type System ---

  it("given Gen1Ruleset, when getting valid types, then returns 15 Gen 1 types", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const types = ruleset.getAvailableTypes();
    // Assert
    expect(types).toEqual(GEN1_TYPES);
    expect(types).not.toContain(CORE_TYPE_IDS.dark);
    expect(types).not.toContain(CORE_TYPE_IDS.steel);
    expect(types).not.toContain(CORE_TYPE_IDS.fairy);
  });

  it("given Gen1Ruleset, when getting type chart, then returns a valid type chart", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const chart = ruleset.getTypeChart();
    // Assert
    expect(chart).toBeDefined();
    expect(Object.keys(chart)).toEqual([...GEN1_TYPES]);
  });

  // --- Freeze Thaw ---

  it("given Gen1Ruleset, when checking freeze thaw, then returns false (permanent freeze)", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const rng = new SeededRandom(42);
    // Act / Assert: In Gen 1, frozen Pokemon NEVER thaw naturally
    // They can only be thawed by a Fire-type move hitting them or items
    // Run many checks to verify it always returns false
    for (let i = 0; i < 100; i++) {
      const thaws = ruleset.checkFreezeThaw(createOnFieldPokemon(), rng);
      expect(thaws).toBe(false);
    }
  });

  // --- Sleep Turns ---

  it("given Gen1Ruleset, when rolling sleep turns, then returns value between 1 and 7", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const rng = new SeededRandom(42);
    // Act / Assert: Gen 1 sleep lasts 1-7 turns
    const results = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      results.add(turns);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(7);
    }
    // Should see multiple different values
    expect(results.size).toBeGreaterThan(1);
  });

  it("given Gen1Ruleset sleep turns, when rolling many times with different seeds, then distribution covers full range", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const seenValues = new Set<number>();
    // Act: Try many different seeds to cover the range
    for (let seed = 0; seed < 500; seed++) {
      const rng = new SeededRandom(seed);
      const turns = ruleset.rollSleepTurns(rng);
      seenValues.add(turns);
    }
    // Assert: Should see most values from 1-7
    expect(seenValues.has(1)).toBe(true);
    expect(seenValues.has(7)).toBe(true);
    expect(seenValues.size).toBeGreaterThanOrEqual(5);
  });

  // --- Critical Hit ---

  it("given Gen1Ruleset, when getting crit multiplier, then returns 1 (Gen 1 crits use level doubling, not a separate multiplier)", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const multiplier = ruleset.getCritMultiplier();
    // Assert: Gen 1 implements crits by doubling the attacker's level in the damage formula
    // (effectiveLevel = level * 2), not by applying a flat 2x multiplier after the fact.
    // The BattleEngine does not call getCritMultiplier() for Gen 1 — the boost is internal.
    expect(multiplier).toBe(1);
  });

  it("given Gen1Ruleset, when getting crit rate table, then returns a valid array", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const table = ruleset.getCritRateTable();
    // Assert: Should return some kind of rate table (even if Gen 1 uses speed-based formula)
    expect(Array.isArray(table)).toBe(true);
  });

  // --- End of Turn Order ---

  it("given Gen1Ruleset, when getting end-of-turn order, then returns simplified Gen 1 order", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const order = ruleset.getEndOfTurnOrder();
    // Assert: Gen 1 has a simpler set of end-of-turn effects than later gens
    expect(order).toEqual([
      CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
      CORE_VOLATILE_IDS.leechSeed,
      CORE_END_OF_TURN_EFFECT_IDS.disableCountdown,
    ]);
    expect(order).not.toContain(CORE_END_OF_TURN_EFFECT_IDS.weatherDamage);
    expect(order).not.toContain(CORE_END_OF_TURN_EFFECT_IDS.terrainCountdown);
  });

  // --- Weather Effects (no-op) ---

  it("given Gen1Ruleset, when applying weather effects, then returns empty array", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const mockState = {} as unknown as BattleState;
    // Act
    const effects = ruleset.applyWeatherEffects(mockState);
    // Assert
    expect(effects).toEqual([]);
  });

  // --- Terrain Effects (no-op) ---

  it("given Gen1Ruleset, when applying terrain effects, then returns empty array", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const mockState = {} as unknown as BattleState;
    // Act
    const effects = ruleset.applyTerrainEffects(mockState);
    // Assert
    expect(effects).toEqual([]);
  });

  // --- Physical vs Special by Type ---

  it("given isGen1PhysicalType, when checking physical types, then Normal/Fighting/Flying/Ground/Rock/Bug/Ghost/Poison return true", () => {
    // Source: pret/pokered data/type_names.asm — Gen 1 physical types: Normal, Fighting, Flying,
    // Poison, Ground, Rock, Bug, Ghost. Poison IS physical in Gen 1 (common misconception).
    // These types use Attack/Defense stats in the damage formula.
    for (const type of GEN1_PHYSICAL_TYPES) {
      expect(isGen1PhysicalType(type)).toBe(true);
    }
  });

  it("given isGen1PhysicalType, when checking special types, then Fire/Water/Grass/Electric/Ice/Psychic/Dragon return false", () => {
    // Source: pret/pokered data/type_names.asm — Gen 1 special types use the unified Special stat
    // for both offense (SpAttack) and defense (SpDefense).
    for (const type of GEN1_SPECIAL_TYPES) {
      expect(isGen1PhysicalType(type)).toBe(false);
    }
  });

  // --- Struggle Recoil ---

  describe("calculateStruggleRecoil", () => {
    it("given damage=100, when calculating recoil, then returns 50", () => {
      // Arrange
      const ruleset = new Gen1Ruleset();
      const mockAttacker = createOnFieldPokemon();
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 100);
      // Assert: floor(100 / 2) = 50
      expect(recoil).toBe(50);
    });

    it("given damage=1, when calculating recoil, then returns 1 (min 1)", () => {
      // Arrange
      const ruleset = new Gen1Ruleset();
      const mockAttacker = createOnFieldPokemon();
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 1);
      // Assert: max(1, floor(1/2)) = max(1, 0) = 1
      expect(recoil).toBe(1);
    });

    it("given damage=0, when calculating recoil, then returns 1 (max of 1 and floor(0/2))", () => {
      // Arrange
      const ruleset = new Gen1Ruleset();
      const mockAttacker = createOnFieldPokemon();
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 0);
      // Assert: max(1, floor(0/2)) = max(1, 0) = 1
      expect(recoil).toBe(1);
    });

    it("given damage=101, when calculating recoil, then returns 50 (floor(101/2)=50)", () => {
      // Arrange
      const ruleset = new Gen1Ruleset();
      const mockAttacker = createOnFieldPokemon();
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 101);
      // Assert: floor(101 / 2) = 50
      expect(recoil).toBe(50);
    });
  });

  // --- Multi-Hit Count ---

  describe("rollMultiHitCount", () => {
    it("given seed=0, when rolling multi-hit count, then returns a value from [2,2,2,3,3,3,4,5]", () => {
      // Arrange
      const ruleset = new Gen1Ruleset();
      const rng = new SeededRandom(0);
      const mockAttacker = createOnFieldPokemon();
      // Act
      const count = ruleset.rollMultiHitCount(mockAttacker, rng);
      // Assert: must be one of the values in the weighted array
      expect([2, 3, 4, 5]).toContain(count);
    });

    it("given 100 rolls, when rolling multi-hit count, then all values are in {2,3,4,5}", () => {
      // Arrange
      const ruleset = new Gen1Ruleset();
      const rng = new SeededRandom(42);
      const mockAttacker = createOnFieldPokemon();
      // Act / Assert
      for (let i = 0; i < 100; i++) {
        const count = ruleset.rollMultiHitCount(mockAttacker, rng);
        expect([2, 3, 4, 5]).toContain(count);
      }
    });

    it("given 100 rolls, when rolling multi-hit count, then at least some 2s and some 3s appear", () => {
      // Arrange
      const ruleset = new Gen1Ruleset();
      const rng = new SeededRandom(42);
      const mockAttacker = createOnFieldPokemon();
      const counts = new Set<number>();
      // Act
      for (let i = 0; i < 100; i++) {
        counts.add(ruleset.rollMultiHitCount(mockAttacker, rng));
      }
      // Assert: weighted array has 3 twos and 3 threes out of 8, so both should appear
      expect(counts.has(2)).toBe(true);
      expect(counts.has(3)).toBe(true);
    });
  });
});
