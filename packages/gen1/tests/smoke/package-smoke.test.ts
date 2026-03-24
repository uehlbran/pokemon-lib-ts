import { describe, expect, it } from "vitest";
import { createGen1DataManager, Gen1Ruleset } from "../../src";

describe("Gen 1 package smoke", () => {
  it("given the published entrypoints, when creating the ruleset and loading base data, then representative records are available", () => {
    const dataManager = createGen1DataManager();
    const ruleset = new Gen1Ruleset();

    expect(ruleset.generation).toBe(1);
    expect(dataManager.getSpecies(25)?.displayName).toBe("Pikachu");
    expect(dataManager.getMove("thunderbolt")?.displayName).toBe("Thunderbolt");
  });
});
