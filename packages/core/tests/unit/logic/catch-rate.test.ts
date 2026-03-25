import { describe, expect, it } from "vitest";
import { CORE_STATUS_IDS } from "../../../src/constants/reference-ids";
import {
  calculateModifiedCatchRate,
  calculateShakeChecks,
  STATUS_CATCH_MODIFIERS,
  STATUS_CATCH_MODIFIERS_GEN5,
  STATUS_CATCH_MODIFIERS_GEN34,
} from "../../../src/logic/catch-rate";
import { SeededRandom } from "../../../src/prng/seeded-random";
import { GEN2_ITEM_IDS } from "../../../../gen2/src/data/reference-ids";
import { GEN3_ITEM_IDS } from "../../../../gen3/src/data/reference-ids";
import { GEN4_ITEM_IDS } from "../../../../gen4/src/data/reference-ids";
import { GEN5_ITEM_IDS } from "../../../../gen5/src/data/reference-ids";

const ITEM_IDS_BY_GENERATION = {
  2: GEN2_ITEM_IDS,
  3: GEN3_ITEM_IDS,
  4: GEN4_ITEM_IDS,
  5: GEN5_ITEM_IDS,
} as const;

const { badlyPoisoned, burn, freeze, paralysis, poison, sleep } = CORE_STATUS_IDS;

function collectShakeSequence(modifiedCatchRate: number, seed: number, count: number): number[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: count }, () => calculateShakeChecks(modifiedCatchRate, rng));
}

describe("calculateModifiedCatchRate", () => {
  it("given extreme catch-rate inputs, when calculating the modifier, then clamps to [1, 255]", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:9987 Cmd_handleballthrow and Bulbapedia — Catch rate.
    const high = calculateModifiedCatchRate(100, 1, 255, 2.0, 2.5);
    const low = calculateModifiedCatchRate(500, 500, 3, 1.0, 1.0);
    expect(high).toBe(255);
    expect(low).toBe(1);
  });

  it("given the same species and ball, when current HP is lower, then the modified catch rate is higher", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:9987 Cmd_handleballthrow.
    const fullHp = calculateModifiedCatchRate(200, 200, 45, 1.0, 1.0);
    const lowHp = calculateModifiedCatchRate(200, 1, 45, 1.0, 1.0);
    expect(fullHp).toBe(15);
    expect(lowHp).toBe(44);
  });

  it("given the same species and HP, when the ball modifier improves, then the modified catch rate increases exactly", () => {
    // Source: Bulbapedia — Catch rate. Ball multipliers feed directly into the modified catch rate formula.
    const pokeball = calculateModifiedCatchRate(200, 100, 45, 1.0, 1.0);
    const ultraball = calculateModifiedCatchRate(200, 100, 45, 2.0, 1.0);
    expect(pokeball).toBe(30);
    expect(ultraball).toBe(60);
  });

  it("given the same species and HP, when the target is statused, then the modifier applies exactly", () => {
    // Source: Bulbapedia — Catch rate. Status modifiers multiply the modified catch rate after HP and ball factors.
    const noStatus = calculateModifiedCatchRate(200, 100, 45, 1.0, 1.0);
    const withSleep = calculateModifiedCatchRate(200, 100, 45, 1.0, 2.5);
    expect(noStatus).toBe(30);
    expect(withSleep).toBe(75);
  });
});

describe("STATUS_CATCH_MODIFIERS (Gen 5+ default)", () => {
  it("given Gen 5+ defaults, when checking sleep/freeze modifiers, then they are 2.5x", () => {
    // Source: Bulbapedia — Catch rate: Gen 5+ changed sleep/freeze from 2.0 to 2.5
    expect(STATUS_CATCH_MODIFIERS[sleep]).toBe(2.5);
    expect(STATUS_CATCH_MODIFIERS[freeze]).toBe(2.5);
  });

  it("given Gen 5+ defaults, when checking other status modifiers, then they are 1.5x", () => {
    // Source: Bulbapedia — Catch rate: paralysis/burn/poison are 1.5x across all gens
    expect(STATUS_CATCH_MODIFIERS[paralysis]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS[burn]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS[poison]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS[badlyPoisoned]).toBe(1.5);
  });

  it("given STATUS_CATCH_MODIFIERS alias, when compared to STATUS_CATCH_MODIFIERS_GEN5, then they are identical", () => {
    // STATUS_CATCH_MODIFIERS is an alias for GEN5 for backwards compatibility
    expect(STATUS_CATCH_MODIFIERS).toBe(STATUS_CATCH_MODIFIERS_GEN5);
  });
});

describe("STATUS_CATCH_MODIFIERS_GEN34", () => {
  it("given Gen 3-4 modifiers, when checking sleep/freeze, then they are 2.0x (not 2.5x)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — sleep/freeze: odds *= 2
    expect(STATUS_CATCH_MODIFIERS_GEN34[sleep]).toBe(2.0);
    expect(STATUS_CATCH_MODIFIERS_GEN34[freeze]).toBe(2.0);
  });

  it("given Gen 3-4 modifiers, when checking other statuses, then they are 1.5x (same as Gen 5+)", () => {
    // Source: pret/pokeemerald — poison/burn/paralysis: odds = (odds * 15) / 10
    expect(STATUS_CATCH_MODIFIERS_GEN34[paralysis]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN34[burn]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN34[poison]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN34[badlyPoisoned]).toBe(1.5);
  });
});

describe("STATUS_CATCH_MODIFIERS_GEN5", () => {
  it("given Gen 5+ modifiers, when checking sleep/freeze, then they are 2.5x", () => {
    // Source: Bulbapedia — Catch rate: Gen 5+ changed sleep/freeze to 2.5x
    expect(STATUS_CATCH_MODIFIERS_GEN5[sleep]).toBe(2.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5[freeze]).toBe(2.5);
  });

  it("given Gen 5+ modifiers, when checking other statuses, then they are 1.5x", () => {
    // Source: Bulbapedia — Catch rate: paralysis/burn/poison unchanged at 1.5x
    expect(STATUS_CATCH_MODIFIERS_GEN5[paralysis]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5[burn]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5[poison]).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5[badlyPoisoned]).toBe(1.5);
  });
});

describe("Poke Ball items have catch useEffect in generated data", () => {
  // Source: Bug #301 — Poke Ball items were missing useEffect.type=catch
  for (const gen of [2, 3, 4, 5] as const) {
    it(`given Gen ${gen} items.json, when checking Poke Ball items, then poke-ball exists and every Pokeball has useEffect.type=catch`, () => {
      // Source: Bulbapedia — Poke Balls have a catch rate modifier
      const itemIds = ITEM_IDS_BY_GENERATION[gen];
      const items = require(`../../../../../packages/gen${gen}/data/items.json`);
      const pokeballs = items.filter((item: { category: string }) => item.category === "pokeball");
      expect(pokeballs.map((item: { id: string }) => item.id)).toContain(itemIds.pokeBall);
      const withCatchEffect = pokeballs.filter(
        (item: { useEffect?: { type: string } }) => item.useEffect?.type === "catch",
      );
      expect(withCatchEffect.length).toBe(pokeballs.length);
    });

    it(`given Gen ${gen} items.json, when checking Ultra Ball, then catchRateModifier is 2`, () => {
      // Source: Bulbapedia — Ultra Ball catch rate modifier is 2x
      const itemIds = ITEM_IDS_BY_GENERATION[gen];
      const items = require(`../../../../../packages/gen${gen}/data/items.json`);
      const ultraBall = items.find((item: { id: string }) => item.id === itemIds.ultraBall);
      if (ultraBall) {
        expect(ultraBall.useEffect).toEqual({
          type: "catch",
          catchRateModifier: 2,
        });
      }
    });
  }
});

describe("calculateShakeChecks", () => {
  it("given a modified catch rate of 255 or higher, when checking shakes, then returns a guaranteed catch", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:10025 Cmd_handleballthrow — modified catch rates >= 255 short-circuit to 4 shakes.
    const rng = new SeededRandom(42);
    expect(calculateShakeChecks(255, rng)).toBe(4);
    // Source: pret/pokeemerald src/battle_script_commands.c:10025 Cmd_handleballthrow — 300 is also above the guaranteed-catch threshold.
    expect(calculateShakeChecks(300, rng)).toBe(4);
  });

  it("given a fixed seed and a near-guaranteed catch rate, when checking shakes repeatedly, then returns the documented deterministic sequence", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:10025 Cmd_handleballthrow.
    expect(collectShakeSequence(254, 2024, 10)).toEqual([4, 4, 4, 4, 4, 0, 4, 4, 4, 4]);
  });

  it("given a fixed seed and a very low catch rate, when checking shakes repeatedly, then returns the documented deterministic sequence", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:10025 Cmd_handleballthrow.
    expect(collectShakeSequence(1, 42, 10)).toEqual([0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
  });
});
