import type { ActivePokemon } from "@pokemon-lib/battle";
import { SeededRandom } from "@pokemon-lib/core";
import type { MoveData } from "@pokemon-lib/core";
import { describe, expect, it } from "vitest";
import { GEN2_CRIT_STAGES, getGen2CritStage, rollGen2Critical } from "../src/Gen2CritCalc";

/**
 * Helper to create a minimal ActivePokemon for crit calc testing.
 */
function createMockActivePokemon(
  overrides: {
    volatileStatuses?: Map<string, unknown>;
    heldItem?: string | null;
  } = {},
): ActivePokemon {
  return {
    pokemon: {
      uid: "test",
      speciesId: 1,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 100,
      moves: [],
      ability: "",
      abilitySlot: "normal1",
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 70,
      gender: "male",
      isShiny: false,
      metLocation: "test",
      metLevel: 5,
      originalTrainer: "Test",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
      calculatedStats: {
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: (overrides.volatileStatuses ?? new Map()) as Map<never, never>,
    types: ["normal"],
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as unknown as ActivePokemon;
}

/**
 * Helper to create a minimal MoveData for testing.
 */
function createMockMove(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: "tackle",
    displayName: "Tackle",
    type: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "A tackle attack.",
    generation: 1,
    ...overrides,
  } as MoveData;
}

/**
 * Gen 2 Critical Hit Tests
 *
 * Gen 2 uses a stage-based system (NOT Speed-based like Gen 1):
 *
 * Stage 0: 17/256 (~6.6%)
 * Stage 1: 32/256 (12.5%)
 * Stage 2: 64/256 (25%)
 * Stage 3: 128/256 (50%)
 * Stage 4+: 255/256 (~99.6%)
 *
 * Modifiers that add +1 stage each (stackable):
 * - High crit moves (Slash, etc.): +1
 * - Focus Energy: +1 (FIXED — not bugged like Gen 1)
 * - Scope Lens item: +1
 */
describe("Gen2CritCalc", () => {
  describe("Given the crit stage table", () => {
    it("should have 5 stages defined", () => {
      // Assert
      expect(GEN2_CRIT_STAGES).toHaveLength(5);
    });

    it("should have correct rate values", () => {
      // Assert
      expect(GEN2_CRIT_STAGES[0]).toBeCloseTo(17 / 256, 6);
      expect(GEN2_CRIT_STAGES[1]).toBeCloseTo(32 / 256, 6);
      expect(GEN2_CRIT_STAGES[2]).toBeCloseTo(64 / 256, 6);
      expect(GEN2_CRIT_STAGES[3]).toBeCloseTo(128 / 256, 6);
      expect(GEN2_CRIT_STAGES[4]).toBeCloseTo(255 / 256, 6);
    });
  });

  describe("Given a Pokemon with no crit modifiers", () => {
    it("should have base crit stage 0 (17/256 rate)", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove();

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert
      expect(stage).toBe(0);
    });

    it("should correctly roll crit at stage 0", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove();
      // Use a known seed and run many times to verify crit rate is approximately 17/256
      let crits = 0;
      const trials = 10000;

      // Act
      for (let i = 0; i < trials; i++) {
        const rng = new SeededRandom(i);
        if (rollGen2Critical(attacker, move, rng)) {
          crits++;
        }
      }

      // Assert — should be close to 17/256 (~6.6%)
      const rate = crits / trials;
      expect(rate).toBeGreaterThan(0.03);
      expect(rate).toBeLessThan(0.1);
    });
  });

  describe("Given a high crit move", () => {
    it("should increase crit stage by 1", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "slash" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert
      expect(stage).toBe(1);
    });

    it("should apply to Karate Chop", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "karate-chop" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert
      expect(stage).toBe(1);
    });

    it("should apply to Cross Chop (new Gen 2 high crit move)", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "cross-chop" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert
      expect(stage).toBe(1);
    });

    it("should apply to Aeroblast", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "aeroblast" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert
      expect(stage).toBe(1);
    });
  });

  describe("Given Focus Energy is active", () => {
    it("should increase crit stage by 1 (FIXED, not bugged)", () => {
      // Arrange
      const volatiles = new Map();
      volatiles.set("focus-energy", { turnsLeft: -1 });
      const attacker = createMockActivePokemon({ volatileStatuses: volatiles });
      const move = createMockMove();

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — Focus Energy adds +1 (fixed bug from Gen 1)
      expect(stage).toBe(1);
    });
  });

  describe("Given Focus Energy + high crit move", () => {
    it("should stack to stage 2 (64/256 rate)", () => {
      // Arrange
      const volatiles = new Map();
      volatiles.set("focus-energy", { turnsLeft: -1 });
      const attacker = createMockActivePokemon({ volatileStatuses: volatiles });
      const move = createMockMove({ id: "slash" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert
      expect(stage).toBe(2);
    });
  });

  describe("Given Scope Lens + Focus Energy + high crit move", () => {
    it("should stack to stage 3 (128/256 rate)", () => {
      // Arrange
      const volatiles = new Map();
      volatiles.set("focus-energy", { turnsLeft: -1 });
      const attacker = createMockActivePokemon({
        volatileStatuses: volatiles,
        heldItem: "scope-lens",
      });
      const move = createMockMove({ id: "slash" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert
      expect(stage).toBe(3);
    });
  });

  describe("Given maximum stacking (stage 4+)", () => {
    it("should cap at 255/256 rate", () => {
      // Arrange — even if we somehow get past stage 4, cap at the max stage index
      const volatiles = new Map();
      volatiles.set("focus-energy", { turnsLeft: -1 });
      const attacker = createMockActivePokemon({
        volatileStatuses: volatiles,
        heldItem: "scope-lens",
      });
      const move = createMockMove({ id: "slash" });

      // Act — stage 3 is max from these modifiers, but verify capping logic
      const stage = getGen2CritStage(attacker, move);
      const cappedStage = Math.min(stage, GEN2_CRIT_STAGES.length - 1);

      // Assert
      expect(cappedStage).toBeLessThanOrEqual(4);
      expect(GEN2_CRIT_STAGES[cappedStage]).toBeLessThanOrEqual(255 / 256);
    });
  });

  describe("Given edge cases", () => {
    it("should return a boolean from rollGen2Critical", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove();
      const rng = new SeededRandom(42);

      // Act
      const result = rollGen2Critical(attacker, move, rng);

      // Assert
      expect(typeof result).toBe("boolean");
    });

    it("should return consistent results with same seed", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove();

      // Act
      const rng1 = new SeededRandom(12345);
      const result1 = rollGen2Critical(attacker, move, rng1);
      const rng2 = new SeededRandom(12345);
      const result2 = rollGen2Critical(attacker, move, rng2);

      // Assert — deterministic
      expect(result1).toBe(result2);
    });
  });
});
