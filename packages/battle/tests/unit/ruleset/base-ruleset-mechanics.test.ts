/**
 * BaseRuleset mechanics regression tests.
 *
 * Covers mechanics that were previously untested or only tested statistically:
 *   - rollMultiHitCount (35/35/15/15 distribution)
 *   - rollProtectSuccess (1/3^N formula, Gen 5+ default)
 *   - rollFleeSuccess (Gen 3+ escape formula)
 *   - calculateConfusionDamage (40 BP typeless physical, exact values)
 *   - calculateStruggleDamage (50 BP typeless physical, exact values)
 *   - calculateStruggleRecoil (1/4 max HP, Gen 4+ default)
 *   - calculateBindDamage (1/8 max HP, Gen 5+ default)
 *   - processPerishSong (countdown + faint)
 *   - getEndOfTurnOrder (exact ordering verified against Showdown)
 *   - calculateStats (exact non-HP stat values)
 *
 * Source authority: Showdown sim/battle-actions.ts, data/conditions.ts, data/moves.ts, data/items.ts
 */
import {
  CORE_ABILITY_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  type Generation,
  type PokemonType,
  type TypeChart,
} from "@pokemon-lib-ts/core";
import { GEN1_SPECIES_IDS } from "@pokemon-lib-ts/gen1";
import { beforeEach, describe, expect, it } from "vitest";
import type { DamageContext, DamageResult } from "../../../src/context";
import { BaseRuleset } from "../../../src/ruleset/BaseRuleset";
import type { BattleState } from "../../../src/state";
import { createOnFieldPokemon, createTestPokemon } from "../../../src/utils";

// ─── Concrete test subclass ───────────────────────────────────────────────────
class TestRuleset extends BaseRuleset {
  readonly generation: Generation = 6;
  readonly name = "Test Gen 6";

  getTypeChart(): TypeChart {
    const types = this.getAvailableTypes();
    const chart: Record<string, Record<string, number>> = {};
    for (const atk of types) {
      chart[atk] = {};
      for (const def of types) {
        chart[atk][def] = 1;
      }
    }
    return chart as TypeChart;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return Object.values(CORE_TYPE_IDS);
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
const emptyState = {} as unknown as BattleState;

// Source: Showdown sim/battle-actions.ts residualOrder values from
// data/conditions.ts, data/moves.ts, data/items.ts.
const EXPECTED_END_OF_TURN_ORDER = [
  CORE_END_OF_TURN_EFFECT_IDS.futureAttack,
  CORE_END_OF_TURN_EFFECT_IDS.wish,
  CORE_END_OF_TURN_EFFECT_IDS.weatherDamage,
  CORE_ITEM_IDS.leftovers,
  CORE_ITEM_IDS.blackSludge,
  CORE_VOLATILE_IDS.ingrain,
  CORE_VOLATILE_IDS.leechSeed,
  CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
  CORE_VOLATILE_IDS.nightmare,
  CORE_VOLATILE_IDS.curse,
  CORE_MOVE_IDS.bind,
  CORE_MOVE_IDS.perishSong,
  CORE_END_OF_TURN_EFFECT_IDS.screenCountdown,
  CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
  CORE_END_OF_TURN_EFFECT_IDS.terrainCountdown,
  CORE_END_OF_TURN_EFFECT_IDS.tailwindCountdown,
  CORE_END_OF_TURN_EFFECT_IDS.trickRoomCountdown,
  CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown,
] as const;

function createChanceCapturingRng() {
  const capture = { probability: null as number | null };
  return {
    getCapturedProbability: () => capture.probability,
    rng: {
      chance: (probability: number) => {
        capture.probability = probability;
        return false;
      },
      next: () => 0.5,
      int: () => 0,
    } as unknown as SeededRandom,
  };
}

describe("BaseRuleset — rollMultiHitCount", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given a seeded RNG, when rollMultiHitCount is called 2000 times, then distribution is 35/35/15/15 for 2/3/4/5 hits", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Gen 5+ multi-hit: randomChance(35,100) → 2 hits,
    //   randomChance(35,65) → 3 hits, randomChance(15,30) → 4 hits, else 5 hits
    // Distribution: 35% = 2 hits, 35% = 3 hits, 15% = 4 hits, 15% = 5 hits
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    const rng = new SeededRandom(42);
    const counts = { 2: 0, 3: 0, 4: 0, 5: 0 };

    // Act
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const hits = ruleset.rollMultiHitCount(active, rng);
      counts[hits as 2 | 3 | 4 | 5]++;
    }

    // Assert — each bucket within 5% of expected (allowing statistical variance)
    // Expected: 35% = 700, 35% = 700, 15% = 300, 15% = 300
    expect(counts[2]).toBeGreaterThanOrEqual(600);
    expect(counts[2]).toBeLessThanOrEqual(800);
    expect(counts[3]).toBeGreaterThanOrEqual(600);
    expect(counts[3]).toBeLessThanOrEqual(800);
    expect(counts[4]).toBeGreaterThanOrEqual(200);
    expect(counts[4]).toBeLessThanOrEqual(400);
    expect(counts[5]).toBeGreaterThanOrEqual(200);
    expect(counts[5]).toBeLessThanOrEqual(400);
  });

  it("given an attacker with skill-link ability, when rollMultiHitCount is called, then always returns 5 hits", () => {
    // Arrange
    // Source: Showdown — Skill Link always hits 5 times for multi-hit moves
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, { ability: CORE_ABILITY_IDS.skillLink });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.normal]);
    const rng = new SeededRandom(42);

    // Act — verify 10 consecutive calls all return 5
    for (let i = 0; i < 10; i++) {
      // Assert
      expect(ruleset.rollMultiHitCount(active, rng)).toBe(5);
    }
  });

  it("given rollMultiHitCount, when called, then result is always in range 2-5", () => {
    // Arrange
    // Source: multi-hit move mechanics — Clamp 2 is the minimum, 5 is the maximum
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    const rng = new SeededRandom(99999);

    // Act & Assert
    for (let i = 0; i < 200; i++) {
      const hits = ruleset.rollMultiHitCount(active, rng);
      expect(hits).toBeGreaterThanOrEqual(2);
      expect(hits).toBeLessThanOrEqual(5);
    }
  });
});

describe("BaseRuleset — rollProtectSuccess", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given 0 consecutive protects, when rollProtectSuccess is called, then always returns true (first use)", () => {
    // Arrange
    // Source: Showdown data/conditions.ts — stall volatile: first use always succeeds;
    //   counter starts at 3 only after a successful protect (onStart sets counter=3 for next use)
    const rng = new SeededRandom(42);

    // Act & Assert — first use always succeeds
    for (let i = 0; i < 20; i++) {
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given 1 consecutive protect, when rollProtectSuccess is called, then it requests a 1/3 RNG chance", () => {
    // Arrange
    // Source: Showdown data/conditions.ts — first consecutive Protect uses denominator 3.
    const { rng, getCapturedProbability } = createChanceCapturingRng();

    // Act
    ruleset.rollProtectSuccess(1, rng);

    // Assert
    expect(getCapturedProbability()).toBe(1 / 3);
  });

  it("given 2 consecutive protects, when rollProtectSuccess is called, then it requests a 1/9 RNG chance", () => {
    // Arrange
    // Source: Showdown data/conditions.ts — second consecutive Protect uses denominator 9.
    const { rng, getCapturedProbability } = createChanceCapturingRng();

    // Act
    ruleset.rollProtectSuccess(2, rng);

    // Assert
    expect(getCapturedProbability()).toBe(1 / 9);
  });

  it("given 6 or more consecutive protects, when rollProtectSuccess is called, then it caps the requested RNG chance at 1/729", () => {
    // Arrange
    // Source: Showdown data/conditions.ts — the denominator is capped at 729 = 3^6.
    const protectAtCap = createChanceCapturingRng();
    const protectBeyondCap = createChanceCapturingRng();

    // Act
    ruleset.rollProtectSuccess(6, protectAtCap.rng);
    ruleset.rollProtectSuccess(10, protectBeyondCap.rng);

    // Assert
    expect(protectAtCap.getCapturedProbability()).toBe(1 / 729);
    expect(protectBeyondCap.getCapturedProbability()).toBe(1 / 729);
  });

  it("given a deterministic-always-succeed RNG, when rollProtectSuccess(1, rng) is called, then returns true", () => {
    // Arrange
    // Source: confirms rng.chance(1/3) is used — if chance always returns true, succeed
    const alwaysTrueRng = {
      next: () => 0,
      int: () => 1,
      chance: () => true,
    } as unknown as SeededRandom;

    // Act & Assert
    expect(ruleset.rollProtectSuccess(1, alwaysTrueRng)).toBe(true);
  });

  it("given a deterministic-always-fail RNG, when rollProtectSuccess(1, rng) is called, then returns false", () => {
    // Arrange
    // Source: confirms rng.chance(1/3) is used — if chance always returns false, fail
    const alwaysFalseRng = {
      next: () => 0.9999,
      int: () => 999,
      chance: () => false,
    } as unknown as SeededRandom;

    // Act & Assert
    expect(ruleset.rollProtectSuccess(1, alwaysFalseRng)).toBe(false);
  });
});

describe("BaseRuleset — rollFleeSuccess", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given player speed >= wild speed, when rollFleeSuccess is called, then always returns true", () => {
    // Arrange
    // Source: Bulbapedia — Escape (Gen III onwards): if playerSpeed >= wildSpeed, always flee
    const rng = new SeededRandom(42);

    // Act & Assert — equal speed: flee succeeds
    expect(ruleset.rollFleeSuccess(100, 100, 1, rng)).toBe(true);
    // Act & Assert — faster player: flee succeeds
    expect(ruleset.rollFleeSuccess(200, 100, 1, rng)).toBe(true);
  });

  it("given player speed 128, wild speed 256, attempt 1, when rollFleeSuccess is called, then F=30 so escape is probabilistic", () => {
    // Arrange
    // Source: Bulbapedia — F = floor(128*128/256) + 30*1 = floor(64) + 30 = 94
    //   Flee succeeds if rng(0,255) < 94, i.e., ~36.7% chance
    // Derive: floor(128*128/256) = floor(16384/256) = floor(64) = 64; 64+30=94
    const alwaysHighRng = {
      next: () => 0.99,
      int: (_min: number, _max: number) => 255, // 255 >= 94 → fails
      chance: () => false,
    } as unknown as SeededRandom;

    // Act & Assert — rng returns 255, which is NOT < 94, so flee fails
    expect(ruleset.rollFleeSuccess(128, 256, 1, alwaysHighRng)).toBe(false);
  });

  it("given player speed 128, wild speed 256, attempt 1, when rng returns 0, then flee succeeds", () => {
    // Arrange
    // Source: Bulbapedia — F = 94; rng(0,255) < 94 succeeds if rng returns 0
    const alwaysLowRng = {
      next: () => 0,
      int: (_min: number, _max: number) => 0, // 0 < 94 → succeeds
      chance: () => true,
    } as unknown as SeededRandom;

    // Act & Assert
    expect(ruleset.rollFleeSuccess(128, 256, 1, alwaysLowRng)).toBe(true);
  });

  it("given high enough attempt count making F >= 256, when rollFleeSuccess is called, then always returns true", () => {
    // Arrange
    // Source: Bulbapedia — F = floor(playerSpeed * 128 / wildSpeed) + 30 * attempts
    //   With playerSpeed=1, wildSpeed=256: floor(128/256) + 30*N = 0 + 30*N
    //   F >= 256 when N >= ceil(256/30) = ceil(8.53) = 9 attempts
    // At attempt 9: F = 0 + 30*9 = 270 >= 256 → always flee
    const rng = new SeededRandom(42);

    // Act & Assert
    expect(ruleset.rollFleeSuccess(1, 256, 9, rng)).toBe(true);
  });

  it("given player speed 100 and wild speed 200 with 3 attempts, when rollFleeSuccess is called, then F is computed correctly", () => {
    // Arrange
    // Source: Bulbapedia — F = floor(100*128/200) + 30*3 = floor(64) + 90 = 154
    //   154 < 256 so result depends on rng; rng.int(0,255) < 154
    // Derive: floor(100*128/200) = floor(12800/200) = floor(64) = 64; 64+90=154
    const capturingRng = {
      int: (_min: number, _max: number) => {
        // Showdown uses rng.int(0, 255) < F; return 100 which is < 154
        return 100; // 100 < 154 → flee succeeds
      },
      next: () => 0,
      chance: () => true,
    } as unknown as SeededRandom;

    // Act
    const result = ruleset.rollFleeSuccess(100, 200, 3, capturingRng);

    // Assert — rng(0,255) = 100 < 154 → true
    expect(result).toBe(true);
  });
});

describe("BaseRuleset — calculateConfusionDamage", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given a level 50 pokemon with 100 attack and 100 defense (neutral stages), when calculateConfusionDamage is called, then damage is correct", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — getConfusionDamage(pokemon, 40):
    //   baseDamage = floor(floor(floor(floor(2*50/5 + 2) * 40 * Atk) / Def) / 50) + 2
    //   = floor(floor(floor(floor(20 + 2) * 40 * 100) / 100) / 50) + 2
    //   = floor(floor(floor(22 * 4000) / 100) / 50) + 2
    //   = floor(floor(88000 / 100) / 50) + 2
    //   = floor(880 / 50) + 2
    //   = floor(17.6) + 2 = 17 + 2 = 19 (base damage)
    //   Random factor with seed 42: rng.int(0,15)=9, so randomFactor=94
    //   finalDamage = max(1, floor(19 * 94 / 100)) = max(1, floor(17.86)) = 17
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    const rng = new SeededRandom(42);

    // Act
    const damage = ruleset.calculateConfusionDamage(active, emptyState, rng);

    // Assert
    // baseDamage=19, randomFactor=94 (seed 42), final=floor(19*94/100)=17
    expect(damage).toBe(17);
  });

  it("given a level 100 pokemon with 200 attack and 100 defense, when calculateConfusionDamage is called, then damage scales correctly", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — getConfusionDamage(pokemon, 40):
    //   levelFactor = floor(2*100/5) + 2 = 40 + 2 = 42
    //   baseDamage = floor(floor(42 * 40 * 200) / 100) / 50) + 2
    //   = floor(floor(336000 / 100) / 50) + 2
    //   = floor(3360 / 50) + 2
    //   = floor(67.2) + 2 = 67 + 2 = 69 (base damage)
    //   Random factor with seed 42: rng.int(0,15)=9, randomFactor=94
    //   finalDamage = max(1, floor(69 * 94 / 100)) = max(1, floor(64.86)) = 64
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 100, {
      calculatedStats: {
        hp: 300,
        attack: 200,
        defense: 100,
        spAttack: 150,
        spDefense: 100,
        speed: 130,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    const rng = new SeededRandom(42);

    // Act
    const damage = ruleset.calculateConfusionDamage(active, emptyState, rng);

    // Assert — baseDamage=69, randomFactor=94, final=floor(69*94/100)=64
    expect(damage).toBe(64);
  });

  it("given a burned pokemon with neutral attack stages, when calculateConfusionDamage is called, then attack is halved before calculation", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — confusion self-hit uses the pokemon's in-battle stats;
    //   burn halves the attack stat (same as any physical attack)
    //   With burn: effective attack = floor(100 / 2) = 50
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22 * 40 * 50) / 100 / 50) + 2 = floor(440/50) + 2 = 8 + 2 = 10
    //   Random factor with seed 42: rng.int(0,15)=9, randomFactor=94
    //   finalDamage = max(1, floor(10 * 94 / 100)) = max(1, floor(9.4)) = 9
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      status: CORE_STATUS_IDS.burn,
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    const rng = new SeededRandom(42);

    // Act
    const damage = ruleset.calculateConfusionDamage(active, emptyState, rng);

    // Assert — burn halves atk: baseDamage=10, randomFactor=94, final=floor(10*94/100)=9
    expect(damage).toBe(9);
  });

  it("given a pokemon with attack stage +6 (boosted), when calculateConfusionDamage is called, then boosted attack is applied", () => {
    // Arrange
    // Source: Showdown — confusion self-hit applies stat stages
    //   +6 stage = 4x multiplier; 100 attack * 4 = 400
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22 * 40 * 400) / 100 / 50) + 2 = floor(3520/50) + 2 = 70 + 2 = 72
    //   Random factor with seed 42: rng.int(0,15)=9, randomFactor=94
    //   finalDamage = max(1, floor(72 * 94 / 100)) = max(1, floor(67.68)) = 67
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    active.statStages.attack = 6;
    const rng = new SeededRandom(42);

    // Act
    const damage = ruleset.calculateConfusionDamage(active, emptyState, rng);

    // Assert — baseDamage=72, randomFactor=94, final=floor(72*94/100)=67
    expect(damage).toBe(67);
  });
});

describe("BaseRuleset — calculateStruggleDamage", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given a level 50 attacker with 100 attack and defender with 100 defense, when calculateStruggleDamage is called, then damage is correct", () => {
    // Arrange
    // Source: Showdown — Struggle is typeless 50 BP physical damage (same formula as confusion self-hit but 50 BP)
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22 * 50 * 100) / 100) = floor(110000/100) = floor(1100) = 1100
    //   damage = floor(1100 / 50) + 2 = floor(22) + 2 = 22 + 2 = 24
    const attacker = createOnFieldPokemon(
      createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      }),
      0,
      [CORE_TYPE_IDS.fire],
    );
    const defender = createOnFieldPokemon(
      createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50, {
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 100,
          spAttack: 80,
          spDefense: 100,
          speed: 80,
        },
      }),
      1,
      [CORE_TYPE_IDS.water],
    );

    // Act
    const damage = ruleset.calculateStruggleDamage(attacker, defender, emptyState);

    // Assert
    // Derivation: levelFactor=22, BP=50, atk=100, def=100
    // step1 = floor(22 * 50 * 100) = 110000
    // step2 = floor(110000 / 100) = 1100
    // step3 = floor(1100 / 50) + 2 = 22 + 2 = 24
    expect(damage).toBe(24);
  });

  it("given a level 100 attacker with 200 attack and defender with 100 defense, when calculateStruggleDamage is called, then damage scales with level and attack", () => {
    // Arrange
    // Source: Showdown — Struggle formula: same as confusion but 50 BP
    //   levelFactor = floor(2*100/5) + 2 = 42
    //   step1 = floor(42 * 50 * 200) = 420000
    //   step2 = floor(420000 / 100) = 4200
    //   step3 = floor(4200 / 50) + 2 = 84 + 2 = 86
    const attacker = createOnFieldPokemon(
      createTestPokemon(GEN1_SPECIES_IDS.charizard, 100, {
        calculatedStats: {
          hp: 300,
          attack: 200,
          defense: 100,
          spAttack: 150,
          spDefense: 100,
          speed: 130,
        },
      }),
      0,
      [CORE_TYPE_IDS.fire],
    );
    const defender = createOnFieldPokemon(
      createTestPokemon(GEN1_SPECIES_IDS.blastoise, 100, {
        calculatedStats: {
          hp: 300,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      }),
      1,
      [CORE_TYPE_IDS.water],
    );

    // Act
    const damage = ruleset.calculateStruggleDamage(attacker, defender, emptyState);

    // Assert
    expect(damage).toBe(86);
  });
});

describe("BaseRuleset — calculateStruggleRecoil", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given a pokemon with 200 max HP, when calculateStruggleRecoil is called, then recoil is 1/4 max HP (50)", () => {
    // Arrange
    // Source: Showdown — Gen 4+ Struggle recoil = 1/4 max HP (floor(maxHp / 4))
    //   BaseRuleset defaults to Gen 4+ behavior
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);

    // Act
    const recoil = ruleset.calculateStruggleRecoil(active, 80); // damageDealt=80 (unused in Gen 4+)

    // Assert — floor(200 / 4) = 50
    expect(recoil).toBe(50);
  });

  it("given a pokemon with 160 max HP, when calculateStruggleRecoil is called, then recoil is floor(160/4) = 40", () => {
    // Arrange
    // Source: Showdown — Gen 4+ Struggle recoil = 1/4 max HP; formula: Math.floor(maxHp / 4)
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      calculatedStats: {
        hp: 160,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);

    // Act
    const recoil = ruleset.calculateStruggleRecoil(active, 30); // damageDealt ignored in Gen 4+

    // Assert — floor(160 / 4) = 40
    expect(recoil).toBe(40);
  });

  it("given calculateStruggleRecoil, when called, then it ignores the damageDealt parameter (Gen 4+ uses maxHP not damage)", () => {
    // Arrange
    // Source: Showdown — Gen 4+ uses max HP formula; damageDealt parameter only matters for Gen 2-3
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);

    // Act — same attacker, different damageDealt values
    const recoil1 = ruleset.calculateStruggleRecoil(active, 10);
    const recoil2 = ruleset.calculateStruggleRecoil(active, 200);

    // Assert — both should be 50 (1/4 of 200 max HP), regardless of damage dealt
    expect(recoil1).toBe(50);
    expect(recoil2).toBe(50);
  });
});

describe("BaseRuleset — calculateBindDamage", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given a pokemon with 160 max HP, when calculateBindDamage is called, then returns floor(160/8) = 20", () => {
    // Arrange
    // Source: Showdown data/conditions.ts — partiallytrapped: damage = pokemon.baseMaxhp / 8 (Gen 5+ default)
    //   Gen 2-4 use 1/16 instead; BaseRuleset targets Gen 5+ default
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      calculatedStats: {
        hp: 160,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);

    // Act
    const damage = ruleset.calculateBindDamage(active);

    // Assert — floor(160 / 8) = 20
    expect(damage).toBe(20);
  });

  it("given a pokemon with 200 max HP, when calculateBindDamage is called, then returns floor(200/8) = 25", () => {
    // Arrange
    // Source: Showdown data/conditions.ts — partiallytrapped: damage = pokemon.baseMaxhp / 8
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);

    // Act
    const damage = ruleset.calculateBindDamage(active);

    // Assert — floor(200 / 8) = 25
    expect(damage).toBe(25);
  });
});

describe("BaseRuleset — processPerishSong", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given a pokemon with perish song counter at 3, when processPerishSong is called, then counter decrements to 2 and fainted is false", () => {
    // Arrange
    // Source: Showdown data/moves.ts — perishsong: duration 4, onResidualOrder 24
    //   Counter counts down from 3 to 0, faint when reaching 0
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    active.volatileStatuses.set(CORE_MOVE_IDS.perishSong, {
      turnsLeft: -1,
      data: { counter: 3 },
    });

    // Act
    const result = ruleset.processPerishSong(active);

    // Assert
    expect(result.newCount).toBe(2);
    expect(result.fainted).toBe(false);
  });

  it("given a pokemon with perish song counter at 2, when processPerishSong is called, then counter decrements to 1 and fainted is false", () => {
    // Arrange
    // Source: Bulbapedia — Perish Song counts down 3, 2, 1, 0 then faints
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    active.volatileStatuses.set(CORE_MOVE_IDS.perishSong, {
      turnsLeft: -1,
      data: { counter: 2 },
    });

    // Act
    const result = ruleset.processPerishSong(active);

    // Assert
    expect(result.newCount).toBe(1);
    expect(result.fainted).toBe(false);
  });

  it("given a pokemon with perish song counter at 1, when processPerishSong is called, then fainted is true", () => {
    // Arrange
    // Source: Bulbapedia — Perish Song: at the end of the 3rd turn after use, the Pokemon faints
    //   Counter reaches 0 (from 1) → faint
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    active.volatileStatuses.set(CORE_MOVE_IDS.perishSong, {
      turnsLeft: -1,
      data: { counter: 1 },
    });

    // Act
    const result = ruleset.processPerishSong(active);

    // Assert
    expect(result.fainted).toBe(true);
    expect(result.newCount).toBe(0);
  });

  it("given a pokemon without perish-song volatile, when processPerishSong is called, then returns safe no-op values", () => {
    // Arrange
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire]);
    // No perish-song volatile set

    // Act
    const result = ruleset.processPerishSong(active);

    // Assert — no-op: no faint, count 0
    expect(result.fainted).toBe(false);
    expect(result.newCount).toBe(0);
  });
});

describe("BaseRuleset — getEndOfTurnOrder ordering (regression for #555)", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given the base ruleset, when getEndOfTurnOrder is called, then it matches the exact Showdown-derived residual sequence", () => {
    expect(ruleset.getEndOfTurnOrder()).toEqual(EXPECTED_END_OF_TURN_ORDER);
  });
});

describe("BaseRuleset — calculateStats (exact non-HP values)", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  const charizardSpecies = {
    id: 6,
    name: "charizard",
    displayName: "Charizard",
    types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying] as const,
    baseStats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    abilities: { normal: [CORE_ABILITY_IDS.blaze], hidden: CORE_ABILITY_IDS.solarPower },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 240,
    expGroup: "medium-slow" as const,
    evYield: { spAttack: 3 },
    eggGroups: ["monster", CORE_TYPE_IDS.dragon],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1.7, weight: 90.5 },
    spriteKey: "charizard",
    baseFriendship: 70,
    generation: 1 as const,
    isLegendary: false,
    isMythical: false,
  };

  it("given a level 50 Charizard with 31 IVs and 0 EVs and hardy nature, when calculateStats is called, then attack is correct", () => {
    // Arrange
    // Source: Gen 3+ stat formula — non-HP: floor(((2*base + iv + floor(ev/4)) * L) / 100) + 5
    //   Attack: floor(((2*84 + 31 + 0) * 50) / 100) + 5 = floor(199*50/100) + 5 = floor(99.5) + 5 = 99 + 5 = 104
    //   Hardy nature: neutral (no modifier)
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, { nature: CORE_NATURE_IDS.hardy });

    // Act
    const stats = ruleset.calculateStats(pokemon, charizardSpecies);

    // Assert
    // Attack = floor(((2*84+31+0)*50)/100) + 5 = floor(199*50/100) + 5 = 99 + 5 = 104
    expect(stats.attack).toBe(104);
    // Defense = floor(((2*78+31+0)*50)/100) + 5 = floor(187*50/100) + 5 = floor(93.5) + 5 = 93 + 5 = 98
    expect(stats.defense).toBe(98);
    // SpAttack = floor(((2*109+31+0)*50)/100) + 5 = floor(249*50/100) + 5 = floor(124.5) + 5 = 124 + 5 = 129
    expect(stats.spAttack).toBe(129);
    // SpDefense = floor(((2*85+31+0)*50)/100) + 5 = floor(201*50/100) + 5 = floor(100.5) + 5 = 100 + 5 = 105
    expect(stats.spDefense).toBe(105);
    // Speed = floor(((2*100+31+0)*50)/100) + 5 = floor(231*50/100) + 5 = floor(115.5) + 5 = 115 + 5 = 120
    expect(stats.speed).toBe(120);
  });

  it("given a level 50 Charizard with modest nature, when calculateStats is called, then SpAttack is boosted and Attack is lowered", () => {
    // Arrange
    // Source: Gen 3+ nature modifiers — Modest: +10% SpAttack, -10% Attack
    //   SpAttack (base): floor(((2*109+31+0)*50)/100) + 5 = 129
    //   SpAttack (modest +10%): floor(129 * 1.1) = floor(141.9) = 141
    //   Attack (base): 104
    //   Attack (modest -10%): floor(104 * 0.9) = floor(93.6) = 93
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, { nature: CORE_NATURE_IDS.modest });

    // Act
    const stats = ruleset.calculateStats(pokemon, charizardSpecies);

    // Assert
    expect(stats.spAttack).toBe(141);
    expect(stats.attack).toBe(93);
  });

  it("given a level 100 Charizard with 31 IVs and 252 Speed EVs and timid nature, when calculateStats is called, then speed is correct", () => {
    // Arrange
    // Source: Gen 3+ stat formula with EVs:
    //   Speed (base): floor(((2*100 + 31 + floor(252/4)) * 100) / 100) + 5
    //              = floor(((200 + 31 + 63) * 100) / 100) + 5
    //              = floor(294 * 100 / 100) + 5 = 294 + 5 = 299
    //   Timid nature (+10% Speed): floor(299 * 1.1) = floor(328.9) = 328
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 100, {
      nature: "timid",
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 252 },
    });

    // Act
    const stats = ruleset.calculateStats(pokemon, charizardSpecies);

    // Assert
    expect(stats.speed).toBe(328);
  });
});
