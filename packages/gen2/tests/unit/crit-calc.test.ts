import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_VOLATILE_IDS,
  CRIT_RATE_PROBABILITIES_GEN2,
  SeededRandom,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_CRIT_RATES,
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
  getGen2CritStage,
  rollGen2Critical,
} from "../../src";

const DATA = createGen2DataManager();
const ITEMS = GEN2_ITEM_IDS;
const MOVES = GEN2_MOVE_IDS;
const NATURES = GEN2_NATURE_IDS;
const SPECIES = GEN2_SPECIES_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_SPECIES = DATA.getSpecies(SPECIES.bulbasaur);
const DEFAULT_MOVE = DATA.getMove(MOVES.tackle);
const AVAILABLE_MOVE_IDS = new Set(DATA.getAllMoves().map((move) => move.id));
const STAGE_ZERO_TOLERANCE = 0.02;
const HIGH_CRIT_TOLERANCE = 0.03;
const DEFAULT_LEVEL = 50;
const NO_PP_UPS = 0;
const NEUTRAL_STAGE = 0;
const DEFAULT_CALCULATED_STATS = {
  hp: 100,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;

function createFocusEnergyVolatiles() {
  return new Map([[VOLATILES.focusEnergy, { turnsLeft: -1 }]]);
}

function expectRateWithinTolerance(rate: number, stage: number, tolerance: number): void {
  const expectedRate = GEN2_CRIT_RATES[stage] as number;
  expect(rate).toBeGreaterThan(expectedRate - tolerance);
  expect(rate).toBeLessThan(expectedRate + tolerance);
}

/**
 * Helper to create a minimal ActivePokemon for crit calc testing using Gen 2 data-backed defaults.
 */
function createMockActivePokemon(
  overrides: { volatileStatuses?: Map<string, unknown>; heldItem?: string | null } = {},
): ActivePokemon {
  const pokemon = createPokemonInstance(DEFAULT_SPECIES, DEFAULT_LEVEL, new SeededRandom(7), {
    nature: NATURES.hardy,
    abilitySlot: "normal1",
    gender: "male",
    isShiny: false,
    moves: [],
    heldItem: overrides.heldItem ?? null,
    friendship: 70,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 12345,
    pokeball: ITEMS.pokeBall,
  });

  pokemon.moves = [createMoveSlot(MOVES.tackle, DEFAULT_MOVE.pp, NO_PP_UPS)];
  pokemon.currentHp = DEFAULT_CALCULATED_STATS.hp;
  pokemon.calculatedStats = DEFAULT_CALCULATED_STATS;
  pokemon.ability = CORE_ABILITY_IDS.none;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      hp: NEUTRAL_STAGE,
      attack: NEUTRAL_STAGE,
      defense: NEUTRAL_STAGE,
      spAttack: NEUTRAL_STAGE,
      spDefense: NEUTRAL_STAGE,
      speed: NEUTRAL_STAGE,
      accuracy: NEUTRAL_STAGE,
      evasion: NEUTRAL_STAGE,
    },
    volatileStatuses: (overrides.volatileStatuses ?? new Map()) as Map<never, never>,
    types: DEFAULT_SPECIES.types,
    ability: CORE_ABILITY_IDS.none,
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
 * Uses actual Gen 2 move data when the move exists in the generation dataset.
 */
function createMockMove(overrides: Partial<MoveData> = {}): MoveData {
  const requestedId = overrides.id ?? MOVES.tackle;
  const baseMove = AVAILABLE_MOVE_IDS.has(requestedId)
    ? DATA.getMove(requestedId)
    : DEFAULT_MOVE;

  return {
    ...baseMove,
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

    it("given the Gen 2 crit stage table, when reading the exported rates, then they match the shared Gen 2 probability constants", () => {
      // Source: @pokemon-lib-ts/core critical-hit probability table for Gen 2.
      expect(GEN2_CRIT_RATES).toEqual(CRIT_RATE_PROBABILITIES_GEN2);
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
      const trials = 10000;

      const crits = Array.from({ length: trials }, (_, seed) =>
        rollGen2Critical(attacker, move, new SeededRandom(seed)),
      ).filter(Boolean).length;

      // Source: Gen 2 crit stage 0 rate is 17/256 per pokecrystal critical-hit threshold table.
      const rate = crits / trials;
      expectRateWithinTolerance(rate, 0, STAGE_ZERO_TOLERANCE);
    });
  });

  describe("Given a high crit move", () => {
    it("given Slash with no other crit modifiers, when computing crit stage, then stage is 2", () => {
      // Arrange
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: MOVES.slash });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — "inc c; inc c" = +2.
      expect(stage).toBe(2);
    });

    it("given Karate Chop with no other crit modifiers, when computing crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — CriticalHitMoves gets +2
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: MOVES.karateChop });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — +2 per pokecrystal (not +1 as previously believed)
      expect(stage).toBe(2);
    });

    it("given Cross Chop with no other crit modifiers, when computing crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — CriticalHitMoves gets +2
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: MOVES.crossChop });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — +2 per pokecrystal
      expect(stage).toBe(2);
    });

    it("given Aeroblast with no other crit modifiers, when computing crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — CriticalHitMoves gets +2
      const attacker = createMockActivePokemon();
      const move = createMockMove({ id: MOVES.aeroblast });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — +2 per pokecrystal
      expect(stage).toBe(2);
    });
  });

  describe("Given a move with critRatio declared in data", () => {
    it("given Razor Wind and a Pokemon at base crit stage, when computing crit stage, then stage is 2", () => {
      // Arrange
      // Source: pret/pokecrystal effect_commands.asm:1182-1184 — BattleCommand_RazorWind
      // Razor Wind sets a +2 crit stage bonus via its effect command
      const attacker = createMockActivePokemon();
      const razorWindMove = createMockMove({ id: MOVES.razorWind });

      // Act
      const stage = getGen2CritStage(attacker, razorWindMove);

      // Assert
      expect(stage).toBe(2);
    });

    it("given a synthetic move with critRatio 1, when computing crit stage, then stage is 1", () => {
      // Arrange
      // Source: pret/pokecrystal — standard high-crit moves have critRatio equivalent to 1
      const attacker = createMockActivePokemon();
      // Synthetic scenario: Gen 2 data does not expose a canonical move with critRatio 1.
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
      const volatiles = createFocusEnergyVolatiles();
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
      const volatiles = createFocusEnergyVolatiles();
      const attacker = createMockActivePokemon({ volatileStatuses: volatiles });
      const move = createMockMove({ id: MOVES.slash });

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
      const volatiles = createFocusEnergyVolatiles();
      const attacker = createMockActivePokemon({
        volatileStatuses: volatiles,
        heldItem: ITEMS.scopeLens,
      });
      const move = createMockMove({ id: MOVES.slash });

      // Act
      const stage = getGen2CritStage(attacker, move);

      // Assert — high crit (+2) + Focus Energy (+1) + Scope Lens (+1) = stage 4 (128/256)
      expect(stage).toBe(4);
    });
  });

  describe("Given maximum stacking (stage 4+)", () => {
    it("should cap at 128/256 rate", () => {
      // Arrange — even if we somehow get past stage 4, cap at the max stage index
      const volatiles = createFocusEnergyVolatiles();
      const attacker = createMockActivePokemon({
        volatileStatuses: volatiles,
        heldItem: ITEMS.scopeLens,
      });
      const move = createMockMove({ id: MOVES.slash });

      // Act — stage 3 is max from these modifiers, but verify capping logic
      const stage = getGen2CritStage(attacker, move);
      const cappedStage = Math.min(stage, GEN2_CRIT_RATES.length - 1);

      // Assert
      expect(cappedStage).toBeLessThanOrEqual(4);
      expect(GEN2_CRIT_RATES[cappedStage]).toBe(
        CRIT_RATE_PROBABILITIES_GEN2[CRIT_RATE_PROBABILITIES_GEN2.length - 1],
      );
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
      expect(result === true || result === false).toBe(true);
    });

    it("given the same RNG seed, when rolling crit twice for the same attacker and move, then both results match", () => {
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
      const trials = 10000;

      // Act
      const crits = Array.from({ length: trials }, () =>
        rollGen2Critical(attacker, normalMove, rng),
      ).filter(Boolean).length;
      const rate = crits / trials;

      // Source: stage 0 crit rate is 17/256; tolerance allows for deterministic sampling noise.
      expectRateWithinTolerance(rate, 0, STAGE_ZERO_TOLERANCE);
    });

    it("given Slash (stage 2), when rolling 10000 times, then crit rate is approximately 25%", () => {
      // Arrange — high crit move adds +2, landing at stage 2 = 64/256 = 25%
      // Source: pret/pokecrystal effect_commands.asm L1183-1184 — "inc c; inc c" = +2
      const rng = new SeededRandom(2002);
      const attacker = createMockActivePokemon();
      const highCritMove = createMockMove({ id: MOVES.slash });
      const trials = 10000;

      // Act
      const crits = Array.from({ length: trials }, () =>
        rollGen2Critical(attacker, highCritMove, rng),
      ).filter(Boolean).length;
      const rate = crits / trials;

      // Source: stage 2 crit rate is 64/256; tolerance allows for deterministic sampling noise.
      expectRateWithinTolerance(rate, 2, HIGH_CRIT_TOLERANCE);
    });

    it("given stage 3 (Focus Energy + high crit move), when rolling 10000 times, then crit rate is approximately 33.2%", () => {
      // Arrange — high crit (+2) + Focus Energy (+1) = stage 3 = 85/256 ≈ 33.2%
      // Source: pret/pokecrystal effect_commands.asm — high crit = +2; Focus Energy = +1
      const rng = new SeededRandom(3003);
      const volatiles = createFocusEnergyVolatiles();
      const attacker = createMockActivePokemon({ volatileStatuses: volatiles });
      const highCritMove = createMockMove({ id: MOVES.slash });
      const trials = 10000;

      // Act
      const crits = Array.from({ length: trials }, () =>
        rollGen2Critical(attacker, highCritMove, rng),
      ).filter(Boolean).length;
      const rate = crits / trials;

      // Source: stage 3 crit rate is 85/256; tolerance allows for deterministic sampling noise.
      expectRateWithinTolerance(rate, 3, HIGH_CRIT_TOLERANCE);
    });

    it("given stage 4 (Scope Lens + Focus Energy + Slash), when rolling 10000 times, then crit rate is approximately 50%", () => {
      // Arrange — high crit (+2) + Focus Energy (+1) + Scope Lens (+1) = stage 4 = 128/256 = 50%
      // Source: pret/pokecrystal effect_commands.asm — high crit = +2; Focus Energy = +1; Scope Lens = +1
      const rng = new SeededRandom(4004);
      const volatiles = createFocusEnergyVolatiles();
      const attacker = createMockActivePokemon({
        volatileStatuses: volatiles,
        heldItem: ITEMS.scopeLens,
      });
      const highCritMove = createMockMove({ id: MOVES.slash });
      const trials = 10000;

      // Act — this is stage 4 (128/256 = 50%)
      const crits = Array.from({ length: trials }, () =>
        rollGen2Critical(attacker, highCritMove, rng),
      ).filter(Boolean).length;
      const rate = crits / trials;

      // Source: stage 4 crit rate is 128/256; tolerance allows for deterministic sampling noise.
      expectRateWithinTolerance(rate, 4, HIGH_CRIT_TOLERANCE);
    });

    it("given Focus Energy active with no high-crit move, when querying crit stage, then stage is 1 (not 5)", () => {
      // Arrange
      const volatiles = createFocusEnergyVolatiles();
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
      const highCritMove = createMockMove({ id: MOVES.crossChop });

      // Act
      const stage = getGen2CritStage(attacker, highCritMove);

      // Assert — high crit moves add +2 to stage per pokecrystal
      expect(stage).toBe(2);
    });
  });
});
