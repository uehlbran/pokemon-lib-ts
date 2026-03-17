import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";

describe("Gen 3 DataManager — data loading", () => {
  it("given gen3 data files, when loading DataManager, then loads 386 Pokemon", () => {
    // Source: National Pokédex Gen 3 ends at #386 Deoxys
    const dm = createGen3DataManager();
    expect(dm.getAllSpecies().length).toBe(386);
  });

  it("given gen3 data files, when loading DataManager, then loads 370 moves", () => {
    // Source: @pkmn/data gen3 move count (370 moves in Gen 3 including Struggle)
    const dm = createGen3DataManager();
    expect(dm.getAllMoves().length).toBe(370);
  });

  it("given gen3 data files, when loading DataManager, then loads 76 abilities", () => {
    // Source: 76 abilities introduced in Gen 3 (Ruby/Sapphire/Emerald)
    const dm = createGen3DataManager();
    expect(dm.getAllAbilities().length).toBe(76);
  });

  it("given gen3 data files, when loading DataManager, then loads 25 natures", () => {
    // Source: 25 natures introduced in Gen 3
    const dm = createGen3DataManager();
    expect(dm.getAllNatures().length).toBe(25);
  });

  it("given gen3 type chart, when loading DataManager, then has 17 types", () => {
    // Source: Gen 3 has 17 types (no Fairy, which was added in Gen 6)
    const dm = createGen3DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(17);
  });

  it("given gen3 type chart, when checking Steel vs Water, then Steel resists Water (0.5x)", () => {
    // Source: pret/pokeemerald type chart — Steel resists Water in Gen 3 (removed Gen 6)
    const dm = createGen3DataManager();
    const chart = dm.getTypeChart();
    expect(chart.water?.steel).toBe(0.5);
  });

  it("given gen3 type chart, when checking Steel vs Electric, then Steel resists Electric (0.5x)", () => {
    // Source: pret/pokeemerald type chart — Steel resists Electric in Gen 3 (removed Gen 6)
    const dm = createGen3DataManager();
    const chart = dm.getTypeChart();
    expect(chart.electric?.steel).toBe(0.5);
  });

  it("given gen3 data, when looking up Blaziken, then base Speed is 80", () => {
    // Source: Bulbapedia — Blaziken (#257) base Speed = 80
    const dm = createGen3DataManager();
    const blaziken = dm.getSpeciesByName("blaziken");
    expect(blaziken.baseStats.speed).toBe(80);
  });
});
