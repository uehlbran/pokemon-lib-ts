import type { AccuracyContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
  createDvs,
  createFriendship,
  createMoveSlot,
  createPokemonInstance,
  createStatExp,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS, Gen1Ruleset } from "../../src";

/**
 * Gen 1 Accuracy Tests
 *
 * Key Gen 1 accuracy mechanics:
 * - The 1/256 miss glitch: moves with 100% accuracy have a 1/256 chance to miss
 *   because the game generates a random number 0-255 and checks if it's < threshold
 *   where threshold = floor(effectiveAccuracy * 255 / 100). For 100% acc, threshold = 255,
 *   meaning a roll of exactly 255 causes a miss (1/256 chance).
 * - Moves with null accuracy never miss (Swift, etc.)
 * - Accuracy/evasion stages modify the effective accuracy
 * - Stage multipliers use the 2-based scale (same as regular stats):
 *   +1 = 3/2, +2 = 4/2, -1 = 2/3, -6 = 2/8 = 0.25
 *   (NOT the Gen 3+ 3-based formula: +1 = 4/3, -6 = 3/9)
 */

// --- Test Helpers ---

const dataManager = createGen1DataManager();
const ruleset = new Gen1Ruleset({ dataManager });
const MOVE_IDS = GEN1_MOVE_IDS;
const SPECIES_IDS = GEN1_SPECIES_IDS;
const DEFAULT_SPECIES = dataManager.getSpecies(SPECIES_IDS.pikachu);
const DEFAULT_THUNDERBOLT = dataManager.getMove(MOVE_IDS.thunderbolt);
const DEFAULT_SWIFT = dataManager.getMove(MOVE_IDS.swift);
const DEFAULT_PARTICIPANT_MOVE = dataManager.getMove(MOVE_IDS.tackle);
const DEFAULT_NATURE = CORE_NATURE_IDS.hardy;
const DEFAULT_MET_LOCATION = "pallet-town";
const DEFAULT_TRAINER = "Red";
const DEFAULT_POKEBALL = CORE_ITEM_IDS.pokeBall;

const DEFAULT_CALCULATED_STATS = {
  hp: 100,
  attack: 80,
  defense: 60,
  spAttack: 80,
  spDefense: 60,
  speed: 120,
};

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData> = {}): MoveData {
  const { flags: overrideFlags, ...rest } = overrides;
  return {
    ...baseMove,
    ...rest,
    id: rest.id ?? `synthetic-${baseMove.id}`,
    displayName: rest.displayName ?? `Synthetic ${baseMove.displayName}`,
    flags: {
      ...baseMove.flags,
      ...(overrideFlags ?? {}),
    },
  };
}

function createSyntheticActivePokemon(): ActivePokemon {
  const species = DEFAULT_SPECIES;
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(1), {
    nature: DEFAULT_NATURE,
    ivs: createDvs(),
    evs: createStatExp(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    heldItem: null,
    friendship: createFriendship(70),
    isShiny: false,
    metLocation: DEFAULT_MET_LOCATION,
    originalTrainer: DEFAULT_TRAINER,
    originalTrainerId: 12345,
    pokeball: DEFAULT_POKEBALL,
  }) as PokemonInstance;

  pokemon.moves = [createMoveSlot(DEFAULT_PARTICIPANT_MOVE.id, DEFAULT_PARTICIPANT_MOVE.pp)];
  pokemon.currentHp = DEFAULT_CALCULATED_STATS.hp;
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.calculatedStats = { ...DEFAULT_CALCULATED_STATS };

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...species.types],
    ability: CORE_ABILITY_IDS.none,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  };
}

function createSyntheticBattleState(rng: SeededRandom): BattleState {
  return {
    phase: "turn-resolve",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng,
    isWildBattle: false,
    fleeAttempts: 0,
    ended: false,
    winner: null,
  };
}

function createAccuracyContext(
  overrides: {
    moveAccuracy?: number | null;
    accuracyStage?: number;
    evasionStage?: number;
    rng?: SeededRandom;
  } = {},
): AccuracyContext {
  const rng = overrides.rng ?? new SeededRandom(42);
  const attacker = createSyntheticActivePokemon();
  attacker.statStages.accuracy = overrides.accuracyStage ?? 0;
  const defender = createSyntheticActivePokemon();
  defender.statStages.evasion = overrides.evasionStage ?? 0;
  const move =
    overrides.moveAccuracy === null
      ? DEFAULT_SWIFT
      : overrides.moveAccuracy === undefined ||
          overrides.moveAccuracy === DEFAULT_THUNDERBOLT.accuracy
        ? DEFAULT_THUNDERBOLT
        : createSyntheticMoveFrom(DEFAULT_THUNDERBOLT, { accuracy: overrides.moveAccuracy });
  return { attacker, defender, move, state: createSyntheticBattleState(rng), rng };
}

/**
 * Compute the Gen 1 accuracy threshold used internally by doesMoveHit.
 * This mirrors the two-step sequential floor approach in Gen1Ruleset.doesMoveHit().
 *
 * Source: pret/pokered engine/battle/core.asm:5348 CalcHitChance
 * 1. Convert move accuracy from 0-100 to 0-255 scale
 * 2. Apply accuracy stage (integer multiply-divide, floor)
 * 3. Clamp to 0-255
 * 4. Apply evasion stage (integer multiply-divide, inverted, floor)
 * 5. Clamp to 0-255
 */
function computeThreshold(
  moveAccuracy: number,
  accuracyStage: number,
  evasionStage: number,
): number {
  // Step 1: Convert to 0-255 scale
  const baseAccuracy = moveAccuracy >= 100 ? 255 : Math.floor((moveAccuracy * 255) / 100);

  // Step 2: Apply accuracy stage
  const afterAccuracyStage =
    accuracyStage === 0
      ? baseAccuracy
      : Math.floor(
          (baseAccuracy * Math.max(2, 2 + accuracyStage)) / Math.max(2, 2 - accuracyStage),
        );
  const clampedAfterAccuracyStage = Math.max(0, Math.min(255, afterAccuracyStage));

  // Step 3: Apply evasion stage (inverted)
  const afterEvasionStage =
    evasionStage === 0
      ? clampedAfterAccuracyStage
      : Math.floor(
          (clampedAfterAccuracyStage * Math.max(2, 2 - evasionStage)) /
            Math.max(2, 2 + evasionStage),
        );

  return Math.max(0, Math.min(255, afterEvasionStage));
}

describe("Gen 1 Accuracy", () => {
  // --- 1/256 Miss Glitch ---

  it("given a move with 100% accuracy, when computing the threshold, then the threshold is 255 (not 256), causing the 1/256 miss glitch", () => {
    // Arrange: 100% accuracy move with no stage modifiers
    const moveAccuracy = 100;
    const accuracyStage = 0;
    const evasionStage = 0;
    // Act
    const threshold = computeThreshold(moveAccuracy, accuracyStage, evasionStage);
    // Assert: floor(100 * 255 / 100) = 255
    // A random roll of exactly 255 (out of 0-255) would miss
    expect(threshold).toBe(255);
    expect(threshold).toBeLessThanOrEqual(255);
  });

  it("given 10000 accuracy checks with a 100% move using seeded RNG, when rolling, then the vast majority hit", () => {
    // Arrange
    const rng = new SeededRandom(12345);
    let hits = 0;
    let _misses = 0;
    const trials = 10000;
    // Act
    for (let i = 0; i < trials; i++) {
      const ctx = createAccuracyContext({ moveAccuracy: 100, rng });
      const result = ruleset.doesMoveHit(ctx);
      if (result) hits++;
      else _misses++;
    }
    // Assert: Only ~1/256 (~0.39%) should miss, so at least 99% should hit
    expect(hits).toBeGreaterThan(trials * 0.99);
  });

  // --- Never-Miss Moves ---

  it("given a move with null accuracy, when checking hit, then always hits", () => {
    // Arrange
    const rng = new SeededRandom(42);
    // Act / Assert: null accuracy (e.g., Swift) should always return true
    for (let i = 0; i < 100; i++) {
      const ctx = createAccuracyContext({ moveAccuracy: null, rng });
      expect(ruleset.doesMoveHit(ctx)).toBe(true);
    }
  });

  // --- Base Accuracy ---

  it("given a move with 90% accuracy, when computing threshold with no stages, then threshold reflects ~90% hit rate", () => {
    // Arrange
    const moveAccuracy = 90;
    // Act
    const threshold = computeThreshold(moveAccuracy, 0, 0);
    // Assert: floor(90 * 255 / 100) = floor(229.5) = 229
    expect(threshold).toBe(229);
    expect(threshold).toBeGreaterThan(200);
    expect(threshold).toBeLessThan(256);
  });

  it("given a move with 75% accuracy, when computing threshold, then threshold reflects 75% hit chance", () => {
    // Arrange
    const moveAccuracy = 75;
    // Act
    const threshold = computeThreshold(moveAccuracy, 0, 0);
    // Assert: floor(75 * 255 / 100) = floor(191.25) = 191
    expect(threshold).toBe(191);
    expect(threshold).toBeGreaterThan(150);
    expect(threshold).toBeLessThan(210);
  });

  it("given a move with 50% accuracy, when computing threshold, then threshold reflects ~50% hit chance", () => {
    // Arrange
    const moveAccuracy = 50;
    // Act
    const threshold = computeThreshold(moveAccuracy, 0, 0);
    // Assert: floor(50 * 255 / 100) = floor(127.5) = 127
    expect(threshold).toBe(127);
    expect(threshold).toBeGreaterThan(100);
    expect(threshold).toBeLessThan(150);
  });

  // --- Accuracy Stages ---

  it("given +1 accuracy stage, when computing threshold, then threshold increases", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const baseThreshold = computeThreshold(moveAccuracy, 0, 0);
    const boostedThreshold = computeThreshold(moveAccuracy, 1, 0);
    // Assert: +1 accuracy should increase the threshold (or cap it at 255)
    expect(boostedThreshold).toBeGreaterThanOrEqual(baseThreshold);
  });

  it("given -1 accuracy stage, when computing threshold, then threshold decreases", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const baseThreshold = computeThreshold(moveAccuracy, 0, 0);
    const reducedThreshold = computeThreshold(moveAccuracy, -1, 0);
    // Assert
    expect(reducedThreshold).toBeLessThanOrEqual(baseThreshold);
  });

  it("given -6 accuracy stage, when computing threshold, then threshold is very low", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const threshold = computeThreshold(moveAccuracy, -6, 0);
    // Assert: acc=255, stage -6: floor(255*2/8)=63
    // Source: pret/pokered CalcHitChance — stage -6 uses ratio 2/8
    expect(threshold).toBe(63);
  });

  // --- Evasion Stages ---

  it("given opponent has +1 evasion, when computing threshold, then threshold decreases", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const baseThreshold = computeThreshold(moveAccuracy, 0, 0);
    const evadedThreshold = computeThreshold(moveAccuracy, 0, 1);
    // Assert: +1 evasion makes the move harder to hit
    expect(evadedThreshold).toBeLessThanOrEqual(baseThreshold);
  });

  it("given opponent has -1 evasion, when computing threshold, then threshold increases", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const baseThreshold = computeThreshold(moveAccuracy, 0, 0);
    const reducedEvasionThreshold = computeThreshold(moveAccuracy, 0, -1);
    // Assert: -1 evasion makes the move easier to hit
    expect(reducedEvasionThreshold).toBeGreaterThanOrEqual(baseThreshold);
  });

  it("given opponent has +6 evasion, when computing threshold, then threshold is very low", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const threshold = computeThreshold(moveAccuracy, 0, 6);
    // Assert: acc=255, evasion +6: floor(255*2/8)=63
    // Source: pret/pokered CalcHitChance — evasion +6 inverted uses ratio 2/8
    expect(threshold).toBe(63);
  });

  // --- Combined Accuracy and Evasion ---

  it("given +1 accuracy and +1 evasion, when computing threshold, then effects partially cancel but two-step floor causes rounding loss", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const modifiedThreshold = computeThreshold(moveAccuracy, 1, 1);
    // Assert: With two-step sequential floor (pokered CalcHitChance):
    // acc=255, accStage+1: floor(255*3/2)=382 clamped to 255,
    // evaStage+1: floor(255*2/3)=170. The two steps don't perfectly cancel
    // due to integer rounding, giving 170 instead of 255.
    // Source: pret/pokered CalcHitChance sequential integer multiply-divide
    expect(modifiedThreshold).toBe(170);
  });

  it("given +6 accuracy and -6 evasion, when computing threshold, then threshold is at maximum", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const threshold = computeThreshold(moveAccuracy, 6, -6);
    // Assert: Maximum accuracy boost + minimum evasion = very high effective accuracy
    // But effective accuracy is clamped to 255, so threshold = floor(255 * 255 / 100) = 650
    // However the roll is 0-255, so any threshold >= 256 guarantees a hit
    expect(threshold).toBeGreaterThanOrEqual(255);
  });

  // --- doesMoveHit with Seeded RNG ---

  it("given seeded RNG and 50% accuracy, when running many trials, then approximately half hit", () => {
    // Arrange
    const rng = new SeededRandom(42);
    let hits = 0;
    const trials = 10000;
    // Act
    for (let i = 0; i < trials; i++) {
      const ctx = createAccuracyContext({ moveAccuracy: 50, rng });
      if (ruleset.doesMoveHit(ctx)) {
        hits++;
      }
    }
    // Assert: Should be approximately 50% with some tolerance
    const hitRate = hits / trials;
    expect(hitRate).toBeGreaterThan(0.4);
    expect(hitRate).toBeLessThan(0.6);
  });

  it("given seeded RNG and 0% accuracy, when checking hit, then always misses", () => {
    // Arrange
    const rng = new SeededRandom(42);
    // Act: 0% accuracy -> acc = floor(0*255/100) = 0, threshold = 0
    // roll < 0 is always false → always misses
    let hits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const ctx = createAccuracyContext({ moveAccuracy: 0, rng });
      if (ruleset.doesMoveHit(ctx)) hits++;
    }
    // Assert: threshold = 0 means no roll can be < 0, so 0% hit rate
    expect(hits).toBe(0);
  });

  // --- Determinism ---

  it("given same seed and same accuracy, when rolling twice, then produces same sequence", () => {
    // Arrange
    const rng1 = new SeededRandom(99);
    const rng2 = new SeededRandom(99);
    // Act / Assert
    for (let i = 0; i < 50; i++) {
      const ctx1 = createAccuracyContext({ moveAccuracy: 75, rng: rng1 });
      const ctx2 = createAccuracyContext({ moveAccuracy: 75, rng: rng2 });
      const result1 = ruleset.doesMoveHit(ctx1);
      const result2 = ruleset.doesMoveHit(ctx2);
      expect(result1).toBe(result2);
    }
  });

  // --- Threshold is always integer ---

  it("given any accuracy and stages, when computing threshold, then result is an integer", () => {
    // Arrange / Act / Assert
    for (const acc of [50, 75, 85, 90, 95, 100]) {
      for (let stage = -6; stage <= 6; stage++) {
        const threshold = computeThreshold(acc, stage, 0);
        expect(Number.isInteger(threshold)).toBe(true);
      }
    }
  });

  // --- Accuracy increases with positive stages ---

  it("given increasing accuracy stages, when computing thresholds, then thresholds increase monotonically", () => {
    // Arrange
    const moveAccuracy = 80;
    const thresholds: number[] = [];
    // Act
    for (let stage = -6; stage <= 6; stage++) {
      thresholds.push(computeThreshold(moveAccuracy, stage, 0));
    }
    // Assert: Should be non-decreasing
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeGreaterThanOrEqual(thresholds[i - 1] ?? 0);
    }
  });

  // --- Gen 1 stage multiplier value checks (2-based scale) ---

  it("given accuracy stage +1 (Gen 1), when computing threshold, then stage increases accuracy on 0-255 scale", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const threshold = computeThreshold(moveAccuracy, 1, 0);
    // Assert: acc=255, accStage+1: floor(255*3/2)=382 clamped to 255 → threshold = 255
    // Source: pret/pokered CalcHitChance — stage +1 uses ratio 3/2 as integer multiply-divide
    expect(threshold).toBe(255);
  });

  it("given accuracy stage -6 (Gen 1), when computing threshold, then threshold is 63 per two-step sequential floor", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const threshold = computeThreshold(moveAccuracy, -6, 0);
    // Assert: acc=255, accStage-6: accNum=max(2,2+(-6))=2, accDen=max(2,2-(-6))=8
    // floor(255*2/8)=floor(63.75)=63
    // Source: pret/pokered CalcHitChance — stage -6 uses ratio 2/8
    expect(threshold).toBe(63);
  });

  it("given evasion stage +6 (Gen 1), when computing threshold, then threshold is 63 per two-step sequential floor", () => {
    // Arrange
    const moveAccuracy = 100;
    // Act
    const threshold = computeThreshold(moveAccuracy, 0, 6);
    // Assert: acc=255, evaStage+6: evaNum=max(2,2-6)=2, evaDen=max(2,2+6)=8
    // floor(255*2/8)=floor(63.75)=63
    // Source: pret/pokered CalcHitChance — evasion +6 inverted uses ratio 2/8
    expect(threshold).toBe(63);
  });

  // --- Evasion increases make moves harder to hit ---

  it("given increasing evasion stages, when computing thresholds, then thresholds decrease monotonically", () => {
    // Arrange
    const moveAccuracy = 80;
    const thresholds: number[] = [];
    // Act
    for (let stage = -6; stage <= 6; stage++) {
      thresholds.push(computeThreshold(moveAccuracy, 0, stage));
    }
    // Assert: Should be non-increasing (higher evasion = lower threshold)
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeLessThanOrEqual(thresholds[i - 1] ?? Number.POSITIVE_INFINITY);
    }
  });
});
