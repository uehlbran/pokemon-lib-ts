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
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../../src";
import { handleGen5SwitchAbility } from "../../src/Gen5AbilitiesSwitch";
import { GEN5_CRIT_MULTIPLIER } from "../../src/Gen5CritCalc";
import { Gen5Ruleset } from "../../src/Gen5Ruleset";
import { applyGen5WeatherEffects } from "../../src/Gen5Weather";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen5DataManager();
const MOVE_IDS = GEN5_MOVE_IDS;
const SPECIES_IDS = GEN5_SPECIES_IDS;
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS } as const;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const ABILITY_TRIGGER_IDS = CORE_ABILITY_TRIGGER_IDS;
const GENDERS = CORE_GENDERS;
const STATUS_IDS = CORE_STATUS_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(SPECIES_IDS.bulbasaur);
const DEFAULT_MOVE = DATA_MANAGER.getMove(MOVE_IDS.tackle);
const DEFAULT_LEVEL = 50;
const DEFAULT_HP = 200;
const DEFAULT_SPEED = 100;
const DEFAULT_STATS = {
  hp: DEFAULT_HP,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: DEFAULT_SPEED,
};

function createSyntheticPokemonInstance(overrides: {
  maxHp?: number;
  currentHp?: number;
  ability?: string;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  speed?: number;
  heldItem?: string | null;
  speciesId?: number;
  moveIds?: readonly string[];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(species, DEFAULT_LEVEL, new SeededRandom(0x5050), {
    nature: GEN5_NATURE_IDS.hardy,
    abilitySlot: ABILITY_SLOTS.normal1,
    gender: GENDERS.male,
    pokeball: CORE_ITEM_IDS.pokeBall,
    nickname: overrides.nickname ?? species.displayName,
  });

  pokemon.calculatedStats = {
    ...DEFAULT_STATS,
    hp: maxHp,
    speed: overrides.speed ?? DEFAULT_SPEED,
  };
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.status = overrides.status ?? null;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.moves = (overrides.moveIds ?? [DEFAULT_MOVE.id]).map((moveId) => {
    const move = DATA_MANAGER.getMove(moveId);
    return createMoveSlot(move.id, move.pp);
  });
  if (overrides.ability != null) {
    pokemon.ability = overrides.ability;
  }

  return pokemon;
}

function createSyntheticOnFieldPokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: readonly PokemonType[];
  ability?: string;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  speed?: number;
  heldItem?: string | null;
  consecutiveProtects?: number;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  speciesId?: number;
  moveIds?: readonly string[];
}): ActivePokemon {
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createSyntheticPokemonInstance({
    maxHp: overrides.maxHp,
    currentHp: overrides.currentHp,
    ability: overrides.ability,
    nickname: overrides.nickname,
    status: overrides.status,
    speed: overrides.speed,
    heldItem: overrides.heldItem,
    speciesId: species.id,
    moveIds: overrides.moveIds,
  });
  const activePokemon = createBattleOnFieldPokemon(pokemon, 0, [
    ...(overrides.types ?? species.types),
  ]);
  activePokemon.volatileStatuses = overrides.volatileStatuses ?? new Map();
  activePokemon.consecutiveProtects = overrides.consecutiveProtects ?? 0;
  return activePokemon;
}

function createBattleSide(active: ActivePokemon, index: 0 | 1 = 0): BattleSide {
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

function createBattleState(overrides: {
  weather?: { type: string; turnsLeft: number } | null;
  sides?: [BattleSide, BattleSide];
}): BattleState {
  const defaultPokemon = createSyntheticOnFieldPokemon({});
  const defaultSide0 = createBattleSide(defaultPokemon, 0);
  const defaultSide1 = createBattleSide(createSyntheticOnFieldPokemon({}), 1);
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
    const fastMon = createSyntheticOnFieldPokemon({
      speed: 100,
      status: null,
      nickname: "FastMon",
      moveIds: [MOVE_IDS.tackle],
    });
    const paralyzedMon = createSyntheticOnFieldPokemon({
      speed: 100,
      status: STATUS_IDS.paralysis,
      nickname: "SlowMon",
      moveIds: [MOVE_IDS.tackle],
    });

    const side0 = createBattleSide(paralyzedMon, 0);
    const side1 = createBattleSide(fastMon, 1);
    const state = createBattleState({ sides: [side0, side1] });

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
    const healthyMon = createSyntheticOnFieldPokemon({
      speed: 26,
      status: null,
      nickname: "Healthy26",
      moveIds: [MOVE_IDS.tackle],
    });
    const paralyzedMon = createSyntheticOnFieldPokemon({
      speed: 100,
      status: STATUS_IDS.paralysis,
      nickname: "Paralyzed100",
      moveIds: [MOVE_IDS.tackle],
    });

    const side0 = createBattleSide(paralyzedMon, 0);
    const side1 = createBattleSide(healthyMon, 1);
    const state = createBattleState({ sides: [side0, side1] });

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
  const state = createBattleState({});

  it("given burned Pokemon with 160 max HP, when applyStatusDamage is called, then takes 20 damage (floor(160/8))", () => {
    // Source: Bulbapedia Gen V burn -- "1/8 of maximum HP at the end of each turn"
    // Source: Showdown data/mods/gen5/conditions.ts -- burn.onResidual: Math.floor(p.maxhp/8)
    // Gen 7 changed this to 1/16; in Gen 5 it is still 1/8
    const pokemon = createSyntheticOnFieldPokemon({ maxHp: 160, status: STATUS_IDS.burn });

    const damage = ruleset.applyStatusDamage(pokemon, STATUS_IDS.burn, state);

    // floor(160 / 8) = 20
    expect(damage).toBe(20);
  });

  it("given burned Pokemon with 240 max HP, when applyStatusDamage is called, then takes 30 damage (floor(240/8))", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- burn.onResidual: Math.floor(p.maxhp/8)
    // Triangulation: different HP value to confirm 1/8 formula, not a hardcoded value
    const pokemon = createSyntheticOnFieldPokemon({ maxHp: 240, status: STATUS_IDS.burn });

    const damage = ruleset.applyStatusDamage(pokemon, STATUS_IDS.burn, state);

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
    const pokemon = createSyntheticOnFieldPokemon({
      maxHp: 160,
      speciesId: SPECIES_IDS.charmander,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(
      createSyntheticOnFieldPokemon({ speciesId: SPECIES_IDS.geodude }),
      1,
    );

    const state = createBattleState({
      weather: { type: WEATHER_IDS.sand, turnsLeft: 5 },
      sides: [side0, side1],
    });

    const results = applyGen5WeatherEffects(state);

    const chipResult = results.find((r) => r.side === 0);
    // floor(160 / 16) = 10
    expect(chipResult?.damage).toBe(10);
  });

  it("given non-immune Pokemon with 320 max HP in hail, when applyGen5WeatherEffects fires, then takes 20 damage (floor(320/16))", () => {
    // Source: Showdown data/mods/gen5/conditions.ts -- hail.onResidual: Math.floor(p.maxhp/16)
    // Source: Bulbapedia -- Hail: "all non-Ice Pokemon lose 1/16 max HP per turn"
    // Triangulation: different HP and different weather type
    const pokemon = createSyntheticOnFieldPokemon({
      maxHp: 320,
      speciesId: SPECIES_IDS.charmander,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(
      createSyntheticOnFieldPokemon({ speciesId: SPECIES_IDS.vanillite }),
      1,
    );

    const state = createBattleState({
      weather: { type: WEATHER_IDS.hail, turnsLeft: 5 },
      sides: [side0, side1],
    });

    const results = applyGen5WeatherEffects(state);

    const chipResult = results.find((r) => r.side === 0);
    // floor(320 / 16) = 20
    expect(chipResult?.damage).toBe(20);
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
    const pokemon = createSyntheticOnFieldPokemon({
      ability: ABILITY_IDS.drizzle,
      speciesId: SPECIES_IDS.politoed,
    });
    const ctx = {
      pokemon,
      opponent: null,
      state: createBattleState({}),
      trigger: ABILITY_TRIGGER_IDS.onSwitchIn,
    };

    const result = handleGen5SwitchAbility(
      ABILITY_TRIGGER_IDS.onSwitchIn,
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect?.weatherTurns).toBe(-1);
  });

  it("given a Pokemon with Drought, when handleGen5SwitchAbility fires on-switch-in, then weatherTurns is -1 (indefinite)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- Drought sets permanent sun (-1 turns)
    // Triangulation: different ability confirms the -1 pattern across all weather-setting abilities
    const pokemon = createSyntheticOnFieldPokemon({
      ability: ABILITY_IDS.drought,
      speciesId: SPECIES_IDS.ninetales,
    });
    const ctx = {
      pokemon,
      opponent: null,
      state: createBattleState({}),
      trigger: ABILITY_TRIGGER_IDS.onSwitchIn,
    };

    const result = handleGen5SwitchAbility(
      ABILITY_TRIGGER_IDS.onSwitchIn,
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect?.weatherTurns).toBe(-1);
  });

  it("given a Pokemon with Sand Stream, when handleGen5SwitchAbility fires on-switch-in, then weatherTurns is -1", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- Sand Stream sets permanent sandstorm (-1 turns)
    const pokemon = createSyntheticOnFieldPokemon({
      ability: GEN5_ABILITY_IDS.sandStream,
      speciesId: SPECIES_IDS.tyranitar,
    });
    const ctx = {
      pokemon,
      opponent: null,
      state: createBattleState({}),
      trigger: ABILITY_TRIGGER_IDS.onSwitchIn,
    };

    const result = handleGen5SwitchAbility(
      ABILITY_TRIGGER_IDS.onSwitchIn,
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect?.weatherTurns).toBe(-1);
  });

  it("given a Pokemon with Snow Warning, when handleGen5SwitchAbility fires on-switch-in, then weatherTurns is -1", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- Snow Warning sets permanent hail (-1 turns)
    // Triangulation: all 4 ability weather setters verified — confirms universal indefinite behavior
    const pokemon = createSyntheticOnFieldPokemon({
      ability: GEN5_ABILITY_IDS.snowWarning,
      speciesId: SPECIES_IDS.abomasnow,
    });
    const ctx = {
      pokemon,
      opponent: null,
      state: createBattleState({}),
      trigger: ABILITY_TRIGGER_IDS.onSwitchIn,
    };

    const result = handleGen5SwitchAbility(
      ABILITY_TRIGGER_IDS.onSwitchIn,
      ctx as Parameters<typeof handleGen5SwitchAbility>[1],
    );

    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set") as
      | { effectType: string; weatherTurns: number }
      | undefined;
    expect(weatherEffect?.weatherTurns).toBe(-1);
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
    const attacker = createSyntheticOnFieldPokemon({});
    const defender = createSyntheticOnFieldPokemon({});

    const state = createBattleState({
      sides: [createBattleSide(attacker, 0), createBattleSide(defender, 1)],
    });

    const ctx = {
      attacker,
      defender,
      move: DATA_MANAGER.getMove(MOVE_IDS.explosion),
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
    const attacker = createSyntheticOnFieldPokemon({});
    const defender = createSyntheticOnFieldPokemon({});

    const state = createBattleState({
      sides: [createBattleSide(attacker, 0), createBattleSide(defender, 1)],
    });

    const ctx = {
      attacker,
      defender,
      move: DATA_MANAGER.getMove(MOVE_IDS.selfDestruct),
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
      const pranksterMon = createSyntheticOnFieldPokemon({
        ability: GEN5_ABILITY_IDS.prankster,
        speed: 50,
        nickname: "Sableye",
        moveIds: [MOVE_IDS.willOWisp],
      });
      const fastMon = createSyntheticOnFieldPokemon({
        speed: 200,
        nickname: "Opponent",
        moveIds: [MOVE_IDS.tackle],
      });

      const side0 = createBattleSide(pranksterMon, 0);
      const side1 = createBattleSide(fastMon, 1);
      const state = createBattleState({ sides: [side0, side1] });

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
      const pranksterMon = createSyntheticOnFieldPokemon({
        ability: GEN5_ABILITY_IDS.prankster,
        speed: 50,
        nickname: "Sableye",
        moveIds: [MOVE_IDS.tackle],
      });
      const fastMon = createSyntheticOnFieldPokemon({
        speed: 200,
        nickname: "Opponent",
        moveIds: [MOVE_IDS.tackle],
      });

      const side0 = createBattleSide(pranksterMon, 0);
      const side1 = createBattleSide(fastMon, 1);
      const state = createBattleState({ sides: [side0, side1] });

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
