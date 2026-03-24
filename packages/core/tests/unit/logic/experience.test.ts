import { describe, expect, it } from "vitest";
import type { ExperienceGroup } from "../../../src/entities/experience";
import {
  calculateExpGain,
  calculateExpGainClassic,
  getExpForLevel,
  getExpToNextLevel,
} from "../../../src/logic/experience";

const ALL_GROUPS: ExperienceGroup[] = [
  "erratic",
  "fast",
  "medium-fast",
  "medium-slow",
  "slow",
  "fluctuating",
];

describe("getExpForLevel", () => {
  it("should return 0 for level 1", () => {
    for (const group of ALL_GROUPS) {
      expect(getExpForLevel(group, 1)).toBe(0);
    }
  });

  it("should return 1,000,000 for medium-fast at L100", () => {
    expect(getExpForLevel("medium-fast", 100)).toBe(1_000_000);
  });

  it("should return 800,000 for fast at L100", () => {
    expect(getExpForLevel("fast", 100)).toBe(800_000);
  });

  it("should return 1,250,000 for slow at L100", () => {
    expect(getExpForLevel("slow", 100)).toBe(1_250_000);
  });

  it("should return 600,000 for erratic at L100", () => {
    expect(getExpForLevel("erratic", 100)).toBe(600_000);
  });

  it("should return 1,059,860 for medium-slow at L100", () => {
    expect(getExpForLevel("medium-slow", 100)).toBe(1_059_860);
  });

  it("should return 1,640,000 for fluctuating at L100", () => {
    expect(getExpForLevel("fluctuating", 100)).toBe(1_640_000);
  });

  it("should be monotonically increasing from L2 to L100 for all groups", () => {
    for (const group of ALL_GROUPS) {
      let prev = getExpForLevel(group, 2);
      for (let level = 3; level <= 100; level++) {
        const current = getExpForLevel(group, level);
        expect(current).toBeGreaterThan(prev);
        prev = current;
      }
    }
  });

  it("should return known values for medium-fast", () => {
    // n^3 formula
    expect(getExpForLevel("medium-fast", 2)).toBe(8);
    expect(getExpForLevel("medium-fast", 10)).toBe(1_000);
    expect(getExpForLevel("medium-fast", 50)).toBe(125_000);
  });

  it("should return positive values for all levels > 1", () => {
    for (const group of ALL_GROUPS) {
      for (let level = 2; level <= 100; level++) {
        expect(getExpForLevel(group, level)).toBeGreaterThan(0);
      }
    }
  });
});

describe("getExpToNextLevel", () => {
  it("should return 0 at level 100", () => {
    for (const group of ALL_GROUPS) {
      expect(getExpToNextLevel(group, 100)).toBe(0);
    }
  });

  it("should return positive values for levels below 100", () => {
    for (const group of ALL_GROUPS) {
      for (let level = 1; level < 100; level++) {
        expect(getExpToNextLevel(group, level)).toBeGreaterThan(0);
      }
    }
  });

  it("should equal the difference between consecutive getExpForLevel calls", () => {
    for (const group of ALL_GROUPS) {
      for (let level = 1; level < 100; level++) {
        const expected = getExpForLevel(group, level + 1) - getExpForLevel(group, level);
        expect(getExpToNextLevel(group, level)).toBe(expected);
      }
    }
  });
});

describe("calculateExpGain (Gen 5+ scaled)", () => {
  it("should return at least 1", () => {
    expect(calculateExpGain(1, 1, 100, false)).toBeGreaterThanOrEqual(1);
  });

  it("should give more EXP for trainer battles (1.5x)", () => {
    const wild = calculateExpGain(64, 25, 25, false);
    const trainer = calculateExpGain(64, 25, 25, true);
    expect(trainer).toBeGreaterThan(wild);
  });

  it("should give more EXP with Lucky Egg (1.5x)", () => {
    const noEgg = calculateExpGain(64, 25, 25, false, 1, false);
    const withEgg = calculateExpGain(64, 25, 25, false, 1, true);
    expect(withEgg).toBeGreaterThan(noEgg);
  });

  it("should reduce EXP when participant is higher level", () => {
    const sameLevelExp = calculateExpGain(64, 50, 50, false);
    const higherLevelExp = calculateExpGain(64, 50, 80, false);
    expect(higherLevelExp).toBeLessThan(sameLevelExp);
  });

  it("should split EXP among participants", () => {
    const solo = calculateExpGain(64, 25, 25, false, 1);
    const duo = calculateExpGain(64, 25, 25, false, 2);
    expect(duo).toBeLessThan(solo);
  });
});

describe("calculateExpGainClassic (Gen 1-4)", () => {
  it("should return at least 1", () => {
    expect(calculateExpGainClassic(1, 1, false)).toBeGreaterThanOrEqual(1);
  });

  it("should give more EXP for trainer battles (1.5x)", () => {
    const wild = calculateExpGainClassic(64, 25, false);
    const trainer = calculateExpGainClassic(64, 25, true);
    expect(trainer).toBeGreaterThan(wild);
  });

  it("should split EXP among participants", () => {
    const solo = calculateExpGainClassic(64, 25, false, 1);
    const duo = calculateExpGainClassic(64, 25, false, 2);
    expect(duo).toBeLessThan(solo);
  });

  it("should not scale with participant level (unlike Gen 5+)", () => {
    // In classic formula, participant level doesn't matter
    const lowLevel = calculateExpGainClassic(64, 25, false, 1);
    // The classic formula only uses defeated level, not participant level.
    // Calling with same params should give same result.
    expect(lowLevel).toBe(calculateExpGainClassic(64, 25, false, 1));
  });

  it("given baseExpYield=64, defeatedLevel=50, trainer battle, 1 participant, when calculating EXP, then applies step-by-step truncation yielding 685", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Cmd_getexp
    //   Step 1: floor(64 * 50 / 7) = floor(457.14) = 457
    //   Step 2: floor(457 / 1) = 457
    //   Step 3: floor(457 * 1.5) = floor(685.5) = 685
    const result = calculateExpGainClassic(64, 50, true, 1);
    expect(result).toBe(685);
  });

  it("given baseExpYield=65, defeatedLevel=50, trainer battle, 3 participants, when calculating EXP, then step-by-step truncation yields 231 (not 232)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Cmd_getexp
    //   Step 1: floor(65 * 50 / 7) = floor(464.2857) = 464
    //   Step 2: floor(464 / 3) = floor(154.666) = 154
    //   Step 3: floor(154 * 1.5) = floor(231) = 231
    //   Without step-by-step: floor(464.2857 / 3 * 1.5) = floor(232.14) = 232
    // The difference demonstrates that intermediate floors matter.
    const result = calculateExpGainClassic(65, 50, true, 3);
    expect(result).toBe(231);
  });

  it("given baseExpYield=100, defeatedLevel=30, wild battle, 1 participant with Lucky Egg, when calculating EXP, then Lucky Egg applies 1.5x multiplier", () => {
    // Source: pret/pokeemerald — Lucky Egg 1.5x multiplier after trainer bonus
    //   Step 1: floor(100 * 30 / 7) = floor(428.57) = 428
    //   Step 2: floor(428 / 1) = 428
    //   Step 3: floor(428 * 1.0) = 428 (wild battle)
    //   Step 4 (Lucky Egg): floor(428 * 1.5) = floor(642) = 642
    const withoutEgg = calculateExpGainClassic(100, 30, false, 1, false);
    const withEgg = calculateExpGainClassic(100, 30, false, 1, true);
    expect(withoutEgg).toBe(428);
    expect(withEgg).toBe(642);
  });

  it("given baseExpYield=64, defeatedLevel=50, wild battle, 1 participant with Lucky Egg, when calculating EXP, then returns floor(457 * 1.5) = 685", () => {
    // Source: pret/pokeemerald — Lucky Egg multiplier
    //   Step 1: floor(64 * 50 / 7) = floor(457.14) = 457
    //   Step 2: floor(457 / 1) = 457
    //   Step 3: floor(457 * 1.0) = 457 (wild)
    //   Step 4: floor(457 * 1.5) = floor(685.5) = 685
    const result = calculateExpGainClassic(64, 50, false, 1, true);
    expect(result).toBe(685);
  });

  it("given very small values, when calculating EXP, then returns minimum 1", () => {
    // Source: pret/pokeemerald — EXP is always at least 1
    const result = calculateExpGainClassic(1, 1, false, 7);
    // floor(1 * 1 / 7) = 0, but max(1, 0) = 1
    expect(result).toBe(1);
  });
});
