import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { CRIT_MULTIPLIER_CLASSIC, CRIT_RATES_GEN3_5, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN5_CRIT_MULTIPLIER,
  GEN5_CRIT_RATE_DENOMINATORS,
  GEN5_CRIT_RATES,
} from "../src/Gen5CritCalc";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

// ---------------------------------------------------------------------------
// Crit-calc constant tests
// ---------------------------------------------------------------------------

describe("Gen 5 crit calc constants", () => {
  it("given Gen5 crit table, when checking stage 1, then crit chance is 1/16", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 0 in our 0-indexed table = Stage 1 in Showdown's 1-indexed table = denominator 16
    expect(GEN5_CRIT_RATE_DENOMINATORS[0]).toBe(16);
  });

  it("given Gen5 crit table, when checking stage 2, then crit chance is 1/8", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 1 in our table = denominator 8
    expect(GEN5_CRIT_RATE_DENOMINATORS[1]).toBe(8);
  });

  it("given Gen5 crit table, when checking stage 3 (Focus Energy +2), then crit chance is 1/4", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 2 in our table = denominator 4 (1/4 chance)
    // Focus Energy adds +2 stages from base 0, resulting in stage 2
    expect(GEN5_CRIT_RATE_DENOMINATORS[2]).toBe(4);
  });

  it("given Gen5 crit table, when checking stage 4, then crit chance is 1/3", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    expect(GEN5_CRIT_RATE_DENOMINATORS[3]).toBe(3);
  });

  it("given Gen5 crit table, when checking stage 5, then crit chance is 1/2", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 4 in our table = denominator 2 (max stage, 1/2 chance)
    expect(GEN5_CRIT_RATE_DENOMINATORS[4]).toBe(2);
  });

  it("given GEN5_CRIT_RATE_DENOMINATORS, when checking length, then has exactly 5 entries", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- 5 stages (0-4 in our indexing)
    expect(GEN5_CRIT_RATE_DENOMINATORS.length).toBe(5);
  });

  it("given Gen5 crit multiplier, then is 2.0 (not 1.5)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
    // Gen 5 crit: baseDamage * (move.critModifier || (this.battle.gen >= 6 ? 1.5 : 2))
    // Gen < 6 uses 2x crit multiplier
    expect(GEN5_CRIT_MULTIPLIER).toBe(2.0);
  });

  it("given GEN5_CRIT_MULTIPLIER, when comparing to CRIT_MULTIPLIER_CLASSIC, then values match", () => {
    // Source: packages/core/src/logic/critical-hit.ts -- CRIT_MULTIPLIER_CLASSIC = 2.0
    // Gen 5 uses the classic multiplier, same as Gen 1-5
    expect(GEN5_CRIT_MULTIPLIER).toBe(CRIT_MULTIPLIER_CLASSIC);
  });

  it("given GEN5_CRIT_RATES, when checking stage 0 probability, then probability is 1/16 = 0.0625", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- stage 0 crit rate = 1/16
    // Derivation: 1 / 16 = 0.0625
    expect(GEN5_CRIT_RATES[0]).toBeCloseTo(1 / 16, 5);
  });

  it("given GEN5_CRIT_RATES, when checking stage 1 probability, then probability is 1/8 = 0.125", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- stage 1 crit rate = 1/8
    // Derivation: 1 / 8 = 0.125
    expect(GEN5_CRIT_RATES[1]).toBeCloseTo(1 / 8, 5);
  });

  it("given GEN5_CRIT_RATES, when comparing to CRIT_RATES_GEN3_5, then table is the same reference", () => {
    // Source: packages/core/src/logic/critical-hit.ts -- CRIT_RATES_GEN3_5 is the authoritative table
    // Gen5CritCalc re-exports the core constant for convenience
    expect(GEN5_CRIT_RATES).toBe(CRIT_RATES_GEN3_5);
  });
});

// ---------------------------------------------------------------------------
// Gen5Ruleset crit method delegation tests
// ---------------------------------------------------------------------------

describe("Gen5Ruleset crit methods", () => {
  it("given Gen5Ruleset, when getCritRateTable, then stage 0 denominator is 16", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Gen 3-5 crit rate table
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getCritRateTable()[0]).toBe(16);
  });

  it("given Gen5Ruleset, when getCritRateTable, then stage 4 denominator is 2", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- max crit stage = 1/2 chance
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getCritRateTable()[4]).toBe(2);
  });

  it("given Gen5Ruleset, when getCritMultiplier, then returns 2.0", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
    // Gen 5 crit: gen < 6 uses 2x; Gen 6+ changed to 1.5x (BaseRuleset default)
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// Helper factories for crit tests
// ---------------------------------------------------------------------------

function makeActiveWithAbility(
  ability: string,
  overrides?: { heldItem?: string | null },
): ActivePokemon {
  return {
    pokemon: {
      uid: "test",
      speciesId: 1,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [],
      ability,
      abilitySlot: "normal1" as const,
      heldItem: overrides?.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: ["normal"],
    ability,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

/** Stub BattleState -- unused but required by CritContext. */
const STUB_STATE = {} as Parameters<Gen5Ruleset["rollCritical"]>[0]["state"];

/** Minimal MoveData stub -- critRatio 0 means base stage. */
const STUB_MOVE = { id: "tackle", critRatio: 0 } as Parameters<
  Gen5Ruleset["rollCritical"]
>[0]["move"];

/** High-crit move: critRatio 1 means +1 stage. */
const HIGH_CRIT_MOVE = { id: "slash", critRatio: 1 } as Parameters<
  Gen5Ruleset["rollCritical"]
>[0]["move"];

/**
 * Helper: roll N crits and return the count of true results.
 * Uses sequential seeds for reproducibility.
 */
function countCrits(
  ruleset: Gen5Ruleset,
  attacker: ActivePokemon,
  defender: ActivePokemon | undefined,
  move: Parameters<Gen5Ruleset["rollCritical"]>[0]["move"],
  trials: number,
  baseSeed: number,
): number {
  let crits = 0;
  for (let i = 0; i < trials; i++) {
    const rng = new SeededRandom(baseSeed + i);
    if (
      ruleset.rollCritical({
        attacker,
        defender,
        move,
        state: STUB_STATE,
        rng,
      })
    ) {
      crits++;
    }
  }
  return crits;
}

// ---------------------------------------------------------------------------
// rollCritical -- Battle Armor / Shell Armor immunity
// ---------------------------------------------------------------------------

describe("Gen5Ruleset rollCritical -- Battle Armor / Shell Armor immunity", () => {
  it("given pokemon with Battle Armor, when rolling crit, then always returns false", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Battle_Armor_(Ability)
    // Battle Armor prevents critical hits entirely
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none");
    const defender = makeActiveWithAbility("battle-armor");

    for (let seed = 1; seed <= 100; seed++) {
      const rng = new SeededRandom(seed);
      const result = ruleset.rollCritical({
        attacker,
        defender,
        move: STUB_MOVE,
        state: STUB_STATE,
        rng,
      });
      expect(result).toBe(false);
    }
  });

  it("given pokemon with Shell Armor, when rolling crit, then always returns false", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Shell_Armor_(Ability)
    // Shell Armor prevents critical hits entirely
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none");
    const defender = makeActiveWithAbility("shell-armor");

    for (let seed = 1; seed <= 100; seed++) {
      const rng = new SeededRandom(seed);
      const result = ruleset.rollCritical({
        attacker,
        defender,
        move: STUB_MOVE,
        state: STUB_STATE,
        rng,
      });
      expect(result).toBe(false);
    }
  });

  it("given defender with Battle Armor and attacker with Scope Lens + Super Luck, when rolling crit 100 times, then always returns false", () => {
    // Source: Bulbapedia -- Battle Armor prevents crits regardless of attacker's crit stage
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("super-luck", { heldItem: "scope-lens" });
    const defender = makeActiveWithAbility("battle-armor");

    for (let seed = 1; seed <= 100; seed++) {
      const rng = new SeededRandom(seed);
      const result = ruleset.rollCritical({
        attacker,
        defender,
        move: HIGH_CRIT_MOVE,
        state: STUB_STATE,
        rng,
      });
      expect(result).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// rollCritical -- high-crit move stage
// ---------------------------------------------------------------------------

describe("Gen5Ruleset rollCritical -- high-crit move stage", () => {
  it("given high-crit move (seed=42), when computing crit stage, then applies +1 stage (crit rate ~1/8)", () => {
    // Source: Showdown -- moves with critRatio property add to crit stage
    // Stage 1 = 1/8 = 12.5%. Expected: ~250 crits out of 2000 trials.
    // Tolerance: 150-350 for PRNG variance.
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none");
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, HIGH_CRIT_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given high-crit move (seed=7777), when computing crit stage, then applies +1 stage (crit rate ~1/8)", () => {
    // Source: Showdown -- same mechanic, different seed for triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none");
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, HIGH_CRIT_MOVE, 2000, 7777);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});

// ---------------------------------------------------------------------------
// rollCritical -- Focus Energy volatile
// ---------------------------------------------------------------------------

describe("Gen5Ruleset rollCritical -- Focus Energy", () => {
  it("given Focus Energy volatile (seed=42), when computing crit stage, then applies +2 stages (crit rate ~1/4)", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Focus_Energy
    // Focus Energy adds +2 crit stages. Base 0 + 2 = stage 2 = 1/4 = 25%
    // Expected: ~500 crits out of 2000 trials. Tolerance: 380-620.
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none");
    attacker.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(380);
    expect(crits).toBeLessThanOrEqual(620);
  });

  it("given Focus Energy volatile (seed=1234), when computing crit stage, then applies +2 stages (crit rate ~1/4)", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Focus_Energy -- triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none");
    attacker.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 1234);
    expect(crits).toBeGreaterThanOrEqual(380);
    expect(crits).toBeLessThanOrEqual(620);
  });
});

// ---------------------------------------------------------------------------
// rollCritical -- Scope Lens / Super Luck crit boosts
// ---------------------------------------------------------------------------

describe("Gen5Ruleset rollCritical -- Scope Lens crit boost", () => {
  it("given attacker with Scope Lens (seed=42), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Scope Lens adds +1 crit stage
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none", { heldItem: "scope-lens" });
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given attacker with Scope Lens (seed=1000), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("none", { heldItem: "scope-lens" });
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 1000);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});

describe("Gen5Ruleset rollCritical -- Super Luck crit boost", () => {
  it("given attacker with Super Luck ability (seed=42), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Super Luck adds +1 crit stage
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("super-luck");
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given attacker with Super Luck ability (seed=5555), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility("super-luck");
    const defender = makeActiveWithAbility("none");
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 5555);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});
