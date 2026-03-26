/**
 * Gen 3 Mechanics Audit Regression Tests
 *
 * Verifies Gen 3-specific mechanics that differ from Gen 6+ BaseRuleset defaults:
 *   - Paralysis speed penalty: 0.25x (NOT 0.5x like Gen 7+)
 *   - Burn damage: 1/8 max HP (NOT 1/16 like Gen 7+)
 *   - Sleep turns: rollSleepTurns returns 2-5 (maps to 1-4 effective sleep turns)
 *   - Protect formula: halving, capped at 1/8 (12.5%)
 *   - Crit multiplier: 2.0x (NOT 1.5x like Gen 6+)
 *
 * Source authority: pret/pokeemerald; Showdown Gen3 mod (inherits for these mechanics)
 */

import type { ActivePokemon, BattleState, CritContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { GEN3_ABILITY_IDS } from "@pokemon-lib-ts/gen3";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createActivePokemon(overrides: {
  maxHp?: number;
  speed?: number;
  status?: string | null;
  ability?: string;
  heldItem?: string | null;
  types?: string[];
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp, speed: overrides.speed ?? 100 },
      currentHp: maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      speciesId: 1,
      nickname: "TestMon",
      nature: "hardy",
      ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [],
      ability: overrides.ability ?? GEN3_ABILITY_IDS.blaze,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      friendship: 0,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
    },
    ability: overrides.ability ?? GEN3_ABILITY_IDS.blaze,
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses:
      (overrides.volatileStatuses as Map<
        import("@pokemon-lib-ts/core").VolatileStatus,
        { turnsLeft: number; data?: Record<string, unknown> }
      >) ?? new Map(),
    consecutiveProtects: 0,
  } as unknown as ActivePokemon;
}

function createBattleState(): BattleState {
  return {} as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Gen 3 Paralysis Speed Penalty
// ---------------------------------------------------------------------------

describe("Gen3Ruleset paralysis speed penalty (0.25x)", () => {
  const ruleset = new Gen3Ruleset();

  it("given a paralyzed Pokemon with 100 base speed in Gen3, when getEffectiveSpeed is called, then returns 25 (0.25x)", () => {
    // Source: pret/pokeemerald src/battle_util.c — paralyzed speed = speed / 4 = 0.25x
    // Gen 3-6 all quarter speed under paralysis. Gen 7+ halves it (BaseRuleset default).
    // floor(100 * 0.25) = 25
    const pokemon = createActivePokemon({ speed: 100, status: CORE_STATUS_IDS.paralysis });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(25);
  });

  it("given a paralyzed Pokemon with 200 base speed in Gen3, when getEffectiveSpeed is called, then returns 50 (0.25x)", () => {
    // Source: pret/pokeemerald src/battle_util.c — paralysis = speed / 4
    // Triangulation: floor(200 * 0.25) = 50
    const pokemon = createActivePokemon({ speed: 200, status: CORE_STATUS_IDS.paralysis });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(50);
  });

  it("given a non-paralyzed Pokemon with 100 base speed in Gen3, when getEffectiveSpeed is called, then returns 100 (no penalty)", () => {
    // Source: pret/pokeemerald — only paralyzed Pokemon get the speed penalty
    const pokemon = createActivePokemon({ speed: 100, status: null });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Gen 3 Burn Damage
// ---------------------------------------------------------------------------

describe("Gen3Ruleset burn damage (1/8 maxHP)", () => {
  const ruleset = new Gen3Ruleset();

  it("given a burned Pokemon with 200 maxHP in Gen3, when applyStatusDamage is called, then returns 25 (floor(200/8))", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn tick = maxHP / 8
    // Gen 3-6: 1/8 max HP per turn. Gen 7+: 1/16 (BaseRuleset default which Gen3 must override).
    const pokemon = createActivePokemon({ maxHp: 200 });
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.burn, createBattleState());
    expect(damage).toBe(25);
  });

  it("given a burned Pokemon with 160 maxHP in Gen3, when applyStatusDamage is called, then returns 20 (floor(160/8))", () => {
    // Source: pret/pokeemerald src/battle_util.c — burn = maxHP / 8
    // Triangulation: floor(160/8) = 20
    const pokemon = createActivePokemon({ maxHp: 160 });
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.burn, createBattleState());
    expect(damage).toBe(20);
  });

  it("given a burned Pokemon with 1 maxHP in Gen3, when applyStatusDamage is called, then returns 1 (minimum)", () => {
    // Source: pret/pokeemerald — Math.max(1, ...) ensures minimum 1 damage
    const pokemon = createActivePokemon({ maxHp: 1 });
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.burn, createBattleState());
    expect(damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gen 3 Sleep Turns
// ---------------------------------------------------------------------------

describe("Gen3Ruleset sleep turns (rollSleepTurns returns 2-5)", () => {
  const ruleset = new Gen3Ruleset();

  it("given Gen3 sleep with seed 1, when rollSleepTurns is sampled 20 times, then the exact deterministic sequence is returned", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — sleep counter = Random(4) + 2
    //   (generates 0-3, adds 2 → counter range 2-5)
    // Source: Showdown data/mods/gen3/conditions.ts — slp.onStart: this.random(2, 6) = 2-5
    //   Counter decrements before the wake check, so effective sleep turns = counter - 1 = 1-4.
    //   Our rollSleepTurns returns 2-5 as turnsLeft; our processSleepTurn also decrements then checks,
    //   so effective sleeping turns = turnsLeft - 1 = 1-4. Equivalent to Showdown.
    const rng = new SeededRandom(1);
    const turns = Array.from({ length: 20 }, () => ruleset.rollSleepTurns(rng));
    expect(turns).toEqual([4, 2, 4, 5, 5, 3, 4, 4, 3, 5, 3, 3, 2, 3, 2, 2, 3, 2, 3, 5]);
  });

  it("given Gen3 sleep with seed 999, when rollSleepTurns is sampled 20 times, then the exact deterministic sequence is returned", () => {
    // Source: pret/pokeemerald — min counter = 2, max counter = 5 (Random(4) + 2)
    // Triangulation case
    const rng = new SeededRandom(999);
    const turns = Array.from({ length: 20 }, () => ruleset.rollSleepTurns(rng));
    expect(turns).toEqual([5, 4, 3, 5, 3, 4, 2, 4, 5, 2, 3, 2, 3, 2, 5, 2, 3, 4, 2, 2]);
  });
});

// ---------------------------------------------------------------------------
// Gen 3 Protect Formula
// ---------------------------------------------------------------------------

describe("Gen3Ruleset rollProtectSuccess (halving, capped at 12.5%)", () => {
  const ruleset = new Gen3Ruleset();

  it("given 0 consecutive protects in Gen3, when rollProtectSuccess is called 20 times, then always returns true", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c -- first use always succeeds
    // sProtectSuccessRate[0] = 65535 = 100%
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given 1 consecutive protect in Gen3, when rollProtectSuccess called 10000 times, then ~50% success rate", () => {
    // Source: pret/pokeemerald -- sProtectSuccessRate[1] = 32768 / 65535 ≈ 50%
    const rng = new SeededRandom(42);
    let successes = 0;
    for (let i = 0; i < 10000; i++) {
      if (ruleset.rollProtectSuccess(1, rng)) successes++;
    }
    expect(successes).toBe(5022);
  });

  it("given 3+ consecutive protects in Gen3, when rollProtectSuccess called, then capped at ~12.5% (1/8)", () => {
    // Source: pret/pokeemerald -- sProtectSuccessRate has 4 entries; counter caps at index 3 = 12.5%
    // Gen 3 caps at 12.5%. Gen 5 would keep reducing beyond this point (2^4=16, 2^5=32...).
    const rng = new SeededRandom(42);
    let successes = 0;
    for (let i = 0; i < 10000; i++) {
      if (ruleset.rollProtectSuccess(3, rng)) successes++;
    }
    expect(successes).toBe(1264);
  });

  it("given 4+ consecutive protects (beyond cap), when rollProtectSuccess called, then same rate as 3 consecutive", () => {
    // Source: pret/pokeemerald -- counter capped at 3 (sProtectSuccessRate has exactly 4 entries)
    const rng3 = new SeededRandom(42);
    const rng4 = new SeededRandom(42); // same seed to produce identical sequence
    let s3 = 0;
    let s4 = 0;
    for (let i = 0; i < 5000; i++) {
      if (ruleset.rollProtectSuccess(3, rng3)) s3++;
      if (ruleset.rollProtectSuccess(4, rng4)) s4++;
    }
    // Same seed + same denominator = identical results (cap behavior)
    expect(s3).toBe(s4);
  });
});

// ---------------------------------------------------------------------------
// Gen 3 Crit Multiplier
// ---------------------------------------------------------------------------

describe("Gen3Ruleset crit multiplier (2.0x, not Gen6+ 1.5x)", () => {
  const ruleset = new Gen3Ruleset();

  it("given Gen3, when getCritMultiplier is called, then returns 2.0", () => {
    // Source: pret/pokeemerald src/battle_util.c — crit damage = 2 * baseDamage
    // Source: Bulbapedia -- Gen 3-5: Critical hits deal 2x damage. Gen 6+: 1.5x.
    const context = {} as CritContext;
    const mult = ruleset.getCritMultiplier(context);
    expect(mult).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// Gen 3 End-of-Turn Order Sanity Checks
// ---------------------------------------------------------------------------

describe("Gen3Ruleset getEndOfTurnOrder", () => {
  const ruleset = new Gen3Ruleset();

  it("given Gen3, when getEndOfTurnOrder is called, then it returns the exact Gen 3 sequence", () => {
    // Source: pret/pokeemerald src/battle_main.c -- end-of-turn phase ordering
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toEqual([
      CORE_END_OF_TURN_EFFECT_IDS.weatherDamage,
      CORE_END_OF_TURN_EFFECT_IDS.futureAttack,
      CORE_END_OF_TURN_EFFECT_IDS.wish,
      CORE_END_OF_TURN_EFFECT_IDS.weatherHealing,
      CORE_END_OF_TURN_EFFECT_IDS.leftovers,
      CORE_VOLATILE_IDS.ingrain,
      CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
      CORE_VOLATILE_IDS.leechSeed,
      CORE_VOLATILE_IDS.curse,
      CORE_VOLATILE_IDS.nightmare,
      CORE_END_OF_TURN_EFFECT_IDS.bind,
      CORE_END_OF_TURN_EFFECT_IDS.statBoostingItems,
      CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.disableCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.tauntCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.perishSong,
      CORE_VOLATILE_IDS.uproar,
      CORE_ABILITY_IDS.speedBoost,
      CORE_ABILITY_IDS.shedSkin,
      CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
    ]);
  });
});
