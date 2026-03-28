import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_VOLATILE_IDS,
  CRIT_MULTIPLIER_CLASSIC,
  CRIT_RATE_PROBABILITIES_GEN3_5,
  createEvs,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "@pokemon-lib-ts/gen5";
import { describe, expect, it } from "vitest";
import {
  GEN5_CRIT_MULTIPLIER,
  GEN5_CRIT_RATE_PROBABILITIES,
  GEN5_CRIT_RATE_TABLE,
} from "../src/Gen5CritCalc";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

// ---------------------------------------------------------------------------
// Crit-calc constant tests
// ---------------------------------------------------------------------------

describe("Gen 5 crit calc constants", () => {
  it("given Gen5 crit table, when checking stage 1, then crit chance is 1/16", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 0 in our 0-indexed table = Stage 1 in Showdown's 1-indexed table = denominator 16
    expect(GEN5_CRIT_RATE_TABLE[0]).toBe(16);
  });

  it("given Gen5 crit table, when checking stage 2, then crit chance is 1/8", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 1 in our table = denominator 8
    expect(GEN5_CRIT_RATE_TABLE[1]).toBe(8);
  });

  it("given Gen5 crit table, when checking stage 3 (Focus Energy +2), then crit chance is 1/4", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 2 in our table = denominator 4 (1/4 chance)
    // Focus Energy adds +2 stages from base 0, resulting in stage 2
    expect(GEN5_CRIT_RATE_TABLE[2]).toBe(4);
  });

  it("given Gen5 crit table, when checking stage 4, then crit chance is 1/3", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    expect(GEN5_CRIT_RATE_TABLE[3]).toBe(3);
  });

  it("given Gen5 crit table, when checking stage 5, then crit chance is 1/2", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts critMult = [0, 16, 8, 4, 3, 2]
    // Stage 4 in our table = denominator 2 (max stage, 1/2 chance)
    expect(GEN5_CRIT_RATE_TABLE[4]).toBe(2);
  });

  it("given GEN5_CRIT_RATE_TABLE, when checking length, then has exactly 5 entries", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- 5 stages (0-4 in our indexing)
    expect(GEN5_CRIT_RATE_TABLE.length).toBe(5);
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

  it("given GEN5_CRIT_RATE_PROBABILITIES, when checking stage 0 probability, then probability is 1/16 = 0.0625", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- stage 0 crit rate = 1/16
    // Derivation: 1 / 16 = 0.0625
    expect(GEN5_CRIT_RATE_PROBABILITIES[0]).toBeCloseTo(1 / 16, 5);
  });

  it("given GEN5_CRIT_RATE_TABLE, when compared to CRIT_RATE_TABLE_GEN3_5 values, then matches [16, 8, 4, 3, 2]", () => {
    // Source: issue #773 standardizes the denominator surface on GEN5_CRIT_RATE_TABLE
    // backed by the shared core CRIT_RATE_TABLE_GEN3_5 constant.
    expect(Array.from(GEN5_CRIT_RATE_TABLE)).toEqual([16, 8, 4, 3, 2]);
  });

  it("given GEN5_CRIT_RATE_PROBABILITIES, when compared to CRIT_RATE_PROBABILITIES_GEN3_5, then same reference", () => {
    // Source: issue #773 standardizes the probability surface on GEN5_CRIT_RATE_PROBABILITIES
    expect(GEN5_CRIT_RATE_PROBABILITIES).toBe(CRIT_RATE_PROBABILITIES_GEN3_5);
  });

  it("given GEN5_CRIT_RATE_PROBABILITIES, when checking stage 1 probability, then probability is 1/8 = 0.125", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- stage 1 crit rate = 1/8
    // Derivation: 1 / 8 = 0.125
    expect(GEN5_CRIT_RATE_PROBABILITIES[1]).toBeCloseTo(1 / 8, 5);
  });

  it("given GEN5_CRIT_RATE_PROBABILITIES, when comparing to CRIT_RATE_PROBABILITIES_GEN3_5, then table is the same reference", () => {
    // Source: packages/core/src/logic/critical-hit.ts -- CRIT_RATE_PROBABILITIES_GEN3_5 is the authoritative table
    // Gen5CritCalc re-exports the core constant for convenience
    expect(GEN5_CRIT_RATE_PROBABILITIES).toBe(CRIT_RATE_PROBABILITIES_GEN3_5);
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

const DATA_MANAGER = createGen5DataManager();

function makeActiveWithAbility(
  ability: string,
  overrides?: { heldItem?: string | null },
): ActivePokemon {
  const species = DATA_MANAGER.getSpecies(GEN5_SPECIES_IDS.bulbasaur);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(42), {
    nature: GEN5_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    heldItem: overrides?.heldItem ?? null,
    friendship: species.baseFriendship,
    pokeball: GEN5_ITEM_IDS.pokeBall,
  });
  pokemon.ability = ability;
  pokemon.currentHp = 200;
  pokemon.calculatedStats = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return createBattleOnFieldPokemon(pokemon, 0, [...species.types]);
}

/** Stub BattleState -- unused but required by CritContext. */
const STUB_STATE = {} as Parameters<Gen5Ruleset["rollCritical"]>[0]["state"];

/** Minimal MoveData stub -- critRatio 0 means base stage. */
const STUB_MOVE = DATA_MANAGER.getMove(GEN5_MOVE_IDS.tackle) as Parameters<
  Gen5Ruleset["rollCritical"]
>[0]["move"];

/** High-crit move: critRatio 1 means +1 stage. */
const HIGH_CRIT_MOVE = {
  ...DATA_MANAGER.getMove(GEN5_MOVE_IDS.slash),
  critRatio: 1,
} as Parameters<Gen5Ruleset["rollCritical"]>[0]["move"];

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
  return Array.from({ length: trials }, (_, i) =>
    ruleset.rollCritical({
      attacker,
      defender,
      move,
      state: STUB_STATE,
      rng: new SeededRandom(baseSeed + i),
    }),
  ).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// rollCritical -- Battle Armor / Shell Armor immunity
// ---------------------------------------------------------------------------

describe("Gen5Ruleset rollCritical -- Battle Armor / Shell Armor immunity", () => {
  it("given pokemon with Battle Armor, when rolling crit, then always returns false", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Battle_Armor_(Ability)
    // Battle Armor prevents critical hits entirely
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const defender = makeActiveWithAbility(GEN5_ABILITY_IDS.battleArmor);

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
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const defender = makeActiveWithAbility(GEN5_ABILITY_IDS.shellArmor);

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
    const attacker = makeActiveWithAbility(GEN5_ABILITY_IDS.superLuck, {
      heldItem: GEN5_ITEM_IDS.scopeLens,
    });
    const defender = makeActiveWithAbility(GEN5_ABILITY_IDS.battleArmor);

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
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const crits = countCrits(ruleset, attacker, defender, HIGH_CRIT_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given high-crit move (seed=7777), when computing crit stage, then applies +1 stage (crit rate ~1/8)", () => {
    // Source: Showdown -- same mechanic, different seed for triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
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
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.focusEnergy, { turnsLeft: -1 });
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(380);
    expect(crits).toBeLessThanOrEqual(620);
  });

  it("given Focus Energy volatile (seed=1234), when computing crit stage, then applies +2 stages (crit rate ~1/4)", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Focus_Energy -- triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.focusEnergy, { turnsLeft: -1 });
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
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
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none, {
      heldItem: GEN5_ITEM_IDS.scopeLens,
    });
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given attacker with Scope Lens (seed=1000), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility(CORE_ABILITY_IDS.none, {
      heldItem: GEN5_ITEM_IDS.scopeLens,
    });
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 1000);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});

describe("Gen5Ruleset rollCritical -- Super Luck crit boost", () => {
  it("given attacker with Super Luck ability (seed=42), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- Super Luck adds +1 crit stage
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility(GEN5_ABILITY_IDS.superLuck);
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 42);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });

  it("given attacker with Super Luck ability (seed=5555), when rollCritical is called 2000 times, then crit rate is approximately 12.5% (stage 1 = 1/8)", () => {
    // Source: references/pokemon-showdown/sim/battle-actions.ts -- triangulation
    const ruleset = new Gen5Ruleset();
    const attacker = makeActiveWithAbility(GEN5_ABILITY_IDS.superLuck);
    const defender = makeActiveWithAbility(CORE_ABILITY_IDS.none);
    const crits = countCrits(ruleset, attacker, defender, STUB_MOVE, 2000, 5555);
    expect(crits).toBeGreaterThanOrEqual(150);
    expect(crits).toBeLessThanOrEqual(350);
  });
});
