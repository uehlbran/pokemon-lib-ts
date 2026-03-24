import { describe, expect, it } from "vitest";
import { createGen2DataManager, Gen2Ruleset } from "../../src";

describe("Gen 2 package smoke", () => {
  it("given the published entrypoints, when creating the ruleset and loading base data, then representative records are available", () => {
    const dataManager = createGen2DataManager();
    const ruleset = new Gen2Ruleset();

    expect(ruleset.generation).toBe(2);
    expect(dataManager.getSpecies(197)?.displayName).toBe("Umbreon");
    expect(dataManager.getMove("crunch")?.displayName).toBe("Crunch");
  });
});
