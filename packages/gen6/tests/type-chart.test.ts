import { describe, expect, it } from "vitest";
import { createGen6DataManager } from "../src/data";
import { GEN6_TYPE_CHART, GEN6_TYPES } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// GEN6_TYPES -- type list membership and count
// ---------------------------------------------------------------------------

describe("Gen 6 type list", () => {
  it("given Gen6 type chart, when checking type count, then has exactly 18 types", () => {
    // Source: Fairy type introduced Gen 6 -- https://bulbapedia.bulbagarden.net/wiki/Generation_VI
    // Gen 6 has 18 types: Normal through Steel plus Fairy
    expect(GEN6_TYPES.length).toBe(18);
  });

  it("given GEN6_TYPES, when checking for Fairy type, then Fairy IS present", () => {
    // Source: Fairy type introduced in Gen 6 (X/Y)
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Fairy_(type)
    expect(GEN6_TYPES).toContain("fairy");
  });

  it("given GEN6_TYPES, when checking for Steel type, then Steel is present", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Steel type present
    expect(GEN6_TYPES).toContain("steel");
  });

  it("given GEN6_TYPES, when checking for Dark type, then Dark is present", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Dark type present
    expect(GEN6_TYPES).toContain("dark");
  });

  it("given GEN6_TYPES, when checking for Normal type, then Normal is present", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Normal type present
    expect(GEN6_TYPES).toContain("normal");
  });
});

// ---------------------------------------------------------------------------
// Fairy offensive effectiveness (Fairy attacking other types)
// ---------------------------------------------------------------------------

describe("Gen 6 type chart -- Fairy offensive effectiveness", () => {
  it("given Gen6 type chart, when Fairy attacks Dragon, then returns 2x (super effective)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Fairy SE vs Dragon
    // Source: Showdown data/typechart.ts -- Dragon damageTaken Fairy: 1 (weak)
    expect(GEN6_TYPE_CHART.fairy?.dragon).toBe(2);
  });

  it("given Gen6 type chart, when Fairy attacks Fighting, then returns 2x (super effective)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Fairy SE vs Fighting
    // Source: Showdown data/typechart.ts -- Fighting damageTaken Fairy: 1 (weak)
    expect(GEN6_TYPE_CHART.fairy?.fighting).toBe(2);
  });

  it("given Gen6 type chart, when Fairy attacks Dark, then returns 2x (super effective)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Fairy SE vs Dark
    // Source: Showdown data/typechart.ts -- Dark damageTaken Fairy: 1 (weak)
    expect(GEN6_TYPE_CHART.fairy?.dark).toBe(2);
  });

  it("given Gen6 type chart, when Fairy attacks Fire, then returns 0.5x (resisted)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Fairy resisted by Fire
    // Source: Showdown data/typechart.ts -- Fire damageTaken Fairy: 2 (resist)
    expect(GEN6_TYPE_CHART.fairy?.fire).toBe(0.5);
  });

  it("given Gen6 type chart, when Fairy attacks Poison, then returns 0.5x (resisted)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Fairy resisted by Poison
    // Source: Showdown data/typechart.ts -- Poison damageTaken Fairy: 2 (resist)
    expect(GEN6_TYPE_CHART.fairy?.poison).toBe(0.5);
  });

  it("given Gen6 type chart, when Fairy attacks Steel, then returns 0.5x (resisted)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Fairy resisted by Steel
    // Source: Showdown data/typechart.ts -- Steel damageTaken Fairy: 2 (resist)
    expect(GEN6_TYPE_CHART.fairy?.steel).toBe(0.5);
  });

  it("given Gen6 type chart, when Fairy attacks Fairy, then returns 1x (neutral)", () => {
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Fairy: 0 (neutral)
    expect(GEN6_TYPE_CHART.fairy?.fairy).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fairy defensive effectiveness (types attacking Fairy)
// ---------------------------------------------------------------------------

describe("Gen 6 type chart -- Fairy defensive effectiveness", () => {
  it("given Gen6 type chart, when Poison attacks Fairy, then returns 2x (super effective)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Poison SE vs Fairy
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Poison: 1 (weak)
    expect(GEN6_TYPE_CHART.poison?.fairy).toBe(2);
  });

  it("given Gen6 type chart, when Steel attacks Fairy, then returns 2x (super effective)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Steel SE vs Fairy
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Steel: 1 (weak)
    expect(GEN6_TYPE_CHART.steel?.fairy).toBe(2);
  });

  it("given Gen6 type chart, when Dragon attacks Fairy, then returns 0x (immune)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Dragon immune vs Fairy
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Dragon: 3 (immune)
    expect(GEN6_TYPE_CHART.dragon?.fairy).toBe(0);
  });

  it("given Gen6 type chart, when Bug attacks Fairy, then returns 0.5x (resisted)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Bug resisted by Fairy
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Bug: 2 (resist)
    expect(GEN6_TYPE_CHART.bug?.fairy).toBe(0.5);
  });

  it("given Gen6 type chart, when Fighting attacks Fairy, then returns 0.5x (resisted)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Fighting resisted by Fairy
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Fighting: 2 (resist)
    expect(GEN6_TYPE_CHART.fighting?.fairy).toBe(0.5);
  });

  it("given Gen6 type chart, when Dark attacks Fairy, then returns 0.5x (resisted)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Dark resisted by Fairy
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Dark: 2 (resist)
    expect(GEN6_TYPE_CHART.dark?.fairy).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Steel type changes (Gen 5 -> Gen 6)
// ---------------------------------------------------------------------------

describe("Gen 6 type chart -- Steel type defensive changes", () => {
  it("given Gen6 type chart, when Ghost attacks Steel, then returns 1x (neutral, was 0.5x in Gen 5)", () => {
    // Source: specs/battle/07-gen6.md section 3 -- Steel lost Ghost resistance in Gen 6
    // Source: Showdown data/typechart.ts -- Steel damageTaken Ghost: 0 (neutral in Gen 6+)
    expect(GEN6_TYPE_CHART.ghost?.steel).toBe(1);
  });

  it("given Gen6 type chart, when Dark attacks Steel, then returns 1x (neutral, was 0.5x in Gen 5)", () => {
    // Source: specs/battle/07-gen6.md section 3 -- Steel lost Dark resistance in Gen 6
    // Source: Showdown data/typechart.ts -- Steel damageTaken Dark: 0 (neutral in Gen 6+)
    expect(GEN6_TYPE_CHART.dark?.steel).toBe(1);
  });

  it("given Gen6 type chart, when Steel attacks Fairy, then returns 2x (new in Gen 6)", () => {
    // Source: specs/battle/07-gen6.md section 2 -- Steel gains offensive coverage vs Fairy
    // Source: Showdown data/typechart.ts -- Fairy damageTaken Steel: 1 (weak)
    expect(GEN6_TYPE_CHART.steel?.fairy).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Classic type matchups (unchanged from Gen 2-5)
// ---------------------------------------------------------------------------

describe("Gen 6 type chart -- classic super effective (2x)", () => {
  it("given Gen6 type chart, when Fire attacks Grass, then returns 2x effectiveness", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Fire > Grass = 2x
    expect(GEN6_TYPE_CHART.fire?.grass).toBe(2);
  });

  it("given Gen6 type chart, when Water attacks Fire, then returns 2x effectiveness", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Water > Fire = 2x
    expect(GEN6_TYPE_CHART.water?.fire).toBe(2);
  });

  it("given Gen6 type chart, when Ground attacks Electric, then returns 2x effectiveness", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Ground > Electric = 2x
    expect(GEN6_TYPE_CHART.ground?.electric).toBe(2);
  });
});

describe("Gen 6 type chart -- classic immunities (0x)", () => {
  it("given Gen6 type chart, when Normal attacks Ghost, then returns 0x effectiveness", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Normal > Ghost = 0x
    expect(GEN6_TYPE_CHART.normal?.ghost).toBe(0);
  });

  it("given Gen6 type chart, when Ground attacks Flying, then returns 0x effectiveness", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Ground > Flying = 0x
    expect(GEN6_TYPE_CHART.ground?.flying).toBe(0);
  });

  it("given Gen6 type chart, when Poison attacks Steel, then returns 0x effectiveness", () => {
    // Source: references/pokemon-showdown/data/typechart.ts -- Poison > Steel = 0x
    expect(GEN6_TYPE_CHART.poison?.steel).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property test: all 324 matchups defined and in valid set
// ---------------------------------------------------------------------------

describe("Gen 6 type chart -- property tests", () => {
  it("given Gen6 type chart, when checking all 18x18 = 324 matchups, then all are defined and in {0, 0.25, 0.5, 1, 2, 4}", () => {
    // Source: Type effectiveness can only be one of the standard multipliers
    // Source: https://bulbapedia.bulbagarden.net/wiki/Type#Type_effectiveness
    const validValues = new Set([0, 0.25, 0.5, 1, 2, 4]);
    let count = 0;
    for (const atkType of GEN6_TYPES) {
      for (const defType of GEN6_TYPES) {
        const value = GEN6_TYPE_CHART[atkType]?.[defType];
        expect(value).toBeDefined();
        expect(validValues.has(value!)).toBe(true);
        count++;
      }
    }
    // Source: 18 types (with Fairy in Gen 6) = 18 * 18 = 324 matchups
    expect(count).toBe(324);
  });
});

// ---------------------------------------------------------------------------
// Via DataManager (integration path)
// ---------------------------------------------------------------------------

describe("Gen 6 type chart via DataManager", () => {
  it("given gen6 DataManager, when checking type chart key count, then has exactly 18 types", () => {
    // Source: Gen 6 has 18 types; DataManager loads directly from type-chart.json
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(18);
  });

  it("given gen6 DataManager type chart, when Fairy attacks Dragon, then effectiveness is 2x", () => {
    // Source: specs/battle/07-gen6.md -- Fairy SE vs Dragon
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(chart.fairy?.dragon).toBe(2);
  });

  it("given gen6 DataManager type chart, when Ghost attacks Steel, then effectiveness is 1x (neutral)", () => {
    // Source: specs/battle/07-gen6.md section 3 -- Steel lost Ghost resistance in Gen 6
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(chart.ghost?.steel).toBe(1);
  });
});
