import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS, Gen1Ruleset } from "../../src";

describe("Gen 1 package smoke", () => {
  it("given the published entrypoints, when creating the ruleset and loading base data, then representative records are available", () => {
    const dataManager = createGen1DataManager();
    const ruleset = new Gen1Ruleset();

    expect(ruleset.generation).toBe(1);
    expect(dataManager.getSpecies(GEN1_SPECIES_IDS.pikachu)?.displayName).toBe("Pikachu");
    expect(dataManager.getMove(GEN1_MOVE_IDS.thunderbolt)?.displayName).toBe("Thunderbolt");
  });
});
