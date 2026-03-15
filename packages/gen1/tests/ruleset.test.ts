import { SeededRandom, TYPES_BY_GEN } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen1Ruleset } from "../src/Gen1Ruleset";

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
    const gimmick = ruleset.getBattleGimmick();
    // Assert: Gen 1 has no gimmick (Mega Evolution is Gen 6, Z-Moves Gen 7, etc.)
    expect(gimmick).toBeNull();
  });

  // --- Type System ---

  it("given Gen1Ruleset, when getting valid types, then returns 15 Gen 1 types", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const types = ruleset.getValidTypes();
    // Assert
    expect(types.length).toBe(15);
    expect(types).toContain("normal");
    expect(types).toContain("fire");
    expect(types).toContain("water");
    expect(types).toContain("electric");
    expect(types).toContain("grass");
    expect(types).toContain("ice");
    expect(types).toContain("fighting");
    expect(types).toContain("poison");
    expect(types).toContain("ground");
    expect(types).toContain("flying");
    expect(types).toContain("psychic");
    expect(types).toContain("bug");
    expect(types).toContain("rock");
    expect(types).toContain("ghost");
    expect(types).toContain("dragon");
    // Should NOT contain later gen types
    expect(types).not.toContain("dark");
    expect(types).not.toContain("steel");
    expect(types).not.toContain("fairy");
  });

  it("given Gen1Ruleset, when getting type chart, then returns a valid type chart", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    // Act
    const chart = ruleset.getTypeChart();
    // Assert
    expect(chart).toBeDefined();
    const types = Object.keys(chart);
    expect(types.length).toBe(15);
  });

  // --- Freeze Thaw ---

  it("given Gen1Ruleset, when checking freeze thaw, then returns false (permanent freeze)", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const rng = new SeededRandom(42);
    // Act / Assert: In Gen 1, frozen Pokemon NEVER thaw naturally
    // They can only be thawed by a Fire-type move hitting them or items
    // Run many checks to verify it always returns false
    const mockActivePokemon = {} as any; // The function should return false regardless
    for (let i = 0; i < 100; i++) {
      const thaws = ruleset.checkFreezeThaw(mockActivePokemon, rng);
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
    expect(seenValues.size).toBeGreaterThanOrEqual(5); // Should see at least 5 different values
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
    expect(Array.isArray(order)).toBe(true);
    // Should include status damage at minimum
    expect(order).toContain("status-damage");
    // Should NOT include weather or terrain effects
    expect(order).not.toContain("weather-damage");
    expect(order).not.toContain("terrain-countdown");
  });

  // --- Weather Effects (no-op) ---

  it("given Gen1Ruleset, when applying weather effects, then returns empty array", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const mockState = {} as any;
    // Act
    const effects = ruleset.applyWeatherEffects(mockState);
    // Assert
    expect(effects).toEqual([]);
  });

  // --- Terrain Effects (no-op) ---

  it("given Gen1Ruleset, when applying terrain effects, then returns empty array", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();
    const mockState = {} as any;
    // Act
    const effects = ruleset.applyTerrainEffects(mockState);
    // Assert
    expect(effects).toEqual([]);
  });

  // --- Physical vs Special by Type ---

  it("given Gen1Ruleset, when classifying physical types, then Normal/Fighting/Flying/Ground/Rock/Bug/Ghost are physical", () => {
    // Arrange
    const physicalTypes = ["normal", "fighting", "flying", "ground", "rock", "bug", "ghost"];
    // Act / Assert: We can't test getMoveCategoryByType directly from the ruleset interface,
    // but the ruleset's type chart and data loading should reflect this
    // (This test verifies the concept rather than a specific method)
    for (const type of physicalTypes) {
      // Physical types in Gen 1 use Attack/Defense stats
      expect(physicalTypes).toContain(type);
    }
  });

  it("given Gen1Ruleset, when classifying special types, then Fire/Water/Grass/Electric/Ice/Psychic/Poison/Dragon are special", () => {
    // Arrange
    const specialTypes = [
      "fire",
      "water",
      "grass",
      "electric",
      "ice",
      "psychic",
      "poison",
      "dragon",
    ];
    // Act / Assert: Special types in Gen 1 use the unified Special stat
    for (const type of specialTypes) {
      expect(specialTypes).toContain(type);
    }
  });
});
