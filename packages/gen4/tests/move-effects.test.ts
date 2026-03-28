import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_EFFECT_TYPES,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { canInflictGen4Status, Gen4Ruleset } from "../src";
import { createGen4DataManager } from "../src/data";
import {
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src/data/reference-ids";
import { createSyntheticOnFieldPokemon } from "./helpers/createSyntheticOnFieldPokemon";

/**
 * Gen 4 Move Effects Tests
 *
 * Tests for executeGen4MoveEffect: weather (with rocks), screens (with Light Clay),
 * hazards (stealth rock, toxic spikes, spikes), status infliction with Gen 4 immunities,
 * stat changes, recoil, drain, heal, protect, rapid spin, knock off, custom effects
 * (belly drum, rest, haze, pain split, weather-dependent healing, defog, roost, etc.),
 * Shield Dust, Serene Grace, and the critical Electric/paralysis difference from Gen 3.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const RAIN = CORE_WEATHER_IDS.rain;
const SUN = CORE_WEATHER_IDS.sun;
const SAND = CORE_WEATHER_IDS.sand;
const HAIL_WEATHER = CORE_WEATHER_IDS.hail;

const MOVE_EFFECT_CUSTOM = CORE_MOVE_EFFECT_TYPES.custom;
const MOVE_EFFECT_REMOVE_HAZARDS = CORE_MOVE_EFFECT_TYPES.removeHazards;

const BURN = CORE_STATUS_IDS.burn;
const PARALYSIS = CORE_STATUS_IDS.paralysis;
const POISON = CORE_STATUS_IDS.poison;
const FREEZE = CORE_STATUS_IDS.freeze;
const SLEEP = CORE_STATUS_IDS.sleep;
const BADLY_POISONED = CORE_STATUS_IDS.badlyPoisoned;
const FLINCH = CORE_VOLATILE_IDS.flinch;
const TRAPPED = CORE_VOLATILE_IDS.trapped;

const LEFTOVERS = CORE_ITEM_IDS.leftovers;
const CHOICE_BAND = CORE_ITEM_IDS.choiceBand;
const SITRUS_BERRY = GEN4_ITEM_IDS.sitrusBerry;
const LIGHT_CLAY = GEN4_ITEM_IDS.lightClay;
const DAMP_ROCK = GEN4_ITEM_IDS.dampRock;
const HEAT_ROCK = GEN4_ITEM_IDS.heatRock;
const SMOOTH_ROCK = GEN4_ITEM_IDS.smoothRock;
const ICY_ROCK = GEN4_ITEM_IDS.icyRock;

const RAIN_DANCE = GEN4_MOVE_IDS.rainDance;
const SUNNY_DAY = GEN4_MOVE_IDS.sunnyDay;
const SANDSTORM = GEN4_MOVE_IDS.sandstorm;
const HAIL_MOVE = GEN4_MOVE_IDS.hail;
const REFLECT = GEN4_MOVE_IDS.reflect;
const LIGHT_SCREEN = GEN4_MOVE_IDS.lightScreen;
const STEALTH_ROCK_MOVE = GEN4_MOVE_IDS.stealthRock;
const TOXIC_SPIKES_MOVE = GEN4_MOVE_IDS.toxicSpikes;
const SPIKES_MOVE = GEN4_MOVE_IDS.spikes;
const KNOCK_OFF = GEN4_MOVE_IDS.knockOff;
const FLAMETHROWER = GEN4_MOVE_IDS.flamethrower;
const THUNDER_WAVE = GEN4_MOVE_IDS.thunderWave;
const DOUBLE_EDGE = GEN4_MOVE_IDS.doubleEdge;
const GIGA_DRAIN = GEN4_MOVE_IDS.gigaDrain;
const DREAM_EATER = GEN4_MOVE_IDS.dreamEater;
const ROOST = GEN4_MOVE_IDS.roost;
const RECOVER = GEN4_MOVE_IDS.recover;
const PROTECT = GEN4_MOVE_IDS.protect;
const DETECT = GEN4_MOVE_IDS.detect;
const RAPID_SPIN = GEN4_MOVE_IDS.rapidSpin;
const BELLY_DRUM = GEN4_MOVE_IDS.bellyDrum;
const EXPLOSION = GEN4_MOVE_IDS.explosion;
const THIEF = GEN4_MOVE_IDS.thief;
const U_TURN = GEN4_MOVE_IDS.uTurn;
const BATON_PASS = GEN4_MOVE_IDS.batonPass;
const DEFOG = GEN4_MOVE_IDS.defog;
const TRICK_ROOM = GEN4_MOVE_IDS.trickRoom;
const TAILWIND = GEN4_MOVE_IDS.tailwind;
const HAZE = GEN4_MOVE_IDS.haze;
const REST = GEN4_MOVE_IDS.rest;
const MOONLIGHT = GEN4_MOVE_IDS.moonlight;
const SYNTHESIS = GEN4_MOVE_IDS.synthesis;
const MORNING_SUN = GEN4_MOVE_IDS.morningSun;
const PAIN_SPLIT = GEN4_MOVE_IDS.painSplit;
const PERISH_SONG = GEN4_MOVE_IDS.perishSong;
const MEAN_LOOK = GEN4_MOVE_IDS.meanLook;
const BLOCK = GEN4_MOVE_IDS.block;
const INGRRAIN = GEN4_MOVE_IDS.ingrain;
const AQUA_RING = GEN4_MOVE_IDS.aquaRing;
const SAFEGUARD = GEN4_MOVE_IDS.safeguard;
const LUCKY_CHANT = GEN4_MOVE_IDS.luckyChant;
const HEAL_BELL = GEN4_MOVE_IDS.healBell;
const AROMATHERAPY = GEN4_MOVE_IDS.aromatherapy;
const SWORDS_DANCE = GEN4_MOVE_IDS.swordsDance;
const GRAVITY = GEN4_MOVE_IDS.gravity;
const WHIRLWIND = GEN4_MOVE_IDS.whirlwind;
const ROAR = GEN4_MOVE_IDS.roar;
const COVET = GEN4_MOVE_IDS.covet;
const REFRESH = GEN4_MOVE_IDS.refresh;
const WISH = GEN4_MOVE_IDS.wish;
const SPIDER_WEB = GEN4_MOVE_IDS.spiderWeb;
const SELF_DESTRUCT = GEN4_MOVE_IDS.selfDestruct;
const SONIC_BOOM = GEN4_MOVE_IDS.sonicBoom;
const FURY_SWIPES = GEN4_MOVE_IDS.furySwipes;
const FLY = GEN4_MOVE_IDS.fly;
const TACKLE = GEN4_MOVE_IDS.tackle;
const FOCUS_ENERGY = GEN4_MOVE_IDS.focusEnergy;
const BULBASAUR = GEN4_SPECIES_IDS.bulbasaur;
const HARDY = GEN4_NATURE_IDS.hardy;
const POKE_BALL = CORE_ITEM_IDS.pokeBall;
const NO_ABILITY = CORE_ABILITY_IDS.none;
const SHIELD_DUST = GEN4_ABILITY_IDS.shieldDust;
const SERENE_GRACE = GEN4_ABILITY_IDS.sereneGrace;
const ROCK_HEAD = GEN4_ABILITY_IDS.rockHead;
const SERENE_GRACE_CAP_BASE_CHANCE = 50;
const SERENE_GRACE_CAPPED_EFFECTIVE_CHANCE = Math.min(SERENE_GRACE_CAP_BASE_CHANCE * 2, 100);

function createMockRng(intReturnValue: number, chanceResult = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  status?: PokemonInstance["status"];
  heldItem?: PokemonInstance["heldItem"];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  level?: number;
  ability?: ActivePokemon["ability"];
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const calculatedStats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return createSyntheticOnFieldPokemon({
    ability: opts.ability ?? NO_ABILITY,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    calculatedStats,
    currentHp: opts.currentHp ?? maxHp,
    gender: CORE_GENDERS.male,
    heldItem: opts.heldItem ?? null,
    level: opts.level ?? 50,
    nickname: opts.nickname ?? null,
    nature: HARDY,
    pokeball: POKE_BALL,
    speciesId: BULBASAUR,
    statStages: {
      ...opts.statStages,
      hp: 0,
    } as Partial<ActivePokemon["statStages"]>,
    status: opts.status ?? null,
    types: opts.types,
  });
}

function createCanonicalMove(id: string, overrides?: Partial<MoveData>): MoveData {
  const move = dataManager.getMove(id);
  return {
    ...move,
    ...overrides,
    flags: overrides?.flags ? { ...move.flags, ...overrides.flags } : move.flags,
  } as MoveData;
}

function createSyntheticMove(id: string, overrides: Partial<MoveData>): MoveData {
  const baseMove = dataManager.getMove(TACKLE);
  return {
    ...baseMove,
    id,
    displayName: id,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
  } as MoveData;
}

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weatherType?: string | null,
): BattleState {
  return {
    sides: [
      {
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: weatherType ?? null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
  weatherType?: string | null,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, weatherType);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const ruleset = new Gen4Ruleset(dataManager);

// ─── Weather ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Weather", () => {
  it(`given ${RAIN_DANCE} used without Damp Rock, when executeMoveEffect called, then weatherSet = { weather: ${RAIN}, turns: 5 }`, () => {
    // Source: Showdown Gen 4 — Rain Dance sets 5-turn rain without rock
    const attacker = createActivePokemon({ types: ["water"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(RAIN_DANCE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: RAIN, turns: 5, source: RAIN_DANCE });
  });

  it(`given ${RAIN_DANCE} used with Damp Rock, when executeMoveEffect called, then weatherSet = { weather: ${RAIN}, turns: 8 }`, () => {
    // Source: Bulbapedia — Damp Rock extends rain to 8 turns
    // Source: pret/pokeplatinum — weather rock items extend weather to 8 turns
    const attacker = createActivePokemon({ types: ["water"], heldItem: DAMP_ROCK });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(RAIN_DANCE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: RAIN, turns: 8, source: RAIN_DANCE });
  });

  it(`given ${SUNNY_DAY} used with Heat Rock, when executeMoveEffect called, then weatherSet = { weather: ${SUN}, turns: 8 }`, () => {
    // Source: Bulbapedia — Heat Rock extends sun to 8 turns
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire], heldItem: HEAT_ROCK });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SUNNY_DAY);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: SUN, turns: 8, source: SUNNY_DAY });
  });

  it(`given ${SANDSTORM} used with Smooth Rock, when executeMoveEffect called, then weatherSet = { weather: ${SAND}, turns: 8 }`, () => {
    // Source: Bulbapedia — Smooth Rock extends sandstorm to 8 turns
    const attacker = createActivePokemon({ types: ["rock"], heldItem: SMOOTH_ROCK });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SANDSTORM);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: SAND, turns: 8, source: SANDSTORM });
  });

  it(`given ${HAIL_MOVE} used with Icy Rock, when executeMoveEffect called, then weatherSet = { weather: ${HAIL_WEATHER}, turns: 8 }`, () => {
    // Source: Bulbapedia — Icy Rock extends hail to 8 turns
    const attacker = createActivePokemon({ types: ["ice"], heldItem: ICY_ROCK });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(HAIL_MOVE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: HAIL_WEATHER, turns: 8, source: HAIL_MOVE });
  });

  it(`given ${RAIN_DANCE} used with wrong rock (${HEAT_ROCK}), when executeMoveEffect called, then turns = 5 (not 8)`, () => {
    // Source: Showdown Gen 4 — mismatched rock does not extend weather
    const attacker = createActivePokemon({ types: ["water"], heldItem: HEAT_ROCK });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(RAIN_DANCE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: RAIN, turns: 5, source: RAIN_DANCE });
  });

  it(`given ${SUNNY_DAY} used without any rock, when executeMoveEffect called, then weatherSet turns = 5`, () => {
    // Source: Showdown Gen 4 — default weather duration
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SUNNY_DAY);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: SUN, turns: 5, source: SUNNY_DAY });
  });
});

// ─── Screens ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Screens", () => {
  it("given Reflect used without Light Clay, when executeMoveEffect called, then screenSet with 5 turns", () => {
    // Source: Showdown Gen 4 — Reflect lasts 5 turns without Light Clay
    const attacker = createActivePokemon({ types: ["psychic"], nickname: "Alakazam" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(REFLECT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: REFLECT, turnsLeft: 5, side: "attacker" });
    expect(result.messages).toContain("Alakazam put up a Reflect!");
  });

  it("given Reflect used with Light Clay, when executeMoveEffect called, then screenSet with 8 turns", () => {
    // Source: Bulbapedia — Light Clay extends screens to 8 turns
    const attacker = createActivePokemon({
      types: ["psychic"],
      heldItem: LIGHT_CLAY,
      nickname: "Alakazam",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(REFLECT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: REFLECT, turnsLeft: 8, side: "attacker" });
    expect(result.messages).toContain("Alakazam put up a Reflect!");
  });

  it("given Light Screen used with Light Clay, when executeMoveEffect called, then screenSet with 8 turns", () => {
    // Source: Bulbapedia — Light Clay extends screens to 8 turns
    const attacker = createActivePokemon({
      types: ["psychic"],
      heldItem: LIGHT_CLAY,
      nickname: "Espeon",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(LIGHT_SCREEN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: LIGHT_SCREEN,
      turnsLeft: 8,
      side: "attacker",
    });
    expect(result.messages).toContain("Espeon put up a Light Screen!");
  });

  it("given Light Screen used without Light Clay, when executeMoveEffect called, then screenSet with 5 turns", () => {
    // Source: Showdown Gen 4 — Light Screen lasts 5 turns without Light Clay
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(LIGHT_SCREEN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: LIGHT_SCREEN,
      turnsLeft: 5,
      side: "attacker",
    });
  });
});

// ─── Entry Hazards (null-effect moves) ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — Entry Hazards (null-effect)", () => {
  it("given Stealth Rock used, when executeMoveEffect called, then hazardSet = stealth-rock on opponent's side", () => {
    // Source: Showdown Gen 4 — Stealth Rock sets entry hazard
    // Source: Bulbapedia — Stealth Rock introduced in Gen 4
    const attacker = createActivePokemon({ types: ["rock"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(STEALTH_ROCK_MOVE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: STEALTH_ROCK_MOVE, targetSide: 1 });
    expect(result.messages).toContain("Pointed stones float in the air around the foe!");
  });

  it("given Toxic Spikes used, when executeMoveEffect called, then hazardSet = toxic-spikes on opponent's side", () => {
    // Source: Showdown Gen 4 — Toxic Spikes sets entry hazard
    // Source: Bulbapedia — Toxic Spikes introduced in Gen 4
    const attacker = createActivePokemon({ types: [POISON] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(TOXIC_SPIKES_MOVE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: TOXIC_SPIKES_MOVE, targetSide: 1 });
    expect(result.messages).toContain("Poison spikes were scattered on the ground!");
  });

  it("given Spikes used (data-driven entry-hazard type), when executeMoveEffect called, then hazardSet = spikes on opponent's side", () => {
    // Source: Showdown Gen 4 — Spikes carried over from Gen 3
    const attacker = createActivePokemon({ types: ["ground"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SPIKES_MOVE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: SPIKES_MOVE, targetSide: 1 });
  });
});

// ─── Knock Off ──────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Knock Off", () => {
  it("given Knock Off vs Pokemon with item, when executeMoveEffect called, then item is removed", () => {
    // Source: Showdown Gen 4 — Knock Off removes defender's held item, no damage boost
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: LEFTOVERS,
      nickname: "Snorlax",
    });
    const move = dataManager.getMove(KNOCK_OFF);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(result.messages).toEqual(["Snorlax lost its leftovers!"]);
  });

  it("given Knock Off vs Pokemon with no item, when executeMoveEffect called, then no effect", () => {
    // Source: Showdown Gen 4 — Knock Off has no secondary effect if target has no item
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal], heldItem: null });
    const move = dataManager.getMove(KNOCK_OFF);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages.length).toBe(0);
    expect(result.itemTransfer).toBeUndefined();
  });
});

// ─── Status Infliction ─────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Status Infliction", () => {
  it(`given ${FLAMETHROWER} (10% burn chance) and roll succeeds, when executeMoveEffect called, then statusInflicted = ${BURN}`, () => {
    // Source: Showdown Gen 4 — Flamethrower has 10% secondary burn chance
    // rng.int(0,99) returns 0 → 0 < 10 → success
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(FLAMETHROWER);
    const rng = createMockRng(0); // intReturn=0, always succeeds the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe(BURN);
    expect(result.messages).toEqual([]);
  });

  it("given Flamethrower (10% burn chance) and roll fails, when executeMoveEffect called, then statusInflicted = null", () => {
    // rng.int(0,99) returns 50 → 50 < 10 = false → miss
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(FLAMETHROWER);
    const rng = createMockRng(50); // intReturn=50, fails the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });

  it(`given Fire-type defender, when ${FLAMETHROWER} burn chance succeeds, then ${BURN} NOT inflicted (type immunity)`, () => {
    // Source: Showdown Gen 4 — Fire types are immune to burn
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const move = dataManager.getMove(FLAMETHROWER);
    const rng = createMockRng(0); // Roll succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });

  it("given defender already has status, when burn chance succeeds, then status NOT inflicted", () => {
    // Source: Showdown Gen 4 — can't have two primary statuses
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal], status: PARALYSIS });
    const move = dataManager.getMove(FLAMETHROWER);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });
});

// ─── Gen 4 Electric/Paralysis (NO immunity) ────────────────────────────────

describe("Gen 4 canInflictGen4Status — Electric/Paralysis", () => {
  it("given Electric-type target, when paralysis is attempted, then paralysis CAN be inflicted (Gen 4 has no Electric immunity)", () => {
    // Source: Showdown Gen 4 — Electric types are NOT immune to paralysis
    // Source: Bulbapedia — Electric-type paralysis immunity introduced in Gen 6
    const target = createActivePokemon({ types: [CORE_TYPE_IDS.electric] });

    const result = canInflictGen4Status(PARALYSIS, target);

    expect(result).toBe(true);
  });

  it("given Electric-type target with existing status, when paralysis is attempted, then cannot inflict (already has status)", () => {
    // Source: Showdown Gen 4 — can't have two primary statuses
    const target = createActivePokemon({ types: [CORE_TYPE_IDS.electric], status: BURN });

    const result = canInflictGen4Status(PARALYSIS, target);

    expect(result).toBe(false);
  });
});

describe("Gen 4 canInflictGen4Status — Type Immunities", () => {
  it("given Fire-type target, when burn is attempted, then burn cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Fire types immune to burn
    const target = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    expect(canInflictGen4Status(BURN, target)).toBe(false);
  });

  it("given non-Fire-type target, when burn is attempted, then burn can be inflicted", () => {
    // Source: Showdown Gen 4 — non-Fire types can be burned
    const target = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    expect(canInflictGen4Status(BURN, target)).toBe(true);
  });

  it("given Ice-type target, when freeze is attempted, then freeze cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Ice types immune to freeze
    const target = createActivePokemon({ types: ["ice"] });
    expect(canInflictGen4Status(FREEZE, target)).toBe(false);
  });

  it("given Poison-type target, when poison is attempted, then poison cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Poison types immune to poison
    const target = createActivePokemon({ types: [POISON] });
    expect(canInflictGen4Status(POISON, target)).toBe(false);
  });

  it("given Steel-type target, when badly-poisoned is attempted, then badly-poisoned cannot be inflicted", () => {
    // Source: Showdown Gen 4 — Steel types immune to poison/badly-poisoned
    const target = createActivePokemon({ types: ["steel"] });
    expect(canInflictGen4Status(BADLY_POISONED, target)).toBe(false);
  });

  it("given target already has status, when burn is attempted, then burn cannot be inflicted", () => {
    // Source: Showdown Gen 4 — can't stack primary statuses
    const target = createActivePokemon({ types: [CORE_TYPE_IDS.normal], status: SLEEP });
    expect(canInflictGen4Status(BURN, target)).toBe(false);
  });
});

// ─── Shield Dust ────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Shield Dust", () => {
  it("given defender has Shield Dust, when damaging move has secondary burn effect, then burn is blocked", () => {
    // Source: Showdown Gen 4 — Shield Dust blocks secondary effects
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: SHIELD_DUST });
    const move = dataManager.getMove(FLAMETHROWER); // 10% burn chance
    const rng = createMockRng(0); // Roll would succeed without Shield Dust
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });

  it("given defender has Shield Dust, when guaranteed status move used, then status IS inflicted (not secondary)", () => {
    // Source: Showdown Gen 4 — Shield Dust only blocks secondary effects
    // Thunder Wave is a guaranteed status move (status-guaranteed), not secondary
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.electric] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: SHIELD_DUST });
    const move = dataManager.getMove(THUNDER_WAVE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe(PARALYSIS);
    expect(result.messages).toEqual([]);
  });
});

// ─── Serene Grace ───────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Serene Grace", () => {
  it("given attacker has Serene Grace and roll at 15, when Flamethrower (10% burn), then burn IS inflicted (chance doubled to 20%)", () => {
    // Source: Showdown Gen 4 — Serene Grace doubles secondary effect chance
    // 10% → 20% with Serene Grace; rng.int(0,99)=15 → 15 < 20 → success
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire], ability: SERENE_GRACE });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(FLAMETHROWER);
    const rng = createMockRng(15);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe(BURN);
    expect(result.messages).toEqual([]);
  });

  it("given attacker without Serene Grace and roll at 15, when Flamethrower (10% burn), then burn NOT inflicted", () => {
    // Without Serene Grace: 10% chance; rng.int(0,99)=15 → 15 < 10 = false → miss
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(FLAMETHROWER);
    const rng = createMockRng(15);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });
});

// ─── Recoil + Rock Head ─────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Recoil", () => {
  it("given Double-Edge used dealing 100 damage, when executeMoveEffect called, then recoilDamage = 33 (1/3 recoil)", () => {
    // Source: Showdown Gen 4 — Double-Edge has 1/3 recoil
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(DOUBLE_EDGE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 100, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(33); // floor(100 * 1/3)
  });

  it("given attacker has Rock Head and Double-Edge used, when executeMoveEffect called, then recoilDamage = 0", () => {
    // Source: Showdown Gen 4 — Rock Head prevents recoil
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: ROCK_HEAD });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(DOUBLE_EDGE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 100, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
  });
});

// ─── Drain ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Drain", () => {
  it("given Giga Drain dealing 80 damage, when executeMoveEffect called, then healAmount = 40 (50% drain)", () => {
    // Source: Showdown Gen 4 — Giga Drain drains 50%
    // Formula: max(1, floor(80 * 0.5)) = 40
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(GIGA_DRAIN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(40);
  });

  it("given Dream Eater dealing 150 damage, when executeMoveEffect called, then healAmount = 75 (50% drain)", () => {
    // Source: Showdown Gen 4 — Dream Eater drains 50%
    // Formula: max(1, floor(150 * 0.5)) = 75
    // Triangulation: second test ensures drain formula computes, not a constant return
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal], status: SLEEP });
    const move = createCanonicalMove(DREAM_EATER);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 150, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });
});

// ─── Heal ───────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Heal", () => {
  it("given Roost used by Flying/Normal type (real data), when executeMoveEffect called, then healAmount = 50% and typeChange removes Flying", () => {
    // Source: Showdown Gen 4 — Roost heals 50% max HP and removes Flying type for the turn
    // roost has { type: "heal", amount: 0.5 } in data; the Roost special-case handler
    // in executeGen4MoveEffect intercepts by move ID to also apply Flying-type removal.
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal, CORE_TYPE_IDS.flying],
      maxHp: 300,
      currentHp: 150,
      nickname: "Staraptor",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(ROOST);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // heal = floor(300 * 0.5) = 150
    // Source: Showdown Gen 4 — Roost heals 50% max HP
    expect(result.healAmount).toBe(150);
    // Flying type removed for this turn; Normal type remains
    // Source: Bulbapedia — Roost temporarily removes the user's Flying type
    expect(result.typeChange).toEqual({ target: "attacker", types: [CORE_TYPE_IDS.normal] });
    expect(result.messages).toContain("Staraptor landed and recovered health!");
  });

  it("given Recover used (heal 0.5 fraction, non-Roost), when executeMoveEffect called, then healAmount = 50% and no typeChange", () => {
    // Source: Showdown Gen 4 — Recover heals 50% max HP, no type change
    // Triangulation: ensures the heal case works generically, not just for Roost
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 100,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(RECOVER);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // heal = floor(200 * 0.5) = 100
    expect(result.healAmount).toBe(100);
    expect(result.typeChange).toBeUndefined();
  });
});

// ─── Protect / Detect ───────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Protect/Detect", () => {
  it(`given ${PROTECT} used, when executeMoveEffect called, then volatileInflicted = ${PROTECT}`, () => {
    // Source: Showdown Gen 4 — Protect sets PROTECTED volatile status
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(PROTECT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(PROTECT);
  });

  it(`given ${DETECT} used, when executeMoveEffect called, then volatileInflicted = ${PROTECT}`, () => {
    // Source: Showdown Gen 4 — Detect has same effect as Protect
    const attacker = createActivePokemon({ types: ["fighting"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(DETECT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(PROTECT);
  });
});

// ─── Rapid Spin ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Rapid Spin", () => {
  it("given Rapid Spin used, when executeMoveEffect called, then clearSideHazards = 'attacker' and volatiles cleared", () => {
    // Source: Showdown Gen 4 — Rapid Spin clears Spikes, Stealth Rock, Toxic Spikes, Leech Seed, Wrap/Bind
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Forretress" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(RAPID_SPIN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.clearSideHazards).toBe("attacker");
    expect(result.volatilesToClear).toEqual([
      { target: "attacker", volatile: "leech-seed" },
      { target: "attacker", volatile: "bound" },
    ]);
    expect(result.messages).toContain("Forretress blew away leech seed and spikes!");
  });
});

// ─── Belly Drum ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Belly Drum", () => {
  it("given attacker with >50% HP and +0 Attack, when Belly Drum used, then recoilDamage = 100 and Attack maxed to +6", () => {
    // Source: Showdown Gen 4 — Belly Drum costs 50% HP and maximizes Attack
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      currentHp: 200,
      maxHp: 200,
      nickname: "Charizard",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(BELLY_DRUM);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(100); // floor(200/2) = 100
    expect(result.statChanges).toContainEqual({
      target: "attacker",
      stat: "attack",
      stages: 6,
    });
    expect(result.messages).toContain("Charizard cut its own HP and maximized Attack!");
  });

  it("given attacker with <=50% HP, when Belly Drum used, then fails and no stat change", () => {
    // Source: Showdown Gen 4 — Belly Drum fails if HP is too low
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      currentHp: 100,
      maxHp: 200,
      nickname: "Charizard",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(BELLY_DRUM);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
    expect(result.statChanges.length).toBe(0);
    expect(result.messages).toContain("Charizard is too weak to use Belly Drum!");
  });
});

// ─── Explosion / Self-Destruct ──────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Explosion/Self-Destruct", () => {
  it("given Explosion used, when executeMoveEffect called, then selfFaint = true", () => {
    // Source: Showdown Gen 4 — Explosion causes self-KO
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Golem" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(EXPLOSION);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 300, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Golem exploded!");
  });
});

// ─── Thief / Covet ──────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Thief/Covet", () => {
  it("given Thief used and attacker has no item and defender has item, when executeMoveEffect called, then itemTransfer set", () => {
    // Source: Showdown Gen 4 — Thief steals defender's item
    const attacker = createActivePokemon({
      types: ["dark"],
      heldItem: null,
      nickname: "Sneasel",
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: SITRUS_BERRY,
      nickname: "Chansey",
    });
    const move = dataManager.getMove(THIEF);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toEqual(["Sneasel stole Chansey's sitrus-berry!"]);
  });

  it("given Thief used and attacker already has item, when executeMoveEffect called, then no itemTransfer", () => {
    // Source: Showdown Gen 4 — can't steal if you already have an item
    const attacker = createActivePokemon({
      types: ["dark"],
      heldItem: CHOICE_BAND,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: SITRUS_BERRY,
    });
    const move = dataManager.getMove(THIEF);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
    expect(result.messages).toEqual([]);
  });
});

// ─── U-turn (switch-out) ────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — U-turn", () => {
  it("given U-turn used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — U-turn switches attacker out after dealing damage
    const attacker = createActivePokemon({ types: ["bug"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(U_TURN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 70, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── Baton Pass ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Baton Pass", () => {
  it("given Baton Pass used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — Baton Pass passes stat changes and volatiles
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(BATON_PASS);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── Defog ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Defog", () => {
  it("given Defog used, when executeMoveEffect called, then clears defender hazards + screens and lowers evasion", () => {
    // Source: Showdown Gen 4 — Defog clears target's hazards and screens
    // Source: Bulbapedia — Defog lowers target's evasion by 1
    const attacker = createActivePokemon({ types: ["flying"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(DEFOG);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.clearSideHazards).toBe("defender");
    expect(result.screensCleared).toBe("defender");
    expect(result.statChanges).toContainEqual({
      target: "defender",
      stat: "evasion",
      stages: -1,
    });
    expect(result.messages).toContain("It blew away the hazards!");
  });
});

// ─── Roost (null-effect handler) ────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Roost (null-effect)", () => {
  it("given Roost used by Flying/Normal type, when executeMoveEffect called, then healAmount and typeChange removes Flying", () => {
    // Note: Roost has effect: { type: "heal", amount: 0.5 } in the data,
    // so this test validates the data-driven path, not the null-effect handler.
    // The null-effect handler for ROOST would only fire if effect were null.
    // We test the null-effect path separately with a synthetic move.
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal, CORE_TYPE_IDS.flying],
      maxHp: 200,
      currentHp: 100,
      nickname: "Pidgeot",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    // Create synthetic null-effect roost to test handleNullEffectMoves
    const move = createCanonicalMove(ROOST, { effect: null });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(100); // floor(200 / 2) = 100
    expect(result.typeChange).toEqual({
      target: "attacker",
      types: [CORE_TYPE_IDS.normal],
    });
    expect(result.messages).toContain("Pidgeot landed and recovered health!");
  });

  it("given Roost used by pure Flying type, when executeMoveEffect called, then types become Normal", () => {
    // Source: Showdown Gen 4 — pure Flying-type using Roost becomes Normal-type
    const attacker = createActivePokemon({
      types: ["flying"],
      maxHp: 200,
      currentHp: 100,
      nickname: "Tornadus",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(ROOST, { effect: null });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.typeChange).toEqual({
      target: "attacker",
      types: [CORE_TYPE_IDS.normal],
    });
    expect(result.messages).toEqual(["Tornadus landed and recovered health!"]);
  });

  it("given Roost used by non-Flying type, when executeMoveEffect called, then no typeChange", () => {
    // Source: Showdown Gen 4 — Roost only removes Flying type
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 100,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(ROOST, { effect: null });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.typeChange).toBeUndefined();
    expect(result.messages).toEqual(["The Pokemon landed and recovered health!"]);
  });
});

// ─── Trick Room ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Trick Room", () => {
  it("given Trick Room used when trickRoom is not active, when executeMoveEffect called, then trickRoomSet with 5 turns", () => {
    // Source: Showdown Gen 4 — Trick Room reverses speed order for 5 turns
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(TRICK_ROOM);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.trickRoomSet).toEqual({ turnsLeft: 5 });
    expect(result.messages).toContain("The dimensions were twisted!");
  });

  it("given Trick Room used when trickRoom is already active, when executeMoveEffect called, then trickRoomSet has turnsLeft 0 to deactivate", () => {
    // Source: Showdown Gen 4 — Using Trick Room while active ends it
    // turnsLeft: 0 signals the engine to deactivate Trick Room
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(TRICK_ROOM);
    const rng = createMockRng(0);
    // Create state with active Trick Room
    const state = createMinimalBattleState(attacker, defender);
    (state as { trickRoom: { active: boolean; turnsLeft: number } }).trickRoom = {
      active: true,
      turnsLeft: 3,
    };
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    expect(result.trickRoomSet).toEqual({ turnsLeft: 0 });
    expect(result.messages).toContain("The twisted dimensions returned to normal!");
  });
});

// ─── Tailwind ───────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Tailwind", () => {
  it("given Tailwind used, when executeMoveEffect called, then tailwindSet with 3 turns and side attacker", () => {
    // Source: Showdown Gen 4 — Tailwind lasts 3 turns in Gen 4
    // Source: Bulbapedia — Tailwind: 3 turns in Gen 4, 4 turns in Gen 5+
    const attacker = createActivePokemon({ types: ["flying"], nickname: "Togekiss" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(TAILWIND);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.tailwindSet).toEqual({ turnsLeft: 3, side: "attacker" });
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("Togekiss whipped up a tailwind!");
  });
});

// ─── Haze ───────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Haze", () => {
  it("given Haze used, when executeMoveEffect called, then statStagesReset for both", () => {
    // Source: Showdown Gen 4 — Haze resets all stat changes for both sides
    const attacker = createActivePokemon({ types: [POISON] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(HAZE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statStagesReset).toEqual({ target: "both" });
    expect(result.messages).toContain("All stat changes were eliminated!");
  });
});

// ─── Rest ───────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Rest", () => {
  it("given Rest used, when executeMoveEffect called, then full heal + self-sleep", () => {
    // Source: Showdown Gen 4 — Rest heals fully and inflicts 2-turn sleep
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 300,
      currentHp: 50,
      nickname: "Snorlax",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(REST);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(300); // Full max HP
    expect(result.selfStatusInflicted).toBe(SLEEP);
    expect(result.messages).toContain("Snorlax went to sleep and became healthy!");
  });
});

// ─── Weather-Dependent Healing ──────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Weather-Dependent Healing (Moonlight/Synthesis/Morning Sun)", () => {
  it("given Moonlight used in sun, when executeMoveEffect called, then healAmount = 2/3 max HP", () => {
    // Source: Showdown Gen 4 — sun: 2/3 max HP recovery
    // Source: Bulbapedia — Moonlight/Synthesis/Morning Sun weather healing
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 300,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(MOONLIGHT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, SUN);

    const result = ruleset.executeMoveEffect(context);

    // floor(300 * 2/3) = floor(200) = 200
    expect(result.healAmount).toBe(200);
  });

  it("given Synthesis used in rain, when executeMoveEffect called, then healAmount = 1/4 max HP", () => {
    // Source: Showdown Gen 4 — rain: 1/4 max HP recovery
    const attacker = createActivePokemon({
      types: ["grass"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SYNTHESIS);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, RAIN);

    const result = ruleset.executeMoveEffect(context);

    // floor(200 * 1/4) = 50
    expect(result.healAmount).toBe(50);
  });

  it("given Morning Sun used in clear weather, when executeMoveEffect called, then healAmount = 1/2 max HP", () => {
    // Source: Showdown Gen 4 — no weather: 1/2 max HP recovery
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(MORNING_SUN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // floor(200 * 1/2) = 100
    expect(result.healAmount).toBe(100);
  });

  it("given Moonlight used in hail, when executeMoveEffect called, then healAmount = 1/4 max HP", () => {
    // Source: Showdown Gen 4 — hail: 1/4 max HP recovery
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(MOONLIGHT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, HAIL_WEATHER);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(50); // floor(200 * 1/4)
  });

  it("given Synthesis used in sandstorm, when executeMoveEffect called, then healAmount = 1/4 max HP", () => {
    // Source: Showdown Gen 4 — sandstorm: 1/4 max HP recovery
    const attacker = createActivePokemon({
      types: ["grass"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SYNTHESIS);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng, SAND);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(50); // floor(200 * 1/4)
  });
});

// ─── Pain Split ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Pain Split", () => {
  it("given attacker at 50 HP and defender at 150 HP, when Pain Split used, then attacker heals via healAmount and defender damaged via customDamage", () => {
    // Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
    // Source: Bulbapedia -- "each have their HP set to the average of the two"
    // Average = floor((50 + 150) / 2) = 100
    // Attacker gains 50 (100 - 50), defender loses 50 (150 - 100)
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 200,
      currentHp: 50,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 150,
    });
    const move = dataManager.getMove(PAIN_SPLIT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Attacker heals via healAmount (engine applies this)
    expect(result.healAmount).toBe(50);
    // Defender damaged via customDamage (engine applies this)
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 50,
      source: PAIN_SPLIT,
    });
    expect(result.messages).toContain("The battlers shared their pain!");
  });

  it("given attacker at 150 HP and defender at 50 HP, when Pain Split used, then attacker damaged via recoilDamage and defender HP is updated", () => {
    // Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
    // Average = floor((150 + 50) / 2) = 100
    // Attacker loses 50 (150 - 100), defender gains 50 (100 - 50)
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 200,
      currentHp: 150,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 50,
    });
    const move = dataManager.getMove(PAIN_SPLIT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Attacker loses HP via recoilDamage (engine applies this)
    expect(result.recoilDamage).toBe(50);
    // Defender gains HP (direct mutation -- no defenderHealAmount field exists)
    expect(defender.pokemon.currentHp).toBe(100);
    expect(result.messages).toContain("The battlers shared their pain!");
  });
});

// ─── Perish Song ────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Perish Song", () => {
  it("given Perish Song used, when executeMoveEffect called, then both attacker and defender get perish-song volatile", () => {
    // Source: Showdown Gen 4 — Perish Song affects both sides
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(PERISH_SONG);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(PERISH_SONG);
    expect(result.volatileInflicted).toBe(PERISH_SONG);
    expect(result.messages).toContain("All Pokemon that heard the song will faint in 3 turns!");
  });
});

// ─── Mean Look / Block ──────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Trapping Moves", () => {
  it(`given Mean Look used, when executeMoveEffect called, then volatileInflicted = ${TRAPPED}`, () => {
    // Source: Showdown Gen 4 — Mean Look prevents switching
    const attacker = createActivePokemon({ types: ["ghost"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(MEAN_LOOK);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(TRAPPED);
  });

  it(`given Block used, when executeMoveEffect called, then volatileInflicted = ${TRAPPED}`, () => {
    // Source: Showdown Gen 4 — Block prevents switching
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(BLOCK);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(TRAPPED);
  });
});

// ─── Ingrain / Aqua Ring ────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Ingrain and Aqua Ring", () => {
  it(`given ${INGRRAIN} used, when executeMoveEffect called, then selfVolatileInflicted = ${INGRRAIN}`, () => {
    // Source: Showdown Gen 4 — Ingrain volatile
    const attacker = createActivePokemon({ types: ["grass"], nickname: "Torterra" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(INGRRAIN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(INGRRAIN);
    expect(result.messages).toContain("Torterra planted its roots!");
  });

  it(`given ${AQUA_RING} used, when executeMoveEffect called, then selfVolatileInflicted = ${AQUA_RING}`, () => {
    // Source: Showdown Gen 4 — Aqua Ring volatile
    const attacker = createActivePokemon({ types: ["water"], nickname: "Vaporeon" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(AQUA_RING);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(AQUA_RING);
    expect(result.messages).toContain("Vaporeon surrounded itself with a veil of water!");
  });
});

// ─── Safeguard / Lucky Chant ────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Safeguard and Lucky Chant", () => {
  it("given Safeguard used, when executeMoveEffect called, then screenSet with safeguard for 5 turns", () => {
    // Source: Showdown Gen 4 — Safeguard prevents status for 5 turns
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Blissey" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SAFEGUARD);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: SAFEGUARD, turnsLeft: 5, side: "attacker" });
  });

  it("given Lucky Chant used, when executeMoveEffect called, then screenSet with lucky-chant for 5 turns", () => {
    // Source: Showdown Gen 4 — Lucky Chant prevents crits for 5 turns
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Clefable" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(LUCKY_CHANT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: LUCKY_CHANT,
      turnsLeft: 5,
      side: "attacker",
    });
  });
});

// ─── Heal Bell / Aromatherapy ───────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Heal Bell / Aromatherapy", () => {
  it("given Heal Bell used, when executeMoveEffect called, then statusCuredOnly for attacker's side only (not foe's party)", () => {
    // Source: Showdown Gen 4 — Heal Bell cures user's team status
    // Source: Bulbapedia — "Heal Bell cures all status conditions of the user and the user's party"
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(HEAL_BELL);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
  });

  it("given Aromatherapy used, when executeMoveEffect called, then statusCuredOnly for attacker's side only (not foe's party)", () => {
    // Source: Showdown Gen 4 — Aromatherapy cures user's team status
    // Source: Bulbapedia — cures user's party, not the foe's party
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(AROMATHERAPY);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
  });
});

// ─── Stat Change Effects ────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Stat Changes", () => {
  it("given Swords Dance (status move, 100% stat change), when executeMoveEffect called, then attack +2 (guaranteed, no roll)", () => {
    // Source: Showdown Gen 4 — Swords Dance is a status move, guaranteed effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SWORDS_DANCE);
    const rng = createMockRng(99); // Roll value doesn't matter for status moves
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toContainEqual({
      target: "attacker",
      stat: "attack",
      stages: 2,
    });
  });
});

// ─── Gravity ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Gravity", () => {
  it("given Gravity used, when executeMoveEffect called, then message emitted", () => {
    // Source: Showdown Gen 4 — Gravity intensified message
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(GRAVITY);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Gravity intensified!");
  });
});

// ─── Whirlwind / Roar ───────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Whirlwind/Roar (phazing)", () => {
  it("given Whirlwind used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — Whirlwind forces target to switch
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(WHIRLWIND);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });

  it("given Roar used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — Roar forces target to switch
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(ROAR);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── Covet ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Covet", () => {
  it("given Covet used and attacker has no item and defender has item, when executeMoveEffect called, then item is stolen", () => {
    // Source: Showdown Gen 4 — Covet steals defender's item (same as Thief)
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: null,
      nickname: "Togekiss",
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: LEFTOVERS,
      nickname: "Blissey",
    });
    const move = dataManager.getMove(COVET);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Togekiss stole Blissey's leftovers!");
  });

  it("given Covet used and attacker already has item, when executeMoveEffect called, then no item transfer", () => {
    // Source: Showdown Gen 4 — can't steal if you already have an item
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: CHOICE_BAND,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: LEFTOVERS,
    });
    const move = dataManager.getMove(COVET);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
    expect(result.messages).toEqual([]);
  });
});

// ─── Refresh ────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Refresh", () => {
  it("given Refresh used by poisoned Pokemon, when executeMoveEffect called, then statusCuredOnly for attacker", () => {
    // Source: Showdown Gen 4 — Refresh cures burn/poison/paralysis on the user
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      status: POISON,
      nickname: "Chansey",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(REFRESH);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result.messages).toEqual(["Chansey cured its status condition!"]);
  });

  it("given Refresh used by healthy Pokemon (no status), when executeMoveEffect called, then no effect", () => {
    // Source: Showdown Gen 4 — Refresh does nothing if no status condition
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(REFRESH);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toBeUndefined();
    expect(result.messages).toEqual([]);
  });
});

// ─── Wish ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Wish", () => {
  it("given Wish used, when executeMoveEffect called, then emits wish message (engine tracks state)", () => {
    // Source: Showdown Gen 4 — Wish sets up healing for end of next turn
    // Source: Bulbapedia — Wish: At end of next turn, heals the Pokemon at user's position by 1/2 max HP
    // The move effect only produces a message; the engine handles Wish tracking
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      nickname: "Jirachi",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(WISH);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Jirachi made a wish!");
  });

  it("given Wish used by unnamed Pokemon, when executeMoveEffect called, then uses default name", () => {
    // Source: Showdown Gen 4 — Wish message fallback for unnamed Pokemon
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(WISH);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("The Pokemon made a wish!");
  });
});

// ─── Spider Web ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Spider Web (trapping)", () => {
  it(`given Spider Web used, when executeMoveEffect called, then volatileInflicted = ${TRAPPED}`, () => {
    // Source: Showdown Gen 4 — Spider Web prevents switching (same as Mean Look)
    const attacker = createActivePokemon({ types: ["bug"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SPIDER_WEB);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(TRAPPED);
  });
});

// ─── Self-Destruct ──────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Self-Destruct", () => {
  it("given Self-Destruct used, when executeMoveEffect called, then selfFaint = true", () => {
    // Source: Showdown Gen 4 — Self-Destruct causes self-KO (same as Explosion)
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Electrode" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SELF_DESTRUCT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 200, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Electrode exploded!");
  });
});

// ─── applyMoveEffect — passthrough cases (no-op effect types) ───────────────

describe("Gen 4 executeMoveEffect — applyMoveEffect no-op passthrough cases", () => {
  it("given a move with remove-hazards effect type, when executeMoveEffect called, then no hazard clearing in result (handled by engine)", () => {
    // Source: Showdown Gen 4 — remove-hazards is a no-op in applyMoveEffect;
    // Rapid Spin and Defog are handled by the Field sub-module by move ID.
    // This test covers the intentional no-op branch in the data-driven applyMoveEffect
    // by using a synthetic move ID that is not recognized by any sub-module.
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createSyntheticMove("synthetic-remove-hazards", {
      effect: { type: MOVE_EFFECT_REMOVE_HAZARDS } as unknown as MoveData["effect"],
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // remove-hazards is a no-op in applyMoveEffect — only statuses/messages reset
    expect(result.clearSideHazards).toBeUndefined();
    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });

  it("given a move with fixed-damage effect type, when executeMoveEffect called, then no status inflicted (handled by damage calc)", () => {
    // Source: Showdown Gen 4 — fixed-damage is handled by the damage calculation, not move effects
    // Covers the fixed-damage case arm (line 374) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(SONIC_BOOM, {
      effect: { type: "fixed-damage", damage: 20 } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.recoilDamage).toBe(0);
    expect(result.messages).toEqual([]);
  });

  it("given a move with terrain effect type, when executeMoveEffect called, then no terrain set in result (not in Gen 4)", () => {
    // Source: Showdown Gen 4 — terrain moves are N/A in Gen 4 (Gen 5 feature)
    // Covers the terrain case arm (line 381) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.electric] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(GEN4_MOVE_IDS.charge, {
      effect: { type: "terrain", terrain: "electric" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });

  it("given a move with multi-hit effect type, when executeMoveEffect called, then no additional effects (handled by engine)", () => {
    // Source: Showdown Gen 4 — multi-hit is handled by the engine loop, not move effects
    // Covers the multi-hit case arm (line 382) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(FURY_SWIPES, {
      effect: { type: "multi-hit", min: 2, max: 5 } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 15, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.recoilDamage).toBe(0);
    expect(result.statusInflicted).toBeNull();
  });

  it("given a move with two-turn effect type, when executeMoveEffect called, then no side effects (handled by engine)", () => {
    // Source: Showdown Gen 4 — two-turn moves like Fly/Dig handled by engine, not move effects
    // Covers the two-turn case arm (line 383) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["flying"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(FLY, {
      effect: { type: "two-turn", status: "semi-invulnerable" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 90, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.recoilDamage).toBe(0);
  });

  it("given a move with damage effect type, when executeMoveEffect called, then no additional effects (pure damage)", () => {
    // Source: Showdown Gen 4 — damage effect type is pure damage, handled by the damage calc
    // Covers the damage case arm (line 377) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(TACKLE, {
      effect: { type: "damage" } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.recoilDamage).toBe(0);
  });
});

// ─── applyMoveEffect — stat-change targeting defender ───────────────────────

describe("Gen 4 executeMoveEffect — stat-change targeting defender", () => {
  it("given Charm (secondary stat drop on foe), when roll succeeds, then defender's Attack drops", () => {
    // Source: Showdown Gen 4 — Charm lowers target's Attack stat
    // Using a synthetic move with stat-change type targeting foe
    // Covers the effect.target !== "self" branch (line 246) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(GEN4_MOVE_IDS.charm, {
      effect: {
        type: "stat-change",
        target: "foe",
        chance: 100,
        changes: [{ stat: "attack", stages: -2 }],
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toContainEqual({ target: "defender", stat: "attack", stages: -2 });
  });

  it("given a physical move with secondary stat-change chance, when RNG roll fails, then no stat change", () => {
    // Source: Showdown Gen 4 — secondary stat changes only apply if the roll succeeds
    // Using a synthetic physical move with 10% stat-change secondary effect
    // Covers the roll-fails branch (line 239-242) in applyMoveEffect for stat-change
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(GEN4_MOVE_IDS.crunch, {
      effect: {
        type: "stat-change",
        target: "foe",
        chance: 10,
        changes: [{ stat: "defense", stages: -1 }],
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(50); // roll=50, 50 < 10 is false → chance fails
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toHaveLength(0);
  });
});

// ─── applyMoveEffect — volatile-status for status move (guaranteed) ──────────

describe("Gen 4 executeMoveEffect — volatile-status on status move (guaranteed)", () => {
  it("given a status move with volatile-status effect and roll fails, when used, then volatile IS still inflicted (guaranteed for status moves)", () => {
    // Source: Showdown Gen 4 — volatile-status from status moves is guaranteed (no roll for status moves)
    // Covers the 'move.category === status' path (line 290-299) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(FOCUS_ENERGY, {
      effect: {
        type: "volatile-status",
        status: FOCUS_ENERGY,
        chance: 0,
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(99); // roll=99, would fail if used
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Status moves with volatile-status are guaranteed, ignoring chance
    expect(result.volatileInflicted).toBe(FOCUS_ENERGY);
    expect(result.messages).toEqual([]);
  });

  it("given a damaging move with volatile-status secondary effect, when roll fails, then volatile NOT inflicted", () => {
    // Source: Showdown Gen 4 — volatile-status from damaging moves uses a roll
    // Covers the false-branch of the volatile-status roll check (line 293-297)
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(GEN4_MOVE_IDS.rockSlide);
    // Source: Gen 4 move data — Rock Slide's flinch branch is 30%, so a roll of 50 must fail.
    const rng = createMockRng(50);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });
});

// ─── Serene Grace at 100% cap ───────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Serene Grace doubling chance to 100%", () => {
  it("given attacker has Serene Grace and move has 50% secondary chance, when roll is 99, then effect STILL activates (capped at 100%)", () => {
    // Source: pret/pokeplatinum — Serene Grace doubles secondary effect chance; min(chance*2, 100)
    // Derived: 50 is the smallest base secondary chance that reaches the 100% cap after doubling.
    // Covers the effectiveChance >= 100 branch (line 185) in rollEffectChance
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], ability: SERENE_GRACE });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(GEN4_MOVE_IDS.ironHead, {
      effect: {
        type: "volatile-status",
        status: FLINCH,
        chance: SERENE_GRACE_CAP_BASE_CHANCE,
      } as unknown as typeof move.effect,
    });
    // Derived: the doubled chance reaches the 100% cap, so even the highest 0-99 roll still succeeds.
    const rng = createMockRng(SERENE_GRACE_CAPPED_EFFECTIVE_CHANCE - 1);
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    // 100% guaranteed effect — covers the 'effectiveChance >= 100' fast-path
    expect(result.volatileInflicted).toBe(FLINCH);
    expect(result.messages).toEqual([]);
  });
});

// ─── handleNullEffectMoves — default case ───────────────────────────────────

describe("Gen 4 executeMoveEffect — handleNullEffectMoves default case", () => {
  it("given a null-effect move with unrecognized ID, when executeMoveEffect called, then no effect produced", () => {
    // Source: Showdown Gen 4 — unknown null-effect moves are silently ignored
    // Covers the default case (line 846-847) in handleNullEffectMoves
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createSyntheticMove("unknown-null-move", {
      effect: null,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
    expect(result.messages).toEqual([]);
  });
});

// ─── handleCustomEffect — default case ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — handleCustomEffect default case", () => {
  it("given a custom-effect move with unrecognized ID, when executeMoveEffect called, then no effect produced", () => {
    // Source: Showdown Gen 4 — unknown custom moves fall through to no-op default
    // Covers the default case (line 618-621) in handleCustomEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createSyntheticMove("future-custom-move", {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toEqual([]);
  });
});

// ─── handleNullEffectMoves — attacker on side 1 (hazards target side 0) ─────

describe("Gen 4 executeMoveEffect — entry hazards from attacker on side 1", () => {
  it("given attacker on side 1 uses Stealth Rock, when executeMoveEffect called, then hazardSet targets side 0", () => {
    // Source: Showdown Gen 4 — Stealth Rock places hazard on the opponent's side
    // Covers the attackerSideIndex !== 0 branch (line 653) in handleNullEffectMoves
    const attacker = createActivePokemon({ types: ["rock"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(STEALTH_ROCK_MOVE);
    const rng = createMockRng(0);

    // Place attacker on side 1 instead of side 0
    const state = createMinimalBattleState(defender, attacker); // swap sides
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Attacker on side 1 → hazard targets side 0
    expect(result.hazardSet).toEqual({ hazard: STEALTH_ROCK_MOVE, targetSide: 0 });
  });

  it("given attacker on side 1 uses Toxic Spikes, when executeMoveEffect called, then hazardSet targets side 0", () => {
    // Source: Showdown Gen 4 — Toxic Spikes places hazard on the opponent's side
    // Covers the attackerSideIndex !== 0 branch (line 666) in handleNullEffectMoves
    const attacker = createActivePokemon({ types: [POISON] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(TOXIC_SPIKES_MOVE);
    const rng = createMockRng(0);

    const state = createMinimalBattleState(defender, attacker);
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: TOXIC_SPIKES_MOVE, targetSide: 0 });
  });
});

// ─── Belly Drum — attack already at +6 ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — Belly Drum with attack already maxed", () => {
  it("given attacker at +6 attack with >50% HP, when Belly Drum used, then recoilDamage = 50% HP and statChanges has stages = 0", () => {
    // Source: Showdown Gen 4 — Belly Drum maximizes attack; stages = 6 - current
    // When already at +6 attack, stages = 6 - 6 = 0 (no change to stages)
    // Covers the branch where attacker.statStages.attack is 6 (line 419)
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      currentHp: 200,
      maxHp: 200,
      nickname: "Snorlax",
      statStages: { attack: 6 },
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(BELLY_DRUM);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Belly Drum still costs 50% HP even if attack is maxed
    expect(result.recoilDamage).toBe(100); // floor(200/2) = 100
    // Stages = 6 - 6 = 0 (already maxed — no additional stages added)
    expect(result.statChanges).toContainEqual({ target: "attacker", stat: "attack", stages: 0 });
  });
});

// ─── switch-out effect with non-self target ──────────────────────────────────

describe("Gen 4 executeMoveEffect — switch-out effect with opponent target", () => {
  it("given a synthetic move with switch-out effect targeting opponent, when used, then switchOut = false (only self-switch triggers)", () => {
    // Source: Showdown Gen 4 — switch-out effect with target=opponent does not trigger switchOut
    // Covers the 'switchTarget !== self' branch (line 350-353) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createSyntheticMove("forced-switch", {
      effect: {
        type: "switch-out",
        target: "opponent",
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // switchOut is only set for target="self"
    expect(result.switchOut).toBe(false);
  });
});

// ─── applyMoveEffect — multi effect (composite) ─────────────────────────────

describe("Gen 4 executeMoveEffect — multi effect (Scald-style: damage + secondary burn)", () => {
  it("given a move with multi effect containing status-chance, when roll succeeds, then burn is inflicted", () => {
    // Source: Showdown Gen 4 — Scald has multi effect: [damage, 30% burn]
    // The multi effect routes sub-effects through applyMoveEffect recursively
    // Covers the 'multi' case (lines 282-288) in applyMoveEffect
    const attacker = createActivePokemon({ types: ["water"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createSyntheticMove("scald-fake", {
      type: CORE_TYPE_IDS.water,
      category: "special",
      effect: {
        type: "multi",
        effects: [
          {
            type: "status-chance",
            status: BURN,
            chance: 30,
          },
        ],
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0); // roll=0, 0 < 30 → burn succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBe(BURN);
  });
});

// ─── applyMoveEffect — heal without calculatedStats ─────────────────────────

describe("Gen 4 executeMoveEffect — heal effect with no calculatedStats (fallback to currentHp)", () => {
  it("given a Pokemon with no calculatedStats and heal move, when executeMoveEffect called, then uses currentHp as maxHp", () => {
    // Source: Showdown Gen 4 — heal uses calculatedStats?.hp ?? currentHp fallback
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 277) in applyMoveEffect
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      currentHp: 100,
      maxHp: 200,
    });
    // Remove calculatedStats to trigger fallback
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(RECOVER);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 100; heal = floor(100 * 0.5) = 50
    expect(result.healAmount).toBe(50);
  });
});

// ─── switch-out with `who` field (Gen 4 data compatibility) ─────────────────

describe("Gen 4 executeMoveEffect — switch-out effect using 'who' field", () => {
  it("given move with switch-out effect using 'who: self' field, when executeMoveEffect called, then switchOut = true", () => {
    // Source: Showdown Gen 4 — some Gen 4 move data uses 'who' instead of 'target' for switch-out
    // Covers the 'effect.target ?? effect.who ?? self' branch (line 349) in applyMoveEffect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    // Synthetic move with switch-out effect using legacy 'who' field (no 'target' field)
    const move = createCanonicalMove(BATON_PASS, {
      effect: {
        type: "switch-out",
        who: "self",
        // No 'target' field — forces the ?? fallback to 'who'
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── entry-hazard in applyMoveEffect — attacker on side 1 ───────────────────

describe("Gen 4 executeMoveEffect — entry-hazard in applyMoveEffect with attacker on side 1", () => {
  it("given Spikes (data-driven entry-hazard) used from side 1, when executeMoveEffect called, then hazard targets side 0", () => {
    // Source: Showdown Gen 4 — Spikes (entry-hazard type) places hazard on opponent's side
    // Covers the attackerSideIndex !== 0 branch (line 336) in applyMoveEffect entry-hazard case
    const attacker = createActivePokemon({ types: ["ground"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SPIKES_MOVE);
    const rng = createMockRng(0);

    // Place attacker on side 1 by swapping the sides
    const state = createMinimalBattleState(defender, attacker);
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Attacker on side 1 → hazard targets side 0
    expect(result.hazardSet).toEqual({ hazard: SPIKES_MOVE, targetSide: 0 });
  });
});

// ─── Rest in handleNullEffectMoves — no calculatedStats fallback ─────────────

describe("Gen 4 executeMoveEffect — Rest in handleNullEffectMoves with no calculatedStats", () => {
  it("given Rest used by Pokemon with no calculatedStats, when executeMoveEffect called, then uses currentHp as max HP", () => {
    // Source: Showdown Gen 4 — Rest heals max HP; maxHp = calculatedStats?.hp ?? currentHp
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 734) in handleNullEffectMoves rest case
    // When calculatedStats is null, maxHp falls back to currentHp
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      currentHp: 120,
      maxHp: 300, // calculatedStats.hp set to 300
      nickname: "Snorlax",
    });
    // Remove calculatedStats to trigger fallback
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(REST);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 120 (not 300); Rest heals to that amount
    expect(result.healAmount).toBe(120);
    expect(result.selfStatusInflicted).toBe(SLEEP);
  });
});

// ─── handleCustomEffect — dead-code branch coverage via synthetic custom moves ─

describe("Gen 4 executeMoveEffect — handleCustomEffect branches via synthetic custom-effect moves", () => {
  it(`given synthetic custom-effect mean-look move, when used, then volatileInflicted = ${TRAPPED}`, () => {
    // Covers handleCustomEffect case 'mean-look' (line 441) with explicit custom effect type
    // In real data mean-look has null effect (handled by handleNullEffectMoves);
    // this synthetic test covers the handleCustomEffect path.
    const attacker = createActivePokemon({ types: ["ghost"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(MEAN_LOOK, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(TRAPPED);
  });

  it(`given synthetic custom-effect spider-web move, when used, then volatileInflicted = ${TRAPPED}`, () => {
    // Covers handleCustomEffect case 'spider-web' (line 442) via synthetic custom effect
    const attacker = createActivePokemon({ types: ["bug"] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(SPIDER_WEB, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(TRAPPED);
  });

  it(`given synthetic custom-effect block move, when used, then volatileInflicted = ${TRAPPED}`, () => {
    // Covers handleCustomEffect case 'block' (line 443) via synthetic custom effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(BLOCK, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(TRAPPED);
  });

  it("given synthetic custom-effect covet move (no item, defender has item), when used, then item is stolen", () => {
    // Covers handleCustomEffect case 'covet' (line 451) via synthetic custom effect
    // Source: Showdown Gen 4 — Covet steals defender's item if attacker has no item
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: null,
      nickname: "Skitty",
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: SITRUS_BERRY,
      nickname: "Blissey",
    });
    const move = createCanonicalMove(COVET, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result.messages).toContain("Skitty stole Blissey's sitrus-berry!");
  });

  it("given synthetic custom-effect explosion move, when used, then selfFaint = true", () => {
    // Covers handleCustomEffect case 'explosion' (line 470) via synthetic custom effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Weezing" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(EXPLOSION, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 250, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Weezing exploded!");
  });

  it("given synthetic custom-effect self-destruct move, when used, then selfFaint = true", () => {
    // Covers handleCustomEffect case 'self-destruct' (line 471) via synthetic custom effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Electrode" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(SELF_DESTRUCT, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 200, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
  });

  it("given synthetic custom-effect haze move, when used, then statStagesReset for both", () => {
    // Covers handleCustomEffect case 'haze' (line 479) via synthetic custom effect
    const attacker = createActivePokemon({ types: [POISON] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(HAZE, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statStagesReset).toEqual({ target: "both" });
    expect(result.messages).toContain("All stat changes were eliminated!");
  });

  it("given synthetic custom-effect wish move, when used, then message emitted", () => {
    // Covers handleCustomEffect case 'wish' (line 487) via synthetic custom effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Togetic" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(WISH, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Togetic made a wish!");
  });

  it("given synthetic custom-effect safeguard move, when used, then screenSet = safeguard for 5 turns", () => {
    // Covers handleCustomEffect case 'safeguard' (line 497) via synthetic custom effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Blissey" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(SAFEGUARD, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: SAFEGUARD, turnsLeft: 5, side: "attacker" });
  });

  it("given synthetic custom-effect lucky-chant move, when used, then screenSet = lucky-chant for 5 turns", () => {
    // Covers handleCustomEffect case 'lucky-chant' (line 498) via synthetic custom effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Clefable" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(LUCKY_CHANT, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: LUCKY_CHANT,
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it(`given synthetic custom-effect ${INGRRAIN} move, when used, then selfVolatileInflicted = ${INGRRAIN}`, () => {
    // Covers handleCustomEffect case 'ingrain' via synthetic custom effect
    const attacker = createActivePokemon({ types: ["grass"], nickname: "Torterra" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(INGRRAIN, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(INGRRAIN);
  });

  it(`given synthetic custom-effect ${AQUA_RING} move, when used, then selfVolatileInflicted = ${AQUA_RING}`, () => {
    // Covers handleCustomEffect case 'aqua-ring' via synthetic custom effect
    const attacker = createActivePokemon({ types: ["water"], nickname: "Vaporeon" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(AQUA_RING, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(AQUA_RING);
  });

  it("given synthetic custom-effect refresh move and poisoned Pokemon, when used, then statusCuredOnly set", () => {
    // Covers handleCustomEffect case 'refresh' (line 608) via synthetic custom effect
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      status: POISON,
      nickname: "Chansey",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(REFRESH, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result.messages).toEqual(["Chansey cured its status condition!"]);
  });

  it("given synthetic custom-effect refresh move and healthy Pokemon, when used, then no effect", () => {
    // Covers handleCustomEffect case 'refresh' false-branch (attacker.pokemon.status is null)
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] }); // no status
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(REFRESH, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusCuredOnly).toBeUndefined();
    expect(result.messages).toEqual([]);
  });

  it("given synthetic custom-effect baton-pass move, when used, then switchOut = true", () => {
    // Covers handleCustomEffect case 'baton-pass' (line 463) via synthetic custom effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createCanonicalMove(BATON_PASS, {
      effect: { type: MOVE_EFFECT_CUSTOM } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

// ─── handleNullEffectMoves — haze case ──────────────────────────────────────

describe("Gen 4 executeMoveEffect — handleNullEffectMoves haze", () => {
  it("given Haze (null-effect route) used, when executeMoveEffect called, then statStagesReset = both", () => {
    // Source: Showdown Gen 4 — Haze resets all stat changes for both sides
    // Haze has null effect in Gen 4 data, routed through handleNullEffectMoves
    const attacker = createActivePokemon({ types: [POISON] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(HAZE);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statStagesReset).toEqual({ target: "both" });
  });
});

// ─── handleNullEffectMoves — safeguard / lucky-chant / ingrain / aqua-ring / refresh ─

describe("Gen 4 executeMoveEffect — handleNullEffectMoves null-effect moves", () => {
  it("given Safeguard (null effect), when executeMoveEffect called, then screenSet = safeguard 5 turns", () => {
    // Covers handleNullEffectMoves case 'safeguard' (line 576)
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Blissey" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(SAFEGUARD);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({ screen: SAFEGUARD, turnsLeft: 5, side: "attacker" });
  });

  it("given Lucky Chant (null effect), when executeMoveEffect called, then screenSet = lucky-chant 5 turns", () => {
    // Covers handleNullEffectMoves case 'lucky-chant' (line 584)
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], nickname: "Clefable" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(LUCKY_CHANT);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screenSet).toEqual({
      screen: LUCKY_CHANT,
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it(`given ${INGRRAIN} (null effect), when executeMoveEffect called, then selfVolatileInflicted = ${INGRRAIN}`, () => {
    // Covers handleNullEffectMoves case 'ingrain' (line 592)
    const attacker = createActivePokemon({ types: ["grass"], nickname: "Torterra" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(INGRRAIN);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(INGRRAIN);
  });

  it(`given ${AQUA_RING} (null effect), when executeMoveEffect called, then selfVolatileInflicted = ${AQUA_RING}`, () => {
    // Covers handleNullEffectMoves case 'aqua-ring' (line 600)
    const attacker = createActivePokemon({ types: ["water"], nickname: "Vaporeon" });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(AQUA_RING);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(AQUA_RING);
  });
});

// ─── handleNullEffectMoves — rest with calculatedStats fallback ──────────────

describe("Gen 4 executeMoveEffect — Rest in handleNullEffectMoves (calculatedStats fallback)", () => {
  it("given Rest (null effect) used and no calculatedStats, when executeMoveEffect called, then uses currentHp as maxHp", () => {
    // Source: Showdown Gen 4 — Rest heals fully; maxHp = calculatedStats?.hp ?? currentHp
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 734) in handleNullEffectMoves rest case
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      currentHp: 80,
      maxHp: 200,
      nickname: "Snorlax",
    });
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(REST);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 80 (not 200, since calculatedStats is null)
    expect(result.healAmount).toBe(80);
    expect(result.selfStatusInflicted).toBe(SLEEP);
  });
});

// ─── executeGen4MoveEffect — Roost with no calculatedStats (main entry fallback) ─

describe("Gen 4 executeMoveEffect — Roost main-entry-point with no calculatedStats", () => {
  it("given Roost used and Pokemon has no calculatedStats, when executeMoveEffect called, then uses currentHp as maxHp fallback", () => {
    // Source: Showdown Gen 4 — Roost heals max HP; maxHp = calculatedStats?.hp ?? currentHp
    // Covers the '?? attacker.pokemon.currentHp' fallback (line 886) in executeGen4MoveEffect
    const attacker = createActivePokemon({
      types: ["flying"],
      currentHp: 100,
      maxHp: 300,
      nickname: "Pidgeot",
    });
    (attacker.pokemon as { calculatedStats: null }).calculatedStats = null;
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(ROOST);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHp fallback = currentHp = 100; floor(100 * 0.5) = 50
    expect(result.healAmount).toBe(50);
    // Flying type should be removed
    expect(result.typeChange).toEqual({ target: "attacker", types: [CORE_TYPE_IDS.normal] });
  });
});

// ─── executeGen4MoveEffect — Knock Off defender with no nickname (fallback name) ─

describe("Gen 4 executeMoveEffect — Knock Off defender with no nickname", () => {
  it("given Knock Off vs defender with no nickname and an item, when executeMoveEffect called, then uses fallback name in message", () => {
    // Source: Showdown Gen 4 — Knock Off message uses pokemon nickname ?? 'The foe'
    // Covers the defenderName fallback (line 911) in executeGen4MoveEffect
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: LEFTOVERS,
      nickname: null, // no nickname — triggers fallback
    });
    const move = dataManager.getMove(KNOCK_OFF);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("The foe lost its leftovers!");
  });
});

// ─── applyMoveEffect — weather effect.turns fallback ────────────────────────

describe("Gen 4 executeMoveEffect — weather effect with no turns field (default 5)", () => {
  it("given a synthetic weather move with no turns field and no rock item, when used, then weatherSet turns = 5 (default)", () => {
    // Source: Showdown Gen 4 — weather effect uses effect.turns ?? 5 as fallback
    // Covers the 'effect.turns ?? 5' branch (line 309) in applyMoveEffect weather case
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fire] }); // no rock item
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    // Synthetic weather move with no 'turns' field defined
    const move = createSyntheticMove("sunny-day-noturn", {
      effect: {
        type: "weather",
        weather: SUN,
        // No 'turns' field — forces '?? 5' fallback
      } as unknown as typeof move.effect,
    });
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // No Heat Rock + no turns field → fallback to 5
    expect(result.weatherSet).toEqual({ weather: SUN, turns: 5, source: "sunny-day-noturn" });
  });
});

// ─── Roost (non-Flying type) ───────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Roost on non-Flying type", () => {
  it("given Roost used by pure Normal type, when executeMoveEffect called, then heals 50% but no type change", () => {
    // Source: Showdown Gen 4 — Roost only removes Flying type if the user IS Flying-type
    // Source: Bulbapedia — Roost: if the user is not Flying-type, no type change occurs
    // A Normal-type using Roost still heals but has no type change
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      maxHp: 200,
      currentHp: 100,
      nickname: "Snorlax",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(ROOST);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Heals 50% of max HP = floor(200 * 0.5) = 100
    expect(result.healAmount).toBe(100);
    // No type change since not Flying-type
    expect(result.typeChange).toBeUndefined();
    expect(result.messages).toContain("Snorlax landed and recovered health!");
  });

  it("given Roost used by Fire/Flying type, when executeMoveEffect called, then heals and removes Flying type", () => {
    // Source: Showdown Gen 4 — Roost removes Flying type, leaves Fire
    // Source: Bulbapedia — Roost: dual-typed Flying Pokemon loses Flying for the turn
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
      maxHp: 300,
      currentHp: 150,
      nickname: "Charizard",
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(ROOST);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Heals 50% of max HP = floor(300 * 0.5) = 150
    expect(result.healAmount).toBe(150);
    // Flying removed, Fire remains
    expect(result.typeChange).toEqual({
      target: "attacker",
      types: [CORE_TYPE_IDS.fire],
    });
  });
});
