import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  DamageContext,
} from "@pokemon-lib-ts/battle";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_SPECIES_IDS,
} from "../src";
import { handleGen8StatAbility } from "../src/Gen8AbilitiesStat";
import { handleGen8SwitchAbility } from "../src/Gen8AbilitiesSwitch";
import { calculateGen8Damage } from "../src/Gen8DamageCalc";
import { getMaxMovePower } from "../src/Gen8MaxMoves";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";
import { GEN8_TEST_VALUES } from "./helpers/reference-data";

const dataManager = createGen8DataManager();
const A = GEN8_ABILITY_IDS;
const I = GEN8_ITEM_IDS;
const M = GEN8_MOVE_IDS;
const S = GEN8_SPECIES_IDS;
const STATUS = CORE_STATUS_IDS;
const TYPE = CORE_TYPE_IDS;
const { battle: BATTLE, pokemon: POKEMON } = GEN8_TEST_VALUES;

/**
 * Targeted branch-coverage tests for Gen 8 Wave 9.
 *
 * Covers previously-uncovered branches in:
 *   1. Gen8MaxMoves.ts -- getMaxMovePower upper power ranges (standard + Poison/Fighting)
 *   2. Gen8AbilitiesSwitch.ts -- Synchronize edge cases + Libero/Protean monotype match
 *   3. Gen8AbilitiesStat.ts -- trigger dispatch edge cases (passive-immunity, unknown, speed-boost)
 *   4. Gen8DamageCalc.ts -- Metronome consecutive boost + Wise Glasses physical no-op
 */

// ---------------------------------------------------------------------------
// Helper factories (duplicated from existing test files to keep self-contained)
// ---------------------------------------------------------------------------

function getMove(moveId: string): MoveData {
  return dataManager.getMove(moveId);
}

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  gender?: "male" | "female" | "genderless";
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: POKEMON.uid,
    speciesId: overrides.speciesId ?? S.bulbasaur,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: POKEMON.nature,
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? POKEMON.ability,
    abilitySlot: POKEMON.abilitySlot as const,
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: 0,
    gender: overrides.gender ?? POKEMON.gender,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: POKEMON.pokeball,
    calculatedStats: {
      hp: maxHp,
      attack: overrides.attack ?? 100,
      defense: overrides.defense ?? 100,
      spAttack: overrides.spAttack ?? 100,
      spDefense: overrides.spDefense ?? 100,
      speed: overrides.speed ?? 100,
    },
  } as PokemonInstance;
}

function makeSwitchActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: string | null;
  heldItem?: string | null;
  substituteHp?: number;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      status: overrides.status,
      heldItem: overrides.heldItem,
    }),
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
    volatileStatuses: new Map(),
    types: overrides.types ?? [POKEMON.defaultType as PokemonType],
    ability: overrides.ability ?? POKEMON.ability,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: overrides.substituteHp ?? 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    forcedMove: null,
  };
}

function makeSide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function makeSwitchBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 8,
    format: BATTLE.singles,
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeSwitchContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeSwitchActivePokemon>;
  move?: MoveData;
  nickname?: string;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
}): AbilityContext {
  const state = makeSwitchBattleState();
  const pokemon = makeSwitchActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    rng: state.rng as any,
    trigger: opts.trigger as any,
    move: opts.move,
  };
}

// -- Damage calc helpers (from damage-calc.test.ts) --

function makeDamageActive(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isDynamaxed?: boolean;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: POKEMON.uid,
      speciesId: S.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: POKEMON.nature,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? POKEMON.ability,
      abilitySlot: POKEMON.abilitySlot as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: POKEMON.gender as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: POKEMON.pokeball,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [POKEMON.defaultType as PokemonType],
    ability: overrides.ability ?? POKEMON.ability,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: overrides.isDynamaxed ?? false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeDamageMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
}): MoveData {
  const baseMove = getMove(overrides.id ?? M.tackle);
  return {
    ...baseMove,
    type: overrides.type ?? baseMove.type,
    category: overrides.category ?? baseMove.category,
    power: overrides.power ?? baseMove.power,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
    effect: overrides.effect ?? baseMove.effect ?? null,
    critRatio: overrides.critRatio ?? baseMove.critRatio ?? 0,
  } as MoveData;
}

function makeDamageState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: BATTLE.singles,
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeDamageActive({}),
    defender: overrides.defender ?? makeDamageActive({}),
    move: overrides.move ?? makeDamageMove({}),
    state: overrides.state ?? makeDamageState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// -- Stat ability helpers (from abilities-stat.test.ts) --

function makeStatActive(overrides: {
  ability?: string;
  currentHp?: number;
  hp?: number;
  types?: PokemonType[];
  nickname?: string | null;
  turnsOnField?: number;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: POKEMON.uid,
      speciesId: S.bulbasaur,
      nickname: overrides.nickname ?? null,
      level: 50,
      experience: 0,
      nature: POKEMON.nature,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? POKEMON.ability,
      abilitySlot: POKEMON.abilitySlot as const,
      heldItem: null,
      status: null as any,
      friendship: 0,
      gender: POKEMON.gender as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: POKEMON.pokeball,
      calculatedStats: { hp, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
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
    volatileStatuses: new Map(),
    types: overrides.types ?? [POKEMON.defaultType as PokemonType],
    ability: overrides.ability ?? POKEMON.ability,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: overrides.turnsOnField ?? 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeStatCtx(overrides: {
  ability: string;
  trigger: string;
  move?: MoveData;
  types?: PokemonType[];
  turnsOnField?: number;
  seed?: number;
}): AbilityContext {
  return {
    pokemon: makeStatActive({
      ability: overrides.ability,
      types: overrides.types,
      turnsOnField: overrides.turnsOnField,
    }),
    opponent: makeStatActive({}),
    state: makeDamageState() as any,
    rng: new SeededRandom(overrides.seed ?? 42),
    trigger: overrides.trigger as any,
    move: overrides.move,
  };
}

const typeChart = GEN8_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// 1. Gen8MaxMoves -- getMaxMovePower coverage for all power ranges
// ===========================================================================

describe("Gen8MaxMoves -- getMaxMovePower standard type table (all ranges)", () => {
  // Source: Showdown data/moves.ts -- maxMove.basePower standard table

  it("given basePower=0 (status move) and normal type, when getMaxMovePower called, then returns 0", () => {
    // Source: Showdown data/moves.ts -- status moves have 0 Max Move power
    expect(getMaxMovePower(0, TYPE.normal)).toBe(0);
  });

  it("given basePower=40 and normal type, when getMaxMovePower called, then returns 90", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 40 -> 90
    expect(getMaxMovePower(40, TYPE.normal)).toBe(90);
  });

  it("given basePower=50 and fire type, when getMaxMovePower called, then returns 100", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 50 -> 100
    expect(getMaxMovePower(50, TYPE.fire)).toBe(100);
  });

  it("given basePower=60 and water type, when getMaxMovePower called, then returns 110", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 60 -> 110
    expect(getMaxMovePower(60, TYPE.water)).toBe(110);
  });

  it("given basePower=70 and normal type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 70 -> 115
    expect(getMaxMovePower(70, TYPE.normal)).toBe(115);
  });

  it("given basePower=65 and electric type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 61-70 -> 115
    expect(getMaxMovePower(65, TYPE.electric)).toBe(115);
  });

  it("given basePower=80 and grass type, when getMaxMovePower called, then returns 120", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 80 -> 120
    expect(getMaxMovePower(80, TYPE.grass)).toBe(120);
  });

  it("given basePower=90 and ice type, when getMaxMovePower called, then returns 125", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 90 -> 125
    expect(getMaxMovePower(90, TYPE.ice)).toBe(125);
  });

  it("given basePower=100 and ground type, when getMaxMovePower called, then returns 130", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 100 -> 130
    expect(getMaxMovePower(100, TYPE.ground)).toBe(130);
  });

  it("given basePower=110 and flying type, when getMaxMovePower called, then returns 135", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 110 -> 135
    expect(getMaxMovePower(110, TYPE.flying)).toBe(135);
  });

  it("given basePower=105 and psychic type, when getMaxMovePower called, then returns 135", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 101-110 -> 135
    expect(getMaxMovePower(105, TYPE.psychic)).toBe(135);
  });

  it("given basePower=120 and bug type, when getMaxMovePower called, then returns 140", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 120 -> 140
    expect(getMaxMovePower(120, TYPE.bug)).toBe(140);
  });

  it("given basePower=130 and rock type, when getMaxMovePower called, then returns 145", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 130 -> 145
    expect(getMaxMovePower(130, TYPE.rock)).toBe(145);
  });

  it("given basePower=125 and ghost type, when getMaxMovePower called, then returns 145", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 121-130 -> 145
    expect(getMaxMovePower(125, TYPE.ghost)).toBe(145);
  });

  it("given basePower=140 and dragon type, when getMaxMovePower called, then returns 150", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 140 -> 150
    expect(getMaxMovePower(140, TYPE.dragon)).toBe(150);
  });

  it("given basePower=135 and dark type, when getMaxMovePower called, then returns 150", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 131-140 -> 150
    expect(getMaxMovePower(135, TYPE.dark)).toBe(150);
  });

  it("given basePower=150 and steel type, when getMaxMovePower called, then returns 150 (cap)", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP >= 141 -> 150
    expect(getMaxMovePower(150, TYPE.steel)).toBe(150);
  });

  it("given basePower=200 and fairy type, when getMaxMovePower called, then returns 150 (cap)", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP >= 141 -> 150
    expect(getMaxMovePower(200, TYPE.fairy)).toBe(150);
  });
});

describe("Gen8MaxMoves -- getMaxMovePower Poison/Fighting table (all ranges)", () => {
  // Source: Showdown data/moves.ts -- maxMove.basePower Poison/Fighting table

  it("given basePower=40 and poison type, when getMaxMovePower called, then returns 70", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 40 -> 70
    expect(getMaxMovePower(40, TYPE.poison)).toBe(70);
  });

  it("given basePower=50 and fighting type, when getMaxMovePower called, then returns 75", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 50 -> 75
    expect(getMaxMovePower(50, TYPE.fighting)).toBe(75);
  });

  it("given basePower=60 and poison type, when getMaxMovePower called, then returns 80", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 60 -> 80
    expect(getMaxMovePower(60, TYPE.poison)).toBe(80);
  });

  it("given basePower=70 and fighting type, when getMaxMovePower called, then returns 85", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 70 -> 85
    expect(getMaxMovePower(70, TYPE.fighting)).toBe(85);
  });

  it("given basePower=80 and poison type, when getMaxMovePower called, then returns 90", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 80 -> 90
    expect(getMaxMovePower(80, TYPE.poison)).toBe(90);
  });

  it("given basePower=90 and fighting type, when getMaxMovePower called, then returns 95", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 90 -> 95
    expect(getMaxMovePower(90, TYPE.fighting)).toBe(95);
  });

  it("given basePower=100 and poison type, when getMaxMovePower called, then returns 100", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 100 -> 100
    expect(getMaxMovePower(100, TYPE.poison)).toBe(100);
  });

  it("given basePower=110 and fighting type, when getMaxMovePower called, then returns 105", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 110 -> 105
    expect(getMaxMovePower(110, TYPE.fighting)).toBe(105);
  });

  it("given basePower=105 and poison type, when getMaxMovePower called, then returns 105", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: 101-110 -> 105
    expect(getMaxMovePower(105, TYPE.poison)).toBe(105);
  });

  it("given basePower=120 and fighting type, when getMaxMovePower called, then returns 110", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 120 -> 110
    expect(getMaxMovePower(120, TYPE.fighting)).toBe(110);
  });

  it("given basePower=130 and poison type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 130 -> 115
    expect(getMaxMovePower(130, TYPE.poison)).toBe(115);
  });

  it("given basePower=125 and fighting type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: 121-130 -> 115
    expect(getMaxMovePower(125, TYPE.fighting)).toBe(115);
  });

  it("given basePower=140 and poison type, when getMaxMovePower called, then returns 120", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 140 -> 120
    expect(getMaxMovePower(140, TYPE.poison)).toBe(120);
  });

  it("given basePower=150 and fighting type, when getMaxMovePower called, then returns 125", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 150 -> 125
    expect(getMaxMovePower(150, TYPE.fighting)).toBe(125);
  });

  it("given basePower=160 and poison type, when getMaxMovePower called, then returns 130 (cap)", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP >= 151 -> 130
    expect(getMaxMovePower(160, TYPE.poison)).toBe(130);
  });

  it("given basePower=250 and fighting type, when getMaxMovePower called, then returns 130 (cap)", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP >= 151 -> 130
    expect(getMaxMovePower(250, TYPE.fighting)).toBe(130);
  });
});

// ===========================================================================
// 2. Gen8AbilitiesSwitch -- Synchronize uncovered branches
// ===========================================================================

describe("Gen8AbilitiesSwitch -- Synchronize uncovered branches", () => {
  // Source: Showdown data/abilities.ts -- Synchronize onAfterSetStatus

  it("given synchronize ability and no opponent, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize needs a target to pass status to
    const ctx = makeSwitchContext({
      ability: A.synchronize,
      trigger: "on-status-inflicted",
      status: STATUS.burn,
      opponent: undefined,
    });
    const result = handleGen8SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and pokemon has no status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize only passes if holder has a status
    const ctx = makeSwitchContext({
      ability: A.synchronize,
      trigger: "on-status-inflicted",
      status: null,
      opponent: makeSwitchActivePokemon({}),
    });
    const result = handleGen8SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and pokemon has sleep status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize only passes burn/paralysis/poison (not sleep/freeze)
    const ctx = makeSwitchContext({
      ability: A.synchronize,
      trigger: "on-status-inflicted",
      status: STATUS.sleep,
      opponent: makeSwitchActivePokemon({}),
    });
    const result = handleGen8SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and pokemon has badly-poisoned status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize does not pass badly-poisoned
    const ctx = makeSwitchContext({
      ability: A.synchronize,
      trigger: "on-status-inflicted",
      status: STATUS.badlyPoisoned,
      opponent: makeSwitchActivePokemon({}),
    });
    const result = handleGen8SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and opponent already has a status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- cannot inflict status on an already-statused target
    const ctx = makeSwitchContext({
      ability: A.synchronize,
      trigger: "on-status-inflicted",
      status: STATUS.burn,
      opponent: makeSwitchActivePokemon({ status: STATUS.paralysis }),
    });
    const result = handleGen8SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and burn status with valid opponent, when on-status-inflicted triggered, then activates and inflicts status", () => {
    // Source: Showdown data/abilities.ts -- Synchronize passes burn/paralysis/poison
    const ctx = makeSwitchContext({
      ability: A.synchronize,
      trigger: "on-status-inflicted",
      status: STATUS.burn,
      opponent: makeSwitchActivePokemon({ status: null }),
    });
    const result = handleGen8SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "status-inflict", target: "opponent", status: STATUS.burn },
    ]);
  });

  it("given non-synchronize ability (e.g. intimidate), when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- only Synchronize handles on-status-inflicted
    const ctx = makeSwitchContext({
      ability: A.intimidate,
      trigger: "on-status-inflicted",
      status: STATUS.burn,
      opponent: makeSwitchActivePokemon({}),
    });
    const result = handleGen8SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// 3. Gen8AbilitiesSwitch -- Libero/Protean type-match no-op
// ===========================================================================

describe("Gen8AbilitiesSwitch -- Libero/Protean type-match no-op", () => {
  // Source: Showdown data/abilities.ts -- Libero/Protean: no type change if already that type

  it("given protean ability and monotype matching move type, when on-before-move triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- protean: onPrepareHit, no-op if already monotype match
    const ctx = makeSwitchContext({
      ability: A.protean,
      trigger: "on-before-move",
      types: [TYPE.fire],
      move: getMove(M.flamethrower),
    });
    const result = handleGen8SwitchAbility("on-before-move", ctx);
    expect(result.activated).toBe(false);
  });

  it("given libero ability and monotype matching move type, when on-before-move triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- libero: identical to protean
    const ctx = makeSwitchContext({
      ability: A.libero,
      trigger: "on-before-move",
      types: [TYPE.water],
      move: getMove(M.surf),
    });
    const result = handleGen8SwitchAbility("on-before-move", ctx);
    expect(result.activated).toBe(false);
  });

  it("given protean ability and dual-type including move type, when on-before-move triggered, then DOES activate (changes to monotype)", () => {
    // Source: Showdown data/abilities.ts -- protean changes to monotype even if one of dual types matches
    // The code checks types.length === 1 && types[0] === moveType, so dual-type always changes
    const ctx = makeSwitchContext({
      ability: A.protean,
      trigger: "on-before-move",
      types: [TYPE.fire, TYPE.flying],
      move: getMove(M.flamethrower),
    });
    const result = handleGen8SwitchAbility("on-before-move", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [TYPE.fire] },
    ]);
  });

  it("given libero ability and different monotype than move type, when on-before-move triggered, then activates", () => {
    // Source: Showdown data/abilities.ts -- libero: changes type to match the move
    const ctx = makeSwitchContext({
      ability: A.libero,
      trigger: "on-before-move",
      types: [TYPE.grass],
      move: getMove(M.thunderbolt),
    });
    const result = handleGen8SwitchAbility("on-before-move", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [TYPE.electric] },
    ]);
  });
});

// ===========================================================================
// 4. Gen8AbilitiesStat -- trigger routing edge cases
// ===========================================================================

describe("Gen8AbilitiesStat -- trigger routing edge cases", () => {
  // Source: Showdown data/abilities.ts -- dispatch logic

  it("given handleGen8StatAbility with passive-immunity trigger, when called, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- passive-immunity is handled by damage ability handler,
    // stat handler just returns INACTIVE for it
    const ctx = makeStatCtx({
      ability: A.levitate,
      trigger: "passive-immunity",
    });
    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given handleGen8StatAbility with unknown trigger, when called, then returns not activated", () => {
    // Source: default case in handleGen8StatAbility dispatch switch
    const ctx = makeStatCtx({
      ability: A.intimidate,
      trigger: "on-unknown-event",
    });
    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given speed-boost ability on first turn (turnsOnField=0), when on-turn-end triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual: only if pokemon has been on
    // the field for at least 1 full turn (turnsOnField > 0)
    const ctx = makeStatCtx({
      ability: A.speedBoost,
      trigger: "on-turn-end",
      turnsOnField: 0,
    });
    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given speed-boost ability after one full turn (turnsOnField=1), when on-turn-end triggered, then activates with +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual: triggers when turnsOnField > 0
    const ctx = makeStatCtx({
      ability: A.speedBoost,
      trigger: "on-turn-end",
      turnsOnField: 1,
    });
    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "stat-change", target: "self", stat: "speed", stages: 1 },
    ]);
  });
});

// ===========================================================================
// 5. Gen8DamageCalc -- Metronome consecutive boost
// ===========================================================================

describe("Gen8DamageCalc -- Metronome consecutive boost", () => {
  // Source: Showdown data/items.ts -- Metronome onModifyDamage: consecutive boost

  it("given metronome holder with count=3, when dealing damage, then boost applies (~1.4x)", () => {
    // Source: Showdown data/items.ts -- Metronome: boostSteps = min(count-1, 5),
    // multiplier = 1 + boostSteps * 0.2 = 1 + 2*0.2 = 1.4
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("metronome-count", { turnsLeft: -1, data: { count: 3 } });

    const attackerWithMetronome = makeDamageActive({
      heldItem: I.metronome,
      volatiles,
      attack: 100,
    });

    const attackerWithout = makeDamageActive({
      heldItem: null,
      attack: 100,
    });

    const defender = makeDamageActive({ defense: 100 });
    const move = makeDamageMove({ id: M.tackle, power: 80, category: "physical" });

    const resultWith = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithMetronome, defender, move, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithout, defender, move, seed: 100 }),
      typeChart,
    );

    // With count=3: boostSteps=2, multiplier=1.4 -> ~40% more damage
    // Exact seeded values (seed=100): with=67, without=48 (ratio ≈ 1.396 due to integer rounding)
    expect(resultWith.damage).toBe(67);
    expect(resultWithout.damage).toBe(48);
  });

  it("given metronome holder with count=1, when dealing damage, then no boost applies (boostSteps=0)", () => {
    // Source: Showdown data/items.ts -- Metronome: boostSteps = min(1-1, 5) = 0, no boost
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("metronome-count", { turnsLeft: -1, data: { count: 1 } });

    const attackerWithMetronome = makeDamageActive({
      heldItem: I.metronome,
      volatiles,
      attack: 100,
    });

    const attackerWithout = makeDamageActive({
      heldItem: null,
      attack: 100,
    });

    const defender = makeDamageActive({ defense: 100 });
    const move = makeDamageMove({ id: M.tackle, power: 80, category: "physical" });

    const resultWith = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithMetronome, defender, move, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithout, defender, move, seed: 100 }),
      typeChart,
    );

    // count=1 means boostSteps=0, so no boost at all -- same damage
    expect(resultWith.damage).toBe(resultWithout.damage);
  });

  it("given metronome holder with count=7, when dealing damage, then boost caps at 5 steps (2.0x)", () => {
    // Source: Showdown data/items.ts -- Metronome: boostSteps = min(7-1, 5) = 5,
    // multiplier = 1 + 5*0.2 = 2.0
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("metronome-count", { turnsLeft: -1, data: { count: 7 } });

    const attackerWithMetronome = makeDamageActive({
      heldItem: I.metronome,
      volatiles,
      attack: 100,
    });

    const attackerWithout = makeDamageActive({
      heldItem: null,
      attack: 100,
    });

    const defender = makeDamageActive({ defense: 100 });
    const move = makeDamageMove({ id: M.tackle, power: 80, category: "physical" });

    const resultWith = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithMetronome, defender, move, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithout, defender, move, seed: 100 }),
      typeChart,
    );

    // count=7: boostSteps=min(6,5)=5, multiplier=1+5*0.2=2.0 -> double damage
    // Exact seeded values (seed=100): with=96, without=48 (ratio = 2.0 exactly)
    expect(resultWith.damage).toBe(96);
    expect(resultWithout.damage).toBe(48);
  });
});

// ===========================================================================
// 6. Gen8DamageCalc -- Wise Glasses physical move no-op
// ===========================================================================

describe("Gen8DamageCalc -- Wise Glasses physical move no-op", () => {
  // Source: Showdown data/items.ts -- Wise Glasses: special move boost only

  it("given wise-glasses holder using physical move, when damage calculated, then no 1.1x boost applies", () => {
    // Source: Showdown data/items.ts -- Wise Glasses: onBasePowerPriority only for special moves
    const attackerWithGlasses = makeDamageActive({
      heldItem: I.wiseGlasses,
      attack: 100,
    });
    const attackerWithout = makeDamageActive({
      heldItem: null,
      attack: 100,
    });

    const defender = makeDamageActive({ defense: 100 });
    const physicalMove = makeDamageMove({
      id: M.tackle,
      power: 80,
      category: "physical",
    });

    const resultWith = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithGlasses, defender, move: physicalMove, seed: 42 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithout, defender, move: physicalMove, seed: 42 }),
      typeChart,
    );

    // Physical move with Wise Glasses should deal the same damage as without
    expect(resultWith.damage).toBe(resultWithout.damage);
  });

  it("given wise-glasses holder using special move, when damage calculated, then 1.1x boost applies", () => {
    // Source: Showdown data/items.ts -- Wise Glasses: 1.1x boost for special moves
    const attackerWithGlasses = makeDamageActive({
      heldItem: I.wiseGlasses,
      spAttack: 100,
    });
    const attackerWithout = makeDamageActive({
      heldItem: null,
      spAttack: 100,
    });

    const defender = makeDamageActive({ spDefense: 100 });
    const specialMove = makeDamageMove({
      id: M.thunderbolt,
      power: 80,
      category: "special",
    });

    const resultWith = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithGlasses, defender, move: specialMove, seed: 42 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      makeDamageContext({ attacker: attackerWithout, defender, move: specialMove, seed: 42 }),
      typeChart,
    );

    // Special move with Wise Glasses should deal more damage (~1.1x)
    // Exact seeded values (seed=42): with=37, without=34 (ratio ≈ 1.088 due to integer rounding)
    expect(resultWith.damage).toBe(37);
    expect(resultWithout.damage).toBe(34);
  });
});
