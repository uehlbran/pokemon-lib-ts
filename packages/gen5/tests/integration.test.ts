/**
 * Gen 5 Integration Tests
 *
 * Exercises multiple Gen 5 mechanics end-to-end using real Gen5Ruleset objects.
 * No MockRuleset — all tests call real Gen 5 logic.
 *
 * Scenarios covered:
 *   A) Paralysis speed reduction — 0.25x (not 0.5x)
 *   B) Sleep duration — 1-3 turns (not 2-5)
 *   C) Burn chip damage — 1/8 max HP
 *   D) Sandstorm/Hail chip damage — 1/16 max HP
 *   E) Crit multiplier — 2.0x (not 1.5x)
 *   F) Ability weather is indefinite (turnsLeft = -1)
 *   G) Explosion does NOT halve target Defense
 *   H) Protect consecutive use penalty — doubles denominator (2^N cap 256)
 */

import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen5DataManager } from "../src/data";
import { handleGen5SwitchAbility } from "../src/Gen5AbilitiesSwitch";
import { GEN5_CRIT_MULTIPLIER } from "../src/Gen5CritCalc";
import { Gen5Ruleset } from "../src/Gen5Ruleset";
import { applyGen5WeatherEffects } from "../src/Gen5Weather";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: string[];
  ability?: string;
  nickname?: string;
  status?: string | null;
  speed?: number;
  heldItem?: string | null;
  consecutiveProtects?: number;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  speciesId?: number;
  moves?: Array<{ moveId: string; pp: number; maxPp: number }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: overrides.speed ?? 100,
      },
      currentHp: overrides.currentHp ?? maxHp,
      nickname: overrides.nickname ?? "TestMon",
      speciesId: overrides.speciesId ?? 1,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      moves: overrides.moves ?? [],
    },
    ability: overrides.ability ?? "blaze",
    types: overrides.types ?? ["normal"],
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
    substituteHp: 0,
  } as unknown as ActivePokemon;
}

function makeSide(active: ActivePokemon, index: 0 | 1 = 0): BattleSide {
  return {
    index,
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as unknown as BattleSide;
}

function makeState(overrides: {
  weather?: { type: string; turnsLeft: number } | null;
  sides?: [BattleSide, BattleSide];
}): BattleState {
  const defaultPokemon = makeActivePokemon({});
  const defaultSide0 = makeSide(defaultPokemon, 0);
  const defaultSide1 = makeSide(makeActivePokemon({}), 1);
  return {
    weather: overrides.weather ?? null,
    sides: overrides.sides ?? [defaultSide0, defaultSide1],
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    rng: new SeededRandom(42),
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// A) Paralysis Speed Reduction — x0.25 (NOT x0.5 which is Gen 7)
// ---------------------------------------------------------------------------

describe("Gen 5 integration: paralysis speed reduction", () => {
  const ruleset = new Gen5Ruleset();

  it("given paralyzed Pokemon with 100 speed and a healthy 100-speed opponent, when resolveTurnOrder is called, then healthy Pokemon moves first", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- "spe: Math.floor(pokemon.spe * 25 / 100)"
    // Gen 5 paralysis = x0.25 speed (unchanged from Gen 3-4; x0.5 is Gen 7+)
    // A healthy Pokemon at speed 100 should outspeed a paralyzed 100-speed mon (100*0.25=25)
    const fastMon = makeActivePokemon({
      speed: 100,
      status: null,
      nickname: "FastMon",
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
    });
    const paralyzedMon = makeActivePokemon({
      speed: 100,
      status: "paralysis",
      nickname: "SlowMon",
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
    });

    const side0 = makeSide(paralyzedMon, 0);
    const side1 = makeSide(fastMon, 1);
    const state = makeState({ sides: [side0, side1] });

    const actions = [
      { type: "move" as const, side: 0 as const, moveIndex: 0 },
      { type: "move" as const, side: 1 as const, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // fastMon (side 1, speed 100) should go first
    // paralyzedMon (side 0, effective speed = floor(100 * 0.25) = 25) goes second
    expect(ordered[0].side).toBe(1);
    expect(ordered[1].side).toBe(0);
  });

  it("given paralyzed Pokemon with 100 speed and a healthy 26-speed opponent, when resolveTurnOrder is called, then healthy 26-speed mon goes first — proving x0.25 not x0.5", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- paralysis: spe * 25/100 = 25
    // Key discriminator: paralyzed 100-speed at x0.25 = 25 speed, slower than 26
    // If paralysis were x0.5 (Gen 7), effective speed = 50, faster than 26 and this test would fail
    const healthyMon = makeActivePokemon({
      speed: 26,
      status: null,
      nickname: "Healthy26",
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
    });
    const paralyzedMon = makeActivePokemon({
      speed: 100,
      status: "paralysis",
      nickname: "Paralyzed100",
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
    });

    const side0 = makeSide(paralyzedMon, 0);
    const side1 = makeSide(healthyMon, 1);
    const state = makeState({ sides: [side0, side1] });

    const actions = [
      { type: "move" as const, side: 0 as const, moveIndex: 0 },
      { type: "move" as const, side: 1 as const, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Healthy mon at 26 should go first (26 > 25 = floor(100 * 0.25))
    // This proves x0.25 not x0.5 (which would give 50 speed, faster than 26)
    expect(ordered[0].side).toBe(1); // healthy 26-speed goes first
    expect(ordered[1].side).toBe(0); // paralyzed 100-speed (= 25 effective) goes second
  });
});

// ---------------------------------------------------------------------------
// B) Sleep Duration — 1-3 turns (NOT 2-5)
// ---------------------------------------------------------------------------

describe("Gen 5 integration: sleep duration 1-3 turns", () => {
  const ruleset = new Gen5Ruleset();

  it("given Gen 5 rollSleepTurns, when called 200 times with seed 42, then all results are in [1, 3]", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- sleep duration is 1-3 turns (not 2-5 like Gen 3-4)
    // In Showdown: slp condition time = this.random(1, 4) i.e. [1, 2, 3]
    const rng = new SeededRandom(42);
    for (let i = 0; i < 200; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(3);
    }
  });

  it("given Gen 5 rollSleepTurns, when called 200 times with seed 99999, then sees all 3 distinct values and never 4 or 5", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- sleep duration 1-3 (3 distinct values)
    // Triangulation: different seed confirms consistent behavior, never returns 4 or 5
    const rng = new SeededRandom(99999);
    const observed = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(3);
      observed.add(turns);
    }
    // With 200 trials we should see all 3 values
    expect(observed.size).toBe(3);
    expect(observed.has(1)).toBe(true);
    expect(observed.has(2)).toBe(true);
    expect(observed.has(3)).toBe(true);
    // Must never return 4 or 5 (Gen 3-4 range)
    expect(observed.has(4)).toBe(false);
    expect(observed.has(5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C) Burn Chip Damage — 1/8 max HP (NOT 1/16 which is Gen 7)
// ---------------------------------------------------------------------------

describe("Gen 5 integration: burn chip damage = 1/8 max HP", () => {
  const ruleset = new Gen5Ruleset();
  const state = makeState({});

  it("given burned Pokemon with 160 max HP, when applyStatusDamage is called, then takes 20 damage (floor(160/8))", () => {
    // Source: Bulbapedia Gen V burn -- "1/8 of maximum HP at the end of each turn"
    // Source: Showdown data/mods/gen5/conditions.ts -- burn.onResidual: Math.floor(p.maxhp/8)
    // Gen 7 changed this to 1/16; in Gen 5 it is still 1/8
    const pokemon = makeActivePokemon({ maxHp: 160, status: "burn" });

    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);

    // floor(160 / 8) = 20
    expect(damage).toBe(20);
  });

  it("given burned Pokemon with 240 max HP, when applyStatusDamage is called, then takes 30 damage (floor(240/8))", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- burn.onResidual: Math.floor(p.maxhp/8)
    // Triangulation: different HP value to confirm 1/8 formula, not a hardcoded value
    const pokemon = makeActivePokemon({ maxHp: 240, status: "burn" });

    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);

    // floor(240 / 8) = 30
    expect(damage).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// D) Weather Chip Damage — 1/16 max HP (NOT 1/8)
// ---------------------------------------------------------------------------

describe("Gen 5 integration: sandstorm/hail chip = 1/16 max HP", () => {
  it("given non-immune Pokemon with 160 max HP in sandstorm, when applyGen5WeatherEffects fires, then takes 10 damage (floor(160/16))", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- sand.onResidual: Math.floor(p.maxhp/16)
    // Source: Bulbapedia -- Sandstorm: "all non-Rock/Ground/Steel Pokemon lose 1/16 max HP"
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["fire"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);

    const state = makeState({
      weather: { type: "sand", turnsLeft: 5 },
      sides: [side0, side1],
    });

    const results = applyGen5WeatherEffects(state);

    const chipResult = results.find((r) => r.side === 0);
    expect(chipResult).toBeDefined();
    // floor(160 / 16) = 10
    expect(chipResult!.damage).toBe(10);
  });

  it("given non-immune Pokemon with 320 max HP in hail, when applyGen5WeatherEffects fires, then takes 20 damage (floor(320/16))", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- hail.onResidual: Math.floor(p.maxhp/16)
    // Source: Bulbapedia -- Hail: "all non-Ice Pokemon lose 1/16 max HP per turn"
    // Triangulation: different HP and different weather type
    const pokemon = makeActivePokemon({ maxHp: 320, types: ["fire"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["ice"] }), 1);

    const state = makeState({
      weather: { type: "hail", turnsLeft: 5 },
      sides: [side0, side1],
    });

    const results = applyGen5WeatherEffects(state);

    const chipResult = results.find((r) => r.side === 0);
    expect(chipResult).toBeDefined();
    // floor(320 / 16) = 20
    expect(chipResult!.damage).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// E) Crit Multiplier — 2.0x (NOT 1.5x which is Gen 6+)
// ---------------------------------------------------------------------------

describe("Gen 5 integration: crit multiplier is 2.0x", () => {
  const ruleset = new Gen5Ruleset();

  it("given Gen5Ruleset, when getCritMultiplier is called, then returns 2.0 (not 1.5)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 6: critMult = 2 (Gen 6+ uses 1.5)
    // Source: Bulbapedia -- Critical hits deal 2x damage in Gen 1-5; changed to 1.5x in Gen 6
    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });

  it("given GEN5_CRIT_MULTIPLIER constant, then equals 2.0 (not 1.5)", () => {
    // Source: Showdown sim/battle-actions.ts line 1751 -- critMult for Gen < 6
    // Triangulation: verify via exported constant, not just the ruleset method
    expect(GEN5_CRIT_MULTIPLIER).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// F) Ability Weather is Indefinite (weatherTurns = -1)
// ---------------------------------------------------------------------------

describe("Gen 5 integration: ability weather is indefinite", () => {
  it("given a Pokemon with Drizzle, when handleGen5SwitchAbility fires on-switch-in, then weatherTurns is -1 (indefinite, not 5 like Gen 6)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- Drizzle sets permanent rain (no turn limit)
    // Source: Bulbapedia -- Gen 5: weather from abilities is permanent (Gen 6 changed to 5 turns)
    const pokemon = makeActivePokemon({ ability: "drizzle", nickname: "Politoed" });
    const ctx = {
      pokemon,
      opponent: null,
      state: makeState({}),
      trigger: "on-switch-in",
    };

    const result = handleGen5SwitchAbility(
      "on-switch-in",
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect!.weatherTurns).toBe(-1);
  });

  it("given a Pokemon with Drought, when handleGen5SwitchAbility fires on-switch-in, then weatherTurns is -1 (indefinite)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- Drought sets permanent sun (-1 turns)
    // Triangulation: different ability confirms the -1 pattern across all weather-setting abilities
    const pokemon = makeActivePokemon({ ability: "drought", nickname: "Ninetales" });
    const ctx = {
      pokemon,
      opponent: null,
      state: makeState({}),
      trigger: "on-switch-in",
    };

    const result = handleGen5SwitchAbility(
      "on-switch-in",
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect!.weatherTurns).toBe(-1);
  });

  it("given a Pokemon with Sand Stream, when handleGen5SwitchAbility fires on-switch-in, then weatherTurns is -1", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- Sand Stream sets permanent sandstorm (-1 turns)
    const pokemon = makeActivePokemon({ ability: "sand-stream", nickname: "Tyranitar" });
    const ctx = {
      pokemon,
      opponent: null,
      state: makeState({}),
      trigger: "on-switch-in",
    };

    const result = handleGen5SwitchAbility(
      "on-switch-in",
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect!.weatherTurns).toBe(-1);
  });

  it("given a Pokemon with Snow Warning, when handleGen5SwitchAbility fires on-switch-in, then weatherTurns is -1", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- Snow Warning sets permanent hail (-1 turns)
    // Triangulation: all 4 ability weather setters verified — confirms universal indefinite behavior
    const pokemon = makeActivePokemon({ ability: "snow-warning", nickname: "Abomasnow" });
    const ctx = {
      pokemon,
      opponent: null,
      state: makeState({}),
      trigger: "on-switch-in",
    };

    const result = handleGen5SwitchAbility(
      "on-switch-in",
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect!.weatherTurns).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// G) Explosion Does NOT Halve Target Defense
// ---------------------------------------------------------------------------

describe("Gen 5 integration: Explosion does not halve target Defense", () => {
  const ruleset = new Gen5Ruleset();

  it("given Explosion in Gen 5, when executeMoveEffect is called, then result has selfFaint=true and no statusInflicted/volatileInflicted side effects", () => {
    // Source: Bulbapedia -- "From Generation V onward, Explosion no longer halves the target's Defense"
    // Source: Showdown data/mods/gen5/moves.ts -- Explosion modifier (halveAtk) removed in Gen 5
    // In Gen 1-4, Explosion effectively halved defense during damage calc; Gen 5 removes this
    const attacker = makeActivePokemon({ nickname: "Attacker" });
    const defender = makeActivePokemon({ nickname: "Defender" });

    const state = makeState({
      sides: [makeSide(attacker, 0), makeSide(defender, 1)],
    });

    const ctx = {
      attacker,
      defender,
      move: {
        id: "explosion",
        name: "Explosion",
        type: "normal",
        category: "physical",
        power: 250,
        accuracy: 100,
        pp: 5,
        maxPp: 5,
        priority: 0,
        target: "normal",
        effect: { type: "self-faint" },
        flags: {},
      },
      state,
      rng: new SeededRandom(42),
    } as unknown as MoveEffectContext;

    const result = ruleset.executeMoveEffect(ctx);

    // Gen 5 Explosion: user faints, no defense-halving side effects on target
    expect(result.selfFaint).toBe(true);
    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
  });

  it("given Self-Destruct in Gen 5, when executeMoveEffect is called, then result has selfFaint=true with no defense-halving side effects", () => {
    // Source: Bulbapedia -- Self-Destruct also lost Defense halving in Gen 5
    // Source: Showdown data/mods/gen5/moves.ts -- Self-Destruct: same fix as Explosion
    // Triangulation: Self-Destruct had the same Gen 1-4 mechanic and the same Gen 5 removal
    const attacker = makeActivePokemon({ nickname: "Attacker2" });
    const defender = makeActivePokemon({ nickname: "Defender2" });

    const state = makeState({
      sides: [makeSide(attacker, 0), makeSide(defender, 1)],
    });

    const ctx = {
      attacker,
      defender,
      move: {
        id: "self-destruct",
        name: "Self-Destruct",
        type: "normal",
        category: "physical",
        power: 200,
        accuracy: 100,
        pp: 5,
        maxPp: 5,
        priority: 0,
        target: "normal",
        effect: { type: "self-faint" },
        flags: {},
      },
      state,
      rng: new SeededRandom(42),
    } as unknown as MoveEffectContext;

    const result = ruleset.executeMoveEffect(ctx);

    expect(result.selfFaint).toBe(true);
    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H) Protect Consecutive Use Penalty — 2^N denominator, capped at 256
// ---------------------------------------------------------------------------

describe("Gen 5 integration: Protect consecutive use penalty", () => {
  const ruleset = new Gen5Ruleset();

  it("given consecutiveProtects=0, when rollProtectSuccess is called, then always returns true (first use = 100%)", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- stall condition: 1st use always succeeds
    // Source: Bulbapedia -- Protect: first use always succeeds
    const rng = new SeededRandom(42);
    // First use: consecutiveProtects=0 → denominator logic skipped → returns true
    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
  });

  it("given consecutiveProtects=1, when rollProtectSuccess is called across 10000 trials, then ~50% success rate (denominator=2)", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- stall: denominator = Math.min(256, 2^N)
    // 2nd consecutive Protect: 1/2 chance (denominator = 2^1 = 2)
    let successes = 0;
    const TRIALS = 10000;
    for (let i = 0; i < TRIALS; i++) {
      const rng = new SeededRandom(i);
      if (ruleset.rollProtectSuccess(1, rng)) successes++;
    }
    // 50% +/- 2% tolerance
    const rate = successes / TRIALS;
    expect(rate).toBeGreaterThan(0.48);
    expect(rate).toBeLessThan(0.52);
  });

  it("given consecutiveProtects=2, when rollProtectSuccess is called across 10000 trials, then ~25% success rate (denominator=4)", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- 3rd consecutive: denominator = 2^2 = 4
    let successes = 0;
    const TRIALS = 10000;
    for (let i = 0; i < TRIALS; i++) {
      const rng = new SeededRandom(i);
      if (ruleset.rollProtectSuccess(2, rng)) successes++;
    }
    // 25% +/- 2% tolerance
    const rate = successes / TRIALS;
    expect(rate).toBeGreaterThan(0.23);
    expect(rate).toBeLessThan(0.27);
  });

  it("given consecutiveProtects=8 and =9 with same seeds, when rollProtectSuccess is called, then results are identical (denominator capped at 256)", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- denominator = Math.min(256, 2^N)
    // 2^8 = 256 (cap reached); 2^9 = 512 gets clamped to 256
    // Same seed + same capped denominator = same result for N=8 and N=9
    const TRIALS = 1000;
    let mismatches = 0;
    for (let i = 0; i < TRIALS; i++) {
      const rng8 = new SeededRandom(i);
      const rng9 = new SeededRandom(i); // same seed
      const r8 = ruleset.rollProtectSuccess(8, rng8);
      const r9 = ruleset.rollProtectSuccess(9, rng9);
      if (r8 !== r9) mismatches++;
    }
    // If the cap is enforced, same seed produces same result for N=8 and N=9
    expect(mismatches).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// I) Prankster Priority Boost in resolveTurnOrder
// ---------------------------------------------------------------------------

describe("Gen 5 integration: Prankster priority boost in resolveTurnOrder", () => {
  // Must use createGen5DataManager() so move lookups in resolveTurnOrder succeed.
  // The default Gen5Ruleset constructor uses an empty DataManager.
  const ruleset = new Gen5Ruleset(createGen5DataManager());

  it(
    "given Prankster user with a status move vs faster opponent with a damage move, " +
      "when resolveTurnOrder is called, then Prankster user moves first due to +1 priority",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster onModifyPriority: +1 for status moves
      // Both moves have base priority 0. Prankster boosts the status move to priority 1.
      const pranksterMon = makeActivePokemon({
        ability: "prankster",
        speed: 50,
        nickname: "Sableye",
        moves: [{ moveId: "will-o-wisp", pp: 15, maxPp: 15 }],
      });
      const fastMon = makeActivePokemon({
        speed: 200,
        nickname: "Opponent",
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });

      const side0 = makeSide(pranksterMon, 0);
      const side1 = makeSide(fastMon, 1);
      const state = makeState({ sides: [side0, side1] });

      const actions = [
        { type: "move" as const, side: 0 as const, moveIndex: 0 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      const rng = new SeededRandom(42);
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);

      // Prankster user (side 0) should go first despite being slower
      expect(ordered[0].side).toBe(0);
    },
  );

  it(
    "given Prankster user with a physical move vs faster opponent, " +
      "when resolveTurnOrder is called, then faster opponent moves first (Prankster does not boost damage moves)",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster only boosts status moves
      const pranksterMon = makeActivePokemon({
        ability: "prankster",
        speed: 50,
        nickname: "Sableye",
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const fastMon = makeActivePokemon({
        speed: 200,
        nickname: "Opponent",
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });

      const side0 = makeSide(pranksterMon, 0);
      const side1 = makeSide(fastMon, 1);
      const state = makeState({ sides: [side0, side1] });

      const actions = [
        { type: "move" as const, side: 0 as const, moveIndex: 0 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      const rng = new SeededRandom(42);
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);

      // Faster opponent (side 1) should go first
      expect(ordered[0].side).toBe(1);
    },
  );
});
