import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { CRIT_MULTIPLIER_CLASSIC, CRIT_RATES_GEN3_5, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN4_CRIT_MULTIPLIER,
  GEN4_CRIT_RATE_DENOMINATORS,
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
