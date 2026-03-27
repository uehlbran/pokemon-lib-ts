import { describe, expect, it } from "vitest";
import {
  ACCURACY_STAGE_RATIOS,
  calculateAccuracy,
  GEN3_STAT_STAGE_RATIOS,
  GEN12_STAT_STAGE_RATIOS,
  getAccuracyEvasionMultiplier,
  getAccuracyStageRatio,
  getGen3StatStageRatio,
  getGen12StatStageRatio,
  getStatStageMultiplier,
} from "../../../src/logic/stat-stages";

// Source: classic stat-stage table used in Gen 1-2 and preserved as the generic
// multiplier helper here: positive stages use (2 + stage) / 2, negative stages use 2 / (2 - stage).
const EXPECTED_STAT_STAGE_MULTIPLIERS = [
  { stage: -6, expected: 0.25 },
  { stage: -5, expected: 2 / 7 },
  { stage: -4, expected: 2 / 6 },
  { stage: -3, expected: 0.4 },
  { stage: -2, expected: 0.5 },
  { stage: -1, expected: 2 / 3 },
  { stage: 0, expected: 1.0 },
  { stage: 1, expected: 1.5 },
  { stage: 2, expected: 2.0 },
  { stage: 3, expected: 2.5 },
  { stage: 4, expected: 3.0 },
  { stage: 5, expected: 3.5 },
  { stage: 6, expected: 4.0 },
] as const;

// Source: pokeemerald sAccuracyStageRatios / pokecrystal AccuracyLevelMultipliers.
// The exported helper should mirror the authoritative lookup table, not the older
// simplified 3-based approximation.
const EXPECTED_ACCURACY_EVASION_MULTIPLIERS = [
  { stage: -6, expected: 3 / 9 },
  { stage: -3, expected: 0.5 },
  { stage: -2, expected: 0.6 },
  { stage: -1, expected: 0.75 },
  { stage: 0, expected: 1.0 },
  { stage: 1, expected: 133 / 100 },
  { stage: 2, expected: 166 / 100 },
  { stage: 3, expected: 2.0 },
  { stage: 4, expected: 233 / 100 },
  { stage: 5, expected: 133 / 50 },
  { stage: 6, expected: 3.0 },
] as const;

describe("getStatStageMultiplier", () => {
  it.each(
    EXPECTED_STAT_STAGE_MULTIPLIERS,
  )("given stage $stage, when getStatStageMultiplier is called, then it returns $expected", ({
    stage,
    expected,
  }) => {
    expect(getStatStageMultiplier(stage)).toBeCloseTo(expected);
  });

  it("given out-of-range stages, when getStatStageMultiplier is called, then it clamps to the stage +/-6 entries", () => {
    const minStageExpected =
      EXPECTED_STAT_STAGE_MULTIPLIERS.find((entry) => entry.stage === -6)?.expected ?? 0;
    const maxStageExpected =
      EXPECTED_STAT_STAGE_MULTIPLIERS.find((entry) => entry.stage === 6)?.expected ?? 0;

    expect(getStatStageMultiplier(7)).toBe(maxStageExpected);
    expect(getStatStageMultiplier(10)).toBe(maxStageExpected);
    expect(getStatStageMultiplier(-7)).toBe(minStageExpected);
    expect(getStatStageMultiplier(-10)).toBe(minStageExpected);
  });

  it("given every stage from -6 to +6, when getStatStageMultiplier is called, then the full lookup table matches the sourced positive ratios", () => {
    expect(
      EXPECTED_STAT_STAGE_MULTIPLIERS.map(({ stage }) => getStatStageMultiplier(stage)),
    ).toEqual(EXPECTED_STAT_STAGE_MULTIPLIERS.map(({ expected }) => expected));
  });

  it("given matching positive and negative stages, when multiplying their values, then each pair remains reciprocal", () => {
    const reciprocalProduct = 1;
    for (let n = 1; n <= 6; n++) {
      const product = getStatStageMultiplier(n) * getStatStageMultiplier(-n);
      expect(product).toBeCloseTo(reciprocalProduct);
    }
  });
});

describe("getAccuracyEvasionMultiplier", () => {
  it.each(
    EXPECTED_ACCURACY_EVASION_MULTIPLIERS,
  )("given stage $stage, when getAccuracyEvasionMultiplier is called, then it returns $expected", ({
    stage,
    expected,
  }) => {
    expect(getAccuracyEvasionMultiplier(stage)).toBeCloseTo(expected);
  });

  it("given out-of-range stages, when getAccuracyEvasionMultiplier is called, then it clamps to the stage +/-6 entries", () => {
    const minStageExpected =
      EXPECTED_ACCURACY_EVASION_MULTIPLIERS.find((entry) => entry.stage === -6)?.expected ?? 0;
    const maxStageExpected =
      EXPECTED_ACCURACY_EVASION_MULTIPLIERS.find((entry) => entry.stage === 6)?.expected ?? 0;

    expect(getAccuracyEvasionMultiplier(7)).toBe(maxStageExpected);
    expect(getAccuracyEvasionMultiplier(-7)).toBeCloseTo(minStageExpected);
  });

  it("given the cartridge table-only stages +4 and +5, when getAccuracyEvasionMultiplier is called, then it matches the authoritative non-simplified values", () => {
    // Source: pokeemerald sAccuracyStageRatios / pokecrystal AccuracyLevelMultipliers
    // stage +4 = 233/100 = 2.33, not 7/3 ≈ 2.333...
    // stage +5 = 133/50 = 2.66, not 8/3 ≈ 2.666...
    expect(getAccuracyEvasionMultiplier(4)).toBe(233 / 100);
    expect(getAccuracyEvasionMultiplier(5)).toBe(133 / 50);
  });
});

describe("calculateAccuracy", () => {
  it("given a null-accuracy move, when calculating, then returns Infinity (never misses)", () => {
    expect(calculateAccuracy(null, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("given stage 0 with 100-accuracy move, when calculating, then returns 100 unchanged", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage 0 = {1, 1} => 100 * 1 / 1 = 100
    expect(calculateAccuracy(100, 0, 0)).toBe(100);
  });

  it("given stage 0 with 95-accuracy move, when calculating, then returns 95 unchanged", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage 0 = {1, 1} => 95 * 1 / 1 = 95
    expect(calculateAccuracy(95, 0, 0)).toBe(95);
  });

  it("given net stage +1 with 100-accuracy move, when calculating, then returns 133", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage +1 = {133, 100} => floor(100 * 133 / 100) = 133
    expect(calculateAccuracy(100, 1, 0)).toBe(133);
  });

  it("given net stage +2 with 100-accuracy move, when calculating, then returns 166", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage +2 = {166, 100} => floor(100 * 166 / 100) = 166
    expect(calculateAccuracy(100, 2, 0)).toBe(166);
  });

  it("given net stage +3 with 100-accuracy move, when calculating, then returns 200", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage +3 = {2, 1} => floor(100 * 2 / 1) = 200
    expect(calculateAccuracy(100, 3, 0)).toBe(200);
  });

  it("given net stage +4 with 100-accuracy move, when calculating, then returns 233", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage +4 = {233, 100} => floor(100 * 233 / 100) = 233
    expect(calculateAccuracy(100, 4, 0)).toBe(233);
  });

  it("given net stage +5 with 100-accuracy move, when calculating, then returns 266", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage +5 = {133, 50} => floor(100 * 133 / 50) = 266
    expect(calculateAccuracy(100, 5, 0)).toBe(266);
  });

  it("given net stage +6 with 100-accuracy move, when calculating, then returns 300", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage +6 = {3, 1} => floor(100 * 3 / 1) = 300
    expect(calculateAccuracy(100, 6, 0)).toBe(300);
  });

  it("given net stage -1 with 100-accuracy move, when calculating, then returns 75", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage -1 = {75, 100} => floor(100 * 75 / 100) = 75
    expect(calculateAccuracy(100, 0, 1)).toBe(75);
  });

  it("given net stage -2 with 100-accuracy move, when calculating, then returns 60", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage -2 = {60, 100} => floor(100 * 60 / 100) = 60
    expect(calculateAccuracy(100, 0, 2)).toBe(60);
  });

  it("given net stage -3 with 100-accuracy move, when calculating, then returns 50", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage -3 = {50, 100} => floor(100 * 50 / 100) = 50
    expect(calculateAccuracy(100, 0, 3)).toBe(50);
  });

  it("given net stage -4 with 100-accuracy move, when calculating, then returns 43 (not 42 from simplified formula)", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage -4 = {43, 100} => floor(100 * 43 / 100) = 43
    // Bug #560: simplified formula 3/(3-(-4)) = 3/7 => floor(100 * 3/7) = 42 (wrong!)
    expect(calculateAccuracy(100, 0, 4)).toBe(43);
  });

  it("given net stage -5 with 100-accuracy move, when calculating, then returns 36 (not 37 from simplified formula)", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage -5 = {36, 100} => floor(100 * 36 / 100) = 36
    // Bug #560: simplified formula 3/(3-(-5)) = 3/8 => floor(100 * 3/8) = 37 (wrong!)
    expect(calculateAccuracy(100, 0, 5)).toBe(36);
  });

  it("given net stage -6 with 100-accuracy move, when calculating, then returns 33", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage -6 = {33, 100} => floor(100 * 33 / 100) = 33
    expect(calculateAccuracy(100, 0, 6)).toBe(33);
  });

  it("given accuracy and evasion stages that cancel out, when calculating, then returns base accuracy", () => {
    // +1 accuracy vs +1 evasion: net stage = 0, so accuracy is unchanged
    expect(calculateAccuracy(100, 1, 1)).toBe(100);
  });

  it("given combined stages that net to +1, when calculating, then returns 133", () => {
    // +3 acc vs +2 eva: net +1 => floor(100 * 133 / 100) = 133
    // Source: pokeemerald sAccuracyStageRatios -- stage +1 = {133, 100}
    expect(calculateAccuracy(100, 3, 2)).toBe(133);
  });

  it("given combined stages that net to -1, when calculating, then returns 75", () => {
    // +2 acc vs +3 eva: net -1 => floor(100 * 75 / 100) = 75
    // Source: pokeemerald sAccuracyStageRatios -- stage -1 = {75, 100}
    expect(calculateAccuracy(100, 2, 3)).toBe(75);
  });

  it("given net stage beyond +6, when calculating, then clamps to stage +6 result", () => {
    // +6 acc vs -3 eva: net +9 => clamped to +6 => floor(100 * 3 / 1) = 300
    // Source: pokeemerald sAccuracyStageRatios -- stage +6 = {3, 1}
    expect(calculateAccuracy(100, 6, -3)).toBe(300);
  });

  it("given net stage beyond -6, when calculating, then clamps to stage -6 result", () => {
    // -3 acc vs +6 eva: net -9 => clamped to -6 => floor(100 * 33 / 100) = 33
    // Source: pokeemerald sAccuracyStageRatios -- stage -6 = {33, 100}
    expect(calculateAccuracy(100, -3, 6)).toBe(33);
  });

  it("given a 95-accuracy move at net stage -5, when calculating, then returns 34", () => {
    // Source: pokeemerald sAccuracyStageRatios -- stage -5 = {36, 100} => floor(95 * 36 / 100) = floor(34.2) = 34
    // Triangulation: different move accuracy than the 100-accuracy tests above
    expect(calculateAccuracy(95, 0, 5)).toBe(34);
  });
});

// ============================================================
// Integer ratio lookup tables (decomp-sourced)
// ============================================================

describe("GEN12_STAT_STAGE_RATIOS", () => {
  it("given the table, has 13 entries for stages -6 through +6", () => {
    // Source: pret/pokered data/battle/stat_modifiers.asm -- 13 pairs
    expect(GEN12_STAT_STAGE_RATIOS).toHaveLength(13);
  });
});

describe("getGen12StatStageRatio", () => {
  // Source: pret/pokered data/battle/stat_modifiers.asm
  it("given stage -6, returns {num: 25, den: 100} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(-6)).toEqual({ num: 25, den: 100 });
  });

  it("given stage -5, returns {num: 28, den: 100} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(-5)).toEqual({ num: 28, den: 100 });
  });

  it("given stage -4, returns {num: 33, den: 100} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(-4)).toEqual({ num: 33, den: 100 });
  });

  it("given stage -3, returns {num: 40, den: 100} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(-3)).toEqual({ num: 40, den: 100 });
  });

  it("given stage -2, returns {num: 50, den: 100} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(-2)).toEqual({ num: 50, den: 100 });
  });

  it("given stage -1, returns {num: 66, den: 100} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(-1)).toEqual({ num: 66, den: 100 });
  });

  it("given stage 0, returns {num: 1, den: 1} per pokered stat_modifiers.asm", () => {
    // Source: pokered -- db 1, 1 for stage 0
    expect(getGen12StatStageRatio(0)).toEqual({ num: 1, den: 1 });
  });

  it("given stage +1, returns {num: 15, den: 10} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(1)).toEqual({ num: 15, den: 10 });
  });

  it("given stage +2, returns {num: 2, den: 1} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(2)).toEqual({ num: 2, den: 1 });
  });

  it("given stage +3, returns {num: 25, den: 10} per pokered stat_modifiers.asm", () => {
    // Source: pokered -- db 25, 10 = 2.50x (NOT 2.66x like Gen 3+)
    expect(getGen12StatStageRatio(3)).toEqual({ num: 25, den: 10 });
  });

  it("given stage +4, returns {num: 3, den: 1} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(4)).toEqual({ num: 3, den: 1 });
  });

  it("given stage +5, returns {num: 35, den: 10} per pokered stat_modifiers.asm", () => {
    expect(getGen12StatStageRatio(5)).toEqual({ num: 35, den: 10 });
  });

  it("given stage +6, returns {num: 4, den: 1} per pokered stat_modifiers.asm", () => {
    // Source: pokered -- db 4, 1 = 4.00x (NOT 5.00x like Gen 3+)
    expect(getGen12StatStageRatio(6)).toEqual({ num: 4, den: 1 });
  });

  it("given stage beyond +6, clamps to +6 result", () => {
    expect(getGen12StatStageRatio(7)).toEqual({ num: 4, den: 1 });
    expect(getGen12StatStageRatio(10)).toEqual({ num: 4, den: 1 });
  });

  it("given stage beyond -6, clamps to -6 result", () => {
    expect(getGen12StatStageRatio(-7)).toEqual({ num: 25, den: 100 });
    expect(getGen12StatStageRatio(-10)).toEqual({ num: 25, den: 100 });
  });
});

describe("GEN3_STAT_STAGE_RATIOS", () => {
  it("given the table, has 13 entries for stages -6 through +6", () => {
    // Source: pret/pokeemerald src/pokemon.c:1868 gStatStageRatios -- 13 pairs
    expect(GEN3_STAT_STAGE_RATIOS).toHaveLength(13);
  });
});

describe("getGen3StatStageRatio", () => {
  // Source: pret/pokeemerald src/pokemon.c:1868 gStatStageRatios
  it("given stage -6, returns {num: 10, den: 40} per pokeemerald gStatStageRatios", () => {
    expect(getGen3StatStageRatio(-6)).toEqual({ num: 10, den: 40 });
  });

  it("given stage -5, returns {num: 10, den: 35} per pokeemerald gStatStageRatios", () => {
    expect(getGen3StatStageRatio(-5)).toEqual({ num: 10, den: 35 });
  });

  it("given stage 0, returns {num: 10, den: 10} per pokeemerald gStatStageRatios", () => {
    expect(getGen3StatStageRatio(0)).toEqual({ num: 10, den: 10 });
  });

  it("given stage +3, returns {num: 25, den: 10} per pokeemerald gStatStageRatios", () => {
    // Source: pokeemerald -- {25, 10} = 2.5x
    expect(getGen3StatStageRatio(3)).toEqual({ num: 25, den: 10 });
  });

  it("given stage +6, returns {num: 40, den: 10} per pokeemerald gStatStageRatios", () => {
    // Source: pokeemerald -- {40, 10} = 4.0x
    expect(getGen3StatStageRatio(6)).toEqual({ num: 40, den: 10 });
  });

  it("given stage beyond +6, clamps to +6 result", () => {
    expect(getGen3StatStageRatio(7)).toEqual({ num: 40, den: 10 });
  });

  it("given stage beyond -6, clamps to -6 result", () => {
    expect(getGen3StatStageRatio(-7)).toEqual({ num: 10, den: 40 });
  });

  it("given all stages, integer arithmetic produces correct effective ratios", () => {
    // Verify: stat * num / den produces the expected multiplied stat
    // Using a base stat of 100 for clarity
    // Source: pokeemerald APPLY_STAT_MOD macro -- var = stat * ratio[0]; var /= ratio[1]
    const base = 100;
    const expected = [25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400];
    for (let stage = -6; stage <= 6; stage++) {
      const { num, den } = getGen3StatStageRatio(stage);
      const result = Math.floor((base * num) / den);
      expect(result).toBe(expected[stage + 6]);
    }
  });
});

describe("ACCURACY_STAGE_RATIOS", () => {
  it("given the table, has 13 entries for stages -6 through +6", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:588 -- 13 pairs
    expect(ACCURACY_STAGE_RATIOS).toHaveLength(13);
  });
});

describe("getAccuracyStageRatio", () => {
  // Source: pret/pokeemerald src/battle_script_commands.c:588 sAccuracyStageRatios
  // Source: pret/pokecrystal data/battle/accuracy_multipliers.asm
  it("given stage -6, returns {num: 33, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(-6)).toEqual({ num: 33, den: 100 });
  });

  it("given stage -5, returns {num: 36, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    // Source: pokeemerald src/battle_script_commands.c sAccuracyStageRatios
    // floor(100 * 36 / 100) = 36, not 37 from a simplified 3-based formula
    expect(getAccuracyStageRatio(-5)).toEqual({ num: 36, den: 100 });
  });

  it("given stage -4, returns {num: 43, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(-4)).toEqual({ num: 43, den: 100 });
  });

  it("given stage -3, returns {num: 50, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(-3)).toEqual({ num: 50, den: 100 });
  });

  it("given stage -2, returns {num: 60, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(-2)).toEqual({ num: 60, den: 100 });
  });

  it("given stage -1, returns {num: 75, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(-1)).toEqual({ num: 75, den: 100 });
  });

  it("given stage 0, returns {num: 1, den: 1} per pokeemerald sAccuracyStageRatios", () => {
    // Source: pokeemerald -- {1, 1} for stage 0
    expect(getAccuracyStageRatio(0)).toEqual({ num: 1, den: 1 });
  });

  it("given stage +1, returns {num: 133, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(1)).toEqual({ num: 133, den: 100 });
  });

  it("given stage +2, returns {num: 166, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(2)).toEqual({ num: 166, den: 100 });
  });

  it("given stage +3, returns {num: 2, den: 1} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(3)).toEqual({ num: 2, den: 1 });
  });

  it("given stage +4, returns {num: 233, den: 100} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(4)).toEqual({ num: 233, den: 100 });
  });

  it("given stage +5, returns {num: 133, den: 50} per pokeemerald sAccuracyStageRatios", () => {
    // Source: pokeemerald -- {133, 50} = 2.66x (not {266, 100})
    // Source: pokecrystal -- db 133, 50 for +5
    expect(getAccuracyStageRatio(5)).toEqual({ num: 133, den: 50 });
  });

  it("given stage +6, returns {num: 3, den: 1} per pokeemerald sAccuracyStageRatios", () => {
    expect(getAccuracyStageRatio(6)).toEqual({ num: 3, den: 1 });
  });

  it("given stage beyond +6, clamps to +6 result", () => {
    expect(getAccuracyStageRatio(7)).toEqual({ num: 3, den: 1 });
  });

  it("given stage beyond -6, clamps to -6 result", () => {
    expect(getAccuracyStageRatio(-7)).toEqual({ num: 33, den: 100 });
  });

  it("given a 100-accuracy move at stage -5, integer math yields 36 not 37", () => {
    // Source: pokeemerald sAccuracyStageRatios -- {36, 100}
    // calc = moveAcc * dividend / divisor = 100 * 36 / 100 = 36
    // The simplified (3+stage)/3 formula gives 100*3/8 = 37.5 -> floor 37 (wrong!)
    const { num, den } = getAccuracyStageRatio(-5);
    const result = Math.floor((100 * num) / den);
    expect(result).toBe(36);
  });

  it("given a 100-accuracy move at stage -4, integer math yields 43 not 42", () => {
    // Source: pokeemerald sAccuracyStageRatios -- {43, 100}
    // calc = 100 * 43 / 100 = 43
    // The simplified formula gives 100*3/7 = 42.857 -> floor 42 (wrong!)
    const { num, den } = getAccuracyStageRatio(-4);
    const result = Math.floor((100 * num) / den);
    expect(result).toBe(43);
  });
});
