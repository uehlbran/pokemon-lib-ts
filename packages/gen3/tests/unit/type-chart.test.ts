import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../../src/data";
import { GEN3_TYPE_CHART, GEN3_TYPES } from "../../src/Gen3TypeChart";

const TYPE_IDS = CORE_TYPE_IDS;

describe("Gen 3 type chart", () => {
  it("given GEN3_TYPES, when checking count, then returns exactly 17 types", () => {
    // Source: Gen 3 has 17 types (Normal through Steel; Fairy added in Gen 6)
    // pret/pokeemerald src/data/battle/type_effectiveness.h — TYPE_NORMAL through TYPE_STEEL
    expect(GEN3_TYPES.length).toBe(17);
  });

  it("given GEN3_TYPES, when checking for Fairy type, then Fairy is not present", () => {
    // Source: Fairy type was not introduced until Gen 6 (X/Y)
    // pret/pokeemerald has no TYPE_FAIRY constant
    expect(GEN3_TYPES).not.toContain(TYPE_IDS.fairy);
  });

  it("given GEN3_TYPES, when checking for Steel type, then Steel is present", () => {
    // Source: Steel type introduced in Gen 2, present in Gen 3
    // pret/pokeemerald src/data/battle/type_effectiveness.h — TYPE_STEEL present
    expect(GEN3_TYPES).toContain(TYPE_IDS.steel);
  });

  it("given GEN3_TYPES, when checking for Dark type, then Dark is present", () => {
    // Source: Dark type introduced in Gen 2, present in Gen 3
    // pret/pokeemerald src/data/battle/type_effectiveness.h — TYPE_DARK present
    expect(GEN3_TYPES).toContain(TYPE_IDS.dark);
  });

  it("given gen3 type chart, when Water attacks Steel, then effectiveness is 0.5x", () => {
    // Source: pret/pokeemerald src/data/battle/type_effectiveness.h
    // Water → Steel = NOT_VERY_EFFECTIVE (0.5x) — Steel resisted Water in Gen 3
    // This resistance was REMOVED in Gen 6
    expect(GEN3_TYPE_CHART.water?.steel).toBe(0.5);
  });

  it("given gen3 type chart, when Electric attacks Steel, then effectiveness is 0.5x", () => {
    // Source: pret/pokeemerald src/data/battle/type_effectiveness.h
    // Electric → Steel = NOT_VERY_EFFECTIVE (0.5x) — Steel resisted Electric in Gen 3
    // This resistance was REMOVED in Gen 6
    expect(GEN3_TYPE_CHART.electric?.steel).toBe(0.5);
  });

  it("given gen3 type chart, when Ghost attacks Ghost, then effectiveness is 2x", () => {
    // Source: pret/pokeemerald src/data/battle/type_effectiveness.h
    // Ghost → Ghost = SUPER_EFFECTIVE (2x)
    expect(GEN3_TYPE_CHART.ghost?.ghost).toBe(2);
  });

  it("given gen3 type chart, when Ground attacks Electric, then effectiveness is 2x", () => {
    // Source: pret/pokeemerald src/data/battle/type_effectiveness.h
    // Ground → Electric = SUPER_EFFECTIVE (2x) — Electric is not immune to Ground in any gen
    expect(GEN3_TYPE_CHART.ground?.electric).toBe(2);
  });

  it("given gen3 type chart, when Normal attacks Ghost, then effectiveness is 0x (immune)", () => {
    // Source: pret/pokeemerald src/data/battle/type_effectiveness.h
    // Normal → Ghost = IMMUNE (0x)
    expect(GEN3_TYPE_CHART.normal?.ghost).toBe(0);
  });

  it("given gen3 type chart via DataManager, when checking available types, then returns exactly 17 types", () => {
    // Source: Gen 3 has 17 types — same as Gen 2, no Fairy
    // Validated by counting keys in type-chart.json
    const dm = createGen3DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(17);
  });

  it("given gen3 type chart via DataManager, when checking Steel resists Dark, then effectiveness is 0.5x", () => {
    // Source: pret/pokeemerald src/data/battle/type_effectiveness.h
    // Dark → Steel = NOT_VERY_EFFECTIVE (0.5x) — Steel resisted Dark in Gen 3
    // This resistance was REMOVED in Gen 6
    const dm = createGen3DataManager();
    const chart = dm.getTypeChart();
    expect(chart.dark?.steel).toBe(0.5);
  });
});
