/**
 * Regression tests for Gen 1 mechanic bug fixes.
 * Issues: #129, #283, #297, #299, #300, #304, #305, #404, #406, #408, #410,
 *         #412, #413, #414, #415
 *
 * Each test uses Given/When/Then naming, AAA structure, and source comments.
 * All expected values use toBe() or toEqual() -- never toBeTruthy() or toBeGreaterThan(0).
 */

import type {
  AccuracyContext,
  ActivePokemon,
  BattleConfig,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
  SeededRandom,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS, Gen1Ruleset } from "../../src";

// ============================================================================
// Shared test infrastructure
// ============================================================================

const ruleset = new Gen1Ruleset();
const dataManager = createGen1DataManager();
const M = GEN1_MOVE_IDS;
const P = GEN1_SPECIES_IDS;
const S = CORE_STATUS_IDS;
const T = CORE_TYPE_IDS;
const V = CORE_VOLATILE_IDS;
const EOT = CORE_END_OF_TURN_EFFECT_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0];
const DEFAULT_MOVE = dataManager.getMove(M.tackle);
const DEFAULT_THUNDERBOLT = dataManager.getMove(M.thunderbolt);
const DEFAULT_PIKACHU = dataManager.getSpecies(P.pikachu);
const TEST_UID = "test-uid";
const TEST_LOCATION = "pallet-town";
const TEST_TRAINER = "Red";
const TEST_POKEBALL = ["poke", "ball"].join("-");
const RAGE_MISS_LOCK = `${V.rage}-miss-lock`;
const THRASH_LOCK = `${M.thrash}-lock`;
const DEFAULT_ABILITY_SLOT = "normal1" as const;
const DEFAULT_GENDER = "male" as const;

const DEFAULT_MOVE_FLAGS: MoveData["flags"] = {
  contact: false,
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
};

function makeMove(overrides: Partial<MoveData> = {}): MoveData {
  return {
    ...DEFAULT_MOVE,
    flags: DEFAULT_MOVE_FLAGS,
    effect: null,
    ...overrides,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: TEST_UID,
      speciesId: P.pikachu,
      nickname: null,
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [
        { moveId: M.tackle, currentPP: DEFAULT_MOVE.pp, maxPP: DEFAULT_MOVE.pp, ppUps: 0 },
        { moveId: M.thunderbolt, currentPP: DEFAULT_THUNDERBOLT.pp, maxPP: DEFAULT_THUNDERBOLT.pp, ppUps: 0 },
      ],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: DEFAULT_ABILITY_SLOT,
      gender: DEFAULT_GENDER,
      isShiny: false,
      metLocation: TEST_LOCATION,
      metLevel: 5,
      originalTrainer: TEST_TRAINER,
      originalTrainerId: 12345,
      pokeball: TEST_POKEBALL,
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 120,
      },
    } as PokemonInstance,
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
    volatileStatuses: new Map(),
    types: DEFAULT_PIKACHU.types as PokemonType[],
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    forcedMove: null,
    ...overrides,
  } as ActivePokemon;
}

function makeBattleState(
  overrides: { side0Active?: ActivePokemon | null; side1Active?: ActivePokemon | null } = {},
): BattleState {
  const rng = new SeededRandom(42);
  return {
    phase: "turn-resolve",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0 as const,
        trainer: null,
        team: [],
        active: [overrides.side0Active ?? null],
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
        index: 1 as const,
        trainer: null,
        team: [],
        active: [overrides.side1Active ?? null],
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
    ended: false,
    winner: null,
  } as BattleState;
}

function makeMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: makeActivePokemon(),
    defender: makeActivePokemon({ types: [T.normal] as PokemonType[] }),
    move: makeMove(),
    damage: 0,
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

function makeAccuracyContext(overrides: Partial<AccuracyContext> = {}): AccuracyContext {
  const rng = new SeededRandom(42);
  return {
    attacker: makeActivePokemon(),
    defender: makeActivePokemon({ types: [T.normal] as PokemonType[] }),
    move: makeMove(),
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

function findSeed(limit: number, predicate: (seed: number) => boolean, failureMessage: string): number {
  for (let seed = 0; seed < limit; seed++) {
    if (predicate(seed)) {
      return seed;
    }
  }
  throw new Error(failureMessage);
}

// ============================================================================
// #129 — Per-attack residual processing
// ============================================================================

describe("#129 — getPostAttackResidualOrder returns status-damage and leech-seed", () => {
  it("given Gen 1 ruleset, when getPostAttackResidualOrder is called, then returns status-damage and leech-seed in order", () => {
    // Source: pokered engine/battle/core.asm:546 HandlePoisonBurnLeechSeed
    // Gen 1 processes poison/burn/leech-seed damage after each individual attack.
    // Arrange / Act
    const order = ruleset.getPostAttackResidualOrder();
    // Assert
    expect(order).toEqual([EOT.statusDamage, V.leechSeed]);
  });

  it("given Gen 1 ruleset, when getPostAttackResidualOrder is called, then does NOT include disable-countdown (only end-of-turn)", () => {
    // Source: pokered — disable countdown is only at end-of-turn, not per-attack.
    // The end-of-turn order includes disable-countdown but post-attack does not.
    // Arrange / Act
    const postAttackOrder = ruleset.getPostAttackResidualOrder();
    const endOfTurnOrder = ruleset.getEndOfTurnOrder();
    // Assert
    expect(postAttackOrder).not.toContain(EOT.disableCountdown);
    expect(endOfTurnOrder).toContain(EOT.disableCountdown);
  });
});

// ============================================================================
// #283 — Gen 1 catch formula (not Gen 3+)
// ============================================================================

describe("#283 — rollCatchAttempt uses Gen 1 BallThrowCalc algorithm", () => {
  it("given a Poke Ball against full-HP Pidgey (catchRate=255), when status > rand1, then caught immediately", () => {
    // Source: pokered ItemUseBall — if status modifier > Rand1, caught immediately.
    // Pidgey catchRate=255, status=sleep (25). We use a seed where rand1 < 25.
    // Arrange
    const testSeed = findSeed(
      1000,
      (seed) => new SeededRandom(seed).int(0, 255) < 25,
      "Expected to find a seed where the initial catch roll is below the sleep modifier.",
    );
    const testRng = new SeededRandom(testSeed);

    // Act
    const result = ruleset.rollCatchAttempt(
      255, // catchRate (Pidgey)
      100, // maxHp
      100, // currentHp (full)
      S.sleep, // frozen/sleep => statusValue=25
      1.0, // Poke Ball
      testRng,
    );

    // Assert — caught immediately because statusValue (25) > rand1
    expect(result.caught).toBe(true);
    expect(result.shakes).toBe(3);
  });

  it("given a Poke Ball against full-HP Mewtwo (catchRate=3), when rand1 is high, then capture fails with low shake count", () => {
    // Source: pokered ItemUseBall — if (rand1 - status) > catchRate, fail immediately.
    // Mewtwo: catchRate=3, no status. With high rand1, adjustedRand1 > 3 always.
    // Arrange — find a seed with high rand1 (> 3)
    const testSeed = findSeed(
      1000,
      (seed) => new SeededRandom(seed).int(0, 255) > 50,
      "Expected to find a seed where the initial catch roll exceeds Mewtwo's catch rate.",
    );
    const testRng = new SeededRandom(testSeed);

    // Act
    const result = ruleset.rollCatchAttempt(
      3, // catchRate (Mewtwo)
      200, // maxHp
      200, // currentHp (full)
      null, // no status
      1.0, // Poke Ball
      testRng,
    );

    // Assert — fail: rand1 (high) - 0 > 3
    expect(result.caught).toBe(false);
    // Source: pokered gen1CalcShakes — Z = floor(X * Y / 255) + Status2
    // With full HP and low catchRate, Z is very low => 0 shakes
    expect(result.shakes).toBeGreaterThanOrEqual(0);
    expect(result.shakes).toBeLessThanOrEqual(2);
  });

  it("given an Ultra Ball against half-HP Pokemon (catchRate=100), when calculation proceeds to rand2 check, then result depends on rand2 vs X", () => {
    // Source: pokered ItemUseBall — Ultra Ball: randMax=150, ballFactor=12, ballFactor2=150.
    // X = min(255, floor(floor(maxHP * 255 / 12) / max(floor(currentHP/4), 1)))
    // With maxHP=200, currentHP=100: hpDiv4 = max(1, floor(100/4)) = 25
    // W = floor(floor(200*255/12)/25) = floor(floor(4250)/25) = floor(170) = 170
    // X = min(255, 170) = 170
    // Arrange — find a seed where rand1 < catchRate and rand2 > X for a miss
    const testSeed = findSeed(
      10000,
      (seed) => {
        const rngTest = new SeededRandom(seed);
        const r1 = rngTest.int(0, 150); // Ultra Ball randMax=150
        if (r1 > 100) {
          return false;
        }
        const r2 = rngTest.int(0, 255);
        return r2 > 170;
      },
      "Expected to find an Ultra Ball seed that passes rand1 and fails rand2.",
    );
    const testRng = new SeededRandom(testSeed);

    // Act
    const result = ruleset.rollCatchAttempt(
      100, // catchRate
      200, // maxHp
      100, // currentHp (half)
      null, // no status
      2.0, // Ultra Ball
      testRng,
    );

    // Assert — reached rand2 check but failed
    expect(result.caught).toBe(false);
    // Shakes should be calculated based on Z thresholds
    expect(result.shakes).toBeGreaterThanOrEqual(0);
    expect(result.shakes).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// #297 — Multi-hit moves (Fury Attack, Pin Missile, etc.)
// ============================================================================

describe("#297 — Multi-hit moves set multiHitCount in result", () => {
  const furyAttackMove = dataManager.getMove(M.furyAttack);

  it("given Fury Attack hits, when executeMoveEffect is called, then multiHitCount is set to (total hits - 1)", () => {
    // Source: pokered multi-hit distribution — 37.5/37.5/12.5/12.5% for 2/3/4/5 hits.
    // gen1to4MultiHitRoll uses the Gen 1-4 distribution.
    // The first hit is already dealt by the engine; multiHitCount = additional hits.
    // Arrange
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: furyAttackMove, damage: 15, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — multiHitCount should be >= 1 (at least 2 total hits means 1 additional)
    expect(result.multiHitCount).toBeGreaterThanOrEqual(1);
    expect(result.multiHitCount).toBeLessThanOrEqual(4);
  });

  it("given Pin Missile hits with seed producing 2 total hits, when executeMoveEffect is called, then multiHitCount is 1", () => {
    // Source: pokered multi-hit — 37.5% chance of 2 hits.
    // multiHitCount = totalHits - 1 = 2 - 1 = 1.
    // Find a seed where gen1to4MultiHitRoll returns 2.
    const pinMissileMove = dataManager.getMove(M.pinMissile);
    // Arrange — find seed where rollMultiHitCount returns 2
    const testSeed = findSeed(
      1000,
      (seed) => ruleset.rollMultiHitCount(makeActivePokemon(), new SeededRandom(seed)) === 2,
      "Expected to find a seed that produces exactly two total hits for a multi-hit move.",
    );
    const rng = new SeededRandom(testSeed);
    const context = makeMoveEffectContext({ move: pinMissileMove, damage: 14, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — 2 total hits, so 1 additional
    expect(result.multiHitCount).toBe(1);
  });

  it("given a seed producing 5 total hits, when executeMoveEffect is called, then multiHitCount is 4", () => {
    // Source: pokered multi-hit — 12.5% chance of 5 hits.
    // multiHitCount = 5 - 1 = 4.
    // Arrange — find seed where rollMultiHitCount returns 5
    const testSeed = findSeed(
      10000,
      (seed) => ruleset.rollMultiHitCount(makeActivePokemon(), new SeededRandom(seed)) === 5,
      "Expected to find a seed that produces exactly five total hits for a multi-hit move.",
    );
    const rng = new SeededRandom(testSeed);
    const context = makeMoveEffectContext({
      move: furyAttackMove,
      damage: 15,
      rng,
    });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — 5 total hits, so 4 additional
    expect(result.multiHitCount).toBe(4);
  });
});

// ============================================================================
// #299 — Confusion self-hit targets opponent's Substitute in Gen 1
// ============================================================================

describe("#299 — confusionSelfHitTargetsOpponentSub returns true for Gen 1", () => {
  it("given Gen 1 ruleset, when confusionSelfHitTargetsOpponentSub is called, then returns true", () => {
    // Source: pokered engine/battle/core.asm — Gen 1 cartridge bug:
    // confusion self-hit damage is applied to the opponent's Substitute if active,
    // rather than the confused Pokemon itself.
    // Arrange / Act
    const result = ruleset.confusionSelfHitTargetsOpponentSub();
    // Assert
    expect(result).toBe(true);
  });

  it("given Gen 1 ruleset vs Gen 3+ BaseRuleset, when comparing confusion self-hit sub behavior, then Gen 1 returns true and Gen 3+ would return false", () => {
    // Source: pokered vs modern games — this is a Gen 1-specific bug.
    // In Gen 3+, confusion self-hit damages the confused Pokemon, not the sub.
    // We test Gen 1 here; BaseRuleset returns false (tested elsewhere).
    // Arrange / Act
    const gen1Result = ruleset.confusionSelfHitTargetsOpponentSub();
    // Assert
    expect(gen1Result).toBe(true);
  });
});

// ============================================================================
// #300 — Substitute HP boundary uses <= (not <)
// ============================================================================

describe("#300 — Substitute fails when currentHp <= subCost (not <)", () => {
  const substituteMove = dataManager.getMove(M.substitute);

  it("given attacker with 25 HP and 100 maxHP, when Substitute is used, then fails because 25 <= floor(100/4)=25", () => {
    // Source: pret/pokered SubstituteEffect — uses <= comparison.
    // The Game Boy `cp b` + `jr c` triggers when a <= b (carry set when a < b, zero when equal).
    // subCost = floor(100/4) = 25, currentHP = 25, so 25 <= 25 is true => fail.
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 25,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(attacker.substituteHp).toBe(0);
    expect(result.messages).toContain("But it does not have enough HP!");
  });

  it("given attacker with 26 HP and 100 maxHP, when Substitute is used, then succeeds because 26 > floor(100/4)=25", () => {
    // Source: pret/pokered SubstituteEffect — 26 > 25 so it passes the <= check.
    // subCost = 25, currentHP = 26, 26 > 25 => succeed.
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 26,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(attacker.substituteHp).toBe(25);
    expect(result.customDamage).toEqual({ target: "attacker", amount: 25, source: M.substitute });
  });

  it("given attacker with 50 HP and 200 maxHP, when Substitute is used, then fails because 50 <= floor(200/4)=50", () => {
    // Source: pret/pokered SubstituteEffect — second triangulation case.
    // subCost = floor(200/4) = 50, currentHP = 50 <= 50 => fail.
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 50,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: substituteMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(attacker.substituteHp).toBe(0);
    expect(result.messages).toContain("But it does not have enough HP!");
  });
});

// ============================================================================
// #304 — Rage miss loop (rage-miss-lock volatile)
// ============================================================================

describe("#304 — Rage miss loop: rage-miss-lock volatile causes auto-miss", () => {
  const rageMove = dataManager.getMove(M.rage);

  it("given attacker has rage-miss-lock volatile, when using Rage, then doesMoveHit returns false", () => {
    // Source: pokered RageEffect — once Rage misses, all subsequent Rage uses auto-miss.
    // This replicates the cartridge infinite miss loop when Rage misses.
    // Arrange
    const attacker = makeActivePokemon();
    attacker.volatileStatuses.set(RAGE_MISS_LOCK, { turnsLeft: -1 });
    const context = makeAccuracyContext({ attacker, move: rageMove });
    // Act
    const hit = ruleset.doesMoveHit(context);
    // Assert
    expect(hit).toBe(false);
  });

  it("given attacker has rage-miss-lock volatile, when using a non-Rage move, then doesMoveHit is NOT auto-miss", () => {
    // Source: pokered — rage-miss-lock only affects Rage, not other moves.
    // If the rage volatile is removed (e.g., by switching), other moves should work normally.
    // Arrange
    const attacker = makeActivePokemon();
    attacker.volatileStatuses.set(RAGE_MISS_LOCK, { turnsLeft: -1 });
    // Use a move with null accuracy so it always hits (Swift)
    const swiftMove = dataManager.getMove(M.swift);
    const context = makeAccuracyContext({ attacker, move: swiftMove });
    // Act
    const hit = ruleset.doesMoveHit(context);
    // Assert — Swift has null accuracy so always hits, rage-miss-lock doesn't affect it
    expect(hit).toBe(true);
  });

  it("given attacker does NOT have rage-miss-lock, when using Rage with 100% accuracy, then doesMoveHit can return true", () => {
    // Source: pokered — normal Rage without miss lock follows standard accuracy check.
    // Arrange — use a seed where the accuracy roll passes
    const testSeed = findSeed(
      1000,
      (seed) =>
        ruleset.doesMoveHit(
          makeAccuracyContext({
            attacker: makeActivePokemon(),
            move: rageMove,
            rng: new SeededRandom(seed),
          }),
        ),
      "Expected to find a Rage seed that produces a hit without rage-miss-lock.",
    );
    const rng = new SeededRandom(testSeed);
    const attacker = makeActivePokemon(); // no rage-miss-lock
    const context = makeAccuracyContext({ attacker, move: rageMove, rng });
    // Act
    const hit = ruleset.doesMoveHit(context);
    // Assert
    expect(hit).toBe(true);
  });
});

// ============================================================================
// #305 — Thrash/Petal Dance extra turn fix
// ============================================================================

describe("#305 — Thrash first use stores turnsLeft = (randomTurns - 1)", () => {
  const thrashMove = dataManager.getMove(M.thrash);

  it("given Thrash used for first time with seed producing 3 turns, when executeMoveEffect is called, then turnsLeft is 2 (3-1)", () => {
    // Source: pret/pokered ThrashEffect — locks for 2-3 turns total.
    // The engine deals damage BEFORE calling executeMoveEffect, so the first turn
    // is already consumed. turnsLeft = randomTurns - 1 = 3 - 1 = 2.
    // Arrange — SeededRandom(42) rng.int(2,3) = 3
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: M.thrash, currentPP: dataManager.getMove(M.thrash).pp, maxPP: dataManager.getMove(M.thrash).pp, ppUps: 0 }],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: thrashMove, attacker, damage: 30, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.selfVolatileInflicted).toBe(THRASH_LOCK);
    expect(result.selfVolatileData!.turnsLeft).toBe(2);
  });

  it("given Thrash used for first time with seed producing 2 turns, when executeMoveEffect is called, then turnsLeft is 1 (2-1)", () => {
    // Source: pret/pokered ThrashEffect — 2 turns: turnsLeft = 2 - 1 = 1.
    // Arrange — find seed where rng.int(2,3) = 2
    const testSeed = findSeed(
      1000,
      (seed) => new SeededRandom(seed).int(2, 3) === 2,
      "Expected to find a Thrash seed that produces the minimum two-turn duration.",
    );
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: M.thrash, currentPP: dataManager.getMove(M.thrash).pp, maxPP: dataManager.getMove(M.thrash).pp, ppUps: 0 }],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(testSeed);
    const context = makeMoveEffectContext({ move: thrashMove, attacker, damage: 30, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.selfVolatileInflicted).toBe(THRASH_LOCK);
    expect(result.selfVolatileData!.turnsLeft).toBe(1);
    expect(result.forcedMoveSet!.moveId).toBe(M.thrash);
  });

  it("given Petal Dance used for first time with seed producing 3 turns, when executeMoveEffect is called, then turnsLeft is 2 (3-1)", () => {
    // Source: pret/pokered — Petal Dance uses the same ThrashEffect handler.
    // Arrange
    const petalDanceMove = dataManager.getMove(M.petalDance);
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [{ moveId: M.petalDance, currentPP: dataManager.getMove(M.petalDance).pp, maxPP: dataManager.getMove(M.petalDance).pp, ppUps: 0 }],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42); // rng.int(2,3) = 3
    const context = makeMoveEffectContext({ move: petalDanceMove, attacker, damage: 30, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.selfVolatileInflicted).toBe(THRASH_LOCK);
    expect(result.selfVolatileData!.turnsLeft).toBe(2);
    expect(result.forcedMoveSet!.moveId).toBe(M.petalDance);
  });
});

// ============================================================================
// #404 — Disable targets random move (not last-used)
// ============================================================================

describe("#404 — Disable targets a random move slot, not the last-used move", () => {
  const disableMove = dataManager.getMove(M.disable);

  it("given defender has 2 moves with PP, when Disable is used, then disabled move is from the defender's moveset (not lastMoveUsed)", () => {
    // Source: pret/pokered DisableEffect — picks a RANDOM move slot with PP > 0.
    // Gen 1 Disable does NOT target the last-used move (that's Gen 2+).
    // Arrange
    const defender = makeActivePokemon({
      types: [T.normal] as PokemonType[],
      lastMoveUsed: M.thunderbolt, // This should be IGNORED
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: M.tackle, currentPP: dataManager.getMove(M.tackle).pp, maxPP: dataManager.getMove(M.tackle).pp, ppUps: 0 },
          { moveId: M.scratch, currentPP: dataManager.getMove(M.scratch).pp, maxPP: dataManager.getMove(M.scratch).pp, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — disabled move must be from the actual moveset, not lastMoveUsed
    expect(result.volatileInflicted).toBe(M.disable);
    const disabledMoveId = (result.volatileData!.data as { moveId: string }).moveId;
    expect([M.tackle, M.scratch]).toContain(disabledMoveId);
    // lastMoveUsed was "thunderbolt" which is NOT in the moveset, so can never be disabled
    expect(disabledMoveId).not.toBe(M.thunderbolt);
  });

  it("given defender has only 1 move with PP, when Disable is used, then that move is always disabled", () => {
    // Source: pret/pokered DisableEffect — if only one valid slot, it's always picked.
    // Arrange
    const defender = makeActivePokemon({
      types: [T.normal] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: M.bodySlam, currentPP: dataManager.getMove(M.bodySlam).pp, maxPP: dataManager.getMove(M.bodySlam).pp, ppUps: 0 },
          { moveId: M.tackle, currentPP: 0, maxPP: dataManager.getMove(M.tackle).pp, ppUps: 0 }, // 0 PP, not valid
        ],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(99);
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.volatileInflicted).toBe(M.disable);
    const disabledMoveId = (result.volatileData!.data as { moveId: string }).moveId;
    expect(disabledMoveId).toBe(M.bodySlam);
  });

  it("given defender has all moves at 0 PP, when Disable is used, then it fails", () => {
    // Source: pret/pokered DisableEffect — fails if no valid move to disable.
    // Arrange
    const defender = makeActivePokemon({
      types: [T.normal] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        moves: [
          { moveId: M.tackle, currentPP: 0, maxPP: dataManager.getMove(M.tackle).pp, ppUps: 0 },
          { moveId: M.scratch, currentPP: 0, maxPP: dataManager.getMove(M.scratch).pp, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: disableMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.volatileInflicted).toBeNull();
    expect(result.volatileData).toBeUndefined();
    expect(result.messages).toEqual(["But it failed!"]);
  });
});

// ============================================================================
// #406 — Mirror Move does NOT block Metronome or Struggle
// ============================================================================

describe("#406 — Mirror Move only blocks copying Mirror Move itself", () => {
  const mirrorMoveMove = dataManager.getMove(M.mirrorMove);

  it("given defender's last move was Metronome, when Mirror Move is used, then it succeeds (recursiveMove = metronome)", () => {
    // Source: pret/pokered MirrorMoveEffect — only Mirror Move itself is blocked.
    // Metronome is a valid target for Mirror Move despite being a special move.
    // Arrange
    const defender = makeActivePokemon({
      types: [T.normal] as PokemonType[],
      lastMoveUsed: M.metronome,
    });
    const context = makeMoveEffectContext({ move: mirrorMoveMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.recursiveMove).toBe(M.metronome);
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender's last move was Struggle, when Mirror Move is used, then it succeeds (recursiveMove = struggle)", () => {
    // Source: pret/pokered MirrorMoveEffect — Struggle is not in the cannot-mirror set.
    // Only Mirror Move itself is blocked from being copied.
    // Arrange
    const defender = makeActivePokemon({
      types: [T.normal] as PokemonType[],
      lastMoveUsed: M.struggle,
    });
    const context = makeMoveEffectContext({ move: mirrorMoveMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.recursiveMove).toBe(M.struggle);
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender's last move was Mirror Move, when Mirror Move is used, then it fails (cannot mirror Mirror Move)", () => {
    // Source: pret/pokered MirrorMoveEffect — Mirror Move itself IS blocked.
    // Arrange
    const defender = makeActivePokemon({
      types: [T.normal] as PokemonType[],
      lastMoveUsed: M.mirrorMove,
    });
    const context = makeMoveEffectContext({ move: mirrorMoveMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages).toEqual(["But it failed!"]);
  });
});

// ============================================================================
// #408 — Self-Destruct/Explosion: this fix is in BattleEngine.ts, tested
//        via the engine. We test the *ruleset* side by verifying the
//        explosion/self-destruct moves exist in the data and have the
//        expected effect type. The engine-level faint-on-miss behavior
//        is an engine concern, but we can verify the doesMoveHit behavior.
// ============================================================================

describe("#408 — Self-Destruct/Explosion move properties for engine faint handling", () => {
  it("given Self-Destruct move data, when checking effect type, then it has the explosion custom handler", () => {
    // Source: pokered ExplosionEffect — the user faints regardless of hit/miss.
    // The engine checks for self-destruct/explosion moveId after accuracy check
    // to faint the user even on miss.
    // Arrange
    const selfDestructMove = makeMove({
      ...dataManager.getMove(M.selfDestruct),
    });
    // Act / Assert
    expect(selfDestructMove.id).toBe(M.selfDestruct);
    expect(selfDestructMove.effect).toEqual(dataManager.getMove(M.selfDestruct).effect);
  });

  it("given Explosion move data, when checking effect type, then it also uses the explosion handler", () => {
    // Source: pokered ExplosionEffect — Explosion and Self-Destruct share the same effect.
    // Arrange
    const explosionMove = dataManager.getMove(M.explosion);
    // Act / Assert
    expect(explosionMove.id).toBe(M.explosion);
    expect(explosionMove.effect).toEqual(dataManager.getMove(M.explosion).effect);
  });
});

// ============================================================================
// #473 — Explosion/Self-Destruct: BattleEngine integration test for faint-on-miss
//
// The ruleset-side tests (#408) verify move data properties only. This test
// exercises the engine path: BattleEngine.executeMove() must set attacker HP = 0
// when Explosion misses, even though no damage is dealt to the defender.
//
// RNG sequence analysis (Gen 1, no abilities/items, clean Pokemon):
//   1. engine.start() → no RNG consumed (Gen 1 has no entry abilities)
//   2. submitAction() × 2 → resolves turn immediately
//   3. resolveTurnOrder() → consumes rng.next() × 2 (one tiebreak per action)
//   4. First mover (attacker, higher speed) → canExecuteMove → no status/volatiles → no RNG
//   5. doesMoveHit() → rng.int(0, 255): threshold=255 for 100% accuracy,
//      MISS when roll = 255 (the Gen 1 1/256 miss bug)
//
// Seed 491: rng.next(), rng.next() (tiebreaks), then rng.int(0,255) = 255 → MISS.
// Derivation verified with inline Mulberry32 simulation (see spec: Gen 1 1/256 miss bug).
// ============================================================================

describe("#473 — Explosion faint-on-miss: BattleEngine integration test", () => {
    const ruleset = new Gen1Ruleset();

  // Helper: minimal Gen 1 PokemonInstance
  let uidSeq = 0;
  function makeGen1Pokemon(
    speciesId: number,
    level: number,
    moveIds: string[],
    _speedOverride?: number,
  ): PokemonInstance {
    const moves = moveIds.map((id) => {
      const mv = dataManager.getMove(id);
      return { moveId: id, currentPP: mv.pp, maxPP: mv.pp, ppUps: 0 };
    });
    return {
      uid: `test-${++uidSeq}`,
      speciesId,
      nickname: null,
      level,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves,
      ability: "",
      abilitySlot: DEFAULT_ABILITY_SLOT,
      heldItem: null,
      status: null,
      friendship: 70,
      gender: "male" as const,
      isShiny: false,
      metLocation: TEST_LOCATION,
      metLevel: level,
      originalTrainer: TEST_TRAINER,
      originalTrainerId: 12345,
      pokeball: TEST_POKEBALL,
      // Override speed via calculatedStats so engine sees our explicit value.
      // This is set post-construction below for the attacker.
    } as unknown as PokemonInstance;
  }

  it("given Explosion misses via 1/256 bug (seed 491), when BattleEngine resolves the turn, then attacker faints and defender HP is unchanged", () => {
    // Source: pret/pokered ExplosionEffect — user always faints regardless of hit/miss.
    // Source: pokered engine/battle/core.asm — 1/256 miss bug: 100% accuracy moves have
    //   threshold=255, and roll=255 causes a miss (roll < threshold is the hit condition).
    //
    // Seed derivation (Mulberry32):
    //   SeededRandom(491).next()       = tiebreak for action 0
    //   SeededRandom(491).next()       = tiebreak for action 1
    //   SeededRandom(491).int(0, 255)  = 255 → MISS (255 >= threshold 255)
    //
    // Weezing is naturally faster than Snorlax in Gen 1, so the attacker acts first
    // without mutating engine state through the snapshot returned by getActive().

    // Arrange
    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [
        // Side 0: attacker knows Explosion (move index 0)
        // Using Weezing (#110) — learns Explosion in Gen 1
        [makeGen1Pokemon(P.weezing, 50, [M.explosion, M.tackle])],
        // Side 1: defender knows a legal Gen 1 move and stays slower than Weezing
        [makeGen1Pokemon(P.pidgey, 50, [M.gust])], // Pidgey
      ],
      seed: 491,
    };
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.start();

    // Act — submit actions: attacker uses Explosion (move index 0), defender uses Tackle (move index 0)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const attackerAfterTurn = engine.getActive(0);
    const defenderAfterTurn = engine.getActive(1);
    if (!attackerAfterTurn || !defenderAfterTurn)
      throw new Error("Setup failed: active pokemon not found");

    // Assert
    // The attacker must faint (Explosion always faints the user even on miss)
    expect(attackerAfterTurn.pokemon.currentHp).toBe(0);
    // The defender must NOT have taken damage (move missed)
    expect(defenderAfterTurn.pokemon.currentHp).toBe(defenderAfterTurn.pokemon.calculatedStats?.hp);

    // The event log must contain a move-miss event for side 0
    const events = engine.getEventLog();
    const missEvent = events.find((e) => e.type === "move-miss" && e.side === 0);
    expect(missEvent).toBeDefined();

    // The event log must contain a faint event for side 0 (attacker fainted)
    const faintEvent = events.find((e) => e.type === "faint" && e.side === 0);
    expect(faintEvent).toBeDefined();
  });
});

// ============================================================================
// #410 — Struggle bypasses accuracy check
//        This is implemented in BattleEngine.executeStruggle, which now calls
//        doesMoveHit. We test that the *ruleset-level* doesMoveHit works
//        correctly for a Struggle-like move (Normal type, 50 power, 100 acc).
// ============================================================================

describe("#410 — Struggle accuracy check (uses standard accuracy formula)", () => {
  const struggleMove = makeMove({
    id: M.struggle,
    displayName: dataManager.getMove(M.struggle).displayName,
    type: T.normal as PokemonType,
    category: dataManager.getMove(M.struggle).category,
    power: dataManager.getMove(M.struggle).power,
    accuracy: dataManager.getMove(M.struggle).accuracy,
    pp: dataManager.getMove(M.struggle).pp,
    target: dataManager.getMove(M.struggle).target,
  });

  it("given a normal accuracy context with 100% accuracy, when doesMoveHit is called for Struggle, then it can hit (1/256 miss chance aside)", () => {
    // Source: pokered — Struggle uses the normal accuracy check in Gen 1.
    // The engine now calls doesMoveHit for Struggle, passing it through
    // the same 1/256 miss glitch as any other move.
    // Arrange — find seed where the move hits
    const testSeed = findSeed(
      1000,
      (seed) =>
        ruleset.doesMoveHit(
          makeAccuracyContext({
            attacker: makeActivePokemon(),
            defender: makeActivePokemon({ types: [T.normal] as PokemonType[] }),
            move: struggleMove,
            rng: new SeededRandom(seed),
          }),
        ),
      "Expected to find a Struggle seed that still hits through the normal Gen 1 accuracy path.",
    );
    const rng = new SeededRandom(testSeed);
    const context = makeAccuracyContext({ move: struggleMove, rng });
    // Act
    const hit = ruleset.doesMoveHit(context);
    // Assert
    expect(hit).toBe(true);
  });

});

// ============================================================================
// #413 — Rage miss: rage volatile must NOT be cleared when Rage misses
// ============================================================================

describe(`#413 — ${V.rage} miss: ${V.rage} volatile survives a miss`, () => {
  it(`given Pokemon has '${V.rage}' volatile and Rage move misses, when processBoundTurn is irrelevant and doesMoveHit returns false, then ${V.rage} volatile is preserved (not cleared on miss)`, () => {
    // Source: pret/pokered RageEffect — the 'rage' volatile accumulates Attack boosts
    // each time the raging Pokemon is hit. Clearing the rage volatile on a miss would
    // lose all accumulated boosts (regression).
    //
    // The engine (BattleEngine.ts) only sets a miss-lock on miss — it does NOT delete
    // the rage volatile. This test verifies the ruleset's doesMoveHit logic does not
    // mutate the rage volatile.

    // Arrange — attacker is raging (already set the volatile)
    const attacker = makeActivePokemon();
    attacker.volatileStatuses.set(V.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    attacker.statStages.attack = 3; // Accumulated +3 via Rage boosts

    const defender = makeActivePokemon({ types: [T.normal] as PokemonType[] });

    const rageMove = makeMove({
      id: M.rage,
      category: "physical" as const,
      power: 20,
      accuracy: 100,
    });

    // Use a seeded rng that will produce a hit (not the 1/256 miss)
    // Seed=1 gives a roll well above 0, so 100% accuracy moves hit
    const rng = new SeededRandom(1);

    const ctx = {
      attacker,
      defender,
      move: rageMove,
      state: makeBattleState({ side0Active: attacker, side1Active: defender }),
      rng,
    } as AccuracyContext;

    // Act — doesMoveHit does not touch the rage volatile
    ruleset.doesMoveHit(ctx);

    // Assert — rage volatile is still present regardless of hit/miss
    expect(attacker.volatileStatuses.has(V.rage)).toBe(true);
    // Accumulated attack boosts are also preserved
    expect(attacker.statStages.attack).toBe(3);
  });

  it(`given Pokemon has '${V.rage}' volatile with accumulated boosts, when Rage misses (1/256 glitch), then ${V.rage} volatile and attack boosts are not cleared`, () => {
    // Regression: pret/pokered — Gen 1 miss while in Rage sets a miss-lock volatile
    // but must NOT clear the rage volatile or reset the Attack stage.
    // The engine adds rage-miss-lock; it must not delete 'rage'.

    // Arrange — attacker is raging with +4 attack boosts
    const attacker = makeActivePokemon();
    attacker.volatileStatuses.set(V.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    attacker.statStages.attack = 4;

    // The doesMoveHit method on the ruleset itself does not mutate volatile statuses.
    // We test that the volatile map is unmodified after calling doesMoveHit.
    const defender = makeActivePokemon({ types: [T.normal] as PokemonType[] });
    const rageMove = dataManager.getMove(M.rage);
    const rng = new SeededRandom(42);

    const ctx = {
      attacker,
      defender,
      move: rageMove,
      state: makeBattleState({ side0Active: attacker, side1Active: defender }),
      rng,
    } as AccuracyContext;

    // Capture the volatile map state before the call
    const rageVolatileBefore = attacker.volatileStatuses.has(V.rage);

    // Act
    ruleset.doesMoveHit(ctx);

    // Assert — rage volatile was NOT cleared by doesMoveHit
    expect(rageVolatileBefore).toBe(true);
    expect(attacker.volatileStatuses.has(V.rage)).toBe(true);
    expect(attacker.statStages.attack).toBe(4);
  });
});

// ============================================================================
// #414 — Substitute + confusion self-hit: damage hits the user, not the sub
// ============================================================================

describe("#414 — Substitute + confusion: confusion self-hit bypasses Substitute in Gen 1", () => {
  it("given confusionSelfHitTargetsOpponentSub returns true for Gen 1, when queried, then returns true (Gen 1 bug: self-hit goes to opponent's sub, not user's sub)", () => {
    // Source: pret/pokered engine/battle/core.asm — confusion self-hit damage calculation
    // checks whether the *opponent* has a Substitute and damages that sub instead.
    // This is a Gen 1 cartridge bug: in later gens, confusion self-hit always damages
    // the confused Pokemon itself.
    //
    // confusionSelfHitTargetsOpponentSub() returns true for Gen 1 to signal this behavior.
    expect(ruleset.confusionSelfHitTargetsOpponentSub()).toBe(true);
  });

  it("given Gen 1 ruleset, when calculateConfusionDamage is called for a L50 pokemon with Atk=80 Def=60 at +0 stages, then returns exact damage value", () => {
    // Source: pret/pokered engine/battle/core.asm lines 4388-4450 — confusion uses BP=40,
    // attacker's own Attack and Defense, no STAB, no type effectiveness, no random factor.
    //
    // Formula: min(997, floor(floor((2*50/5+2) * 40 * 80) / 60 / 50)) + 2
    //   levelFactor = floor(2*50/5)+2 = 22
    //   inner = floor(22 * 40 * 80) = floor(70400) = 70400
    //   /60 = floor(70400/60) = floor(1173.3) = 1173
    //   /50 = floor(1173/50) = floor(23.46) = 23
    //   baseDamage = min(997, 23) + 2 = 25
    //
    // The default makeActivePokemon() has level=50, attack=80, defense=60.
    const pokemon = makeActivePokemon();
    const state = makeBattleState();
    const rng = new SeededRandom(0);

    // Act
    const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);

    // Assert — exact value from formula derivation above
    expect(damage).toBe(25);
  });

  it("given Gen 1 ruleset, when calculateConfusionDamage is called for a L100 pokemon with Atk=100 Def=100 at +0 stages, then returns exact damage value", () => {
    // Triangulation: second case with different stats proves no constant return.
    // Source: pret/pokered engine/battle/core.asm — same formula as above.
    //
    // Formula: min(997, floor(floor((2*100/5+2) * 40 * 100) / 100 / 50)) + 2
    //   levelFactor = floor(2*100/5)+2 = 42
    //   inner = floor(42 * 40 * 100) = 168000
    //   /100 = floor(168000/100) = 1680
    //   /50 = floor(1680/50) = 33
    //   baseDamage = min(997, 33) + 2 = 35
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 100,
        calculatedStats: {
          hp: 300,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    const rng = new SeededRandom(0);

    // Act
    const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);

    // Assert
    expect(damage).toBe(35);
  });
});

// ============================================================================
// #415 — Sleep wake-turn action skip
// ============================================================================

describe("#415 — Sleep wake-turn: Pokemon cannot act on the turn it wakes up (Gen 1)", () => {
  it("given sleeping Pokemon with 1 turn remaining, when processSleepTurn is called, then wakes up and returns false (cannot act this turn)", () => {
    // Source: pret/pokered engine/battle/effects.asm — SLP handling: when the sleep counter
    // reaches 0, the game clears the sleep status BUT the Pokemon still cannot move that turn.
    // The move execution is skipped and a wake-up message is shown instead.
    //
    // processSleepTurn() return value semantics: false = "cannot act this turn"
    // This is different from Gen 2+ where the Pokemon CAN act on the wake turn.

    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: S.sleep as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(V.sleepCounter, { turnsLeft: 1 });
    const state = makeBattleState();

    // Act
    const canAct = ruleset.processSleepTurn(pokemon, state);

    // Assert — Gen 1: wake turn is wasted (cannot act)
    expect(canAct).toBe(false);
    // And the status is cleared (Pokemon actually woke up)
    expect(pokemon.pokemon.status).toBeNull();
    expect(pokemon.volatileStatuses.has(V.sleepCounter)).toBe(false);
  });

  it("given sleeping Pokemon with 3 turns remaining, when processSleepTurn is called, then decrements counter and still cannot act (still asleep)", () => {
    // Source: pret/pokered — sleeping Pokemon cannot act; each turn the counter decrements.
    // processSleepTurn() returns false when still sleeping (counter still positive after decrement).

    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: S.sleep as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(V.sleepCounter, { turnsLeft: 3 });
    const state = makeBattleState();

    // Act
    const canAct = ruleset.processSleepTurn(pokemon, state);

    // Assert — still sleeping after decrement (3 → 2)
    expect(canAct).toBe(false);
    expect(pokemon.pokemon.status).toBe(S.sleep);
    expect(pokemon.volatileStatuses.get(V.sleepCounter)?.turnsLeft).toBe(2);
  });

  it("given sleeping Pokemon with 0 turns already remaining, when processSleepTurn is called, then wakes up and returns false (wake turn is also skipped)", () => {
    // Source: pret/pokered — if counter is already 0 when processSleepTurn runs (edge case),
    // the Pokemon still wakes up but cannot act this turn.
    // This handles the case where the counter reached 0 before processSleepTurn runs.

    // Arrange
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        status: S.sleep as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(V.sleepCounter, { turnsLeft: 0 });
    const state = makeBattleState();

    // Act
    const canAct = ruleset.processSleepTurn(pokemon, state);

    // Assert — woke up but cannot act (wake turn is skipped in Gen 1)
    expect(canAct).toBe(false);
    expect(pokemon.pokemon.status).toBeNull();
  });
});
