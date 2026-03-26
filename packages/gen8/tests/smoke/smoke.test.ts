import { describe, expect, it } from "vitest";
import { createGen8DataManager } from "../../src/data/index.js";
import { Gen8Ruleset } from "../../src/Gen8Ruleset.js";

/**
 * Smoke tests for Gen 8 package.
 * Verifies that the ruleset and generated data load with the expected
 * top-level counts from the committed Gen 8 data bundle.
 */
describe("Gen8 smoke test", () => {
  it("given Gen8Ruleset, when instantiated, then it reports generation 8 and exposes 18 types", () => {
    // Source: Gen8Ruleset class definition and the 18-type chart used from Gen 6 onward.
    const ruleset = new Gen8Ruleset();
    expect(ruleset.generation).toBe(8);
    expect(ruleset.getAvailableTypes().length).toBe(18);
  });

  it("given gen8 data manager, when querying species, then it loads the committed 664-species dataset", () => {
    // Source: packages/gen8/data/pokemon.json in the committed generated data bundle.
    const dm = createGen8DataManager();
    const species = dm.getAllSpecies();
    expect(species.length).toBe(664);
  });

  it("given gen8 data manager, when querying moves, then it loads the committed 646-move dataset", () => {
    // Source: packages/gen8/data/moves.json in the committed generated data bundle.
    const dm = createGen8DataManager();
    const moves = dm.getAllMoves();
    expect(moves.length).toBe(646);
  });

  it("given gen8 data manager, when querying type chart, then has 18 types", () => {
    // Source: packages/gen8/data/type-chart.json — Gen 8 uses the 18-type chart.
    const dm = createGen8DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(18);
  });

  it("given gen8 data manager, when querying abilities, then it loads the committed 267-ability dataset", () => {
    // Source: packages/gen8/data/abilities.json in the committed generated data bundle.
    const dm = createGen8DataManager();
    const abilities = dm.getAllAbilities();
    expect(abilities.length).toBe(267);
  });

  it("given gen8 data manager, when querying items, then it loads the committed 354-item dataset", () => {
    // Source: packages/gen8/data/items.json in the committed generated data bundle.
    const dm = createGen8DataManager();
    const items = dm.getAllItems();
    expect(items.length).toBe(354);
  });
});
