import { describe, expect, it } from "vitest";
import {
  calculateStatExpContribution,
  gen1to2FullParalysisCheck,
  gen1to4MultiHitRoll,
  gen1to6ConfusionSelfHitRoll,
  gen12FullParalysisCheck,
  gen14MultiHitRoll,
  gen16ConfusionSelfHitRoll,
} from "../../src/logic/gen12-shared.js";
import { SeededRandom } from "../../src/prng/seeded-random.js";

// ============================================================
// gen1to2FullParalysisCheck
// ============================================================

describe("gen1to2FullParalysisCheck", () => {
  // Source: pret/pokered engine/battle/core.asm:3454 — cp 25 percent (= 63/256)
  // The check returns true when rng.int(0,255) < 63.

  it("given seed 7, when checking full paralysis, then returns true (rng.int(0,255) = 2 < 63)", () => {
    // Seed 7 → int(0,255) = 2 → 2 < 63 → paralyzed
    // Verified: new SeededRandom(7).int(0,255) === 2
    const rng = new SeededRandom(7);
    expect(gen1to2FullParalysisCheck(rng)).toBe(true);
  });

  it("given seed 0, when checking full paralysis, then returns false (rng.int(0,255) = 68 >= 63)", () => {
    // Seed 0 → int(0,255) = 68 → 68 >= 63 → not paralyzed
    // Verified: new SeededRandom(0).int(0,255) === 68
    const rng = new SeededRandom(0);
    expect(gen1to2FullParalysisCheck(rng)).toBe(false);
  });

  it("given same seed 7, when checking full paralysis twice, then both calls return the same result", () => {
    // Source: pret/pokered engine/battle/core.asm:3454 — deterministic PRNG
    const rng1 = new SeededRandom(7);
    const rng2 = new SeededRandom(7);
    expect(gen1to2FullParalysisCheck(rng1)).toBe(gen1to2FullParalysisCheck(rng2));
  });

  it("given 10,000 trials with seed 42, when counting paralysis triggers, then rate is between 22% and 27%", () => {
    // Source: pret/pokered engine/battle/core.asm:3454 — threshold 63/256 ≈ 24.6%
    // 10,000 trials with seed=42 yields ~24.83% (verified empirically)
    const rng = new SeededRandom(42);
    let trueCount = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (gen1to2FullParalysisCheck(rng)) trueCount++;
    }
    const rate = trueCount / trials;
    expect(rate).toBeGreaterThan(0.22);
    expect(rate).toBeLessThan(0.27);
  });

  it("given seed 15, when checking full paralysis, then returns true (rng.int(0,255) = 60 < 63)", () => {
    // Seed 15 → int(0,255) = 60 → 60 < 63 → paralyzed (triangulation: second true case)
    // Verified: new SeededRandom(15).int(0,255) === 60
    const rng = new SeededRandom(15);
    expect(gen1to2FullParalysisCheck(rng)).toBe(true);
  });

  it("keeps gen12FullParalysisCheck as a deprecated alias", () => {
    // Source: issue #769 requires the explicit gen1toN rename while preserving deprecated
    // aliases during the compatibility window tracked in issue #1011.
    expect(gen12FullParalysisCheck).toBe(gen1to2FullParalysisCheck);
  });
});

// ============================================================
// gen1to4MultiHitRoll
// ============================================================

describe("gen1to4MultiHitRoll", () => {
  // Source: pret/pokered engine/battle/core.asm — multi-hit distribution [2,2,2,3,3,3,4,5]
  // Source: Bulbapedia — Multi-hit move — counts 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%)

  it("given seed 0, when rolling multi-hit, then returns 2 (index 0 of [2,2,2,3,3,3,4,5])", () => {
    // Seed 0 → pick index 0 → value 2
    // Verified: new SeededRandom(0).pick([2,2,2,3,3,3,4,5]) === 2
    const rng = new SeededRandom(0);
    expect(gen1to4MultiHitRoll(rng)).toBe(2);
  });

  it("given seed 1, when rolling multi-hit, then returns 3 (picks from the 3-hit slots)", () => {
    // Seed 1 → pick index in [3,4,5] → value 3
    // Verified: new SeededRandom(1).pick([2,2,2,3,3,3,4,5]) === 3
    const rng = new SeededRandom(1);
    expect(gen1to4MultiHitRoll(rng)).toBe(3);
  });

  it("given seed 20, when rolling multi-hit, then returns 4 (picks index 6 of [2,2,2,3,3,3,4,5])", () => {
    // Seed 20 → pick index 6 → value 4
    // Verified: new SeededRandom(20).pick([2,2,2,3,3,3,4,5]) === 4
    const rng = new SeededRandom(20);
    expect(gen1to4MultiHitRoll(rng)).toBe(4);
  });

  it("given seed 4, when rolling multi-hit, then returns 5 (picks index 7 of [2,2,2,3,3,3,4,5])", () => {
    // Seed 4 → pick index 7 → value 5
    // Verified: new SeededRandom(4).pick([2,2,2,3,3,3,4,5]) === 5
    const rng = new SeededRandom(4);
    expect(gen1to4MultiHitRoll(rng)).toBe(5);
  });

  it("given seeds 0-99, when rolling multi-hit, then every result is in {2, 3, 4, 5}", () => {
    // Source: pret/pokered — only 4 possible hit counts from the distribution table
    const validHits = new Set([2, 3, 4, 5]);
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed);
      const result = gen1to4MultiHitRoll(rng);
      expect(validHits.has(result)).toBe(true);
    }
  });

  it("given 10,000 trials with seed 42, when counting hit distributions, then rates match 37.5/37.5/12.5/12.5%", () => {
    // Source: pret/pokered — multi-hit distribution [2,2,2,3,3,3,4,5]
    // Source: Bulbapedia — Multi-hit move: 2-hits (37.5%), 3-hits (37.5%), 4-hits (12.5%), 5-hits (12.5%)
    // Empirical with seed=42: 2→37.73%, 3→37.63%, 4→11.92%, 5→12.72%
    const rng = new SeededRandom(42);
    const counts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0 };
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const result = gen1to4MultiHitRoll(rng);
      counts[result]++;
    }
    // 2-hits: expected 37.5%, acceptable 33–42%
    expect(counts[2] / trials).toBeGreaterThan(0.33);
    expect(counts[2] / trials).toBeLessThan(0.42);
    // 3-hits: expected 37.5%, acceptable 33–42%
    expect(counts[3] / trials).toBeGreaterThan(0.33);
    expect(counts[3] / trials).toBeLessThan(0.42);
    // 4-hits: expected 12.5%, acceptable 8–17%
    expect(counts[4] / trials).toBeGreaterThan(0.08);
    expect(counts[4] / trials).toBeLessThan(0.17);
    // 5-hits: expected 12.5%, acceptable 8–17%
    expect(counts[5] / trials).toBeGreaterThan(0.08);
    expect(counts[5] / trials).toBeLessThan(0.17);
  });

  it("keeps gen14MultiHitRoll as a deprecated alias", () => {
    // Source: issue #769 requires the explicit gen1toN rename while preserving deprecated
    // aliases during the compatibility window tracked in issue #1011.
    expect(gen14MultiHitRoll).toBe(gen1to4MultiHitRoll);
  });
});

// ============================================================
// gen1to6ConfusionSelfHitRoll
// ============================================================

describe("gen1to6ConfusionSelfHitRoll", () => {
  // Source: pret/pokered engine/battle/core.asm — confusion self-hit check (50%)
  // Source: pret/pokecrystal engine/battle/effect_commands.asm:602 HitConfusion

  it("given seed 0, when rolling confusion self-hit, then returns true (rng.chance(0.5) triggers)", () => {
    // Seed 0 → next() < 0.5 → true
    // Verified: new SeededRandom(0).chance(0.5) === true
    const rng = new SeededRandom(0);
    expect(gen1to6ConfusionSelfHitRoll(rng)).toBe(true);
  });

  it("given seed 1, when rolling confusion self-hit, then returns false (rng.chance(0.5) misses)", () => {
    // Seed 1 → next() >= 0.5 → false
    // Verified: new SeededRandom(1).chance(0.5) === false
    const rng = new SeededRandom(1);
    expect(gen1to6ConfusionSelfHitRoll(rng)).toBe(false);
  });

  it("given same seed 0, when rolling confusion self-hit twice, then both calls return the same result", () => {
    // Source: Mulberry32 PRNG — same seed always produces same sequence
    const rng1 = new SeededRandom(0);
    const rng2 = new SeededRandom(0);
    expect(gen1to6ConfusionSelfHitRoll(rng1)).toBe(gen1to6ConfusionSelfHitRoll(rng2));
  });

  it("given 10,000 trials with seed 42, when counting self-hits, then rate is between 47% and 53%", () => {
    // Source: pret/pokered engine/battle/core.asm — 50% chance, rng.chance(0.5)
    // Empirical with seed=42: 50.22% self-hits (verified)
    const rng = new SeededRandom(42);
    let trueCount = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (gen1to6ConfusionSelfHitRoll(rng)) trueCount++;
    }
    const rate = trueCount / trials;
    expect(rate).toBeGreaterThan(0.47);
    expect(rate).toBeLessThan(0.53);
  });

  it("keeps gen16ConfusionSelfHitRoll as a deprecated alias", () => {
    // Source: issue #769 requires the explicit gen1toN rename while preserving deprecated
    // aliases during the compatibility window tracked in issue #1011.
    expect(gen16ConfusionSelfHitRoll).toBe(gen1to6ConfusionSelfHitRoll);
  });
});

// ============================================================
// calculateStatExpContribution
// ============================================================

describe("calculateStatExpContribution", () => {
  // Source: pret/pokered engine/battle/core.asm — stat experience calculation
  // Source: pret/pokecrystal engine/battle/core.asm — same formula
  // Source: Bulbapedia — Stat experience (https://bulbapedia.bulbagarden.net/wiki/Stat_experience)
  // Formula: floor(ceil(sqrt(clamp(statExp, 0, 65535))) / 4)

  it("given statExp=0, when calculating contribution, then returns 0 (sqrt(0)=0, ceil(0)=0, floor(0/4)=0)", () => {
    // Source: pret/pokered — sqrt(0)=0, ceil(0)=0, floor(0/4)=0
    expect(calculateStatExpContribution(0)).toBe(0);
  });

  it("given statExp=9, when calculating contribution, then returns 0 (sqrt(9)=3, ceil(3)=3, floor(3/4)=0)", () => {
    // Source: pret/pokered — sqrt(9)=3.0 exactly, ceil=3, floor(3/4)=0
    // 3/4 = 0.75, floor = 0 → still zero contribution
    expect(calculateStatExpContribution(9)).toBe(0);
  });

  it("given statExp=10, when calculating contribution, then returns 1 (first non-zero result)", () => {
    // Source: pret/pokered — sqrt(10)≈3.162, ceil=4, floor(4/4)=1
    // This is the crossover: statExp=9 yields 0, statExp=10 yields 1
    expect(calculateStatExpContribution(10)).toBe(1);
  });

  it("given statExp=65025, when calculating contribution, then returns 63 (sqrt(65025)=255 exactly)", () => {
    // Source: pret/pokered — 65025 = 255^2, sqrt=255.0, ceil=255, floor(255/4)=63
    // floor(255/4) = floor(63.75) = 63
    expect(calculateStatExpContribution(65025)).toBe(63);
  });

  it("given statExp=65535, when calculating contribution, then returns 64 (maximum possible output)", () => {
    // Source: pret/pokered — 65535 is max statExp, sqrt≈255.998, ceil=256, floor(256/4)=64
    // This is the cap: no statExp value can produce more than 64
    expect(calculateStatExpContribution(65535)).toBe(64);
  });

  it("given statExp=-1, when calculating contribution, then returns 0 (clamps negative to 0)", () => {
    // Source: pret/pokered — statExp range is 0–65535; negative values clamp to 0
    // floor(statExp) of -1 = -1; Math.max(0, -1) = 0 → same as statExp=0
    expect(calculateStatExpContribution(-1)).toBe(0);
  });

  it("given statExp=70000, when calculating contribution, then returns 64 (clamps to 65535 max)", () => {
    // Source: pret/pokered — statExp range is 0–65535; values above 65535 clamp to 65535
    // Clamped to 65535 → same result as statExp=65535 → 64
    expect(calculateStatExpContribution(70000)).toBe(64);
  });

  it("given increasing statExp values, when calculating contributions, then results are monotonically non-decreasing", () => {
    // Source: pret/pokered — sqrt is monotone, ceil and floor preserve monotonicity
    // Triangulation: verifies formula is not returning a constant or inverted result
    const inputs = [0, 1, 9, 10, 50, 100, 256, 1000, 10000, 65535];
    const results = inputs.map(calculateStatExpContribution);
    // Expected: [0, 0, 0, 1, 2, 2, 4, 8, 25, 64] (verified)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThanOrEqual(results[i - 1] as number);
    }
  });

  it("given sampled statExp values across the range, when calculating contributions, then all results are non-negative integers", () => {
    // Source: pret/pokered — output is always a non-negative integer
    const samples = [0, 1, 4, 9, 10, 15, 16, 25, 100, 256, 1024, 10000, 40000, 65025, 65535];
    for (const v of samples) {
      const result = calculateStatExpContribution(v);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result)).toBe(true);
    }
  });
});
