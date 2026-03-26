import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN4_SPECIES_IDS } from "../src";
import { createGen4DataManager } from "../src/data";

describe("Gen 4 DataManager -- data loading", () => {
  it("given gen4 data files, when loading DataManager, then loads 493 Pokemon", () => {
    // Source: National Pokedex Gen 4 ends at #493 Arceus
    const dm = createGen4DataManager();
    expect(dm.getAllSpecies().length).toBe(493);
  });

  it("given gen4 data files, when loading DataManager, then loads 483 moves", () => {
    // Source: @pkmn/data gen4 move count (483 moves in Gen 4)
    const dm = createGen4DataManager();
    expect(dm.getAllMoves().length).toBe(483);
  });

  it("given gen4 data files, when loading DataManager, then loads 123 abilities", () => {
    // Source: @pkmn/data gen4 ability count (123 abilities through Gen 4)
    const dm = createGen4DataManager();
    expect(dm.getAllAbilities().length).toBe(123);
  });

  it("given gen4 data files, when loading DataManager, then loads 25 natures", () => {
    // Source: 25 natures introduced in Gen 3, unchanged through Gen 4
    const dm = createGen4DataManager();
    expect(dm.getAllNatures().length).toBe(25);
  });

  it("given gen4 data files, when loading DataManager, then loads 210 items", () => {
    // Source: packages/gen4/data/items.json — jq '. | length' returns 210
    // Gen 4 (Diamond/Pearl/Platinum/HeartGold/SoulSilver) adds many new items including
    // held items, weather rocks, berries, plates, evolutionary items, and battle items.
    const dm = createGen4DataManager();
    expect(dm.getAllItems().length).toBe(210);
  });

  it("given gen4 type chart, when loading DataManager, then has 17 types", () => {
    // Source: Gen 4 has 17 types (same as Gen 2-5, no Fairy yet)
    const dm = createGen4DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(17);
  });

  it("given gen4 type chart, when checking Steel vs Fire, then Fire is super effective (2x)", () => {
    // Source: Bulbapedia -- Fire is super effective against Steel in all gens
    const dm = createGen4DataManager();
    const chart = dm.getTypeChart();
    expect(chart.fire?.steel).toBe(2);
  });

  it("given gen4 type chart, when checking Ghost vs Normal, then Normal is immune (0x)", () => {
    // Source: Bulbapedia -- Normal-type moves do not affect Ghost-type Pokemon
    const dm = createGen4DataManager();
    const chart = dm.getTypeChart();
    expect(chart.normal?.ghost).toBe(0);
  });

  it("given gen4 data, when looking up Garchomp, then base Speed is 102", () => {
    // Source: Bulbapedia -- Garchomp (#445) base Speed = 102
    const dm = createGen4DataManager();
    const garchomp = dm.getSpecies(GEN4_SPECIES_IDS.garchomp);
    expect(garchomp.baseStats.speed).toBe(102);
  });

  it("given gen4 data, when looking up Lucario, then has Fighting/Steel types", () => {
    // Source: Bulbapedia -- Lucario (#448) is Fighting/Steel
    const dm = createGen4DataManager();
    const lucario = dm.getSpecies(GEN4_SPECIES_IDS.lucario);
    expect(lucario.types).toEqual([CORE_TYPE_IDS.fighting, CORE_TYPE_IDS.steel]);
  });
});
