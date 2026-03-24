import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { CRIT_MULTIPLIER_CLASSIC, CRIT_RATES_GEN3_5, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN4_CRIT_MULTIPLIER,
  GEN4_CRIT_RATE_DENOMINATORS,
  GEN4_CRIT_RATE_PROBABILITIES,
  GEN4_CRIT_RATE_TABLE,
  GEN4_CRIT_RATES,
} from "../src/Gen4CritCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Crit-calc constant tests
// ---------------------------------------------------------------------------

describe("Gen 4 crit calc constants", () => {
  it("given stage 0, when checking crit rate denominator, then denominator is 16 (1/16 chance)", () => {
    // Source: pret/pokeplatinum — same crit table as Gen 3 and Gen 5
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 0 (no modifiers): 1/16 chance = denominator 16
    expect(GEN4_CRIT_RATE_DENOMINATORS[0]).toBe(16);
  });

  it("given stage 1, when checking crit rate denominator, then denominator is 8 (1/8 chance)", () => {
    // Source: pret/pokeplatinum — same crit table as Gen 3 and Gen 5
    // Stage 1 (Scope Lens or high-crit move): 1/8 chance = denominator 8
    expect(GEN4_CRIT_RATE_DENOMINATORS[1]).toBe(8);
  });

  it("given stage 2, when checking crit rate denominator, then denominator is 4 (1/4 chance)", () => {
    // Source: pret/pokeplatinum — crit stage 2 = 1/4 chance
    expect(GEN4_CRIT_RATE_DENOMINATORS[2]).toBe(4);
  });

  it("given stage 3, when checking crit rate denominator, then denominator is 3 (1/3 chance)", () => {
    // Source: pret/pokeplatinum — crit stage 3 = 1/3 chance
    expect(GEN4_CRIT_RATE_DENOMINATORS[3]).toBe(3);
  });

  it("given stage 4, when checking crit rate denominator, then denominator is 2 (1/2 chance)", () => {
    // Source: pret/pokeplatinum — crit stage 4+ = 1/2 chance (max)
    expect(GEN4_CRIT_RATE_DENOMINATORS[4]).toBe(2);
  });

  it("given GEN4_CRIT_RATE_DENOMINATORS, when checking length, then has exactly 5 entries", () => {
    // Source: pret/pokeplatinum — 5 crit stages (0–4), same as Gen 3-5
    expect(GEN4_CRIT_RATE_DENOMINATORS.length).toBe(5);
  });

  it("given GEN4_CRIT_RATES, when checking stage 0 probability, then probability is 1/16 = 0.0625", () => {
    // Source: pret/pokeplatinum — stage 0 crit rate = 1/16
    // Derivation: 1 / 16 = 0.0625
    expect(GEN4_CRIT_RATES[0]).toBeCloseTo(1 / 16, 5);
  });

  it("given the canonical Gen 4 denominator table, when compared to the deprecated alias, then they are the same table", () => {
    // Source: issue #773 standardizes the denominator surface on GEN4_CRIT_RATE_TABLE
    // while preserving GEN4_CRIT_RATE_DENOMINATORS for compatibility.
    expect(GEN4_CRIT_RATE_TABLE).toBe(GEN4_CRIT_RATE_DENOMINATORS);
  });

  it("given the canonical Gen 4 probability table, when compared to the deprecated alias, then they are the same table", () => {
    // Source: issue #773 standardizes the probability surface on GEN4_CRIT_RATE_PROBABILITIES
    // while preserving GEN4_CRIT_RATES for compatibility.
    expect(GEN4_CRIT_RATE_PROBABILITIES).toBe(GEN4_CRIT_RATES);
  });

  it("given GEN4_CRIT_RATES, when checking stage 1 probability, then probability is 1/8 = 0.125", () => {
    // Source: pret/pokeplatinum — stage 1 crit rate = 1/8
    // Derivation: 1 / 8 = 0.125
    expect(GEN4_CRIT_RATES[1]).toBeCloseTo(1 / 8, 5);
  });

  it("given GEN4_CRIT_MULTIPLIER, when a crit lands, then damage is multiplied by 2.0", () => {
    // Source: pret/pokeplatinum — critical hits double base damage in Gen 3-5
    // Gen 6+ changed the multiplier to 1.5x (BaseRuleset default)
    expect(GEN4_CRIT_MULTIPLIER).toBe(2.0);
  });

  it("given GEN4_CRIT_MULTIPLIER, when comparing to CRIT_MULTIPLIER_CLASSIC, then values match", () => {
    // Source: packages/core/src/logic/critical-hit.ts — CRIT_MULTIPLIER_CLASSIC = 2.0
    // Gen 4 uses the classic multiplier, same as Gen 1-5
    expect(GEN4_CRIT_MULTIPLIER).toBe(CRIT_MULTIPLIER_CLASSIC);
  });

  it("given GEN4_CRIT_RATES, when comparing to CRIT_RATES_GEN3_5, then table is the same reference", () => {
    // Source: packages/core/src/logic/critical-hit.ts — CRIT_RATES_GEN3_5 is the authoritative table
    // Gen4CritCalc re-exports the core constant for convenience
    expect(GEN4_CRIT_RATES).toBe(CRIT_RATES_GEN3_5);
  });
});

// ---------------------------------------------------------------------------
// Gen4Ruleset crit method delegation tests
// ---------------------------------------------------------------------------

describe("Gen4Ruleset crit methods", () => {
  function makeRuleset(): Gen4Ruleset {
    return new Gen4Ruleset();
  }

  it("given Gen4Ruleset, when getCritRateTable, then stage 0 denominator is 16", () => {
    // Source: pret/pokeplatinum — getCritRateTable returns [16, 8, 4, 3, 2]
    const ruleset = makeRuleset();
    expect(ruleset.getCritRateTable()[0]).toBe(16);
  });

  it("given Gen4Ruleset, when getCritRateTable, then stage 4 denominator is 2", () => {
    // Source: pret/pokeplatinum — max crit stage = 1/2 chance
    const ruleset = makeRuleset();
    expect(ruleset.getCritRateTable()[4]).toBe(2);
  });

  it("given Gen4Ruleset, when getCritMultiplier, then returns 2.0", () => {
    // Source: pret/pokeplatinum — critical hits double damage in Gen 3-5
    // Gen 6+ changed to 1.5x (BaseRuleset default); Gen 4 overrides to 2.0x
    const ruleset = makeRuleset();
    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// rollCritical — Battle Armor / Shell Armor immunity
// ---------------------------------------------------------------------------

/**
 * Build a minimal ActivePokemon stub for crit tests.
 * All we need is `ability` to test Battle Armor / Shell Armor immunity.
 */
function makeActiveWithAbility(ability: string): ActivePokemon {
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
      heldItem: null,
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
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

/**
 * Build a minimal ActivePokemon stub for crit tests with configurable ability and item.
 */
function makeCritActive(overrides: { ability?: string; heldItem?: string | null }): ActivePokemon {
  const ability = overrides.ability ?? "none";
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
      heldItem: overrides.heldItem ?? null,
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
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

/** Stub BattleState — unused but required by CritContext. */
const STUB_STATE = {} as Parameters<Gen4Ruleset["rollCritical"]>[0]["state"];

/** Minimal MoveData stub — category not inspected during crit roll. */
const STUB_MOVE = { id: "tackle", critStage: 0 } as Parameters<
  Gen4Ruleset["rollCritical"]
>[0]["move"];

describe("Gen4Ruleset rollCritical — Battle Armor immunity", () => {
  it("given defender with Battle Armor, when rollCritical is called 100 times, then always returns false", () => {
    // Source: pret/pokeplatinum — Battle Armor prevents critical hits entirely
    // Source: Bulbapedia — Battle Armor ability: user cannot be struck by critical hits
    const ruleset = new Gen4Ruleset();
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

  it("given defender with Shell Armor, when rollCritical is called 100 times, then always returns false", () => {
    // Source: pret/pokeplatinum — Shell Armor prevents critical hits entirely
    // Source: Bulbapedia — Shell Armor ability: user cannot be struck by critical hits
    const ruleset = new Gen4Ruleset();
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

  it("given no defender (undefined), when rollCritical is called, then does not throw", () => {
    // Source: CritContext.defender is optional — engine may call without a defender
    // When defender is undefined, Battle Armor / Shell Armor check is skipped safely
    const ruleset = new Gen4Ruleset();
    const attacker = makeActiveWithAbility("none");
    const rng = new SeededRandom(42);

    expect(() =>
      ruleset.rollCritical({
        attacker,
        defender: undefined,
        move: STUB_MOVE,
        state: STUB_STATE,
        rng,
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// rollCritical — Scope Lens, Razor Claw, Super Luck crit boosts
// ---------------------------------------------------------------------------

/**
 * Helper: roll N crits and return the count of true results.
 * Uses sequential seeds starting from `baseSeed` for reproducibility.
 */
function countCrits(
  ruleset: Gen4Ruleset,
  attacker: ActivePokemon,
  defender: ActivePokemon | undefined,
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
        move: STUB_MOVE,
        state: STUB_STATE,
        rng,
      })
    ) {
      crits++;
    }
  }
  return crits;
}

describe("Gen4Ruleset rollCritical — Scope Lens crit boost", () => {
  it("given attacker with Scope Lens (seed=42), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 1 = 1/8 = 12.5%
    // Source: Showdown sim/battle-actions.ts — Scope Lens adds +1 crit stage
    // Expected: ~250 crits out of 2000 trials (12.5%)
    // Tolerance: 150-350 (generous for PRNG variance)
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ heldItem: "scope-lens" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given attacker with Scope Lens (seed=1000), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 1 = 1/8 = 12.5%
    // Triangulation: different seed to ensure not seed-dependent
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ heldItem: "scope-lens" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 1000);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});

describe("Gen4Ruleset rollCritical — Razor Claw crit boost", () => {
  it("given attacker with Razor Claw (seed=42), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 1 = 1/8 = 12.5%
    // Source: Showdown sim/battle-actions.ts — Razor Claw adds +1 crit stage
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ heldItem: "razor-claw" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given attacker with Razor Claw (seed=7777), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 1 = 1/8 = 12.5%
    // Triangulation: different seed
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ heldItem: "razor-claw" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 7777);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});

describe("Gen4Ruleset rollCritical — Super Luck crit boost", () => {
  it("given attacker with Super Luck ability (seed=42), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 1 = 1/8 = 12.5%
    // Source: Showdown sim/battle-actions.ts — Super Luck adds +1 crit stage
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ ability: "super-luck" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given attacker with Super Luck ability (seed=5555), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 1 = 1/8 = 12.5%
    // Triangulation: different seed
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ ability: "super-luck" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 5555);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});

describe("Gen4Ruleset rollCritical — Super Luck + Scope Lens combined", () => {
  it("given attacker with Super Luck ability and Scope Lens item (seed=42), when rollCritical is called 2000 times, then crit rate is approximately 25% (stage 2 = 1/4)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 2 = 1/4 = 25%
    // Super Luck (+1) + Scope Lens (+1) = stage 2
    // Expected: ~500 crits out of 2000 trials (25%)
    // Tolerance: 380-620
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ ability: "super-luck", heldItem: "scope-lens" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(380);
    expect(crits).toBeLessThanOrEqual(620);
  });

  it("given attacker with Super Luck ability and Scope Lens item (seed=9999), when rollCritical is called 2000 times, then crit rate is approximately 25% (stage 2 = 1/4)", () => {
    // Source: pret/pokeplatinum — crit stage table: stage 2 = 1/4 = 25%
    // Triangulation: different seed
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ ability: "super-luck", heldItem: "scope-lens" });
    const defender = makeCritActive({});
    const crits = countCrits(ruleset, attacker, defender, 2000, 9999);
    expect(crits).toBeGreaterThanOrEqual(380);
    expect(crits).toBeLessThanOrEqual(620);
  });
});

describe("Gen4Ruleset rollCritical — Battle Armor still blocks elevated crit stage", () => {
  it("given attacker with Scope Lens and defender with Battle Armor, when rollCritical is called 100 times, then always returns false", () => {
    // Source: pret/pokeplatinum — Battle Armor prevents critical hits entirely,
    // regardless of the attacker's crit stage modifiers (Scope Lens, Super Luck, etc.)
    // Source: Bulbapedia — Battle Armor: "The Pokemon cannot be struck by critical hits."
    const ruleset = new Gen4Ruleset();
    const attacker = makeCritActive({ ability: "super-luck", heldItem: "scope-lens" });
    const defender = makeCritActive({ ability: "battle-armor" });

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
});
