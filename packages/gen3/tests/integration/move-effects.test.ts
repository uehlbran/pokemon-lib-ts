import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  NEUTRAL_NATURES,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
  type StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  canInflictGen3Status,
  createGen3DataManager,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "../../src";

/**
 * Gen 3 Move Effects Tests
 *
 * Tests for executeMoveEffect: weather, hazards, status infliction with immunity,
 * stat changes, recoil, drain, heal, protect, rapid spin, knock off, and custom effects.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  level?: number;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: GEN3_SPECIES_IDS.bulbasaur,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: NEUTRAL_NATURES[0],
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? 200,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: GEN3_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: "",
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

function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
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
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
const T = CORE_TYPE_IDS;
const S = CORE_STATUS_IDS;
const V = CORE_VOLATILE_IDS;
const W = CORE_WEATHER_IDS;
const M = GEN3_MOVE_IDS;
const I = GEN3_ITEM_IDS;

describe("Gen 3 executeMoveEffect — Weather", () => {
  it("given a weather-setting move used, when executeMoveEffect called, then weather lasts 5 turns", () => {
    // Source: pret/pokeemerald — Rain Dance sets 5-turn rain
    const attacker = createActivePokemon({ types: [T.water] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.rainDance);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: W.rain, turns: 5, source: M.rainDance });
  });

  it("given a weather-setting move used, when executeMoveEffect called, then weather lasts 5 turns", () => {
    // Source: pret/pokeemerald — Sunny Day sets 5-turn sun
    const attacker = createActivePokemon({ types: [T.fire] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.sunnyDay);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: W.sun, turns: 5, source: M.sunnyDay });
  });

  it("given a weather-setting move used, when executeMoveEffect called, then weather lasts 5 turns", () => {
    // Source: pret/pokeemerald — Sandstorm sets 5-turn sandstorm
    const attacker = createActivePokemon({ types: [T.rock] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.sandstorm);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: W.sand, turns: 5, source: M.sandstorm });
  });

  it("given a weather-setting move used, when executeMoveEffect called, then weather lasts 5 turns", () => {
    // Source: pret/pokeemerald — Hail sets 5-turn hail
    const attacker = createActivePokemon({ types: [T.ice] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.hail);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.weatherSet).toEqual({ weather: W.hail, turns: 5, source: M.hail });
  });
});

describe("Gen 3 executeMoveEffect — Entry Hazards", () => {
  it("given Spikes used, when executeMoveEffect called, then hazardSet targets opponent's side", () => {
    // Source: pret/pokeemerald — Spikes placed on foe's side
    const attacker = createActivePokemon({ types: [T.ground] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.spikes);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.hazardSet).toEqual({ hazard: M.spikes, targetSide: 1 });
  });
});

describe("Gen 3 executeMoveEffect — Rapid Spin", () => {
  it("given Rapid Spin used, when executeMoveEffect called, then clearSideHazards = 'attacker' and volatiles cleared", () => {
    // Source: pret/pokeemerald — Rapid Spin clears Spikes, Leech Seed, and binding
    const attacker = createActivePokemon({ types: [T.normal], nickname: "Forretress" });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.rapidSpin);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.clearSideHazards).toBe("attacker");
    expect(result.volatilesToClear).toEqual([
      { target: "attacker", volatile: V.leechSeed },
      { target: "attacker", volatile: V.bound },
    ]);
    expect(result.messages).toContain("Forretress blew away leech seed and spikes!");
  });
});

describe("Gen 3 executeMoveEffect — Protect/Detect", () => {
  it("given a protection move used, when executeMoveEffect called, then the protection volatile is applied", () => {
    // Source: pret/pokeemerald — Protect sets PROTECTED volatile status
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.protect);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(V.protect);
  });

  it("given the matching protection move used, when executeMoveEffect called, then it applies the same protection volatile as the other move", () => {
    // Source: pret/pokeemerald — Detect has same effect as Protect
    const attacker = createActivePokemon({ types: [T.fighting] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.detect);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(V.protect);
  });
});

describe("Gen 3 executeMoveEffect — Knock Off", () => {
  it("given Knock Off vs Pokemon with item, when executeMoveEffect called, then item is removed", () => {
    // Source: pret/pokeemerald — Knock Off removes defender's held item, no damage boost in Gen 3
    const attacker = createActivePokemon({ types: [T.dark] });
    const defender = createActivePokemon({
      types: [T.normal],
      heldItem: I.leftovers,
      nickname: "Snorlax",
    });
    const move = dataManager.getMove(M.knockOff);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["Snorlax lost its leftovers!"],
    });
  });

  it("given Knock Off vs Pokemon with no item, when executeMoveEffect called, then no effect", () => {
    // Source: pret/pokeemerald — Knock Off has no secondary effect if target has no item
    const attacker = createActivePokemon({ types: [T.dark] });
    const defender = createActivePokemon({ types: [T.normal], heldItem: null });
    const move = dataManager.getMove(M.knockOff);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 20, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });
});

describe("Gen 3 executeMoveEffect — Status Infliction", () => {
  it("given a secondary status chance succeeds, when executeMoveEffect called, then the burn status is inflicted", () => {
    // Source: pret/pokeemerald — Flamethrower has 10% secondary burn chance
    // 10% → effectChance = floor(10 * 255 / 100) = 25
    // rng.int(0,255) returns 0 → 0 < 25 → success
    const attacker = createActivePokemon({ types: [T.fire] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.flamethrower);
    const rng = createMockRng(0); // intReturn=0, always succeeds the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: S.burn,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });

  it("given Flamethrower burn chance fails, when executeMoveEffect called, then no status is inflicted", () => {
    // 10% → effectChance = 25; rng.int(0,255) returns 200 → 200 < 25 = false → miss
    const attacker = createActivePokemon({ types: [T.fire] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.flamethrower);
    const rng = createMockRng(200); // intReturn=200, fails the roll
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });

  it("given a Fire-type defender, when Flamethrower burn chance succeeds, then the burn is blocked by type immunity", () => {
    // Source: pret/pokeemerald — Fire types are immune to burn
    const attacker = createActivePokemon({ types: [T.fire] });
    const defender = createActivePokemon({ types: [T.fire] });
    const move = dataManager.getMove(M.flamethrower);
    const rng = createMockRng(0); // Roll succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });

  it("given an Electric-type defender, when Thunderbolt paralysis chance succeeds, then paralysis is inflicted", () => {
    // Source: pret/pokeemerald src/battle_util.c — CanBeStatusd has no Electric-type paralysis check.
    // Electric-type paralysis immunity was introduced in Gen 6.
    // Source: Bulbapedia — "In Generation VI onward, Electric-type Pokemon are immune to paralysis."
    const attacker = createActivePokemon({ types: [T.electric] });
    const defender = createActivePokemon({ types: [T.electric] });
    const move = dataManager.getMove(M.thunderbolt);
    const rng = createMockRng(0); // Roll succeeds
    const context = createContext(attacker, defender, move, 80, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: S.paralysis,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });

  it("given Toxic used on a non-immune target, when executeMoveEffect called, then badly-poisoned is inflicted", () => {
    // Source: pret/pokeemerald — Toxic is guaranteed badly-poisoned
    const attacker = createActivePokemon({ types: [T.poison] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.toxic);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: S.badlyPoisoned,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });

  it("given Toxic used on a Steel-type, when executeMoveEffect called, then the status is blocked by type immunity", () => {
    // Source: pret/pokeemerald — Steel types are immune to poison
    const attacker = createActivePokemon({ types: [T.poison] });
    const defender = createActivePokemon({ types: [T.steel] });
    const move = dataManager.getMove(M.toxic);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });

  it("given defender already has a status, when a status move is used, then no new status is inflicted", () => {
    // Source: pret/pokeemerald — can't have two primary statuses
    const attacker = createActivePokemon({ types: [T.electric] });
    const defender = createActivePokemon({ types: [T.normal], status: S.burn });
    const move = dataManager.getMove(M.thunderWave);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });
});

describe("Gen 3 executeMoveEffect — Stat Changes", () => {
  it("given Swords Dance used, when executeMoveEffect called, then stat +2 attack for attacker", () => {
    // Source: pret/pokeemerald — Swords Dance raises Attack by 2 stages
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.swordsDance);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([{ target: "attacker", stat: "attack", stages: 2 }]);
  });

  it("given Dragon Dance used, when executeMoveEffect called, then +1 attack and +1 speed for attacker", () => {
    // Source: pret/pokeemerald — Dragon Dance raises Attack and Speed by 1 each
    const attacker = createActivePokemon({ types: [T.dragon] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.dragonDance);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "speed", stages: 1 },
    ]);
  });

  it("given Overheat used, when executeMoveEffect called, then -2 spAttack for attacker", () => {
    // Source: pret/pokeemerald — Overheat lowers SpAtk by 2 stages on the user
    const attacker = createActivePokemon({ types: [T.fire] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.overheat);
    // Overheat has chance: 100 but is a special move (not status)
    // effectChance = floor(100 * 255 / 100) = 255; rng.int(0,255) returns 0 → 0 < 255 → success
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 120, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([{ target: "attacker", stat: "spAttack", stages: -2 }]);
  });

  it("given Shadow Ball (20% SpDef drop), when roll fails, then no stat change applied", () => {
    // Shadow Ball has 20% chance → effectChance = floor(20*255/100) = 51
    // rng.int(0,255) returns 200 → 200 < 51 = false → miss
    const attacker = createActivePokemon({ types: [T.ghost] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.shadowBall);
    const rng = createMockRng(200);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statChanges).toEqual([]);
  });
});

describe("Gen 3 executeMoveEffect — No Secondary Effect", () => {
  it("given Earthquake (no secondary), when executeMoveEffect called, then no effects applied", () => {
    // Source: pret/pokeemerald — Earthquake has no secondary effect
    const attacker = createActivePokemon({ types: [T.ground] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.earthquake);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 100, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
    expect(result.recoilDamage).toBe(0);
    expect(result.healAmount).toBe(0);
  });
});

describe("Gen 3 executeMoveEffect — Recoil and Drain", () => {
  it("given Double-Edge (1/3 recoil), when executeMoveEffect called, then recoilDamage = floor(damage/3)", () => {
    // Source: pret/pokeemerald — Double-Edge has 1/3 recoil of damage dealt
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.doubleEdge);
    const rng = createMockRng(0);
    // 99 damage dealt; recoil = floor(99 * 1/3) = floor(33) = 33
    const context = createContext(attacker, defender, move, 99, rng);

    const result = ruleset.executeMoveEffect(context);

    // Source: floor(99 * 0.333...) = 33
    expect(result.recoilDamage).toBe(33);
  });

  it("given Giga Drain (50% drain), when executeMoveEffect called, then healAmount = floor(damage/2)", () => {
    // Source: pret/pokeemerald — Giga Drain heals 50% of damage dealt
    const attacker = createActivePokemon({ types: [T.grass] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.gigaDrain);
    const rng = createMockRng(0);
    // 60 damage dealt; heal = floor(60 * 0.5) = 30
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    // Source: floor(60 * 0.5) = 30
    expect(result.healAmount).toBe(30);
  });

  it("given Recover used, when executeMoveEffect called, then healAmount = floor(maxHP/2)", () => {
    // Source: pret/pokeemerald — Recover heals 50% of max HP
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.recover);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // maxHP = 200 (from mock), heal = floor(200 * 0.5) = 100
    expect(result.healAmount).toBe(100);
  });
});

describe("Gen 3 executeMoveEffect — Explosion/Self-Destruct", () => {
  it("given Explosion used, when executeMoveEffect called, then selfFaint = true", () => {
    // Source: pret/pokeemerald — Explosion causes user to faint
    const attacker = createActivePokemon({ types: [T.normal], nickname: "Golem" });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.explosion);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 200, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfFaint).toBe(true);
    expect(result.messages).toContain("Golem exploded!");
  });
});

describe("Gen 3 executeMoveEffect — Volatile Status", () => {
  it("given the focus-boosting move used, when executeMoveEffect called, then the focus volatile is applied", () => {
    // Source: pret/pokeemerald — Focus Energy sets focus-energy volatile
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.focusEnergy);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(M.focusEnergy);
  });
});

describe("Gen 3 executeMoveEffect — Baton Pass / Switch Out", () => {
  it("given Baton Pass used, when executeMoveEffect called, then switchOut = true", () => {
    // Source: pret/pokeemerald — Baton Pass switches out user
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.batonPass);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });
});

describe("Gen 3 canInflictGen3Status — Type Immunities", () => {
  it("given Fire-type defender, when checking burn infliction, then returns false", () => {
    // Source: pret/pokeemerald — Fire types are immune to burn
    const defender = createActivePokemon({ types: [T.fire] });
    expect(canInflictGen3Status(S.burn, defender)).toBe(false);
  });

  it("given Normal-type defender, when checking burn infliction, then returns true", () => {
    const defender = createActivePokemon({ types: [T.normal] });
    expect(canInflictGen3Status(S.burn, defender)).toBe(true);
  });

  it("given Ice-type defender, when checking freeze infliction, then returns false", () => {
    // Source: pret/pokeemerald — Ice types are immune to freeze
    const defender = createActivePokemon({ types: [T.ice] });
    expect(canInflictGen3Status(S.freeze, defender)).toBe(false);
  });

  it("given Electric-type defender, when checking paralysis infliction, then returns true (no Electric immunity in Gen 3)", () => {
    // Source: pret/pokeemerald src/battle_util.c — CanBeStatusd has no Electric-type paralysis check
    // Electric-type paralysis immunity was introduced in Gen 6.
    // Source: Bulbapedia — "In Generation VI onward, Electric-type Pokemon are immune to paralysis."
    const target = createActivePokemon({ types: [T.electric] });
    expect(canInflictGen3Status(S.paralysis, target)).toBe(true);
  });

  it("given Poison-type defender, when checking poison infliction, then returns false", () => {
    // Source: pret/pokeemerald — Poison types are immune to poison
    const defender = createActivePokemon({ types: [T.poison] });
    expect(canInflictGen3Status(S.poison, defender)).toBe(false);
  });

  it("given Steel-type defender, when checking badly-poisoned infliction, then returns false", () => {
    // Source: pret/pokeemerald — Steel types are immune to badly-poisoned
    const defender = createActivePokemon({ types: [T.steel] });
    expect(canInflictGen3Status(S.badlyPoisoned, defender)).toBe(false);
  });

  it("given defender already has a status, when checking any status infliction, then returns false", () => {
    const defender = createActivePokemon({ types: [T.normal], status: S.paralysis });
    expect(canInflictGen3Status(S.burn, defender)).toBe(false);
  });

  it("given dual-type Fire/Steel defender, when checking burn, then returns false (Fire immunity)", () => {
    // Source: pret/pokeemerald — any matching type triggers immunity
    const defender = createActivePokemon({ types: [T.fire, T.steel] });
    expect(canInflictGen3Status(S.burn, defender)).toBe(false);
  });
});

describe("Gen 3 executeMoveEffect — Pursuit", () => {
  it("given Pursuit in move-effect dispatch, when executeMoveEffect called, then no secondary effect is applied at this layer", () => {
    const attacker = createActivePokemon({ types: [T.dark] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.pursuit);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 60, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });
});
