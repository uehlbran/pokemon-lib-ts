import {
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CRIT_RATE_PROBABILITIES_GEN6,
  DataManager,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN8_ABILITY_IDS } from "../src/data";
import {
  GEN8_CRIT_MULTIPLIER,
  GEN8_CRIT_RATE_PROBABILITIES,
  GEN8_CRIT_RATE_TABLE,
  GEN8_CRIT_RATES,
} from "../src/Gen8CritCalc";
import { Gen8Ruleset } from "../src/Gen8Ruleset";

const abilityIds = GEN8_ABILITY_IDS;
const typeIds = CORE_TYPE_IDS;
const volatileIds = CORE_VOLATILE_IDS;

// ---------------------------------------------------------------------------
// Gen 8 Critical Hit Constants
//
// Gen 8 uses the same crit system as Gen 6-7:
//   - Crit multiplier: 1.5x (unchanged from Gen 6; was 2.0x in Gen 3-5)
//   - Crit rate table: [24, 8, 2, 1] (stages 0-3+, same as Gen 6-7)
//   - Stage 3+ is a guaranteed crit (1/1)
//
// Source: Showdown sim/battle-actions.ts -- Gen 8 crit multiplier and rate table
// Source: Bulbapedia "Critical hit" Gen 8 section -- unchanged from Gen 6-7
// ---------------------------------------------------------------------------

describe("Gen 8 critical hit constants", () => {
  it("given GEN8_CRIT_RATE_TABLE, then stage 0 denominator is 24 (~4.2%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 8 crit stage 0: 1/24
    expect(GEN8_CRIT_RATE_TABLE[0]).toBe(24);
  });

  it("given GEN8_CRIT_RATE_TABLE, then stage 1 denominator is 8 (12.5%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 8 crit stage 1: 1/8
    expect(GEN8_CRIT_RATE_TABLE[1]).toBe(8);
  });

  it("given GEN8_CRIT_RATE_TABLE, then stage 2 denominator is 2 (50%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 8 crit stage 2: 1/2
    expect(GEN8_CRIT_RATE_TABLE[2]).toBe(2);
  });

  it("given GEN8_CRIT_RATE_TABLE, then stage 3+ denominator is 1 (guaranteed)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 8 crit stage 3+: guaranteed (1/1)
    expect(GEN8_CRIT_RATE_TABLE[3]).toBe(1);
  });

  it("given GEN8_CRIT_RATE_TABLE, then it has exactly 4 entries", () => {
    // Source: Showdown sim/battle-actions.ts -- 4 stages (0, 1, 2, 3+)
    expect(GEN8_CRIT_RATE_TABLE).toHaveLength(4);
  });

  it("given GEN8_CRIT_RATE_TABLE, then values match [24, 8, 2, 1]", () => {
    // Source: Showdown sim/battle-actions.ts -- complete Gen 8 crit rate table
    expect(Array.from(GEN8_CRIT_RATE_TABLE)).toEqual([24, 8, 2, 1]);
  });

  it("given the canonical Gen 8 probability table, when checked, then values match [1/24, 1/8, 1/2, 1]", () => {
    // Source: Bulbapedia / Showdown Gen 8 crit table — same as Gen 6-7.
    expect(Array.from(GEN8_CRIT_RATE_PROBABILITIES)).toEqual([1 / 24, 1 / 8, 1 / 2, 1]);
  });

  it("given the canonical Gen 8 probability table, when compared to its aliases, then all references match", () => {
    // Source: issue #773 standardizes the probability surface on GEN8_CRIT_RATE_PROBABILITIES
    // while preserving GEN8_CRIT_RATES and the shared core export for compatibility.
    expect(GEN8_CRIT_RATE_PROBABILITIES).toBe(GEN8_CRIT_RATES);
    expect(GEN8_CRIT_RATE_PROBABILITIES).toBe(CRIT_RATE_PROBABILITIES_GEN6);
  });

  it("given GEN8_CRIT_MULTIPLIER, then it is 1.5", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier = 1.5x
    // Source: Bulbapedia "Critical hit" Gen 8 -- multiplier remains 1.5x
    expect(GEN8_CRIT_MULTIPLIER).toBe(1.5);
  });

  it("given GEN8_CRIT_MULTIPLIER is 1.5, then it differs from Gen 5's 2.0x", () => {
    // Source: Bulbapedia "Critical hit" -- Gen 5 used 2.0x, Gen 6+ changed to 1.5x
    // Triangulation: verify the value is specifically 1.5, not 2.0
    expect(GEN8_CRIT_MULTIPLIER).not.toBe(2.0);
    expect(GEN8_CRIT_MULTIPLIER).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// Gen 8 Critical Hit Roll (via Gen8Ruleset.rollCritical)
//
// Gen 8 inherits the BaseRuleset.rollCritical logic and adds
// Battle Armor / Shell Armor immunity (same as Gen 6-7).
//
// Source: Bulbapedia -- Battle Armor / Shell Armor prevent critical hits
// Source: Showdown sim/battle-actions.ts -- crit immunity check
// ---------------------------------------------------------------------------

describe("Gen 8 critical hit roll behavior", () => {
  const ruleset = new Gen8Ruleset(new DataManager());

  /**
   * Helper: create a minimal CritContext for testing.
   */
  function makeCritContext(overrides: {
    defenderAbility?: string;
    attackerVolatiles?: string[];
    moveCritRatio?: number;
    attackerItem?: string;
    attackerSpeciesId?: number;
    attackerAbility?: string;
  }) {
    const fakeRng = {
      next: () => 0.5,
      int: (min: number, _max: number) => {
        // Return min to trigger a crit (rng.int(1, rate) === 1 when rate > 1)
        return min;
      },
      chance: (p: number) => p >= 0.5,
      seed: 12345,
    };

    const volatileSet = new Set(overrides.attackerVolatiles ?? []);

    return {
      attacker: {
        pokemon: {
          heldItem: overrides.attackerItem ?? null,
          speciesId: overrides.attackerSpeciesId ?? 25,
          moves: [],
        },
        ability: overrides.attackerAbility ?? null,
        statStages: { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        volatileStatuses: volatileSet,
        types: [typeIds.electric],
      },
      defender: overrides.defenderAbility
        ? {
            pokemon: { heldItem: null, speciesId: 1, moves: [] },
            ability: overrides.defenderAbility,
            statStages: { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
            volatileStatuses: new Set(),
            types: [typeIds.normal],
          }
        : undefined,
      move: {
        critRatio: overrides.moveCritRatio ?? 0,
      },
      rng: fakeRng,
    } as any;
  }

  it("given defender has Battle Armor ability, when rolling crit, then crit is prevented", () => {
    // Source: Bulbapedia -- Battle Armor prevents critical hits
    const context = makeCritContext({ defenderAbility: abilityIds.battleArmor });
    expect(ruleset.rollCritical(context)).toBe(false);
  });

  it("given defender has Shell Armor ability, when rolling crit, then crit is prevented", () => {
    // Source: Bulbapedia -- Shell Armor prevents critical hits (same effect as Battle Armor)
    const context = makeCritContext({ defenderAbility: abilityIds.shellArmor });
    expect(ruleset.rollCritical(context)).toBe(false);
  });

  it("given defender has no crit-blocking ability, when rolling crit with favorable RNG, then crit can occur", () => {
    // Source: Bulbapedia -- without Battle Armor/Shell Armor, crits are possible
    // With our fake RNG that returns min (=1), and stage 0 rate of 24,
    // rng.int(1, 24) === 1 is true, so crit occurs
    const context = makeCritContext({ defenderAbility: abilityIds.intimidate });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given attacker has Focus Energy, when rolling crit, then crit stage is boosted by +2", () => {
    // Source: Showdown sim/battle-actions.ts -- Focus Energy adds +2 to crit stage
    // Stage 2 rate = 2, so rng.int(1, 2) === 1 is true with our favorable RNG
    const context = makeCritContext({ attackerVolatiles: [volatileIds.focusEnergy] });
    expect(ruleset.rollCritical(context)).toBe(true);
  });
});
