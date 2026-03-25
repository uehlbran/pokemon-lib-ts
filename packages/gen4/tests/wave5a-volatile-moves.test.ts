import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";

/**
 * Gen 4 Wave 5A — Volatile/Status Move Effects Tests
 *
 * Tests for Yawn, Encore, Heal Block, Embargo, Worry Seed, and Gastro Acid.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia — individual move/ability pages
 */

// ---------------------------------------------------------------------------
// Test helpers (same pattern as move-effects.test.ts)
// ---------------------------------------------------------------------------

const gen4Data = createGen4DataManager();
let nextUid = 0;
const TYPES = CORE_TYPE_IDS;
const STATUSES = CORE_STATUS_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN4_NATURE_IDS.hardy;
const DEFAULT_TACKLE = gen4Data.getMove(GEN4_MOVE_IDS.tackle);
const DEFAULT_EMBER = gen4Data.getMove(GEN4_MOVE_IDS.ember);

const TEST_IDS = {
  abilities: {
    chlorophyll: GEN4_ABILITY_IDS.chlorophyll,
    insomnia: GEN4_ABILITY_IDS.insomnia,
    intimidate: GEN4_ABILITY_IDS.intimidate,
    multitype: GEN4_ABILITY_IDS.multitype,
    synchronize: GEN4_ABILITY_IDS.synchronize,
    truant: GEN4_ABILITY_IDS.truant,
    vitalSpirit: GEN4_ABILITY_IDS.vitalSpirit,
    levitate: GEN4_ABILITY_IDS.levitate,
  },
  items: {
    sitrusBerry: GEN4_ITEM_IDS.sitrusBerry,
  },
  moves: {
    embargo: GEN4_MOVE_IDS.embargo,
    encore: GEN4_MOVE_IDS.encore,
    ember: GEN4_MOVE_IDS.ember,
    gastroAcid: GEN4_MOVE_IDS.gastroAcid,
    healBlock: GEN4_MOVE_IDS.healBlock,
    recover: GEN4_MOVE_IDS.recover,
    roost: GEN4_MOVE_IDS.roost,
    tackle: GEN4_MOVE_IDS.tackle,
    worrySeed: GEN4_MOVE_IDS.worrySeed,
    yawn: GEN4_MOVE_IDS.yawn,
  },
  volatiles: {
    embargo: CORE_VOLATILE_IDS.embargo,
    encore: CORE_VOLATILE_IDS.encore,
    healBlock: CORE_VOLATILE_IDS.healBlock,
    sleepCounter: CORE_VOLATILE_IDS.sleepCounter,
    yawn: CORE_VOLATILE_IDS.yawn,
  },
} as const;

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
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
  maxHp?: number;
  level?: number;
  ability?: string;
  lastMoveUsed?: string | null;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: `wave5a-${++nextUid}`,
    speciesId: GEN4_SPECIES_IDS.bulbasaur,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: opts.moves ?? [
      {
        moveId: TEST_IDS.moves.tackle,
        currentPP: DEFAULT_TACKLE?.pp ?? 35,
        maxPP: DEFAULT_TACKLE?.pp ?? 35,
      },
      {
        moveId: TEST_IDS.moves.ember,
        currentPP: DEFAULT_EMBER?.pp ?? 25,
        maxPP: DEFAULT_EMBER?.pp ?? 25,
      },
    ],
    ability: opts.ability ?? "",
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
    pokeball: GEN4_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  const volatiles =
    opts.volatiles ?? new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: volatiles,
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: opts.lastMoveUsed ?? null,
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

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  const baseMove = gen4Data.getMove(id);
  return {
    id,
    name: baseMove?.displayName ?? id,
    type: baseMove?.type ?? TYPES.normal,
    category: baseMove?.category ?? "status",
    power: baseMove?.power ?? 0,
    accuracy: baseMove?.accuracy ?? 100,
    pp: baseMove?.pp ?? 10,
    maxPp: baseMove?.pp ?? 10,
    priority: baseMove?.priority ?? 0,
    target: "adjacent-foe",
    flags: [],
    effect: null,
    critRatio: 0,
    generation: 4,
    isContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
    description: "",
    ...overrides,
  } as MoveData;
}

function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
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
  rng: ReturnType<typeof createMockRng>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender);
  return { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;
}

// ===========================================================================
// Yawn
// ===========================================================================

describe("Yawn", () => {
  it("given attacker uses Yawn on healthy target, when executed, then target gets yawn volatile with turnsLeft=1 and drowsy message", () => {
    // Source: Bulbapedia — Yawn: "causes drowsiness; the target falls asleep at the end of the next turn"
    // Source: Showdown Gen 4 mod — Yawn sets a 1-turn drowsy volatile
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({ types: [TYPES.normal], nickname: "Snorlax" });
    const move = createMove(TEST_IDS.moves.yawn);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: TEST_IDS.volatiles.yawn,
      volatileData: { turnsLeft: 1 },
      messages: ["Snorlax grew drowsy!"],
    });
  });

  it("given target is already asleep, when Yawn is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Yawn fails if target already has a primary status
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({ types: [TYPES.normal], status: STATUSES.sleep });
    const move = createMove(TEST_IDS.moves.yawn);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given target has paralysis, when Yawn is used, then it fails because target already has a status", () => {
    // Source: Showdown Gen 4 mod — Yawn fails if target has any primary status
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({ types: [TYPES.electric], status: STATUSES.paralysis });
    const move = createMove(TEST_IDS.moves.yawn);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given target already has yawn volatile, when Yawn is used again, then it fails", () => {
    // Source: Showdown Gen 4 mod — Yawn fails if target already drowsy
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(TEST_IDS.volatiles.yawn, { turnsLeft: 1 });
    const defender = createActivePokemon({ types: [TYPES.normal], volatiles });
    const move = createMove(TEST_IDS.moves.yawn);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given target has Insomnia, when Yawn is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Yawn blocked by sleep-preventing abilities
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      ability: TEST_IDS.abilities.insomnia,
    });
    const move = createMove(TEST_IDS.moves.yawn);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given target has Vital Spirit, when Yawn is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Vital Spirit blocks Yawn
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      ability: TEST_IDS.abilities.vitalSpirit,
    });
    const move = createMove(TEST_IDS.moves.yawn);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
    expect(defender.ability).toBe(TEST_IDS.abilities.vitalSpirit);
    expect(defender.volatileStatuses.has(TEST_IDS.volatiles.yawn)).toBe(false);
  });
});

// ===========================================================================
// Encore
// ===========================================================================

describe("Encore", () => {
  it("given target used Tackle last turn, when Encore is used, then target gets encore volatile with moveId=tackle", () => {
    // Source: Showdown Gen 4 mod — Encore locks target into last move used
    // Source: Bulbapedia — Encore: "forces the target to repeat its last used move"
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      nickname: "Rattata",
      lastMoveUsed: TEST_IDS.moves.tackle,
    });
    const move = createMove(TEST_IDS.moves.encore);
    const rng = createMockRng(5); // rng.int(4,8) will return 5
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: TEST_IDS.volatiles.encore,
      volatileData: { turnsLeft: 5, data: { moveId: TEST_IDS.moves.tackle } },
      messages: ["Rattata got an encore!"],
    });
  });

  it("given target has no last move, when Encore is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Encore fails if target hasn't used a move
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      lastMoveUsed: null,
    });
    const move = createMove(TEST_IDS.moves.encore);
    const rng = createMockRng(5);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given target already has encore volatile, when Encore is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — cannot Encore a Pokemon that is already Encored
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(TEST_IDS.volatiles.encore, {
      turnsLeft: 3,
      data: { moveId: TEST_IDS.moves.tackle },
    });
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      lastMoveUsed: TEST_IDS.moves.tackle,
      volatiles,
    });
    const move = createMove(TEST_IDS.moves.encore);
    const rng = createMockRng(5);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given target used Ember last turn, when Encore is used with rng returning 8, then turnsLeft is 8", () => {
    // Source: Showdown Gen 4 mod — Encore duration range is 4-8 turns
    const attacker = createActivePokemon({ types: [TYPES.normal] });
    const defender = createActivePokemon({
      types: [TYPES.fire],
      nickname: "Charmander",
      lastMoveUsed: TEST_IDS.moves.ember,
    });
    const move = createMove(TEST_IDS.moves.encore);
    const rng = createMockRng(8);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: TEST_IDS.volatiles.encore,
      volatileData: { turnsLeft: 8, data: { moveId: TEST_IDS.moves.ember } },
    });
  });
});

// ===========================================================================
// Heal Block
// ===========================================================================

describe("Heal Block", () => {
  it("given target without heal-block, when Heal Block is used, then target gets heal-block volatile for 5 turns", () => {
    // Source: Bulbapedia — Heal Block prevents HP recovery for 5 turns
    // Source: Showdown Gen 4 mod — Heal Block lasts 5 turns
    const attacker = createActivePokemon({ types: [TYPES.psychic] });
    const defender = createActivePokemon({ types: [TYPES.normal], nickname: "Blissey" });
    const move = createMove(TEST_IDS.moves.healBlock);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: TEST_IDS.volatiles.healBlock,
      volatileData: { turnsLeft: 5 },
      messages: ["Blissey was prevented from healing!"],
    });
  });

  it("given target already has heal-block, when Heal Block is used again, then it fails", () => {
    // Source: Showdown Gen 4 mod — cannot stack Heal Block
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(TEST_IDS.volatiles.healBlock, { turnsLeft: 3 });
    const attacker = createActivePokemon({ types: [TYPES.psychic] });
    const defender = createActivePokemon({ types: [TYPES.normal], volatiles });
    const move = createMove(TEST_IDS.moves.healBlock);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given attacker has heal-block, when Recover is used (via data-driven heal effect), then healAmount is 0", () => {
    // Source: Showdown Gen 4 mod — heal-block volatile gates all healing
    // Source: Bulbapedia — Heal Block: "prevents the target from recovering HP"
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(TEST_IDS.volatiles.healBlock, { turnsLeft: 3 });
    const attacker = createActivePokemon({
      types: [TYPES.normal],
      currentHp: 50,
      maxHp: 200,
      volatiles,
    });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = createMove(TEST_IDS.moves.recover, {
      category: "status",
      effect: { type: "heal", amount: 0.5 } as any,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      healAmount: 0,
      messages: ["The Pokemon is blocked from healing!"],
    });
  });

  it("given attacker has heal-block, when Roost is used, then healAmount is 0", () => {
    // Source: Showdown Gen 4 mod — Roost blocked by Heal Block
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(TEST_IDS.volatiles.healBlock, { turnsLeft: 3 });
    const attacker = createActivePokemon({
      types: [TYPES.normal, TYPES.flying],
      currentHp: 50,
      maxHp: 200,
      volatiles,
    });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = createMove(TEST_IDS.moves.roost, {
      effect: { type: "heal", amount: 0.5 } as any,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      healAmount: 0,
      messages: ["The Pokemon is blocked from healing!"],
    });
  });

  it("given attacker without heal-block, when Recover is used, then healAmount is 100 (50% of 200)", () => {
    // Source: Showdown Gen 4 — Recover heals 50% of max HP
    // Derivation: floor(200 * 0.5) = 100
    const attacker = createActivePokemon({
      types: [TYPES.normal],
      currentHp: 50,
      maxHp: 200,
    });
    const defender = createActivePokemon({ types: [TYPES.normal] });
    const move = createMove(TEST_IDS.moves.recover, {
      category: "status",
      effect: { type: "heal", amount: 0.5 } as any,
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      healAmount: 100,
      messages: [],
    });
  });
});

// ===========================================================================
// Embargo
// ===========================================================================

describe("Embargo", () => {
  it("given target without embargo, when Embargo is used, then target gets embargo volatile for 5 turns", () => {
    // Source: Bulbapedia — Embargo prevents use of held items for 5 turns
    // Source: Showdown Gen 4 mod — Embargo lasts 5 turns
    const attacker = createActivePokemon({ types: [TYPES.dark] });
    const defender = createActivePokemon({ types: [TYPES.normal], nickname: "Chansey" });
    const move = createMove(TEST_IDS.moves.embargo);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: TEST_IDS.volatiles.embargo,
      volatileData: { turnsLeft: 5 },
      messages: ["Chansey can't use items!"],
    });
  });

  it("given target already has embargo, when Embargo is used again, then it fails", () => {
    // Source: Showdown Gen 4 mod — cannot stack Embargo
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(TEST_IDS.volatiles.embargo, { turnsLeft: 3 });
    const attacker = createActivePokemon({ types: [TYPES.dark] });
    const defender = createActivePokemon({ types: [TYPES.normal], volatiles });
    const move = createMove(TEST_IDS.moves.embargo);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({
      volatileInflicted: null,
      messages: ["But it failed!"],
    });
  });

  it("given target has embargo volatile and holds Sitrus Berry, when item triggers, then item is blocked", () => {
    // Source: Showdown Gen 4 mod — Embargo blocks held item activation
    // Source: Bulbapedia — Embargo: "prevents the target from using its held item"
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(TEST_IDS.volatiles.embargo, { turnsLeft: 3 });
    const pokemon = createActivePokemon({
      types: [TYPES.normal],
      heldItem: TEST_IDS.items.sitrusBerry,
      currentHp: 50,
      maxHp: 200,
      volatiles,
    });

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state: {} as any,
      rng: createMockRng(0),
    });

    expect(result).toMatchObject({ activated: false });
  });

  it("given target without embargo and holds Sitrus Berry below 50% HP, when item triggers, then item activates", () => {
    // Baseline test: Sitrus Berry works normally without Embargo
    // Source: Bulbapedia — Sitrus Berry heals 1/4 max HP when HP drops to 50% or below
    // Derivation: maxHp=200, 50% = 100, currentHp=90 < 100 -> triggers, heals floor(200/4) = 50
    const pokemon = createActivePokemon({
      types: [TYPES.normal],
      heldItem: TEST_IDS.items.sitrusBerry,
      currentHp: 90,
      maxHp: 200,
    });

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state: {} as any,
      rng: createMockRng(0),
    });

    expect(result).toMatchObject({ activated: true });
  });
});

// ===========================================================================
// Worry Seed
// ===========================================================================

describe("Worry Seed", () => {
  it("given target with Chlorophyll, when Worry Seed is used, then ability becomes insomnia", () => {
    // Source: Bulbapedia — Worry Seed: "Changes the target's Ability to Insomnia"
    const attacker = createActivePokemon({ types: [TYPES.grass] });
    const defender = createActivePokemon({
      types: [TYPES.grass],
      nickname: "Bulbasaur",
      ability: TEST_IDS.abilities.chlorophyll,
    });
    const move = createMove(TEST_IDS.moves.worrySeed);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe(TEST_IDS.abilities.insomnia);
    expect(result).toMatchObject({
      messages: ["Bulbasaur's ability changed to Insomnia!"],
    });
  });

  it("given target already has Insomnia, when Worry Seed is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Worry Seed fails if target already has Insomnia
    const attacker = createActivePokemon({ types: [TYPES.grass] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      ability: TEST_IDS.abilities.insomnia,
    });
    const move = createMove(TEST_IDS.moves.worrySeed);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({ messages: ["But it failed!"] });
    expect(defender.ability).toBe(TEST_IDS.abilities.insomnia);
  });

  it("given target has Truant, when Worry Seed is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Worry Seed fails vs Truant
    const attacker = createActivePokemon({ types: [TYPES.grass] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      ability: TEST_IDS.abilities.truant,
    });
    const move = createMove(TEST_IDS.moves.worrySeed);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({ messages: ["But it failed!"] });
    expect(defender.ability).toBe(TEST_IDS.abilities.truant);
  });

  it("given target has Multitype (Arceus), when Worry Seed is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Worry Seed fails vs Multitype
    const attacker = createActivePokemon({ types: [TYPES.grass] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      ability: TEST_IDS.abilities.multitype,
    });
    const move = createMove(TEST_IDS.moves.worrySeed);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result).toMatchObject({ messages: ["But it failed!"] });
    expect(defender.ability).toBe(TEST_IDS.abilities.multitype);
  });

  it("given target is asleep with Synchronize, when Worry Seed is used, then ability becomes Insomnia and target wakes up", () => {
    // Source: Showdown Gen 4 mod — Worry Seed cures sleep if new ability blocks it
    // Source: Bulbapedia — Insomnia: "Prevents the Pokemon from falling asleep"
    const attacker = createActivePokemon({ types: [TYPES.grass] });
    const sleepVolatiles = new Map<string, { turnsLeft: number }>();
    sleepVolatiles.set(TEST_IDS.volatiles.sleepCounter, { turnsLeft: 3 });
    const defender = createActivePokemon({
      types: [TYPES.psychic],
      nickname: "Alakazam",
      ability: TEST_IDS.abilities.synchronize,
      status: STATUSES.sleep,
      volatiles: sleepVolatiles,
    });
    const move = createMove(TEST_IDS.moves.worrySeed);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe(TEST_IDS.abilities.insomnia);
    expect(defender.pokemon.status).toBeNull();
    expect(defender.volatileStatuses.has(TEST_IDS.volatiles.sleepCounter)).toBe(false);
    expect(result).toMatchObject({
      messages: ["Alakazam's ability changed to Insomnia and it woke up!"],
    });
  });
});

// ===========================================================================
// Gastro Acid
// ===========================================================================

describe("Gastro Acid", () => {
  it("given target has Intimidate, when Gastro Acid is used, then target ability becomes empty string (suppressed)", () => {
    // Source: Bulbapedia — Gastro Acid: "suppresses the target's ability"
    // Source: Showdown Gen 4 mod — Gastro Acid clears ability
    const attacker = createActivePokemon({ types: [TYPES.poison] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      nickname: "Gyarados",
      ability: TEST_IDS.abilities.intimidate,
    });
    const move = createMove(TEST_IDS.moves.gastroAcid);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("");
    expect(result).toMatchObject({
      messages: ["Gyarados's ability was suppressed!"],
    });
  });

  it("given target has Multitype (Arceus), when Gastro Acid is used, then it fails", () => {
    // Source: Showdown Gen 4 mod — Gastro Acid fails vs Multitype
    const attacker = createActivePokemon({ types: [TYPES.poison] });
    const defender = createActivePokemon({
      types: [TYPES.normal],
      ability: TEST_IDS.abilities.multitype,
    });
    const move = createMove(TEST_IDS.moves.gastroAcid);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe(TEST_IDS.abilities.multitype);
    expect(result).toMatchObject({ messages: ["But it failed!"] });
  });

  it("given target has Levitate, when Gastro Acid is used, then target ability becomes empty string", () => {
    // Source: Showdown Gen 4 mod — Gastro Acid works on any non-Multitype ability
    const attacker = createActivePokemon({ types: [TYPES.poison] });
    const defender = createActivePokemon({
      types: [TYPES.ghost, TYPES.poison],
      nickname: "Gengar",
      ability: TEST_IDS.abilities.levitate,
    });
    const move = createMove(TEST_IDS.moves.gastroAcid);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(defender.ability).toBe("");
    expect(result).toMatchObject({
      messages: ["Gengar's ability was suppressed!"],
    });
  });
});
