import { describe, expect, it } from "vitest";
import type { ExperienceGroup } from "../../../src/entities/experience";
import {
  calculateExpGain,
  calculateExpGainClassic,
  getExpForLevel,
  getExpToNextLevel,
  normalizeExperienceGroup,
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
  it("given any experience group, when querying level 1, then total EXP is 0", () => {
    for (const group of ALL_GROUPS) {
      expect(getExpForLevel(group, 1)).toBe(0);
    }
  });

  it("given medium-fast, when querying level 100, then total EXP is 1,000,000", () => {
    // Source: Bulbapedia — Medium Fast uses n^3, so 100^3 = 1,000,000.
    expect(getExpForLevel("medium-fast", 100)).toBe(1_000_000);
  });

  it("given fast, when querying level 100, then total EXP is 800,000", () => {
    // Source: Bulbapedia — Fast uses floor(4n^3 / 5), so floor(4 * 100^3 / 5) = 800,000.
    expect(getExpForLevel("fast", 100)).toBe(800_000);
  });

  it("given slow, when querying level 100, then total EXP is 1,250,000", () => {
    // Source: Bulbapedia — Slow uses floor(5n^3 / 4), so floor(5 * 100^3 / 4) = 1,250,000.
    expect(getExpForLevel("slow", 100)).toBe(1_250_000);
  });

  it("given erratic, when querying level 100, then total EXP is 600,000", () => {
    // Source: Bulbapedia — Erratic at level 100 uses floor(n^3 * (160 - n) / 100).
    expect(getExpForLevel("erratic", 100)).toBe(600_000);
  });

  it("given medium-slow, when querying level 100, then total EXP is 1,059,860", () => {
    // Source: Bulbapedia — Medium Slow uses floor(6/5 n^3 - 15n^2 + 100n - 140).
    expect(getExpForLevel("medium-slow", 100)).toBe(1_059_860);
  });

  it("given fluctuating, when querying level 100, then total EXP is 1,640,000", () => {
    // Source: Bulbapedia — Fluctuating at level 100 uses floor(n^3 * (floor(n / 2) + 32) / 50).
    expect(getExpForLevel("fluctuating", 100)).toBe(1_640_000);
  });

  it("given every experience group, when walking levels 2 through 100, then total EXP increases monotonically", () => {
    for (const group of ALL_GROUPS) {
      let prev = getExpForLevel(group, 2);
      for (let level = 3; level <= 100; level++) {
        const current = getExpForLevel(group, level);
        expect(current).toBeGreaterThan(prev);
        prev = current;
      }
    }
  });

  it("given medium-fast, when sampling a few levels, then the cubic formula matches known totals", () => {
    // Source: Bulbapedia — Medium Fast uses n^3, so the exact totals are direct cubes.
    expect(getExpForLevel("medium-fast", 2)).toBe(8);
    expect(getExpForLevel("medium-fast", 10)).toBe(1_000);
    expect(getExpForLevel("medium-fast", 50)).toBe(125_000);
  });

  it("given every experience group, when querying level 2, then the totals match the documented formulas", () => {
    // Source: Bulbapedia — these level-2 totals are direct formula results.
    expect(getExpForLevel("erratic", 2)).toBe(15);
    expect(getExpForLevel("fast", 2)).toBe(6);
    expect(getExpForLevel("medium-fast", 2)).toBe(8);
    expect(getExpForLevel("medium-slow", 2)).toBe(9);
    expect(getExpForLevel("slow", 2)).toBe(10);
    expect(getExpForLevel("fluctuating", 2)).toBe(4);
  });

  it("given the PokeAPI slow-then-very-fast alias, when querying EXP totals, then it normalizes to erratic", () => {
    // Source: PokeAPI growth-rate data — slow-then-very-fast is the erratic formula.
    expect(normalizeExperienceGroup("slow-then-very-fast")).toBe("erratic");
    expect(getExpForLevel("slow-then-very-fast", 50)).toBe(getExpForLevel("erratic", 50));
    expect(getExpForLevel("slow-then-very-fast", 100)).toBe(600_000);
  });

  it("given the PokeAPI medium alias, when querying EXP totals, then it normalizes to medium-fast", () => {
    // Source: PokeAPI growth-rate naming — medium is the medium-fast curve.
    expect(normalizeExperienceGroup("medium")).toBe("medium-fast");
    expect(getExpForLevel("medium", 50)).toBe(getExpForLevel("medium-fast", 50));
    expect(getExpForLevel("medium", 100)).toBe(1_000_000);
  });

  it("given the PokeAPI fast-then-very-slow alias, when querying EXP totals, then it normalizes to fluctuating", () => {
    // Source: PokeAPI growth-rate data — fast-then-very-slow is the fluctuating formula.
    expect(normalizeExperienceGroup("fast-then-very-slow")).toBe("fluctuating");
    expect(getExpForLevel("fast-then-very-slow", 50)).toBe(getExpForLevel("fluctuating", 50));
    expect(getExpForLevel("fast-then-very-slow", 100)).toBe(1_640_000);
  });

  it("given an unsupported growth-rate identifier, when querying EXP totals, then it throws clearly", () => {
    expect(() => normalizeExperienceGroup("sideways-growth")).toThrow(
      'Unsupported experience growth group "sideways-growth"',
    );
    expect(() => getExpForLevel("sideways-growth", 50)).toThrow(
      'Unsupported experience growth group "sideways-growth"',
    );
  });
});

describe("getExpToNextLevel", () => {
  it("given every experience group, when querying level 100, then EXP to next level is 0", () => {
    for (const group of ALL_GROUPS) {
      expect(getExpToNextLevel(group, 100)).toBe(0);
    }
  });

  it("given adjacent levels, when comparing cumulative totals, then the delta matches getExpToNextLevel", () => {
    for (const group of ALL_GROUPS) {
      for (let level = 1; level < 100; level++) {
        const expected = getExpForLevel(group, level + 1) - getExpForLevel(group, level);
        expect(getExpToNextLevel(group, level)).toBe(expected);
      }
    }
  });
});

describe("calculateExpGain (Gen 5+ scaled)", () => {
  it("given the minimum possible battle values, when calculating scaled EXP, then the floor result is clamped to 1", () => {
    // Source: Bulbapedia — Experience gain is always at least 1.
    expect(calculateExpGain(1, 1, 100, false)).toBe(1);
  });

  it("given identical battle parameters except trainer flag, when calculating scaled EXP, then trainer battles award more", () => {
    const wild = calculateExpGain(64, 25, 25, false);
    const trainer = calculateExpGain(64, 25, 25, true);
    // Source: Showdown sim/battle-actions.ts — trainer battles apply a 1.5x multiplier.
    expect(wild).toBe(640);
    expect(trainer).toBe(960);
  });

  it("given identical battle parameters except Lucky Egg, when calculating scaled EXP, then Lucky Egg boosts the reward", () => {
    const noEgg = calculateExpGain(64, 25, 25, false, 1, false);
    const withEgg = calculateExpGain(64, 25, 25, false, 1, true);
    // Source: Showdown sim/battle-actions.ts — Lucky Egg applies a 1.5x multiplier.
    expect(noEgg).toBe(640);
    expect(withEgg).toBe(960);
  });

  it("given the same battle but a higher participant level, when calculating scaled EXP, then the level penalty reduces the reward", () => {
    const sameLevelExp = calculateExpGain(64, 50, 50, false);
    const higherLevelExp = calculateExpGain(64, 50, 80, false);
    // Source: Bulbapedia — the Gen 5+ formula scales EXP down for higher-level participants.
    expect(sameLevelExp).toBe(1_280);
    expect(higherLevelExp).toBe(990);
  });

  it("given one participant versus two, when calculating scaled EXP, then the split is exact", () => {
    const solo = calculateExpGain(64, 25, 25, false, 1);
    const duo = calculateExpGain(64, 25, 25, false, 2);
    // Source: Bulbapedia — participant count divides the EXP before other multipliers.
    expect(solo).toBe(640);
    expect(duo).toBe(320);
  });
});

describe("calculateExpGainClassic (Gen 1-4)", () => {
  it("given the minimum possible classic battle values, when calculating EXP, then the floor result is clamped to 1", () => {
    // Source: Bulbapedia — Experience gain is always at least 1.
    expect(calculateExpGainClassic(1, 1, false)).toBe(1);
  });

  it("given identical classic battle parameters except trainer flag, when calculating EXP, then trainer battles award more", () => {
    const wild = calculateExpGainClassic(64, 25, false);
    const trainer = calculateExpGainClassic(64, 25, true);
    // Source: pret/pokeemerald src/battle_script_commands.c — trainer battles apply a 1.5x multiplier.
    expect(wild).toBe(228);
    expect(trainer).toBe(342);
  });

  it("given one participant versus two, when calculating classic EXP, then the split is exact", () => {
    const solo = calculateExpGainClassic(64, 25, false, 1);
    const duo = calculateExpGainClassic(64, 25, false, 2);
    // Source: pret/pokeemerald src/battle_script_commands.c — participant count divides before multipliers.
    expect(solo).toBe(228);
    expect(duo).toBe(114);
  });

  it("given baseExpYield=64, defeatedLevel=50, trainer battle, and 1 participant, when calculating classic EXP, then step-by-step truncation yields 685", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Cmd_getexp
    //   Step 1: floor(64 * 50 / 7) = floor(457.14) = 457
    //   Step 2: floor(457 / 1) = 457
    //   Step 3: floor(457 * 1.5) = floor(685.5) = 685
    const result = calculateExpGainClassic(64, 50, true, 1);
    expect(result).toBe(685);
  });

  it("given baseExpYield=65, defeatedLevel=50, trainer battle, and 3 participants, when calculating classic EXP, then step-by-step truncation yields 231", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Cmd_getexp
    //   Step 1: floor(65 * 50 / 7) = floor(464.2857) = 464
    //   Step 2: floor(464 / 3) = floor(154.666) = 154
    //   Step 3: floor(154 * 1.5) = floor(231) = 231
    //   Without step-by-step: floor(464.2857 / 3 * 1.5) = floor(232.14) = 232
    // The difference demonstrates that intermediate floors matter.
    const result = calculateExpGainClassic(65, 50, true, 3);
    expect(result).toBe(231);
  });

  it("given baseExpYield=100, defeatedLevel=30, wild battle, and 1 participant with Lucky Egg, when calculating classic EXP, then Lucky Egg applies a 1.5x multiplier", () => {
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

  it("given baseExpYield=64, defeatedLevel=50, wild battle, and 1 participant with Lucky Egg, when calculating classic EXP, then returns floor(457 * 1.5) = 685", () => {
    // Source: pret/pokeemerald — Lucky Egg multiplier
    //   Step 1: floor(64 * 50 / 7) = floor(457.14) = 457
    //   Step 2: floor(457 / 1) = 457
    //   Step 3: floor(457 * 1.0) = 457 (wild)
    //   Step 4: floor(457 * 1.5) = floor(685.5) = 685
    const result = calculateExpGainClassic(64, 50, false, 1, true);
    expect(result).toBe(685);
  });

  it("given very small values, when calculating classic EXP, then the minimum result is 1", () => {
    // Source: pret/pokeemerald — EXP is always at least 1.
    const result = calculateExpGainClassic(1, 1, false, 7);
    // floor(1 * 1 / 7) = 0, but max(1, 0) = 1
    expect(result).toBe(1);
  });
});
