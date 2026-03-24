import { describe, expect, it } from "vitest";
import { MEGA_STONE_DATA } from "../../src/logic/mega-stone-data.js";

describe("MEGA_STONE_DATA", () => {
  it("contains the 47 shared Gen 6 and Gen 7 mega stones", () => {
    // Source: packages/gen6/data/items.json and packages/gen7/data/items.json
    // Both gens list the same 47 canonical Mega Stone items. Rayquaza is
    // intentionally excluded because it Mega Evolves via Dragon Ascent, not a
    // stone.
    expect(Object.keys(MEGA_STONE_DATA).length).toBe(47);
  });

  it("includes Charizardite X and preserves the Mega Charizard X data", () => {
    // Source: Bulbapedia "Charizardite X" and the imported Gen 6 / Gen 7 mega
    // form data tables. Mega Charizard X is Fire/Dragon with Tough Claws and
    // 130 Attack.
    const data = MEGA_STONE_DATA["charizardite-x"];
    expect(data.form).toBe("mega-charizard-x");
    expect(data.types).toEqual(["fire", "dragon"]);
    expect(data.ability).toBe("tough-claws");
    expect(data.baseStats.attack).toBe(130);
  });

  it("includes Lucarionite and preserves the Mega Lucario data", () => {
    // Source: Bulbapedia "Lucarionite" and the imported Gen 6 / Gen 7 mega
    // form data tables. Mega Lucario is Fighting/Steel with Adaptability and
    // 145 Attack.
    const data = MEGA_STONE_DATA.lucarionite;
    expect(data.form).toBe("mega-lucario");
    expect(data.types).toEqual(["fighting", "steel"]);
    expect(data.ability).toBe("adaptability");
    expect(data.baseStats.attack).toBe(145);
  });
});
