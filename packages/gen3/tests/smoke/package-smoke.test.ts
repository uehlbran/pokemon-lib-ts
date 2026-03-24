import { describe, expect, it } from "vitest";
import { createGen3DataManager, Gen3Ruleset } from "../../src";

/**
 * Gen 3 Smoke Tests
 *
 * Simple instantiation and data loading tests to verify the Gen 3 package
 * is correctly wired up and exports work.
 */

describe("Gen 3 Smoke Tests", () => {
  it("given Gen3Ruleset constructor, when instantiated, then generation = 3 and name is set", () => {
    const ruleset = new Gen3Ruleset();

    expect(ruleset.generation).toBe(3);
    expect(ruleset.name).toBe("Gen 3 (Ruby/Sapphire/Emerald)");
  });

  it("given createGen3DataManager, when called, then loads 386 Pokemon species", () => {
    // Source: Gen 3 has 386 Pokemon (#1 Bulbasaur through #386 Deoxys)
    const dm = createGen3DataManager();

    expect(dm.getAllSpecies().length).toBe(386);
  });

  it("given createGen3DataManager, when getSpecies('blaziken'), then returns Blaziken data", () => {
    // Source: Blaziken is #257 in the National Dex, a Gen 3 starter final evolution
    const dm = createGen3DataManager();
    const blaziken = dm.getSpecies(257);

    expect(blaziken).toBeDefined();
    expect(blaziken.name.toLowerCase()).toContain("blaziken");
  });

  it("given createGen3DataManager, when getMove('earthquake'), then returns Earthquake data", () => {
    // Source: Earthquake is a Gen 1 move available in all gens
    const dm = createGen3DataManager();
    const earthquake = dm.getMove("earthquake");

    expect(earthquake).toBeDefined();
    expect(earthquake.type).toBe("ground");
    expect(earthquake.power).toBe(100);
    expect(earthquake.category).toBe("physical");
  });

  it("given Gen3Ruleset, when getAvailableTypes called, then returns 17 types (no Fairy)", () => {
    // Source: Gen 3 has 17 types — Fairy was added in Gen 6
    const ruleset = new Gen3Ruleset();
    const types = ruleset.getAvailableTypes();

    expect(types.length).toBe(17);
    expect(types).not.toContain("fairy");
    expect(types).toContain("dark");
    expect(types).toContain("steel");
    expect(types).toContain("dragon");
  });

  it("given Gen3Ruleset, when getAvailableHazards called, then returns only spikes", () => {
    // Source: Gen 3 only has Spikes; Stealth Rock and Toxic Spikes were added in Gen 4
    const ruleset = new Gen3Ruleset();
    const hazards = ruleset.getAvailableHazards();

    expect(hazards).toEqual(["spikes"]);
  });

  it("given Gen3Ruleset, when hasAbilities called, then returns true", () => {
    // Source: Abilities were introduced in Gen 3
    const ruleset = new Gen3Ruleset();

    expect(ruleset.hasAbilities()).toBe(true);
  });

  it("given Gen3Ruleset, when hasHeldItems called, then returns true", () => {
    // Source: Held items were introduced in Gen 2 and carried forward
    const ruleset = new Gen3Ruleset();

    expect(ruleset.hasHeldItems()).toBe(true);
  });

  it("given Gen3Ruleset, when hasWeather called, then returns true", () => {
    // Source: Weather was introduced in Gen 2 and expanded in Gen 3 (Hail added)
    const ruleset = new Gen3Ruleset();

    expect(ruleset.hasWeather()).toBe(true);
  });

  it("given Gen3Ruleset, when getCritMultiplier called, then returns 2.0", () => {
    // Source: pret/pokeemerald — Gen 3-5 crit multiplier is 2.0x
    const ruleset = new Gen3Ruleset();

    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });
});
