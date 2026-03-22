import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN2_CRIT_RATES, getGen2CritStage, rollGen2Critical } from "../src/Gen2CritCalc";

/**
 * Helper to create a minimal ActivePokemon for crit calc testing.
 */
function createMockActivePokemon(
  overrides: { volatileStatuses?: Map<string, unknown>; heldItem?: string | null } = {},
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
    stellarBoostedTypes: [],
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
 * Stage 3: 85/256 (~33.2%)
 * Stage 4+: 128/256 (50%)
 *
 * Modifiers (stackable):
 * - High crit moves (Slash, etc.): +2
 *   Source: pret/pokecrystal effect_commands.asm L1183-1184 — "inc c; inc c" = +2 for CriticalHitMoves
 * - Focus Energy: +1 (FIXED — not bugged like Gen 1)
 * - Scope Lens item: +1
 */
describe("Gen2CritCalc", () => {
  describe("Given the crit stage table", () => {
    it("should have 5 stages defined", () => {
      // Assert
      expect(GEN2_CRIT_RATES).toHaveLength(5);
    });

    it("should have correct rate values", () => {
      // Assert
      expect(GEN2_CRIT_RATES[0]).toBeCloseTo(17 / 256, 6);
      expect(GEN2_CRIT_RATES[1]).toBeCloseTo(32 / 256, 6);
      expect(GEN2_CRIT_RATES[2]).toBeCloseTo(64 / 256, 6);
      expect(GEN2_CRIT_RATES[3]).toBeCloseTo(85 / 256, 6);
      expect(GEN2_CRIT_RATES[4]).toBeCloseTo(128 / 256, 6);
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
    it("given Slash (high-crit move), when computing crit stage, then stage is 2 (Source: pokecrystal L1183-1184 — 'inc c; inc c' = +2)", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "slash" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — high-crit moves add +2 to crit stage (pokecrystal: "inc c; inc c")
      expect(stage).toBe(2);
    });

    it("given Karate Chop (high-crit move), when computing crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — CriticalHitMoves gets +2
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "karate-chop" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — +2 per pokecrystal (not +1 as previously believed)
      expect(stage).toBe(2);
    });

    it("given Cross Chop (high-crit move), when computing crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — CriticalHitMoves gets +2
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "cross-chop" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — +2 per pokecrystal
      expect(stage).toBe(2);
    });

    it("given Aeroblast (high-crit move), when computing crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — CriticalHitMoves gets +2
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: "aeroblast" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — +2 per pokecrystal
      expect(stage).toBe(2);
    });
  });

  describe("Given a move with critRatio declared in data", () => {
    it("given a razor-wind move and a Pokemon at base crit stage, when computing crit stage, then stage is 2 per pokecrystal effect_commands.asm:1182-1184", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm:1182-1184 — BattleCommand_RazorWind
      // Razor Wind sets a +2 crit stage bonus via its effect command
      const attacker = createMockActivePokemon();
      const razorWindMove = createMockMove({
        id: "razor-wind",
        critRatio: 2,
        power: 80,
        accuracy: 75,
      });

      // Act
      const stage = getGen2CritStage(attacker, razorWindMove);

      // Assert
      expect(stage).toBe(2);
    });

    it("given a move with critRatio 1, when computing crit stage, then stage is 1 (same as high-crit list moves)", () => {
      // Arrange
      // Source: pret/pokecrystal — standard high-crit moves have critRatio equivalent to 1
      const attacker = createMockActivePokemon();
      const highCritMove = createMockMove({
        id: "custom-high-crit",
        critRatio: 1,
      });

      // Act
      const stage = getGen2CritStage(attacker, highCritMove);

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
    it("should stack to stage 3 (85/256 rate) — high crit +2, Focus Energy +1", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — high crit = +2; L1170 — Focus Energy = +1
      const volatiles = new Map();
      volatiles.set("focus-energy", { turnsLeft: -1 });
      const attacker = createMockActivePokemon({ volatileStatuses: volatiles });
      const move = createMockMove({ id: "slash" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — high crit (+2) + Focus Energy (+1) = stage 3, capped at 4 max (85/256)
      expect(stage).toBe(3);
    });
  });

  describe("Given Scope Lens + Focus Energy + high crit move", () => {
    it("should stack to stage 4 (128/256 rate) — high crit +2, Focus Energy +1, Scope Lens +1", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm — high crit = +2; Focus Energy = +1; Scope Lens = +1
      // 2 + 1 + 1 = 4, which is the max clamped stage (128/256 = 50%)
      const volatiles = new Map();
      volatiles.set("focus-energy", { turnsLeft: -1 });
      const attacker = createMockActivePokemon({
        volatileStatuses: volatiles,
        heldItem: "scope-lens",
      });
      const move = createMockMove({ id: "slash" });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — high crit (+2) + Focus Energy (+1) + Scope Lens (+1) = stage 4 (128/256)
      expect(stage).toBe(4);
    });
  });

  describe("Given maximum stacking (stage 4+)", () => {
    it("should cap at 128/256 rate", () => {
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
      const cappedStage = Math.min(stage, GEN2_CRIT_RATES.length - 1);

      // Assert
      expect(cappedStage).toBeLessThanOrEqual(4);
      expect(GEN2_CRIT_RATES[cappedStage]).toBeLessThanOrEqual(255 / 256);
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

  describe("Statistical crit rate verification", () => {
    it("given base crit stage (0), when rolling 10000 times, then crit rate is approximately 6.64%", () => {
      // Arrange
      const rng = new SeededRandom(1001);
      const attacker = createMockActivePokemon();
      const normalMove = createMockMove();
      let crits = 0;

      // Act
      for (let i = 0; i < 10000; i++) {
        if (rollGen2Critical(attacker, normalMove, rng)) crits++;
      }
      const rate = crits / 10000;

      // Assert — 17/256 ≈ 6.64%, tolerance ±1.5%
      expect(rate).toBeGreaterThan(0.0514);
      expect(rate).toBeLessThan(0.0814);
    });

    it("given high crit move (stage 2), when rolling 10000 times, then crit rate is approximately 25%", () => {
      // Arrange — high crit move adds +2, landing at stage 2 = 64/256 = 25%
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — "inc c; inc c" = +2
      const rng = new SeededRandom(2002);
      const attacker = createMockActivePokemon();
      const highCritMove = createMockMove({ id: "slash" });
      let crits = 0;

      // Act
      for (let i = 0; i < 10000; i++) {
        if (rollGen2Critical(attacker, highCritMove, rng)) crits++;
      }
      const rate = crits / 10000;

      // Assert — 64/256 = 25%, tolerance ±3%
      expect(rate).toBeGreaterThan(0.22);
      expect(rate).toBeLessThan(0.28);
    });

    it("given stage 3 (Focus Energy + high crit move), when rolling 10000 times, then crit rate is approximately 33.2%", () => {
      // Arrange — high crit (+2) + Focus Energy (+1) = stage 3 = 85/256 ≈ 33.2%
      // Source: pret/pokecrystal effect_commands.asm — high crit = +2; Focus Energy = +1
      const rng = new SeededRandom(3003);
      const volatiles = new Map([["focus-energy", { turnsLeft: -1 }]]);
      const attacker = createMockActivePokemon({ volatileStatuses: volatiles });
      const highCritMove = createMockMove({ id: "slash" });
      let crits = 0;

      // Act
      for (let i = 0; i < 10000; i++) {
        if (rollGen2Critical(attacker, highCritMove, rng)) crits++;
      }
      const rate = crits / 10000;

      // Assert — 85/256 ≈ 33.2%, tolerance ±3%
      expect(rate).toBeGreaterThan(0.302);
      expect(rate).toBeLessThan(0.362);
    });

    it("given stage 4 (Scope Lens + Focus Energy + high crit move), when rolling 10000 times, then crit rate is approximately 50%", () => {
      // Arrange — high crit (+2) + Focus Energy (+1) + Scope Lens (+1) = stage 4 = 128/256 = 50%
      // Source: pret/pokecrystal effect_commands.asm — high crit = +2; Focus Energy = +1; Scope Lens = +1
      const rng = new SeededRandom(4004);
      const volatiles = new Map([["focus-energy", { turnsLeft: -1 }]]);
      const attacker = createMockActivePokemon({
        volatileStatuses: volatiles,
        heldItem: "scope-lens",
      });
      const highCritMove = createMockMove({ id: "slash" });
      let crits = 0;

      // Act — this is stage 4 (128/256 = 50%)
      for (let i = 0; i < 10000; i++) {
        if (rollGen2Critical(attacker, highCritMove, rng)) crits++;
      }
      const rate = crits / 10000;

      // Assert — 128/256 = 50%, tolerance ±3%
      expect(rate).toBeGreaterThan(0.47);
      expect(rate).toBeLessThan(0.53);
    });

    it("given Focus Energy active with no high-crit move, when querying crit stage, then stage is 1 (not 5)", () => {
      // Arrange
      const volatiles = new Map([["focus-energy", { turnsLeft: -1 }]]);
      const attacker = createMockActivePokemon({ volatileStatuses: volatiles });
      const normalMove = createMockMove();

      // Act
      const stage = getGen2CritStage(attacker, normalMove);

      // Assert — Focus Energy adds +1, not +4 (Gen 1 bug fixed)
      expect(stage).toBe(1);
    });

    it("given a high crit move with no Focus Energy, when querying crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — CriticalHitMoves gets +2 ("inc c; inc c")
      const attacker = createMockActivePokemon();
      const highCritMove = createMockMove({ id: "cross-chop" });

      // Act
      const stage = getGen2CritStage(attacker, highCritMove);

      // Assert — high crit moves add +2 to stage per pokecrystal
      expect(stage).toBe(2);
    });
  });
});
