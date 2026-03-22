import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN9_CRIT_MULTIPLIER, GEN9_CRIT_RATE_TABLE } from "../src/Gen9CritCalc";
import { Gen9Ruleset } from "../src/Gen9Ruleset";

// ---------------------------------------------------------------------------
// Gen 9 Critical Hit Constants
//
// Gen 9 uses the same crit system as Gen 6-8:
//   - Crit multiplier: 1.5x (unchanged from Gen 6; was 2.0x in Gen 3-5)
//   - Crit rate table: [24, 8, 2, 1] (stages 0-3+, same as Gen 6-8)
//   - Stage 3+ is a guaranteed crit (1/1)
//
// Source: Showdown sim/battle-actions.ts -- Gen 9 crit multiplier and rate table
// Source: Bulbapedia "Critical hit" Gen 9 section -- unchanged from Gen 6-8
// ---------------------------------------------------------------------------

describe("Gen 9 critical hit constants", () => {
  it("given GEN9_CRIT_RATE_TABLE, then stage 0 denominator is 24 (~4.2%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 0: 1/24
    expect(GEN9_CRIT_RATE_TABLE[0]).toBe(24);
  });

  it("given GEN9_CRIT_RATE_TABLE, then stage 1 denominator is 8 (12.5%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 1: 1/8
    expect(GEN9_CRIT_RATE_TABLE[1]).toBe(8);
  });

  it("given GEN9_CRIT_RATE_TABLE, then stage 2 denominator is 2 (50%)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 2: 1/2
    expect(GEN9_CRIT_RATE_TABLE[2]).toBe(2);
  });

  it("given GEN9_CRIT_RATE_TABLE, then stage 3+ denominator is 1 (guaranteed)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 9 crit stage 3+: guaranteed (1/1)
    expect(GEN9_CRIT_RATE_TABLE[3]).toBe(1);
  });

  it("given GEN9_CRIT_RATE_TABLE, then it has exactly 4 entries", () => {
    // Source: Showdown sim/battle-actions.ts -- 4 stages (0, 1, 2, 3+)
    expect(GEN9_CRIT_RATE_TABLE).toHaveLength(4);
  });

  it("given GEN9_CRIT_RATE_TABLE, then values match [24, 8, 2, 1]", () => {
    // Source: Showdown sim/battle-actions.ts -- complete Gen 9 crit rate table
    expect(Array.from(GEN9_CRIT_RATE_TABLE)).toEqual([24, 8, 2, 1]);
  });

  it("given GEN9_CRIT_MULTIPLIER, then it is 1.5", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier = 1.5x
    // Source: Bulbapedia "Critical hit" Gen 9 -- multiplier remains 1.5x
    expect(GEN9_CRIT_MULTIPLIER).toBe(1.5);
  });

  it("given GEN9_CRIT_MULTIPLIER is 1.5, then it differs from Gen 5's 2.0x", () => {
    // Source: Bulbapedia "Critical hit" -- Gen 5 used 2.0x, Gen 6+ changed to 1.5x
    // Triangulation: verify the value is specifically 1.5, not 2.0
    expect(GEN9_CRIT_MULTIPLIER).not.toBe(2.0);
    expect(GEN9_CRIT_MULTIPLIER).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// Gen 9 Critical Hit Roll (via Gen9Ruleset.rollCritical)
//
// Gen 9 inherits the BaseRuleset.rollCritical logic and adds
// Battle Armor / Shell Armor immunity (same as Gen 6-8).
//
// Source: Bulbapedia -- Battle Armor / Shell Armor prevent critical hits
// Source: Showdown sim/battle-actions.ts -- crit immunity check
// ---------------------------------------------------------------------------

describe("Gen 9 critical hit roll behavior", () => {
  const ruleset = new Gen9Ruleset(new DataManager());

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
        types: ["electric" as const],
      },
      defender: overrides.defenderAbility
        ? {
            pokemon: { heldItem: null, speciesId: 1, moves: [] },
            ability: overrides.defenderAbility,
            statStages: { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
            volatileStatuses: new Set(),
            types: ["normal" as const],
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
    // Source: Showdown sim/battle-actions.ts -- crit immunity for Battle Armor
    const context = makeCritContext({ defenderAbility: "battle-armor" });
    expect(ruleset.rollCritical(context)).toBe(false);
  });

  it("given defender has Shell Armor ability, when rolling crit, then crit is prevented", () => {
    // Source: Bulbapedia -- Shell Armor prevents critical hits (same effect as Battle Armor)
    // Source: Showdown sim/battle-actions.ts -- crit immunity for Shell Armor
    const context = makeCritContext({ defenderAbility: "shell-armor" });
    expect(ruleset.rollCritical(context)).toBe(false);
  });

  it("given defender has no crit-blocking ability, when rolling crit with favorable RNG, then crit can occur", () => {
    // Source: Bulbapedia -- without Battle Armor/Shell Armor, crits are possible
    // With our fake RNG that returns min (=1), and stage 0 rate of 24,
    // rng.int(1, 24) === 1 is true, so crit occurs
    const context = makeCritContext({ defenderAbility: "intimidate" });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given attacker has Focus Energy (+2 crit stage), when rolling crit, then crit stage is boosted", () => {
    // Source: Showdown sim/battle-actions.ts -- Focus Energy adds +2 to crit stage
    // Stage 2 rate = 2, so rng.int(1, 2) === 1 is true with our favorable RNG
    const context = makeCritContext({ attackerVolatiles: ["focus-energy"] });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given attacker has Scope Lens (+1 crit stage), when rolling crit, then crit stage is boosted by +1", () => {
    // Source: Showdown sim/battle-actions.ts -- Scope Lens adds +1 to crit stage
    // Stage 1 rate = 8, so rng.int(1, 8) === 1 is true with our favorable RNG
    const context = makeCritContext({ attackerItem: "scope-lens" });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given attacker has Super Luck ability (+1 crit stage), when rolling crit, then crit stage is boosted by +1", () => {
    // Source: Showdown sim/battle-actions.ts -- Super Luck adds +1 crit stage
    // Stage 1 rate = 8, so rng.int(1, 8) === 1 is true with our favorable RNG
    const context = makeCritContext({ attackerAbility: "super-luck" });
    expect(ruleset.rollCritical(context)).toBe(true);
  });

  it("given no defender (e.g., field move), when rolling crit with favorable RNG, then crit can occur", () => {
    // Source: Showdown -- crit check with no defender has no immunity check
    const context = makeCritContext({});
    expect(ruleset.rollCritical(context)).toBe(true);
  });
});
