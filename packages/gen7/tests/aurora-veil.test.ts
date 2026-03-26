import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import {
  AURORA_VEIL_DEFAULT_TURNS,
  AURORA_VEIL_LIGHT_CLAY_TURNS,
  createGen7DataManager,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  Gen7Ruleset,
  handleAuroraVeil,
} from "@pokemon-lib-ts/gen7";
import { describe, expect, it } from "vitest";

const dataManager = createGen7DataManager();
const AURORA_VEIL_MOVE = dataManager.getMove(GEN7_MOVE_IDS.auroraVeil);
const HARDY_NATURE = dataManager.getNature(GEN7_NATURE_IDS.hardy).id;
const NINETALES = dataManager.getSpecies(GEN7_SPECIES_IDS.ninetales);
const DEFAULT_ABILITY = NINETALES.abilities.normal[0] ?? CORE_ABILITY_IDS.none;

/**
 * Gen 7 Aurora Veil Tests
 *
 * Verifies the gen-specific overrides already implemented in Gen7MoveEffects.
 */

function createOnFieldPokemon(
  overrides: {
    maxHp?: number;
    types?: PokemonType[];
    ability?: string;
    nickname?: string;
    heldItem?: string | null;
    volatiles?: Map<string, { turnsLeft: number }>;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: NINETALES.id,
      nickname: overrides.nickname ?? "TestMon",
      level: 50,
      experience: 0,
      nature: HARDY_NATURE,
      ivs: createIvs({ hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 }),
      evs: createEvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
      currentHp: maxHp,
      moves: [
        {
          moveId: AURORA_VEIL_MOVE.id,
          pp: AURORA_VEIL_MOVE.pp,
          maxPp: AURORA_VEIL_MOVE.pp,
        },
      ],
      ability: overrides.ability ?? DEFAULT_ABILITY,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: { hp: maxHp },
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
    volatileStatuses:
      (overrides.volatiles as Map<VolatileStatus, { turnsLeft: number }>) ?? new Map(),
    turnsOnField: 0,
    consecutiveProtects: 0,
    types: overrides.types ?? [...NINETALES.types],
    ability: overrides.ability ?? DEFAULT_ABILITY,
  } as ActivePokemon;
}

function createBattleSide(
  active: ActivePokemon,
  index: 0 | 1 = 0,
  screens: Array<{ type: string; turnsLeft: number }> = [],
): BattleSide {
  return {
    index,
    active: [active],
    hazards: [],
    screens,
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as BattleSide;
}

function createBattleState(
  weatherType: string | null,
  attacker: ActivePokemon,
  defender: ActivePokemon,
  attackerScreens: Array<{ type: string; turnsLeft: number }> = [],
): BattleState {
  return {
    weather: weatherType ? { type: weatherType, turnsLeft: 5, source: DEFAULT_ABILITY } : null,
    sides: [createBattleSide(attacker, 0, attackerScreens), createBattleSide(defender, 1)],
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    terrain: null,
  } as BattleState;
}

function createAuroraVeilContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  state: BattleState,
): MoveEffectContext {
  return {
    attacker,
    defender,
    move: AURORA_VEIL_MOVE,
    damage: 0,
    state,
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

function createSyntheticScreenState(turnsLeft: number): Array<{ type: string; turnsLeft: number }> {
  // Synthetic probe: this test needs an already-active Aurora Veil screen to
  // prove the re-use failure branch, and that state is not owned data.
  return [{ type: AURORA_VEIL_MOVE.id, turnsLeft }];
}

describe("Gen7 Aurora Veil", () => {
  it("given Hail is not active, when Aurora Veil used, then it fails", () => {
    // Source: Showdown data/moves.ts -- onTry: source.effectiveWeather() === 'hail'
    const attacker = createOnFieldPokemon({ nickname: "TestMon" });
    const defender = createOnFieldPokemon({ nickname: "Snorlax", types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(null, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given sun is active, when Aurora Veil used, then it fails", () => {
    const attacker = createOnFieldPokemon({ nickname: "TestMon" });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(CORE_WEATHER_IDS.sun, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given rain is active, when Aurora Veil used, then it fails", () => {
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({});
    const state = createBattleState(CORE_WEATHER_IDS.rain, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given sandstorm is active, when Aurora Veil used, then it fails", () => {
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({});
    const state = createBattleState(CORE_WEATHER_IDS.sand, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given Hail is active, when Aurora Veil used, then sets screen on attacker's side for 5 turns", () => {
    const attacker = createOnFieldPokemon({ nickname: "TestMon" });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(CORE_WEATHER_IDS.hail, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toEqual({
      screen: AURORA_VEIL_MOVE.id,
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it("given Hail is active and attacker holds Light Clay, when Aurora Veil used, then lasts 8 turns", () => {
    const attacker = createOnFieldPokemon({
      nickname: "TestMon",
      heldItem: GEN7_ITEM_IDS.lightClay,
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(CORE_WEATHER_IDS.hail, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toEqual({
      screen: AURORA_VEIL_MOVE.id,
      turnsLeft: 8,
      side: "attacker",
    });
  });

  it("given Aurora Veil already active on attacker's side, when Aurora Veil used again, then fails", () => {
    const attacker = createOnFieldPokemon({ nickname: "TestMon" });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(
      CORE_WEATHER_IDS.hail,
      attacker,
      defender,
      createSyntheticScreenState(3),
    );
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given Aurora Veil succeeds, when message checked, then contains descriptive text", () => {
    const attacker = createOnFieldPokemon({ nickname: "TestMon" });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(CORE_WEATHER_IDS.hail, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("Aurora Veil");
    expect(result.messages[0]).toContain("TestMon");
  });
});

describe("Gen7 Aurora Veil constants", () => {
  it("given the aurora veil default turns constant, when checked, then equals 5", () => {
    // Source: Showdown data/moves.ts -- auroraveil: duration: 5
    expect(AURORA_VEIL_DEFAULT_TURNS).toBe(5);
  });

  it("given the Light Clay turns constant, when checked, then equals 8", () => {
    // Source: Showdown data/items.ts -- lightclay: extends screens by 3 turns (5+3=8)
    expect(AURORA_VEIL_LIGHT_CLAY_TURNS).toBe(8);
  });
});

describe("Gen7 Ruleset executeMoveEffect - Aurora Veil", () => {
  it("given Hail active, when Gen7Ruleset.executeMoveEffect called with aurora-veil, then returns screen set", () => {
    const ruleset = new Gen7Ruleset();
    const attacker = createOnFieldPokemon({ nickname: "TestMon" });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(CORE_WEATHER_IDS.hail, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = ruleset.executeMoveEffect(ctx);
    expect(result.screenSet).toEqual({
      screen: AURORA_VEIL_MOVE.id,
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it("given no Hail, when Gen7Ruleset.executeMoveEffect called with aurora-veil, then fails", () => {
    const ruleset = new Gen7Ruleset();
    const attacker = createOnFieldPokemon({ nickname: "TestMon" });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const state = createBattleState(null, attacker, defender);
    const ctx = createAuroraVeilContext(attacker, defender, state);

    const result = ruleset.executeMoveEffect(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});
