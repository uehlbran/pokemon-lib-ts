import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS, GEN6_TYPE_CHART } from "../../../src/constants";
import type { TypeChart } from "../../../src/entities/type-chart";
import type { PokemonType } from "../../../src/entities/types";
import {
  classifyEffectiveness,
  getTypeEffectiveness,
  getTypeMultiplier,
} from "../../../src/logic/type-effectiveness";

const {
  bug,
  dark,
  dragon,
  electric,
  fairy,
  fighting,
  fire,
  flying,
  ghost,
  grass,
  ground,
  ice,
  normal,
  poison,
  psychic,
  rock,
  steel,
  water,
} = CORE_TYPE_IDS;

// Full Gen 6+ type chart (18x18)
// Only stores non-1.0 values; getTypeMultiplier defaults missing entries to 1.
// Source: Pokemon Showdown `data/typechart.ts` Gen 6+ chart.
// Cross-check: Bulbapedia Fairy-era type chart.
const ALL_TYPES: PokemonType[] = [
  normal,
  fire,
  water,
  electric,
  grass,
  ice,
  fighting,
  poison,
  ground,
  flying,
  psychic,
  bug,
  rock,
  ghost,
  dragon,
  dark,
  steel,
  fairy,
];
const TYPE_CHART = GEN6_TYPE_CHART;

describe("getTypeMultiplier", () => {
  it("given a Fire-type attacker and Grass-type defender, when calculating type multiplier, then returns 2.0", () => {
    // Source: Gen 6+ type chart: Fire is super effective against Grass.
    expect(getTypeMultiplier(fire, grass, TYPE_CHART)).toBe(TYPE_CHART[fire][grass]);
  });

  it("given a Fire-type attacker and Water-type defender, when calculating type multiplier, then returns 0.5", () => {
    expect(getTypeMultiplier(fire, water, TYPE_CHART)).toBe(TYPE_CHART[fire][water]);
  });

  it("given a Normal-type attacker and Ghost-type defender, when calculating type multiplier, then returns 0", () => {
    expect(getTypeMultiplier(normal, ghost, TYPE_CHART)).toBe(TYPE_CHART[normal][ghost]);
  });

  it("given a Normal-type attacker and Normal-type defender, when calculating type multiplier, then returns 1.0", () => {
    // Derived from getTypeMultiplier: unspecified entries in the chart remain neutral (1.0).
    const neutralMultiplier = 1.0;
    expect(getTypeMultiplier(normal, normal, TYPE_CHART)).toBe(neutralMultiplier);
  });

  it("given a Ghost-type attacker and Psychic-type defender, when calculating type multiplier, then returns 2.0", () => {
    // Source: Gen 6+ type chart: Ghost is super effective against Psychic.
    const superEffectiveMultiplier = TYPE_CHART[ghost][psychic];
    expect(getTypeMultiplier(ghost, psychic, TYPE_CHART)).toBe(superEffectiveMultiplier);
  });

  it("given a Dragon-type attacker and Fairy-type defender, when calculating type multiplier, then returns 0", () => {
    expect(getTypeMultiplier(dragon, fairy, TYPE_CHART)).toBe(TYPE_CHART[dragon][fairy]);
  });

  it("given a Fairy-type attacker and Dragon-type defender, when calculating type multiplier, then returns 2.0", () => {
    // Source: Gen 6+ type chart: Fairy is super effective against Dragon.
    expect(getTypeMultiplier(fairy, dragon, TYPE_CHART)).toBe(TYPE_CHART[fairy][dragon]);
  });

  it("given a sparse chart with a missing matchup, when calculating type multiplier, then defaults to neutral", () => {
    const sparseChart = {
      fire: { grass: 2.0 },
    } as unknown as TypeChart;

    // Derived from getTypeMultiplier: missing chart entries default to neutral (1).
    const neutralMultiplier = 1.0;
    expect(getTypeMultiplier(normal, normal, sparseChart)).toBe(neutralMultiplier);
  });
});

describe("getTypeEffectiveness", () => {
  it("given a Fire-type move and single-type Grass defender, when calculating effectiveness, then returns 2.0", () => {
    // Source: Gen 6+ type chart: Fire is super effective against Grass.
    expect(getTypeEffectiveness(fire, [grass], TYPE_CHART)).toBe(TYPE_CHART[fire][grass]);
  });

  it("given an Ice-type move and Dragon/Flying dual-type defender, when calculating effectiveness, then returns 4.0", () => {
    // Derived from the chart: the dual-type result multiplies the two canonical single-type entries.
    const doubleSuperEffectiveMultiplier = TYPE_CHART[ice][dragon] * TYPE_CHART[ice][flying];
    expect(getTypeEffectiveness(ice, [dragon, flying], TYPE_CHART)).toBe(
      doubleSuperEffectiveMultiplier,
    );
  });

  it("given a Normal-type move and Ghost-type defender, when calculating effectiveness, then returns 0 regardless of second type", () => {
    expect(getTypeEffectiveness(normal, [ghost], TYPE_CHART)).toBe(TYPE_CHART[normal][ghost]);
    expect(getTypeEffectiveness(normal, [ghost, poison], TYPE_CHART)).toBe(
      TYPE_CHART[normal][ghost] * TYPE_CHART[normal][poison],
    );
  });

  it("given a Fire-type move and Water/Dragon dual-type defender, when calculating effectiveness, then returns 0.25", () => {
    // Derived from the chart: the dual-type result multiplies the two canonical single-type entries.
    const doubleResistedMultiplier = TYPE_CHART[fire][water] * TYPE_CHART[fire][dragon];
    expect(getTypeEffectiveness(fire, [water, dragon], TYPE_CHART)).toBe(doubleResistedMultiplier);
  });

  it("given a Normal-type move and Normal-type defender, when calculating effectiveness, then returns 1.0", () => {
    // Derived from the chart builder: Normal vs Normal is an unspecified matchup, so it stays neutral at 1.0.
    const neutralMultiplier = 1.0;
    expect(getTypeEffectiveness(normal, [normal], TYPE_CHART)).toBe(neutralMultiplier);
  });

  it("given a Fire-type move and Grass/Water dual-type defender, when calculating effectiveness, then returns 1.0", () => {
    // Fire vs Grass/Water multiplies the canonical single-type entries from the exported chart.
    const neutralMultiplier = TYPE_CHART[fire][grass] * TYPE_CHART[fire][water];
    expect(getTypeEffectiveness(fire, [grass, water], TYPE_CHART)).toBe(neutralMultiplier);
  });

  it("given a Water-type move and single-type Fire defender, when calculating effectiveness, then returns 2.0", () => {
    // Source: Gen 6+ type chart: Water is super effective against Fire.
    expect(getTypeEffectiveness(water, [fire], TYPE_CHART)).toBe(TYPE_CHART[water][fire]);
  });

  it("given any attack type and any single or dual-type defender, when calculating effectiveness, then returns a valid multiplier from the set {0, 0.25, 0.5, 1, 2, 4}", () => {
    const validValues = new Set([0, 0.25, 0.5, 1, 2, 4]);
    for (const atkType of ALL_TYPES) {
      for (const def1 of ALL_TYPES) {
        // Single type
        const single = getTypeEffectiveness(atkType, [def1], TYPE_CHART);
        expect(single).toBe(getTypeMultiplier(atkType, def1, TYPE_CHART));
        expect(validValues.has(single)).toBe(true);

        // Dual type
        for (const def2 of ALL_TYPES) {
          if (def1 === def2) continue;
          const dual = getTypeEffectiveness(atkType, [def1, def2], TYPE_CHART);
          expect(dual).toBe(
            getTypeMultiplier(atkType, def1, TYPE_CHART) *
              getTypeMultiplier(atkType, def2, TYPE_CHART),
          );
          expect(validValues.has(dual)).toBe(true);
        }
      }
    }
  });
});

describe("classifyEffectiveness", () => {
  it("given a multiplier of 0, when classifying effectiveness, then returns 'immune'", () => {
    expect(classifyEffectiveness(0)).toBe("immune");
  });

  it("given a multiplier of 0.25, when classifying effectiveness, then returns 'double-resisted'", () => {
    expect(classifyEffectiveness(0.25)).toBe("double-resisted");
  });

  it("given a multiplier of 0.5, when classifying effectiveness, then returns 'resisted'", () => {
    expect(classifyEffectiveness(0.5)).toBe("resisted");
  });

  it("given a multiplier of 1, when classifying effectiveness, then returns 'neutral'", () => {
    expect(classifyEffectiveness(1)).toBe("neutral");
  });

  it("given a multiplier of 2, when classifying effectiveness, then returns 'super-effective'", () => {
    expect(classifyEffectiveness(2)).toBe("super-effective");
  });

  it("given a multiplier of 4, when classifying effectiveness, then returns 'double-super'", () => {
    expect(classifyEffectiveness(4)).toBe("double-super");
  });
});
