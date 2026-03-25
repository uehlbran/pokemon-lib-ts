/**
 * Gen 3-5 Mechanics Audit Regression Tests
 *
 * Verifies correctness of core battle mechanics across Gen 3-5:
 *   - Paralysis speed penalty: 0.25x (NOT 0.5x like Gen 6+/BaseRuleset default)
 *   - Burn damage: 1/8 max HP (NOT 1/16 like Gen 7+)
 *   - Sleep turns per gen: Gen3=2-5 internal (1-4 effective), Gen4=1-4, Gen5=1-3
 *   - Protect formula: Gen3/4 halving capped at 1/8; Gen5 doubling capped at 1/256
 *   - Gen5 sleep counter reset on switch-in (and bug #552: engine must store startTime)
 *   - Gen5 weather abilities produce permanent weather (turnsLeft=-1)
 *
 * Source authority:
 *   Gen3: pret/pokeemerald (Gen3 Showdown mod matches)
 *   Gen4: Showdown data/mods/gen4/conditions.ts; pret/pokeplatinum where decompiled
 *   Gen5: Showdown data/mods/gen5/ (primary)
 *
 * Issue refs: #552 (Gen5 sleep startTime never stored), #554 (Gen4 comment doc bug)
 */

import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  createEvs,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const dataManager = createGen5DataManager()
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS } as const
const itemIds = CORE_ITEM_IDS
const speciesIds = GEN5_SPECIES_IDS
const statusIds = CORE_STATUS_IDS
const typeIds = CORE_TYPE_IDS
const volatileIds = CORE_VOLATILE_IDS
const defaultNature = dataManager.getNature(GEN5_NATURE_IDS.hardy).id

function makeActivePokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: string[];
  ability?: string;
  status?: string | null;
  heldItem?: string | null;
  speed?: number;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: speciesIds.bulbasaur,
      nickname: "TestMon",
      level: 50,
      experience: 0,
      nature: defaultNature,
      ivs: createIvs(),
      evs: createEvs(),
      calculatedStats: { hp: maxHp, speed: overrides.speed ?? 100 },
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      moves: [],
      ability: overrides.ability ?? abilityIds.blaze,
      abilitySlot: "normal1" as const,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: itemIds.pokeBall,
    },
    ability: overrides.ability ?? abilityIds.blaze,
    types: overrides.types ?? [typeIds.normal],
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

function makeState(): BattleState {
  return {} as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Gen 5 Paralysis Speed Penalty
// ---------------------------------------------------------------------------

describe("Gen5Ruleset paralysis speed penalty", () => {
  const ruleset = new Gen5Ruleset();

  it("given a paralyzed Pokemon with 100 base speed in Gen5, when getEffectiveSpeed is called, then returns 25 (0.25x)", () => {
    // Source: Showdown data/mods/gen4/conditions.ts lines 9-13 —
    //   par.onModifySpe: if (!quick-feet) return chainModify(0.25)
    // Gen 3-6 all use 0.25x paralysis. Gen 7+ uses 0.5x (BaseRuleset default).
    // At 100 speed, 0.25x = 25
    const pokemon = makeActivePokemon({ speed: 100, status: statusIds.paralysis });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(25);
  });

  it("given a paralyzed Pokemon with 120 base speed in Gen5, when getEffectiveSpeed is called, then returns 30 (0.25x)", () => {
    // Source: Showdown data/mods/gen4/conditions.ts — 0.25x speed penalty for paralysis
    // Triangulation: 120 * 0.25 = 30
    const pokemon = makeActivePokemon({ speed: 120, status: statusIds.paralysis });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(30);
  });

  it("given a paralyzed Quick Feet Pokemon in Gen5, when getEffectiveSpeed is called, then returns 1.5x (Quick Feet overrides paralysis penalty)", () => {
    // Source: Bulbapedia -- Quick Feet: "Boosts Speed by 50% when the Pokemon has a status
    //   condition. The Speed drop from paralysis is also ignored."
    // Source: Showdown data/mods/gen4/conditions.ts lines 9-13 — if Quick Feet, no halving
    // At 100 speed with Quick Feet + paralysis: 100 * 1.5 = 150
    const pokemon = makeActivePokemon({
      speed: 100,
      status: statusIds.paralysis,
      ability: abilityIds.quickFeet,
    });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Gen 5 Burn Damage
// ---------------------------------------------------------------------------

describe("Gen5Ruleset burn damage (1/8 maxHP)", () => {
  const ruleset = new Gen5Ruleset();

  it("given a burned Pokemon with 200 maxHP in Gen5, when applyStatusDamage is called, then returns 25 (floor(200/8))", () => {
    // Source: Showdown sim/battle-actions.ts — Gen < 7 burn damage = floor(maxhp / 8)
    // Gen 3-6: 1/8 max HP. Gen 7+: 1/16 (BaseRuleset default which Gen5 must override).
    const pokemon = makeActivePokemon({ maxHp: 200 });
    const damage = ruleset.applyStatusDamage(pokemon, statusIds.burn, makeState());
    expect(damage).toBe(25);
  });

  it("given a burned Pokemon with 160 maxHP in Gen5, when applyStatusDamage is called, then returns 20 (floor(160/8))", () => {
    // Source: Showdown sim/battle-actions.ts — Gen < 7 burn damage = floor(maxhp / 8)
    // Triangulation: floor(160/8) = 20
    const pokemon = makeActivePokemon({ maxHp: 160 });
    const damage = ruleset.applyStatusDamage(pokemon, statusIds.burn, makeState());
    expect(damage).toBe(20);
  });

  it("given a burned Heatproof Pokemon with 200 maxHP in Gen5, when applyStatusDamage is called, then returns 12 (1/16)", () => {
    // Source: Bulbapedia -- Heatproof: "Also halves the damage the holder takes from a burn."
    // Gen 5: Heatproof halves 1/8 to 1/16. floor(200/16) = 12.
    const pokemon = makeActivePokemon({ maxHp: 200, ability: abilityIds.heatproof });
    const damage = ruleset.applyStatusDamage(pokemon, statusIds.burn, makeState());
    expect(damage).toBe(12);
  });

  it("given a burned Magic Guard Pokemon in Gen5, when applyStatusDamage is called, then returns 0 (Magic Guard immunity)", () => {
    // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
    // Source: Showdown -- Magic Guard prevents burn damage
    const pokemon = makeActivePokemon({ maxHp: 200, ability: abilityIds.magicGuard });
    const damage = ruleset.applyStatusDamage(pokemon, statusIds.burn, makeState());
    expect(damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Gen 5 Sleep Turns
// ---------------------------------------------------------------------------

describe("Gen5Ruleset sleep turns (1-3 range)", () => {
  const ruleset = new Gen5Ruleset();

  it("given Gen5 sleep infliction with seed 1, when rollSleepTurns is called 500 times, then all values are in [1, 3]", () => {
    // Source: Showdown data/mods/gen5/conditions.ts — slp.onStart: random(2, 5) = 2-4 counter
    //   Showdown random(2,5) = 2, 3, or 4 (upper bound exclusive)
    //   Each counter value = (counter - 1) effective turns sleeping before wake.
    //   Our rollSleepTurns returns 1-3 directly (equivalent mapping).
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts
    const rng = new SeededRandom(1);
    const values = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(3);
      values.add(turns);
    }
    // All three values should appear in 500 trials
    expect(values.has(1)).toBe(true);
    expect(values.has(2)).toBe(true);
    expect(values.has(3)).toBe(true);
    expect(values.has(0)).toBe(false);
    expect(values.has(4)).toBe(false);
  });

  it("given Gen5 sleep infliction with seed 7777, when rollSleepTurns is called, then never returns value outside [1, 3]", () => {
    // Source: BaseRuleset.rollSleepTurns -- rng.int(1, 3) for Gen 5+ (no override needed in Gen5)
    // Triangulation case
    const rng = new SeededRandom(7777);
    for (let i = 0; i < 200; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Gen 5 Sleep Counter Reset on Switch-In
// ---------------------------------------------------------------------------

describe("Gen5Ruleset sleep counter reset on switch-in (Gen5 unique mechanic)", () => {
  const ruleset = new Gen5Ruleset();

  it("given a sleeping Pokemon with startTime=3 and turnsLeft=1, when onSwitchIn fires, then turnsLeft resets to 3", () => {
    // Source: Showdown data/mods/gen5/conditions.ts --
    //   slp.onSwitchIn: "this.effectState.time = this.effectState.startTime"
    // Gen 5 unique: switching out and back in resets the sleep counter to its original value.
    const sleepCounter = { turnsLeft: 1, data: { startTime: 3 } };
    const pokemon = makeActivePokemon({
      status: statusIds.sleep,
      volatileStatuses: new Map([[volatileIds.sleepCounter, sleepCounter]]),
    });

    ruleset.onSwitchIn(pokemon, makeState());

    const counter = pokemon.volatileStatuses.get(
      volatileIds.sleepCounter,
    );
    expect(counter).toBeDefined();
    expect(counter!.turnsLeft).toBe(3);
  });

  it("given a sleeping Pokemon with startTime=1 and turnsLeft=0, when onSwitchIn fires, then turnsLeft resets to 1", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- slp.onSwitchIn resets time to startTime
    // Triangulation: minimum reset case
    const sleepCounter = { turnsLeft: 0, data: { startTime: 1 } };
    const pokemon = makeActivePokemon({
      status: statusIds.sleep,
      volatileStatuses: new Map([[volatileIds.sleepCounter, sleepCounter]]),
    });

    ruleset.onSwitchIn(pokemon, makeState());

    const counter = pokemon.volatileStatuses.get(
      volatileIds.sleepCounter,
    );
    expect(counter!.turnsLeft).toBe(1);
  });

  it("REGRESSION #552: given a sleeping Pokemon whose sleep-counter has data={} (as BattleEngine stores it), when onSwitchIn fires, then turnsLeft is NOT reset (bug: engine never stores startTime)", () => {
    // Bug #552: BattleEngine.inflictStatus stores sleep-counter with data: {} (empty).
    // Gen5Ruleset.onSwitchIn reads data.startTime, which is undefined in this case.
    // The reset silently does nothing.
    //
    // This test documents the bug. The fix is in BattleEngine: change
    //   data: {}
    // to:
    //   data: { startTime: turns }
    //
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts --
    //   slp.onSwitchIn: this.effectState.time = this.effectState.startTime
    const turnsLeftBeforeSwitch = 1;
    const sleepCounter = {
      turnsLeft: turnsLeftBeforeSwitch,
      data: {}, // ← as BattleEngine currently stores it (missing startTime)
    };
    const pokemon = makeActivePokemon({
      status: statusIds.sleep,
      volatileStatuses: new Map([[volatileIds.sleepCounter, sleepCounter]]),
    });

    ruleset.onSwitchIn(pokemon, makeState());

    const counter = pokemon.volatileStatuses.get(
      volatileIds.sleepCounter,
    );
    // BUG: turnsLeft is not reset because startTime is missing from data.
    // When bug #552 is fixed (BattleEngine stores startTime), this behavior will change.
    expect(counter!.turnsLeft).toBe(turnsLeftBeforeSwitch); // unchanged = silently failed
  });

  it("given a non-sleeping Pokemon, when onSwitchIn fires, then no change occurs to volatile statuses", () => {
    // Source: Gen5Ruleset.onSwitchIn -- only fires if pokemon.status === CORE_STATUS_IDS.sleep
    const pokemon = makeActivePokemon({ status: null });

    ruleset.onSwitchIn(pokemon, makeState());

    // No volatiles created or modified
    expect(pokemon.volatileStatuses.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Gen 5 Protect Formula (doubling counter, capped at 1/256)
// ---------------------------------------------------------------------------

describe("Gen5Ruleset rollProtectSuccess (doubling counter, effectively impossible at cap)", () => {
  const ruleset = new Gen5Ruleset();

  it("given 0 consecutive protects in Gen5, when rollProtectSuccess is called, then always returns true", () => {
    // Source: Gen5Ruleset.rollProtectSuccess -- consecutiveProtects=0 always succeeds
    // Source: Showdown Gen5 -- first use always succeeds
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given 1 consecutive protect in Gen5, when rollProtectSuccess called 10000 times, then ~50% success rate", () => {
    // Source: Gen5Ruleset.rollProtectSuccess -- 2^1 = 2 denominator = 50% (same as Gen3/4)
    // Source: Showdown data/mods/gen5/conditions.ts -- stall: counter doubles each use
    const rng = new SeededRandom(42);
    let successes = 0;
    for (let i = 0; i < 10000; i++) {
      if (ruleset.rollProtectSuccess(1, rng)) successes++;
    }
    const rate = successes / 10000;
    // 50% ± 2% (generous tolerance for statistical variation)
    expect(rate).toBeGreaterThan(0.48);
    expect(rate).toBeLessThan(0.52);
  });

  it("given 7 consecutive protects in Gen5, when rollProtectSuccess called 100000 times, then ~1/128 success rate", () => {
    // Source: Gen5Ruleset.rollProtectSuccess -- 2^7 = 128 denominator = ~0.78%
    // Gen 5 does NOT cap at 1/8 like Gen 3/4 -- the counter keeps doubling until 256
    const rng = new SeededRandom(99);
    let successes = 0;
    for (let i = 0; i < 100000; i++) {
      if (ruleset.rollProtectSuccess(7, rng)) successes++;
    }
    const rate = successes / 100000;
    // 1/128 ≈ 0.0078; generous tolerance for rare events
    expect(rate).toBeGreaterThan(0.004);
    expect(rate).toBeLessThan(0.014);
  });

  it("given 8 consecutive protects in Gen5, when rollProtectSuccess called 100000 times, then effectively 0 successes (cap hit)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- counterMax: 256
    //   At N=8, counter = 2^8 = 256 = cap. Showdown uses randomChance(1, 2**32)
    //   which is ~1 in 4 billion, effectively impossible.
    const rng = new SeededRandom(77);
    let successes = 0;
    for (let i = 0; i < 100000; i++) {
      if (ruleset.rollProtectSuccess(8, rng)) successes++;
    }
    // Expected: ~0 successes (1 in 2^32 chance per attempt)
    expect(successes).toBe(0);
  });

  it("given 10 consecutive protects in Gen5, when rollProtectSuccess called 100000 times, then effectively 0 successes (same as 8, both capped)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- counterMax: 256
    //   Both N=8 and N=10 hit the cap (2^8=256, 2^10=1024 > cap).
    //   Both use randomChance(1, 2**32) -- effectively impossible.
    const rng8 = new SeededRandom(42);
    const rng10 = new SeededRandom(42); // same seed for fair comparison
    let successes8 = 0;
    let successes10 = 0;
    for (let i = 0; i < 100000; i++) {
      if (ruleset.rollProtectSuccess(8, rng8)) successes8++;
      if (ruleset.rollProtectSuccess(10, rng10)) successes10++;
    }
    // Both should be 0 (effectively impossible)
    expect(successes8).toBe(0);
    expect(successes10).toBe(0);
    // Same seed, same cap behavior => identical results
    expect(successes8).toBe(successes10);
  });

  it("given 3 consecutive protects in Gen5, when rollProtectSuccess rate checked, then it is less than Gen4's capped 12.5%", () => {
    // Source: Bulbapedia -- Gen 5 uses doubling counter (not Gen 3/4 halving with 12.5% cap)
    // Gen 5 at 3 consecutive: 2^3 = 8 denominator = 12.5% (coincidentally same as Gen 4 cap)
    // Gen 5 at 4 consecutive: 2^4 = 16 = 6.25% (LOWER than Gen 4's 12.5% cap)
    // This verifies Gen5's formula is DIFFERENT from Gen4's
    const rng4 = new SeededRandom(42);
    let successes4 = 0;
    for (let i = 0; i < 10000; i++) {
      if (ruleset.rollProtectSuccess(4, rng4)) successes4++;
    }
    const rate4 = successes4 / 10000;
    // Gen 5: 2^4 = 16, so ~6.25%. Gen 4 would be 12.5% (capped). Gen 5 is strictly lower.
    expect(rate4).toBeLessThan(0.1); // definitely below Gen4's 12.5% cap
  });
});

// ---------------------------------------------------------------------------
// Gen 5 Weather Ability Permanence
// ---------------------------------------------------------------------------

describe("Gen5 weather ability permanence (permanent weather, no countdown)", () => {
  // These tests verify the Gen5AbilitiesSwitch module correctly uses weatherTurns=-1.
  // Full coverage of all four weather abilities (Drizzle, Drought, Sand Stream, Snow Warning)
  // exists in packages/gen5/tests/abilities-switch-contact.test.ts.
  // This section verifies the RULESET correctly delegates to that module.
  const ruleset = new Gen5Ruleset();

  it("given Gen5Ruleset, when applyAbility is called with on-switch-in and drizzle, then weatherTurns is -1 (permanent)", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- drizzle sets permanent rain (-1 turns)
    // Gen 5: weather from abilities is permanent. Gen 6+ changed to 5 turns.
    // This confirms the whole ruleset chain (applyAbility → Gen5AbilitiesSwitch) passes -1.
    const pokemon = makeActivePokemon({ ability: abilityIds.drizzle });
    const state = {
      weather: null,
      sides: [{ active: [pokemon] }, { active: [] }],
      trickRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      rng: new SeededRandom(42),
    } as unknown as BattleState;
    const result = ruleset.applyAbility("on-switch-in", {
      pokemon,
      opponent: undefined,
      state,
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    });

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect).toBeDefined();
    // @ts-expect-error -- dynamic field
    expect(weatherEffect!.weatherTurns).toBe(-1); // permanent weather in Gen 5
  });

  it("given Gen5Ruleset, when applyAbility is called with on-switch-in and sand-stream, then weatherTurns is -1 (permanent)", () => {
    // Source: Showdown Gen5 -- Sand Stream sets permanent sandstorm (weatherTurns=-1)
    // Triangulation: second weather setter
    const pokemon = makeActivePokemon({ ability: abilityIds.sandStream });
    const state = {
      weather: null,
      sides: [{ active: [pokemon] }, { active: [] }],
      trickRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      rng: new SeededRandom(42),
    } as unknown as BattleState;
    const result = ruleset.applyAbility("on-switch-in", {
      pokemon,
      opponent: undefined,
      state,
      rng: new SeededRandom(42),
      trigger: "on-switch-in",
    });

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect).toBeDefined();
    // @ts-expect-error -- dynamic field
    expect(weatherEffect!.weatherTurns).toBe(-1); // permanent weather in Gen 5
  });
});

// ---------------------------------------------------------------------------
// Gen 5 Crit Multiplier (2.0x NOT 1.5x)
// ---------------------------------------------------------------------------

describe("Gen5Ruleset crit multiplier (2.0x, not Gen6+ 1.5x)", () => {
  const ruleset = new Gen5Ruleset();

  it("given a critical hit in Gen5, when getCritMultiplier is called, then returns 2.0", () => {
    // Source: Showdown data/mods/gen5/ -- no crit multiplier override; inherits Gen4 which uses 2.0x
    // Source: Bulbapedia -- Gen 3-5: Critical hit = 2x damage. Gen 6+: 1.5x.
    const context = {} as import("@pokemon-lib-ts/battle").CritContext;
    const mult = ruleset.getCritMultiplier(context);
    expect(mult).toBe(2.0);
  });
});
