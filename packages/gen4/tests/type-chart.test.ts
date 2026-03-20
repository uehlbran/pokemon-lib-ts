import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { GEN4_TYPE_CHART, GEN4_TYPES } from "../src/Gen4TypeChart";

// ---------------------------------------------------------------------------
// GEN4_TYPES — type list membership and count
// ---------------------------------------------------------------------------

describe("Gen 4 type list", () => {
  it("given GEN4_TYPES, when checking count, then returns exactly 17 types", () => {
    // Source: pret/pokeplatinum — 17 types in Gen 4 (Normal through Steel; Fairy added in Gen 6)
    // Verified: same 17-type roster as Gen 2-3
    expect(GEN4_TYPES.length).toBe(17);
  });

  it("given GEN4_TYPES, when checking for Steel type, then Steel is present", () => {
    // Source: pret/pokeplatinum — Steel type introduced in Gen 2, present in Gen 4
    expect(GEN4_TYPES).toContain("steel");
  });

  it("given GEN4_TYPES, when checking for Dark type, then Dark is present", () => {
    // Source: pret/pokeplatinum — Dark type introduced in Gen 2, present in Gen 4
    expect(GEN4_TYPES).toContain("dark");
  });

  it("given GEN4_TYPES, when checking for Fairy type, then Fairy is NOT present", () => {
    // Source: Fairy type was not introduced until Gen 6 (X/Y)
    // pret/pokeplatinum has no TYPE_FAIRY constant
    expect(GEN4_TYPES).not.toContain("fairy");
  });

  it("given GEN4_TYPES, when checking for Normal type, then Normal is present", () => {
    // Source: pret/pokeplatinum — Normal type is the first of the 17 types
    expect(GEN4_TYPES).toContain("normal");
  });
});

// ---------------------------------------------------------------------------
// GEN4_TYPE_CHART — super-effective matchups
// ---------------------------------------------------------------------------

describe("Gen 4 type chart — super effective (2x)", () => {
  it("given Gen4 type chart, when Fire attacks Grass, then effectiveness is 2x", () => {
    // Source: Bulbapedia — Fire-type moves are super effective against Grass-type Pokemon
    // pret/pokeplatinum type effectiveness table: FIRE > GRASS = 2x
    expect(GEN4_TYPE_CHART.fire?.grass).toBe(2);
  });

  it("given Gen4 type chart, when Fire attacks Steel, then effectiveness is 2x", () => {
    // Source: Bulbapedia — Fire is super effective against Steel in all gens
    // pret/pokeplatinum type chart: FIRE > STEEL = 2x
    expect(GEN4_TYPE_CHART.fire?.steel).toBe(2);
  });

  it("given Gen4 type chart, when Ground attacks Electric, then effectiveness is 2x", () => {
    // Source: pret/pokeplatinum — Ground > Electric = SUPER_EFFECTIVE (2x)
    // Ground-type moves hit Electric-type Pokemon for 2x damage
    expect(GEN4_TYPE_CHART.ground?.electric).toBe(2);
  });

  it("given Gen4 type chart, when Dark attacks Psychic, then effectiveness is 2x", () => {
    // Source: Bulbapedia — Dark is super effective against Psychic in Gen 2+
    // pret/pokeplatinum type chart: DARK > PSYCHIC = 2x
    expect(GEN4_TYPE_CHART.dark?.psychic).toBe(2);
  });

  it("given Gen4 type chart, when Rock attacks Ice, then effectiveness is 2x", () => {
    // Source: Bulbapedia — Rock is super effective against Ice
    // pret/pokeplatinum type chart: ROCK > ICE = 2x (verified from type-chart.json)
    expect(GEN4_TYPE_CHART.rock?.ice).toBe(2);
  });

  it("given Gen4 type chart, when Ghost attacks Psychic, then effectiveness is 2x", () => {
    // Source: pret/pokeplatinum — Ghost > Psychic = SUPER_EFFECTIVE (2x)
    // Bulbapedia: Ghost-type moves are super effective against Psychic
    expect(GEN4_TYPE_CHART.ghost?.psychic).toBe(2);
  });

  it("given Gen4 type chart, when Steel attacks Ice, then effectiveness is 2x", () => {
    // Source: pret/pokeplatinum type chart — Steel > Ice = 2x (verified from type-chart.json)
    // Steel is super effective against Ice in Gen 2+ (not removed until Gen 6)
    expect(GEN4_TYPE_CHART.steel?.ice).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GEN4_TYPE_CHART — not very effective matchups (0.5x)
// ---------------------------------------------------------------------------

describe("Gen 4 type chart — not very effective (0.5x)", () => {
  it("given Gen4 type chart, when Fire attacks Water, then effectiveness is 0.5x", () => {
    // Source: Bulbapedia — Fire is not very effective against Water in all gens
    // pret/pokeplatinum type chart: FIRE > WATER = 0.5x
    expect(GEN4_TYPE_CHART.fire?.water).toBe(0.5);
  });

  it("given Gen4 type chart, when Water attacks Grass, then effectiveness is 0.5x", () => {
    // Source: pret/pokeplatinum — Water > Grass = NOT_VERY_EFFECTIVE (0.5x)
    expect(GEN4_TYPE_CHART.water?.grass).toBe(0.5);
  });

  it("given Gen4 type chart, when Dark attacks Steel, then effectiveness is 0.5x", () => {
    // Source: pret/pokeplatinum — Dark > Steel = NOT_VERY_EFFECTIVE (0.5x)
    // Steel resisted Dark in Gen 2-5; this resistance was REMOVED in Gen 6
    // Verified from packages/gen4/data/type-chart.json: dark.steel = 0.5
    expect(GEN4_TYPE_CHART.dark?.steel).toBe(0.5);
  });

  it("given Gen4 type chart, when Ghost attacks Dark, then effectiveness is 0.5x", () => {
    // Source: pret/pokeplatinum — Ghost > Dark = NOT_VERY_EFFECTIVE (0.5x)
    // Verified from packages/gen4/data/type-chart.json: ghost.dark = 0.5
    expect(GEN4_TYPE_CHART.ghost?.dark).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// GEN4_TYPE_CHART — immunities (0x)
// ---------------------------------------------------------------------------

describe("Gen 4 type chart — immune (0x)", () => {
  it("given Gen4 type chart, when Electric attacks Ground, then effectiveness is 0x (immune)", () => {
    // Source: Bulbapedia — Ground-type Pokemon are immune to Electric-type moves
    // pret/pokeplatinum type chart: ELECTRIC > GROUND = 0x (immune)
    expect(GEN4_TYPE_CHART.electric?.ground).toBe(0);
  });

  it("given Gen4 type chart, when Normal attacks Ghost, then effectiveness is 0x (immune)", () => {
    // Source: Bulbapedia — Ghost-type Pokemon are immune to Normal-type moves in all gens
    // pret/pokeplatinum type chart: NORMAL > GHOST = 0x (immune)
    expect(GEN4_TYPE_CHART.normal?.ghost).toBe(0);
  });

  it("given Gen4 type chart, when Ghost attacks Normal, then effectiveness is 0x (immune)", () => {
    // Source: Bulbapedia — Normal-type Pokemon are immune to Ghost-type moves
    // pret/pokeplatinum type chart: GHOST > NORMAL = 0x (immune)
    // This immunity is BOTH directions: Normal can't hit Ghost AND Ghost can't hit Normal
    expect(GEN4_TYPE_CHART.ghost?.normal).toBe(0);
  });

  it("given Gen4 type chart, when Psychic attacks Dark, then effectiveness is 0x (immune)", () => {
    // Source: Bulbapedia — Dark-type Pokemon are immune to Psychic-type moves (Gen 2+)
    // pret/pokeplatinum type chart: PSYCHIC > DARK = 0x (immune)
    expect(GEN4_TYPE_CHART.psychic?.dark).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GEN4_TYPE_CHART — Gen 4 specific interactions (Steel resistances)
// ---------------------------------------------------------------------------

describe("Gen 4 type chart — Gen 4 Steel resistances (different from Gen 6+)", () => {
  it("given Gen4 type chart, when Ghost attacks Steel, then effectiveness is 0.5x", () => {
    // Source: pret/pokeplatinum — Ghost > Steel = NOT_VERY_EFFECTIVE (0.5x) in Gen 2-5
    // This resistance was REMOVED in Gen 6 (X/Y)
    // Verified from packages/gen4/data/type-chart.json: ghost.steel = 0.5
    expect(GEN4_TYPE_CHART.ghost?.steel).toBe(0.5);
  });

  it("given Gen4 type chart, when Water attacks Steel, then effectiveness is 1x (neutral)", () => {
    // Source: pret/pokeplatinum — Water > Steel = NEUTRAL (1x) in Gen 3-5
    // The Water vs Steel resistance (0.5x) existed only in Gen 1-2; it was removed in Gen 3
    // Verified from packages/gen4/data/type-chart.json: water.steel = 1
    expect(GEN4_TYPE_CHART.water?.steel).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Via DataManager (integration path)
// ---------------------------------------------------------------------------

describe("Gen 4 type chart via DataManager", () => {
  it("given gen4 DataManager, when checking type chart key count, then has exactly 17 types", () => {
    // Source: Gen 4 has 17 types; DataManager loads directly from type-chart.json
    // Verified by counting keys in packages/gen4/data/type-chart.json
    const dm = createGen4DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(17);
  });

  it("given gen4 DataManager type chart, when Fire attacks Ice, then effectiveness is 2x", () => {
    // Source: Bulbapedia — Fire is super effective against Ice in all gens
    // Verified from packages/gen4/data/type-chart.json: fire.ice = 2
    const dm = createGen4DataManager();
    const chart = dm.getTypeChart();
    expect(chart.fire?.ice).toBe(2);
  });

  it("given gen4 DataManager type chart, when Ground attacks Flying, then effectiveness is 0x", () => {
    // Source: Bulbapedia — Flying-type Pokemon are immune to Ground-type moves
    // Verified from packages/gen4/data/type-chart.json: ground.flying = 0
    const dm = createGen4DataManager();
    const chart = dm.getTypeChart();
    expect(chart.ground?.flying).toBe(0);
  });
});
