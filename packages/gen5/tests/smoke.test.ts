import { describe, expect, it } from "vitest";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

describe("Gen5Ruleset smoke tests", () => {
  it("given Gen5Ruleset, when checking generation property, then returns 5", () => {
    // Source: Gen5Ruleset.generation is set to 5 in the class definition
    // (Generation V: Black/White/Black2/White2, 2010-2012)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.generation).toBe(5);
  });

  it("given Gen5Ruleset, when checking name, then includes Gen 5", () => {
    // Source: Gen5Ruleset.name is set to "Gen 5 (Black/White/Black2/White2)" in the class definition
    const ruleset = new Gen5Ruleset();
    expect(ruleset.name).toContain("Gen 5");
  });

  it("given Gen5Ruleset, when getting type chart, then returns non-empty type chart", () => {
    // Source: Gen 5 has 17 types (same as Gen 2-4)
    const ruleset = new Gen5Ruleset();
    const chart = ruleset.getTypeChart();
    expect(Object.keys(chart).length).toBeGreaterThan(0);
  });

  it("given Gen5Ruleset, when getting available types, then returns array of 17 types", () => {
    // Source: Gen 5 has 17 types (no Fairy, which was added in Gen 6)
    const ruleset = new Gen5Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types.length).toBe(17);
  });

  it("given Gen5Ruleset, when getting available types, then does not include fairy", () => {
    // Source: Fairy type was introduced in Gen 6
    const ruleset = new Gen5Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types).not.toContain("fairy");
  });

  it("given Gen5Ruleset, when getting crit rate table, then first stage is 1/16", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1625
    // Gen 3-5 crit rate: stage 0 = 1/16 chance (denominator 16)
    const ruleset = new Gen5Ruleset();
    const table = ruleset.getCritRateTable();
    expect(table[0]).toBe(16);
  });

  it("given Gen5Ruleset, when getting crit rate table, then has 5 stages [16, 8, 4, 3, 2]", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts lines 1625-1627
    // Gen 3-5: 5-stage crit table
    const ruleset = new Gen5Ruleset();
    const table = ruleset.getCritRateTable();
    expect([...table]).toEqual([16, 8, 4, 3, 2]);
  });

  it("given Gen5Ruleset, when getting crit multiplier, then returns 2.0", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
    // Gen 2-5: critical hits deal 2x damage (Gen 6+ reduced to 1.5x)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });

  it("given Gen5Ruleset, when checking hasAbilities, then returns true", () => {
    // Source: Abilities introduced in Gen 3, present in all subsequent gens
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasAbilities()).toBe(true);
  });

  it("given Gen5Ruleset, when checking hasHeldItems, then returns true", () => {
    // Source: Held items introduced in Gen 2, present in all subsequent gens
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasHeldItems()).toBe(true);
  });

  it("given Gen5Ruleset, when checking hasWeather, then returns true", () => {
    // Source: Weather introduced in Gen 2, present in all subsequent gens
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasWeather()).toBe(true);
  });

  it("given Gen5Ruleset, when checking hasTerrain, then returns false", () => {
    // Source: Terrain was not introduced until Gen 7
    const ruleset = new Gen5Ruleset();
    expect(ruleset.hasTerrain()).toBe(false);
  });

  it("given Gen5Ruleset, when checking getBattleGimmick, then returns null", () => {
    // Source: No battle gimmick in Gen 5 (Mega Evolution introduced in Gen 6)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getBattleGimmick()).toBeNull();
  });

  it("given Gen5Ruleset, when checking shouldExecutePursuitPreSwitch, then returns true", () => {
    // Source: Pursuit executes before switch in Gen 2-7 (removed in Gen 8)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.shouldExecutePursuitPreSwitch()).toBe(true);
  });

  it("given Gen5Ruleset, when checking available hazards, then includes stealth-rock and spikes and toxic-spikes", () => {
    // Source: Stealth Rock, Spikes, Toxic Spikes all available in Gen 5
    const ruleset = new Gen5Ruleset();
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toContain("stealth-rock");
    expect(hazards).toContain("spikes");
    expect(hazards).toContain("toxic-spikes");
  });

  it("given Gen5Ruleset, when getting confusion self-hit chance, then returns 0.5", () => {
    // Source: Gen 1-6 confusion self-hit is 50% (Gen 7+ reduced to 33%)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getConfusionSelfHitChance()).toBe(0.5);
  });
});
