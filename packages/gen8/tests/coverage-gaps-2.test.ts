import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  DamageContext,
} from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  type Gender,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
  type PrimaryStatus,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src";
import { handleGen8StatAbility } from "../src/Gen8AbilitiesStat";
import { handleGen8SwitchAbility } from "../src/Gen8AbilitiesSwitch";
import { calculateGen8Damage } from "../src/Gen8DamageCalc";
import { getMaxMovePower } from "../src/Gen8MaxMoves";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";
import { GEN8_TEST_VALUES } from "./helpers/reference-data";

const dataManager = createGen8DataManager();
const abilityIds = GEN8_ABILITY_IDS;
const itemIds = GEN8_ITEM_IDS;
const moveIds = GEN8_MOVE_IDS;
const natureIds = GEN8_NATURE_IDS;
const speciesIds = GEN8_SPECIES_IDS;
const statusIds = CORE_STATUS_IDS;
const typeIds = CORE_TYPE_IDS;
const abilityTriggerIds = CORE_ABILITY_TRIGGER_IDS;
const { battle: battleValues } = GEN8_TEST_VALUES;
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const defaultNature = dataManager.getNature(natureIds.hardy).id;
const defaultMove = dataManager.getMove(moveIds.tackle);
const defaultFriendship = createFriendship(0);

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
// Helper factories
// ---------------------------------------------------------------------------

function getCanonicalMove(moveId: string): MoveData {
  return dataManager.getMove(moveId);
}

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData>): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
  };
}

function createCanonicalPokemonInstance(overrides: {
  speciesId?: string;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: PrimaryStatus | null;
  gender?: Gender;
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(8), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    moves: [],
    heldItem: overrides.heldItem ?? null,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    friendship: defaultFriendship,
    gender: overrides.gender ?? CORE_GENDERS.male,
    isShiny: false,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });
  pokemon.uid = "test";
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: overrides.speed ?? 100,
  };
  return pokemon;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: string;
  status?: PrimaryStatus | null;
  heldItem?: string | null;
  substituteHp?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  level?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  turnsOnField?: number;
  isDynamaxed?: boolean;
}): ActivePokemon {
  const hp = overrides.hp ?? overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createCanonicalPokemonInstance({
    speciesId: species.id,
    ability: overrides.ability,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp ?? hp,
    heldItem: overrides.heldItem,
    status: overrides.status,
    attack: overrides.attack,
    defense: overrides.defense,
    spAttack: overrides.spAttack,
    spDefense: overrides.spDefense,
    speed: overrides.speed,
    level: overrides.level,
  });
  const activePokemon = createBattleOnFieldPokemon(pokemon, 0, overrides.types ?? [typeIds.normal]);
  activePokemon.volatileStatuses = overrides.volatiles ?? new Map();
  activePokemon.ability = overrides.ability ?? abilityIds.none;
  activePokemon.turnsOnField = overrides.turnsOnField ?? 0;
  activePokemon.substituteHp = overrides.substituteHp ?? 0;
  activePokemon.isDynamaxed = overrides.isDynamaxed ?? false;
  activePokemon.suppressedAbility = null;
  activePokemon.forcedMove = null;
  return activePokemon;
}

function createBattleSide(index: 0 | 1): BattleSide {
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

function createSwitchBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 8,
    format: battleValues.singles,
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
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

function createSwitchAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ActivePokemon;
  move?: MoveData;
  nickname?: string;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
}): AbilityContext {
  const state = createSwitchBattleState();
  const pokemon = createOnFieldPokemon({
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

function createDamageBattleState(overrides?: {
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
    format: battleValues.singles,
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function createDamageCalcContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createOnFieldPokemon({}),
    defender: overrides.defender ?? createOnFieldPokemon({}),
    move: overrides.move ?? defaultMove,
    state: overrides.state ?? createDamageBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

function createStatAbilityContext(overrides: {
  ability?: string;
  currentHp?: number;
  hp?: number;
  types?: PokemonType[];
  nickname?: string | null;
  turnsOnField?: number;
  trigger: string;
  move?: MoveData;
  seed?: number;
}): AbilityContext {
  return {
    pokemon: createOnFieldPokemon({
      ability: overrides.ability,
      currentHp: overrides.currentHp,
      hp: overrides.hp,
      types: overrides.types,
      nickname: overrides.nickname,
      turnsOnField: overrides.turnsOnField,
    }),
    opponent: createOnFieldPokemon({}),
    state: createDamageBattleState() as any,
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
    expect(getMaxMovePower(0, typeIds.normal)).toBe(0);
  });

  it("given basePower=40 and normal type, when getMaxMovePower called, then returns 90", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 40 -> 90
    expect(getMaxMovePower(40, typeIds.normal)).toBe(90);
  });

  it("given basePower=50 and fire type, when getMaxMovePower called, then returns 100", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 50 -> 100
    expect(getMaxMovePower(50, typeIds.fire)).toBe(100);
  });

  it("given basePower=60 and water type, when getMaxMovePower called, then returns 110", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 60 -> 110
    expect(getMaxMovePower(60, typeIds.water)).toBe(110);
  });

  it("given basePower=70 and normal type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 70 -> 115
    expect(getMaxMovePower(70, typeIds.normal)).toBe(115);
  });

  it("given basePower=65 and electric type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 61-70 -> 115
    expect(getMaxMovePower(65, typeIds.electric)).toBe(115);
  });

  it("given basePower=80 and grass type, when getMaxMovePower called, then returns 120", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 80 -> 120
    expect(getMaxMovePower(80, typeIds.grass)).toBe(120);
  });

  it("given basePower=90 and ice type, when getMaxMovePower called, then returns 125", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 90 -> 125
    expect(getMaxMovePower(90, typeIds.ice)).toBe(125);
  });

  it("given basePower=100 and ground type, when getMaxMovePower called, then returns 130", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 100 -> 130
    expect(getMaxMovePower(100, typeIds.ground)).toBe(130);
  });

  it("given basePower=110 and flying type, when getMaxMovePower called, then returns 135", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 110 -> 135
    expect(getMaxMovePower(110, typeIds.flying)).toBe(135);
  });

  it("given basePower=105 and psychic type, when getMaxMovePower called, then returns 135", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 101-110 -> 135
    expect(getMaxMovePower(105, typeIds.psychic)).toBe(135);
  });

  it("given basePower=120 and bug type, when getMaxMovePower called, then returns 140", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 120 -> 140
    expect(getMaxMovePower(120, typeIds.bug)).toBe(140);
  });

  it("given basePower=130 and rock type, when getMaxMovePower called, then returns 145", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 130 -> 145
    expect(getMaxMovePower(130, typeIds.rock)).toBe(145);
  });

  it("given basePower=125 and ghost type, when getMaxMovePower called, then returns 145", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 121-130 -> 145
    expect(getMaxMovePower(125, typeIds.ghost)).toBe(145);
  });

  it("given basePower=140 and dragon type, when getMaxMovePower called, then returns 150", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP <= 140 -> 150
    expect(getMaxMovePower(140, typeIds.dragon)).toBe(150);
  });

  it("given basePower=135 and dark type, when getMaxMovePower called, then returns 150", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: 131-140 -> 150
    expect(getMaxMovePower(135, typeIds.dark)).toBe(150);
  });

  it("given basePower=150 and steel type, when getMaxMovePower called, then returns 150 (cap)", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP >= 141 -> 150
    expect(getMaxMovePower(150, typeIds.steel)).toBe(150);
  });

  it("given basePower=200 and fairy type, when getMaxMovePower called, then returns 150 (cap)", () => {
    // Source: Showdown data/moves.ts -- maxMove.basePower: BP >= 141 -> 150
    expect(getMaxMovePower(200, typeIds.fairy)).toBe(150);
  });
});

describe("Gen8MaxMoves -- getMaxMovePower Poison/Fighting table (all ranges)", () => {
  // Source: Showdown data/moves.ts -- maxMove.basePower Poison/Fighting table

  it("given basePower=40 and poison type, when getMaxMovePower called, then returns 70", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 40 -> 70
    expect(getMaxMovePower(40, typeIds.poison)).toBe(70);
  });

  it("given basePower=50 and fighting type, when getMaxMovePower called, then returns 75", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 50 -> 75
    expect(getMaxMovePower(50, typeIds.fighting)).toBe(75);
  });

  it("given basePower=60 and poison type, when getMaxMovePower called, then returns 80", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 60 -> 80
    expect(getMaxMovePower(60, typeIds.poison)).toBe(80);
  });

  it("given basePower=70 and fighting type, when getMaxMovePower called, then returns 85", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 70 -> 85
    expect(getMaxMovePower(70, typeIds.fighting)).toBe(85);
  });

  it("given basePower=80 and poison type, when getMaxMovePower called, then returns 90", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 80 -> 90
    expect(getMaxMovePower(80, typeIds.poison)).toBe(90);
  });

  it("given basePower=90 and fighting type, when getMaxMovePower called, then returns 95", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 90 -> 95
    expect(getMaxMovePower(90, typeIds.fighting)).toBe(95);
  });

  it("given basePower=100 and poison type, when getMaxMovePower called, then returns 100", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 100 -> 100
    expect(getMaxMovePower(100, typeIds.poison)).toBe(100);
  });

  it("given basePower=110 and fighting type, when getMaxMovePower called, then returns 105", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 110 -> 105
    expect(getMaxMovePower(110, typeIds.fighting)).toBe(105);
  });

  it("given basePower=105 and poison type, when getMaxMovePower called, then returns 105", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: 101-110 -> 105
    expect(getMaxMovePower(105, typeIds.poison)).toBe(105);
  });

  it("given basePower=120 and fighting type, when getMaxMovePower called, then returns 110", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 120 -> 110
    expect(getMaxMovePower(120, typeIds.fighting)).toBe(110);
  });

  it("given basePower=130 and poison type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 130 -> 115
    expect(getMaxMovePower(130, typeIds.poison)).toBe(115);
  });

  it("given basePower=125 and fighting type, when getMaxMovePower called, then returns 115", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: 121-130 -> 115
    expect(getMaxMovePower(125, typeIds.fighting)).toBe(115);
  });

  it("given basePower=140 and poison type, when getMaxMovePower called, then returns 120", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 140 -> 120
    expect(getMaxMovePower(140, typeIds.poison)).toBe(120);
  });

  it("given basePower=150 and fighting type, when getMaxMovePower called, then returns 125", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP <= 150 -> 125
    expect(getMaxMovePower(150, typeIds.fighting)).toBe(125);
  });

  it("given basePower=160 and poison type, when getMaxMovePower called, then returns 130 (cap)", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP >= 151 -> 130
    expect(getMaxMovePower(160, typeIds.poison)).toBe(130);
  });

  it("given basePower=250 and fighting type, when getMaxMovePower called, then returns 130 (cap)", () => {
    // Source: Showdown data/moves.ts -- Poison/Fighting: BP >= 151 -> 130
    expect(getMaxMovePower(250, typeIds.fighting)).toBe(130);
  });
});

// ===========================================================================
// 2. Gen8AbilitiesSwitch -- Synchronize uncovered branches
// ===========================================================================

describe("Gen8AbilitiesSwitch -- Synchronize uncovered branches", () => {
  // Source: Showdown data/abilities.ts -- Synchronize onAfterSetStatus

  it("given synchronize ability and no opponent, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize needs a target to pass status to
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.synchronize,
      trigger: abilityTriggerIds.onStatusInflicted,
      status: statusIds.burn,
      opponent: undefined,
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and pokemon has no status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize only passes if holder has a status
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.synchronize,
      trigger: abilityTriggerIds.onStatusInflicted,
      status: null,
      opponent: createOnFieldPokemon({}),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and pokemon has sleep status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize only passes burn/paralysis/poison (not sleep/freeze)
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.synchronize,
      trigger: abilityTriggerIds.onStatusInflicted,
      status: statusIds.sleep,
      opponent: createOnFieldPokemon({}),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and pokemon has badly-poisoned status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Synchronize does not pass badly-poisoned
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.synchronize,
      trigger: abilityTriggerIds.onStatusInflicted,
      status: statusIds.badlyPoisoned,
      opponent: createOnFieldPokemon({}),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and opponent already has a status, when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- cannot inflict status on an already-statused target
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.synchronize,
      trigger: abilityTriggerIds.onStatusInflicted,
      status: statusIds.burn,
      opponent: createOnFieldPokemon({ status: statusIds.paralysis }),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });

  it("given synchronize ability and burn status with valid opponent, when on-status-inflicted triggered, then activates and inflicts status", () => {
    // Source: Showdown data/abilities.ts -- Synchronize passes burn/paralysis/poison
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.synchronize,
      trigger: abilityTriggerIds.onStatusInflicted,
      status: statusIds.burn,
      opponent: createOnFieldPokemon({ status: null }),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onStatusInflicted, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "status-inflict", target: "opponent", status: statusIds.burn },
    ]);
  });

  it("given non-synchronize ability (e.g. intimidate), when on-status-inflicted triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- only Synchronize handles on-status-inflicted
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.intimidate,
      trigger: abilityTriggerIds.onStatusInflicted,
      status: statusIds.burn,
      opponent: createOnFieldPokemon({}),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onStatusInflicted, ctx);
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
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.protean,
      trigger: abilityTriggerIds.onBeforeMove,
      types: [typeIds.fire],
      move: getCanonicalMove(moveIds.flamethrower),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onBeforeMove, ctx);
    expect(result.activated).toBe(false);
  });

  it("given libero ability and monotype matching move type, when on-before-move triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- libero: identical to protean
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.libero,
      trigger: abilityTriggerIds.onBeforeMove,
      types: [typeIds.water],
      move: getCanonicalMove(moveIds.surf),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onBeforeMove, ctx);
    expect(result.activated).toBe(false);
  });

  it("given protean ability and dual-type including move type, when on-before-move triggered, then DOES activate (changes to monotype)", () => {
    // Source: Showdown data/abilities.ts -- protean changes to monotype even if one of dual types matches
    // The code checks types.length === 1 && types[0] === moveType, so dual-type always changes
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.protean,
      trigger: abilityTriggerIds.onBeforeMove,
      types: [typeIds.fire, typeIds.flying],
      move: getCanonicalMove(moveIds.flamethrower),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onBeforeMove, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [typeIds.fire] },
    ]);
  });

  it("given libero ability and different monotype than move type, when on-before-move triggered, then activates", () => {
    // Source: Showdown data/abilities.ts -- libero: changes type to match the move
    const ctx = createSwitchAbilityContext({
      ability: abilityIds.libero,
      trigger: abilityTriggerIds.onBeforeMove,
      types: [typeIds.grass],
      move: getCanonicalMove(moveIds.thunderbolt),
    });
    const result = handleGen8SwitchAbility(abilityTriggerIds.onBeforeMove, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [typeIds.electric] },
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
    const ctx = createStatAbilityContext({
      ability: abilityIds.levitate,
      trigger: abilityTriggerIds.passiveImmunity,
    });
    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given handleGen8StatAbility with unknown trigger, when called, then returns not activated", () => {
    // Source: default case in handleGen8StatAbility dispatch switch
    const ctx = createStatAbilityContext({
      ability: abilityIds.intimidate,
      trigger: "on-unknown-event",
    });
    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given speed-boost ability on first turn (turnsOnField=0), when on-turn-end triggered, then returns not activated", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual: only if pokemon has been on
    // the field for at least 1 full turn (turnsOnField > 0)
    const ctx = createStatAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: abilityTriggerIds.onTurnEnd,
      turnsOnField: 0,
    });
    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given speed-boost ability after one full turn (turnsOnField=1), when on-turn-end triggered, then activates with +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual: triggers when turnsOnField > 0
    const ctx = createStatAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: abilityTriggerIds.onTurnEnd,
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

    const attackerWithMetronome = createOnFieldPokemon({
      heldItem: itemIds.metronome,
      volatiles,
      attack: 100,
    });

    const attackerWithout = createOnFieldPokemon({
      heldItem: null,
      attack: 100,
    });

    const defender = createOnFieldPokemon({ defense: 100 });
    const move = createSyntheticMoveFrom(defaultMove, {
      // Synthetic probe: these damage tests isolate the item modifier math with an 80 BP baseline.
      power: 80,
    });

    const resultWith = calculateGen8Damage(
      createDamageCalcContext({ attacker: attackerWithMetronome, defender, move, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      createDamageCalcContext({ attacker: attackerWithout, defender, move, seed: 100 }),
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

    const attackerWithMetronome = createOnFieldPokemon({
      heldItem: itemIds.metronome,
      volatiles,
      attack: 100,
    });

    const attackerWithout = createOnFieldPokemon({
      heldItem: null,
      attack: 100,
    });

    const defender = createOnFieldPokemon({ defense: 100 });
    const move = createSyntheticMoveFrom(defaultMove, {
      // Synthetic probe: this keeps the no-boost Metronome branch on the same 80 BP baseline.
      power: 80,
    });

    const resultWith = calculateGen8Damage(
      createDamageCalcContext({ attacker: attackerWithMetronome, defender, move, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      createDamageCalcContext({ attacker: attackerWithout, defender, move, seed: 100 }),
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

    const attackerWithMetronome = createOnFieldPokemon({
      heldItem: itemIds.metronome,
      volatiles,
      attack: 100,
    });

    const attackerWithout = createOnFieldPokemon({
      heldItem: null,
      attack: 100,
    });

    const defender = createOnFieldPokemon({ defense: 100 });
    const move = createSyntheticMoveFrom(defaultMove, {
      // Synthetic probe: this keeps the capped Metronome branch on the same 80 BP baseline.
      power: 80,
    });

    const resultWith = calculateGen8Damage(
      createDamageCalcContext({ attacker: attackerWithMetronome, defender, move, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      createDamageCalcContext({ attacker: attackerWithout, defender, move, seed: 100 }),
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
    const attackerWithGlasses = createOnFieldPokemon({
      heldItem: itemIds.wiseGlasses,
      attack: 100,
    });
    const attackerWithout = createOnFieldPokemon({
      heldItem: null,
      attack: 100,
    });

    const defender = createOnFieldPokemon({ defense: 100 });
    const physicalMove = createSyntheticMoveFrom(defaultMove, {
      // Synthetic probe: use the same 80 BP physical baseline as the matching Metronome cases.
      power: 80,
    });

    const resultWith = calculateGen8Damage(
      createDamageCalcContext({
        attacker: attackerWithGlasses,
        defender,
        move: physicalMove,
        seed: 42,
      }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      createDamageCalcContext({
        attacker: attackerWithout,
        defender,
        move: physicalMove,
        seed: 42,
      }),
      typeChart,
    );

    // Physical move with Wise Glasses should deal the same damage as without
    expect(resultWith.damage).toBe(resultWithout.damage);
  });

  it("given wise-glasses holder using special move, when damage calculated, then 1.1x boost applies", () => {
    // Source: Showdown data/items.ts -- Wise Glasses: 1.1x boost for special moves
    const attackerWithGlasses = createOnFieldPokemon({
      heldItem: itemIds.wiseGlasses,
      spAttack: 100,
    });
    const attackerWithout = createOnFieldPokemon({
      heldItem: null,
      spAttack: 100,
    });

    const defender = createOnFieldPokemon({ spDefense: 100 });
    const specialMove = createSyntheticMoveFrom(getCanonicalMove(moveIds.thunderbolt), {
      // Synthetic probe: keep the arithmetic on the original 80 BP special baseline for this gap test.
      power: 80,
    });

    const resultWith = calculateGen8Damage(
      createDamageCalcContext({
        attacker: attackerWithGlasses,
        defender,
        move: specialMove,
        seed: 42,
      }),
      typeChart,
    );
    const resultWithout = calculateGen8Damage(
      createDamageCalcContext({
        attacker: attackerWithout,
        defender,
        move: specialMove,
        seed: 42,
      }),
      typeChart,
    );

    // Special move with Wise Glasses should deal more damage (~1.1x)
    // Exact seeded values (seed=42): with=37, without=34 (ratio ≈ 1.088 due to integer rounding)
    expect(resultWith.damage).toBe(37);
    expect(resultWithout.damage).toBe(34);
  });
});
