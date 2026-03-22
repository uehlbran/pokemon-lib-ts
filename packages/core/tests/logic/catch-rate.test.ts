import { describe, expect, it } from "vitest";
import {
  calculateModifiedCatchRate,
  calculateShakeChecks,
  STATUS_CATCH_MODIFIERS,
  STATUS_CATCH_MODIFIERS_GEN5,
  STATUS_CATCH_MODIFIERS_GEN34,
} from "../../src/logic/catch-rate";
import { SeededRandom } from "../../src/prng/seeded-random";

describe("calculateModifiedCatchRate", () => {
  it("should clamp the result to [1, 255]", () => {
    // Very high catch rate
    const high = calculateModifiedCatchRate(100, 1, 255, 2.0, 2.5);
    expect(high).toBeLessThanOrEqual(255);
    expect(high).toBeGreaterThanOrEqual(1);

    // Very low catch rate
    const low = calculateModifiedCatchRate(500, 500, 3, 1.0, 1.0);
    expect(low).toBeGreaterThanOrEqual(1);
    expect(low).toBeLessThanOrEqual(255);
  });

  it("should give higher catch rate at lower current HP", () => {
    const fullHp = calculateModifiedCatchRate(200, 200, 45, 1.0, 1.0);
    const lowHp = calculateModifiedCatchRate(200, 1, 45, 1.0, 1.0);
    expect(lowHp).toBeGreaterThan(fullHp);
  });

  it("should give higher catch rate with better ball modifier", () => {
    const pokeball = calculateModifiedCatchRate(200, 100, 45, 1.0, 1.0);
    const ultraball = calculateModifiedCatchRate(200, 100, 45, 2.0, 1.0);
    expect(ultraball).toBeGreaterThan(pokeball);
  });

  it("should give higher catch rate with status condition", () => {
    const noStatus = calculateModifiedCatchRate(200, 100, 45, 1.0, 1.0);
    const withSleep = calculateModifiedCatchRate(200, 100, 45, 1.0, 2.5);
    expect(withSleep).toBeGreaterThan(noStatus);
  });

  it("should return 255 (max) for very easy catches", () => {
    expect(calculateModifiedCatchRate(100, 1, 255, 2.0, 2.5)).toBe(255);
  });
});

describe("STATUS_CATCH_MODIFIERS (Gen 5+ default)", () => {
  it("given Gen 5+ defaults, when checking sleep/freeze modifiers, then they are 2.5x", () => {
    // Source: Bulbapedia — Catch rate: Gen 5+ changed sleep/freeze from 2.0 to 2.5
    expect(STATUS_CATCH_MODIFIERS.sleep).toBe(2.5);
    expect(STATUS_CATCH_MODIFIERS.freeze).toBe(2.5);
  });

  it("given Gen 5+ defaults, when checking other status modifiers, then they are 1.5x", () => {
    // Source: Bulbapedia — Catch rate: paralysis/burn/poison are 1.5x across all gens
    expect(STATUS_CATCH_MODIFIERS.paralysis).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS.burn).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS.poison).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS["badly-poisoned"]).toBe(1.5);
  });

  it("given STATUS_CATCH_MODIFIERS alias, when compared to STATUS_CATCH_MODIFIERS_GEN5, then they are identical", () => {
    // STATUS_CATCH_MODIFIERS is an alias for GEN5 for backwards compatibility
    expect(STATUS_CATCH_MODIFIERS).toBe(STATUS_CATCH_MODIFIERS_GEN5);
  });
});

describe("STATUS_CATCH_MODIFIERS_GEN34", () => {
  it("given Gen 3-4 modifiers, when checking sleep/freeze, then they are 2.0x (not 2.5x)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — sleep/freeze: odds *= 2
    expect(STATUS_CATCH_MODIFIERS_GEN34.sleep).toBe(2.0);
    expect(STATUS_CATCH_MODIFIERS_GEN34.freeze).toBe(2.0);
  });

  it("given Gen 3-4 modifiers, when checking other statuses, then they are 1.5x (same as Gen 5+)", () => {
    // Source: pret/pokeemerald — poison/burn/paralysis: odds = (odds * 15) / 10
    expect(STATUS_CATCH_MODIFIERS_GEN34.paralysis).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN34.burn).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN34.poison).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN34["badly-poisoned"]).toBe(1.5);
  });
});

describe("STATUS_CATCH_MODIFIERS_GEN5", () => {
  it("given Gen 5+ modifiers, when checking sleep/freeze, then they are 2.5x", () => {
    // Source: Bulbapedia — Catch rate: Gen 5+ changed sleep/freeze to 2.5x
    expect(STATUS_CATCH_MODIFIERS_GEN5.sleep).toBe(2.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5.freeze).toBe(2.5);
  });

  it("given Gen 5+ modifiers, when checking other statuses, then they are 1.5x", () => {
    // Source: Bulbapedia — Catch rate: paralysis/burn/poison unchanged at 1.5x
    expect(STATUS_CATCH_MODIFIERS_GEN5.paralysis).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5.burn).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5.poison).toBe(1.5);
    expect(STATUS_CATCH_MODIFIERS_GEN5["badly-poisoned"]).toBe(1.5);
  });
});

describe("Poke Ball items have catch useEffect in generated data", () => {
  // Source: Bug #301 — Poke Ball items were missing useEffect.type=catch
  for (const gen of [2, 3, 4, 5]) {
    it(`given Gen ${gen} items.json, when checking Poke Ball items, then at least one has useEffect.type=catch`, () => {
      // Source: Bulbapedia — Poke Balls have a catch rate modifier
      const items = require(`../../../../packages/gen${gen}/data/items.json`);
      const pokeballs = items.filter((item: { category: string }) => item.category === "pokeball");
      expect(pokeballs.length).toBeGreaterThan(0);
      const withCatchEffect = pokeballs.filter(
        (item: { useEffect?: { type: string } }) => item.useEffect?.type === "catch",
      );
      expect(withCatchEffect.length).toBe(pokeballs.length);
    });

    it(`given Gen ${gen} items.json, when checking Ultra Ball, then catchRateModifier is 2`, () => {
      // Source: Bulbapedia — Ultra Ball catch rate modifier is 2x
      const items = require(`../../../../packages/gen${gen}/data/items.json`);
      const ultraBall = items.find((item: { id: string }) => item.id === "ultra-ball");
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
  it("should return 4 (guaranteed catch) for rate >= 255", () => {
    const rng = new SeededRandom(42);
    expect(calculateShakeChecks(255, rng)).toBe(4);
    expect(calculateShakeChecks(300, rng)).toBe(4);
  });

  it("should return a value between 0 and 4", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const shakes = calculateShakeChecks(100, rng);
      expect(shakes).toBeGreaterThanOrEqual(0);
      expect(shakes).toBeLessThanOrEqual(4);
    }
  });

  it("should be deterministic with the same seed", () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);

    for (let i = 0; i < 20; i++) {
      expect(calculateShakeChecks(100, rng1)).toBe(calculateShakeChecks(100, rng2));
    }
  });

  it("should almost always catch with rate 254", () => {
    // Rate 254 is very close to guaranteed; most attempts should succeed
    const rng = new SeededRandom(42);
    let caughtCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (calculateShakeChecks(254, rng) === 4) {
        caughtCount++;
      }
    }
    // 254/255 is ~99.6% per check, 4 checks => ~98.4% catch
    expect(caughtCount).toBeGreaterThan(trials * 0.9);
  });

  it("should rarely catch with rate 1", () => {
    const rng = new SeededRandom(42);
    let caughtCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (calculateShakeChecks(1, rng) === 4) {
        caughtCount++;
      }
    }
    // Very low catch rate, should catch very rarely
    expect(caughtCount).toBeLessThan(trials * 0.5);
  });
});
