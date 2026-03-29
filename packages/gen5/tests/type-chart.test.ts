import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen5DataManager } from "../src/data";
import { GEN5_TYPE_CHART, GEN5_TYPES } from "../src/Gen5TypeChart";

const TYPE_IDS = CORE_TYPE_IDS;

// ---------------------------------------------------------------------------
// GEN5_TYPES -- type list membership and count
// ---------------------------------------------------------------------------

describe("Gen 5 type list", () => {
  it("given Gen5 type chart, when checking type count, then has exactly 17 types", () => {
    // Source: Fairy type introduced Gen 6 -- https://bulbapedia.bulbagarden.net/wiki/Generation_VI
    // Gen 5 has 17 types: Normal through Steel, no Fairy
    expect(GEN5_TYPES.length).toBe(17);
  });

  it("given GEN5_TYPES, when checking for Steel type, then Steel is present", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Steel type present
    expect(GEN5_TYPES).toContain(TYPE_IDS.steel);
  });

  it("given GEN5_TYPES, when checking for Dark type, then Dark is present", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Dark type present
    expect(GEN5_TYPES).toContain(TYPE_IDS.dark);
  });

  it("given GEN5_TYPES, when checking for Fairy type, then Fairy is NOT present", () => {
    // Source: Fairy type was not introduced until Gen 6 (X/Y)
    // https://bulbapedia.bulbagarden.net/wiki/Fairy_(type)
    expect(GEN5_TYPES).not.toContain(TYPE_IDS.fairy);
  });

  it("given GEN5_TYPES, when checking for Normal type, then Normal is present", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Normal type present
    expect(GEN5_TYPES).toContain(TYPE_IDS.normal);
  });
});

// ---------------------------------------------------------------------------
// GEN5_TYPE_CHART -- super-effective matchups (2x)
// ---------------------------------------------------------------------------

describe("Gen 5 type chart -- super effective (2x)", () => {
  it("given Gen5 type chart, when Fire attacks Grass, then returns 2x effectiveness", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts base type chart
    // Fire is super effective against Grass in all gens
    expect(GEN5_TYPE_CHART.fire?.grass).toBe(2);
  });

  it("given Gen5 type chart, when Water attacks Fire, then returns 2x effectiveness", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts base type chart
    // Water is super effective against Fire in all gens
    expect(GEN5_TYPE_CHART.water?.fire).toBe(2);
  });

  it("given Gen5 type chart, when Fire attacks Steel, then effectiveness is 2x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Fire > Steel = 2x
    expect(GEN5_TYPE_CHART.fire?.steel).toBe(2);
  });

  it("given Gen5 type chart, when Ground attacks Electric, then effectiveness is 2x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Ground > Electric = 2x
    expect(GEN5_TYPE_CHART.ground?.electric).toBe(2);
  });

  it("given Gen5 type chart, when Dark attacks Psychic, then effectiveness is 2x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Dark > Psychic = 2x
    expect(GEN5_TYPE_CHART.dark?.psychic).toBe(2);
  });

  it("given Gen5 type chart, when Ghost attacks Psychic, then effectiveness is 2x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Ghost > Psychic = 2x
    expect(GEN5_TYPE_CHART.ghost?.psychic).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GEN5_TYPE_CHART -- not very effective (0.5x)
// ---------------------------------------------------------------------------

describe("Gen 5 type chart -- not very effective (0.5x)", () => {
  it("given Gen5 type chart, when Fire attacks Water, then effectiveness is 0.5x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Fire > Water = 0.5x
    expect(GEN5_TYPE_CHART.fire?.water).toBe(0.5);
  });

  it("given Gen5 type chart, when Water attacks Grass, then effectiveness is 0.5x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Water > Grass = 0.5x
    expect(GEN5_TYPE_CHART.water?.grass).toBe(0.5);
  });

  it("given Gen5 type chart, when Dark attacks Steel, then returns 0.5x effectiveness", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Steel damageTaken Dark: 2 (resist)
    // CRITICAL: In Gen 6+, Steel no longer resists Dark. This is a pre-Gen-6 mechanic.
    // The type chart encodes Dark attacking Steel: dark.steel = 0.5
    expect(GEN5_TYPE_CHART.dark?.steel).toBe(0.5);
  });

  it("given Gen5 type chart, when Ghost attacks Steel, then returns 0.5x effectiveness", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Steel damageTaken Ghost: 2 (resist)
    // CRITICAL: In Gen 6+ this was removed. Steel is neutral to Ghost in Gen 6+.
    // The type chart encodes Ghost attacking Steel = 0.5x.
    expect(GEN5_TYPE_CHART.ghost?.steel).toBe(0.5);
  });

  it("given Gen5 type chart, when Ghost attacks Dark, then effectiveness is 0.5x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Ghost > Dark = 0.5x
    expect(GEN5_TYPE_CHART.ghost?.dark).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// GEN5_TYPE_CHART -- immunities (0x)
// ---------------------------------------------------------------------------

describe("Gen 5 type chart -- immune (0x)", () => {
  it("given Gen5 type chart, when Normal attacks Ghost, then returns 0x effectiveness", () => {
    // Source: type chart -- Ghost is immune to Normal
    // references/pokemon-showdown/data/mods/gen5/typechart.ts -- Normal > Ghost = 0x
    expect(GEN5_TYPE_CHART.normal?.ghost).toBe(0);
  });

  it("given Gen5 type chart, when Psychic attacks Dark, then returns 0x effectiveness", () => {
    // Source: type chart -- Dark is immune to Psychic (added Gen 2)
    // references/pokemon-showdown/data/mods/gen5/typechart.ts -- Psychic > Dark = 0x
    expect(GEN5_TYPE_CHART.psychic?.dark).toBe(0);
  });

  it("given Gen5 type chart, when Fighting attacks Ghost, then returns 0x effectiveness", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Fighting > Ghost = 0x
    // Ghost-type Pokemon are immune to Fighting-type moves
    expect(GEN5_TYPE_CHART.fighting?.ghost).toBe(0);
  });

  it("given Gen5 type chart, when Ground attacks Flying, then returns 0x effectiveness", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Ground > Flying = 0x
    // Flying-type Pokemon are immune to Ground-type moves
    expect(GEN5_TYPE_CHART.ground?.flying).toBe(0);
  });

  it("given Gen5 type chart, when Poison attacks Steel, then returns 0x effectiveness", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Poison > Steel = 0x
    // Steel-type Pokemon are immune to Poison-type moves
    expect(GEN5_TYPE_CHART.poison?.steel).toBe(0);
  });

  it("given Gen5 type chart, when Ghost attacks Normal, then effectiveness is 0x (immune)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Ghost > Normal = 0x
    expect(GEN5_TYPE_CHART.ghost?.normal).toBe(0);
  });

  it("given Gen5 type chart, when Electric attacks Ground, then effectiveness is 0x (immune)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Electric > Ground = 0x
    expect(GEN5_TYPE_CHART.electric?.ground).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property test: all 289 matchups defined and in valid set
// ---------------------------------------------------------------------------

describe("Gen 5 type chart -- property tests", () => {
  it("given Gen5 type chart, when checking all 17x17 = 289 matchups, then all are defined and in {0, 0.25, 0.5, 1, 2, 4}", () => {
    // Source: Type effectiveness can only be one of the standard multipliers
    // https://bulbapedia.bulbagarden.net/wiki/Type#Type_effectiveness
    const validValues = new Set([0, 0.25, 0.5, 1, 2, 4]);
    let count = 0;
    for (const atkType of GEN5_TYPES) {
      for (const defType of GEN5_TYPES) {
        const value = GEN5_TYPE_CHART[atkType]?.[defType];
        expect(value).not.toBeUndefined();
        expect(validValues.has(value as number)).toBe(true);
        count++;
      }
    }
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- 17 types (no Fairy in Gen 5) = 17 * 17 = 289 matchups
    expect(count).toBe(289);
  });
});

// ---------------------------------------------------------------------------
// Via DataManager (integration path)
// ---------------------------------------------------------------------------

describe("Gen 5 type chart via DataManager", () => {
  it("given gen5 DataManager, when checking type chart key count, then has exactly 17 types", () => {
    // Source: Gen 5 has 17 types; DataManager loads directly from type-chart.json
    const dm = createGen5DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(17);
  });

  it("given gen5 DataManager type chart, when Fire attacks Ice, then effectiveness is 2x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Fire > Ice = 2x
    const dm = createGen5DataManager();
    const chart = dm.getTypeChart();
    expect(chart.fire?.ice).toBe(2);
  });

  it("given gen5 DataManager type chart, when Ground attacks Flying, then effectiveness is 0x", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts -- Ground > Flying = 0x
    const dm = createGen5DataManager();
    const chart = dm.getTypeChart();
    expect(chart.ground?.flying).toBe(0);
  });
});
