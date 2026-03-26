import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type {
  Gender,
  MoveData,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import { handleGen5RemainingAbility } from "../src/Gen5AbilitiesRemaining";

const gen5DataManager = createGen5DataManager();
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS } as const;
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN5_ITEM_IDS } as const;
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN5_MOVE_IDS } as const;
const STATUS_IDS = CORE_STATUS_IDS;
const _TYPE_IDS = CORE_TYPE_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;
const TRIGGER_ON_TURN_END = CORE_ABILITY_TRIGGER_IDS.onTurnEnd;
const TRIGGER_ON_SWITCH_IN = CORE_ABILITY_TRIGGER_IDS.onSwitchIn;
const TRIGGER_PASSIVE_IMMUNITY = CORE_ABILITY_TRIGGER_IDS.passiveImmunity;
const HEALER_UID = "healer-test";
const HARVEST_BERRY_VOLATILE = `${ABILITY_IDS.harvest}-berry` as const;
const GEN5_DEFAULT_LEVEL = 50;
const GEN5_DEFAULT_HP = 200;
const GEN5_DEFAULT_SPEED = 100;
const GEN5_DEFAULT_STATS = {
  hp: GEN5_DEFAULT_HP,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: GEN5_DEFAULT_SPEED,
};

/**
 * Gen 5 Remaining Ability Tests -- Wave 4A.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 * Source: references/pokemon-showdown/data/abilities.ts
 * Source: Bulbapedia -- individual ability pages
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type Gen5BattleStateOptions = {
  format?: "singles" | "doubles";
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [BattleSide, BattleSide];
};

type Gen5AbilityContextOptions = {
  ability: string;
  trigger: string;
  types?: readonly PokemonType[];
  opponent?: ActivePokemon;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  rngNextValues?: readonly number[];
  move?: MoveData;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  format?: "singles" | "doubles";
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [BattleSide, BattleSide];
  speciesId?: number;
  gender?: Gender;
  abilitySlot?: (typeof CORE_ABILITY_SLOTS)[keyof typeof CORE_ABILITY_SLOTS];
  nickname?: string | null;
};

function createCanonicalMove(moveId: string): MoveData {
  return gen5DataManager.getMove(moveId);
}

function createGen5BattleSide(index: 0 | 1, active: (ActivePokemon | null)[] = []): BattleSide {
  return {
    index,
    trainer: null,
    team: active.flatMap((slot) => (slot ? [slot.pokemon] : [])),
    active,
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as BattleSide;
}

function createGen5BattleState(options: Gen5BattleStateOptions = {}): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: options.format ?? "singles",
    turnNumber: 1,
    sides: options.sides ?? [createGen5BattleSide(0), createGen5BattleSide(1)],
    weather: options.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(0),
    ended: false,
    winner: null,
    isWildBattle: false,
    fleeAttempts: 0,
  } as BattleState;
}

function createGen5PokemonInstance(
  speciesId: number,
  options: {
    abilityOverride?: string;
    currentHp?: number;
    maxHp?: number;
    moveIds?: readonly string[];
    primaryStatus?: PrimaryStatus | null;
    volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
    seedOffset?: number;
    speed?: number;
    heldItem?: string | null;
    abilitySlot?: (typeof CORE_ABILITY_SLOTS)[keyof typeof CORE_ABILITY_SLOTS];
    gender?: Gender;
    nickname?: string | null;
    types?: readonly PokemonType[];
  } = {},
): PokemonInstance {
  const species = gen5DataManager.getSpecies(speciesId);
  const pokemon = createPokemonInstance(
    species,
    GEN5_DEFAULT_LEVEL,
    new SeededRandom(0x5d50 + (options.seedOffset ?? 0)),
    {
      nature: GEN5_NATURE_IDS.hardy,
      abilitySlot: options.abilitySlot ?? CORE_ABILITY_SLOTS.normal1,
      gender: options.gender ?? CORE_GENDERS.male,
      pokeball: GEN5_ITEM_IDS.pokeBall,
      nickname: options.nickname ?? species.displayName,
    },
  );

  pokemon.moves = (options.moveIds ?? [GEN5_MOVE_IDS.tackle]).map((moveId) => {
    const move = createCanonicalMove(moveId);
    return createMoveSlot(move.id, move.pp);
  });
  const maxHp = options.maxHp ?? GEN5_DEFAULT_HP;
  pokemon.currentHp = options.currentHp ?? maxHp;
  pokemon.calculatedStats = {
    ...GEN5_DEFAULT_STATS,
    hp: maxHp,
    speed: options.speed ?? GEN5_DEFAULT_SPEED,
  };
  pokemon.heldItem = options.heldItem ?? null;
  if (options.abilityOverride != null) {
    pokemon.ability = options.abilityOverride;
  }
  if (options.primaryStatus !== undefined) {
    pokemon.status = options.primaryStatus;
  }
  if (options.types) {
    pokemon.teraType = undefined;
  }

  return pokemon;
}

function createGen5OnFieldPokemon(
  speciesId: number,
  options: {
    abilityOverride?: string;
    currentHp?: number;
    maxHp?: number;
    moveIds?: readonly string[];
    primaryStatus?: PrimaryStatus | null;
    seedOffset?: number;
    speed?: number;
    heldItem?: string | null;
    abilitySlot?: (typeof CORE_ABILITY_SLOTS)[keyof typeof CORE_ABILITY_SLOTS];
    gender?: Gender;
    nickname?: string | null;
    types?: readonly PokemonType[];
  } = {},
): ActivePokemon {
  const species = gen5DataManager.getSpecies(speciesId);
  const pokemon = createGen5PokemonInstance(speciesId, options);
  const activePokemon = createOnFieldPokemon(pokemon, 0, [...(options.types ?? species.types)]);
  if (options.volatiles) {
    activePokemon.volatileStatuses = new Map(options.volatiles);
  }
  return activePokemon;
}

function createGen5AbilityContext(opts: Gen5AbilityContextOptions): AbilityContext {
  const state = createGen5BattleState({
    format: opts.format,
    weather: opts.weather,
    sides: opts.sides,
  });
  const speciesId = opts.speciesId ?? GEN5_SPECIES_IDS.darmanitan;
  const pokemon = createGen5OnFieldPokemon(speciesId, {
    abilityOverride: opts.ability,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    heldItem: opts.heldItem,
    moveIds: opts.move ? [opts.move.id] : [GEN5_MOVE_IDS.tackle],
    primaryStatus: opts.primaryStatus ?? null,
    volatiles: opts.volatiles,
    speed: opts.speed ?? GEN5_DEFAULT_SPEED,
    abilitySlot: opts.abilitySlot ?? CORE_ABILITY_SLOTS.normal1,
    gender: opts.gender ?? CORE_GENDERS.male,
    nickname: opts.nickname ?? null,
    types: opts.types,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: readonly T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as AbilityContext;
}

// ---------------------------------------------------------------------------
// ZEN MODE
// ---------------------------------------------------------------------------

describe("handleGen5RemainingAbility on-turn-end -- Zen Mode", () => {
  it("given Darmanitan at exactly 50% HP without Zen Mode volatile, when turn ends, then transforms to Zen Mode", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.zenMode,
      trigger: TRIGGER_ON_TURN_END,
      currentHp: 100,
      maxHp: 200,
      speciesId: GEN5_SPECIES_IDS.darmanitan,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: ABILITY_IDS.zenMode,
    });
    expect(result.messages[0]).toContain("Zen Mode");
  });

  it("given Darmanitan at 30% HP without Zen Mode volatile, when turn ends, then transforms to Zen Mode", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.zenMode,
      trigger: TRIGGER_ON_TURN_END,
      currentHp: 60,
      maxHp: 200,
      speciesId: GEN5_SPECIES_IDS.darmanitan,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: ABILITY_IDS.zenMode,
    });
  });

  it("given Darmanitan at 51% HP without Zen Mode volatile, when turn ends, then does not transform", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.zenMode,
      trigger: TRIGGER_ON_TURN_END,
      currentHp: 101,
      maxHp: 200,
      speciesId: GEN5_SPECIES_IDS.darmanitan,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Darmanitan already in Zen Mode above 50% HP, when turn ends, then reverts to standard form via volatile-remove", () => {
    const zenVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    zenVolatiles.set(ABILITY_IDS.zenMode as never, { turnsLeft: -1 });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.zenMode,
      trigger: TRIGGER_ON_TURN_END,
      currentHp: 150,
      maxHp: 200,
      speciesId: GEN5_SPECIES_IDS.darmanitan,
      volatiles: zenVolatiles,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-remove",
      target: "self",
      volatile: ABILITY_IDS.zenMode,
    });
    expect(result.messages[0]).toContain("standard form");
  });

  it("given Darmanitan in Zen Mode at 51% HP (just above threshold), when turn ends, then reverts to standard form", () => {
    const zenVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    zenVolatiles.set(ABILITY_IDS.zenMode as never, { turnsLeft: -1 });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.zenMode,
      trigger: TRIGGER_ON_TURN_END,
      currentHp: 101,
      maxHp: 200,
      speciesId: GEN5_SPECIES_IDS.darmanitan,
      volatiles: zenVolatiles,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-remove",
      target: "self",
      volatile: ABILITY_IDS.zenMode,
    });
    expect(result.messages[0]).toContain("standard form");
  });

  it("given Darmanitan already in Zen Mode at exactly 50% HP, when turn ends, then stays in Zen Mode", () => {
    const zenVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    zenVolatiles.set(ABILITY_IDS.zenMode as never, { turnsLeft: -1 });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.zenMode,
      trigger: TRIGGER_ON_TURN_END,
      currentHp: 100,
      maxHp: 200,
      speciesId: GEN5_SPECIES_IDS.darmanitan,
      volatiles: zenVolatiles,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================\n+// HARVEST
// ===========================================================================

describe("handleGen5RemainingAbility on-turn-end -- Harvest", () => {
  it("given Harvest with consumed berry and sun active, when turn ends, then restores berry via item-restore", () => {
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set(HARVEST_BERRY_VOLATILE as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.sitrusBerry },
    });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.harvest,
      trigger: TRIGGER_ON_TURN_END,
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: { type: WEATHER_IDS.sun, turnsLeft: 5, source: ABILITY_IDS.drought },
      rngNextValues: [0.9],
      speciesId: GEN5_SPECIES_IDS.cherubi,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "item-restore",
      target: "self",
      item: ITEM_IDS.sitrusBerry,
    });
    expect(result.messages[0]).toContain("Harvest");
    expect(result.messages[0]).toContain(ITEM_IDS.sitrusBerry);
  });

  it("given Harvest with consumed berry, no sun, and rng below 0.5, when turn ends, then restores berry via item-restore", () => {
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set(HARVEST_BERRY_VOLATILE as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.lumBerry },
    });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.harvest,
      trigger: TRIGGER_ON_TURN_END,
      heldItem: null,
      volatiles: harvestVolatiles,
      rngNextValues: [0.3],
      speciesId: GEN5_SPECIES_IDS.cherubi,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "item-restore",
      target: "self",
      item: ITEM_IDS.lumBerry,
    });
    expect(result.messages[0]).toContain("Harvest");
    expect(result.messages[0]).toContain(ITEM_IDS.lumBerry);
  });

  it("given Harvest with consumed berry, no sun, and rng at 0.5, when turn ends, then fails to restore", () => {
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set(HARVEST_BERRY_VOLATILE as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.sitrusBerry },
    });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.harvest,
      trigger: TRIGGER_ON_TURN_END,
      heldItem: null,
      volatiles: harvestVolatiles,
      rngNextValues: [0.5],
      speciesId: GEN5_SPECIES_IDS.cherubi,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Harvest but Pokemon still holding an item, when turn ends, then does not activate", () => {
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set(HARVEST_BERRY_VOLATILE as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.sitrusBerry },
    });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.harvest,
      trigger: TRIGGER_ON_TURN_END,
      heldItem: ITEM_IDS.leftovers,
      volatiles: harvestVolatiles,
      speciesId: GEN5_SPECIES_IDS.cherubi,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Harvest but no consumed berry tracked, when turn ends, then does not activate", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.harvest,
      trigger: TRIGGER_ON_TURN_END,
      heldItem: null,
      speciesId: GEN5_SPECIES_IDS.cherubi,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================\n+// HEALER
// ===========================================================================

describe("handleGen5RemainingAbility on-turn-end -- Healer", () => {
  it("given Healer in singles format, when turn ends, then does not activate", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.healer,
      trigger: TRIGGER_ON_TURN_END,
      format: "singles",
      speciesId: GEN5_SPECIES_IDS.audino,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Healer in doubles with poisoned ally and rng below 0.3, when turn ends, then activates with status-cure targeting ally", () => {
    const healer = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.audino, {
      abilityOverride: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    healer.pokemon.uid = HEALER_UID;
    const ally = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.charizard, {
      abilityOverride: ABILITY_IDS.blaze,
      nickname: "Charizard",
      primaryStatus: STATUS_IDS.poison,
    });
    const side0 = createGen5BattleSide(0, [healer, ally]);
    const side1 = createGen5BattleSide(1);

    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.healer,
      trigger: TRIGGER_ON_TURN_END,
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.2],
      speciesId: GEN5_SPECIES_IDS.audino,
      nickname: "Audino",
    });
    ctx.pokemon.pokemon.uid = HEALER_UID;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({ effectType: "status-cure", target: "ally" });
    expect(result.messages[0]).toContain("Healer");
    expect(result.messages[0]).toContain("Charizard");
    expect(result.messages[0]).toContain(STATUS_IDS.poison);
  });

  it("given Healer in doubles with burned ally and rng below 0.3, when turn ends, then activates with status-cure targeting ally", () => {
    const healer = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.audino, {
      abilityOverride: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    healer.pokemon.uid = HEALER_UID;
    const ally = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.arcanine, {
      abilityOverride: ABILITY_IDS.blaze,
      nickname: "Arcanine",
      primaryStatus: STATUS_IDS.burn,
    });
    const side0 = createGen5BattleSide(0, [healer, ally]);
    const side1 = createGen5BattleSide(1);

    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.healer,
      trigger: TRIGGER_ON_TURN_END,
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.1],
      speciesId: GEN5_SPECIES_IDS.audino,
      nickname: "Audino",
    });
    ctx.pokemon.pokemon.uid = HEALER_UID;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({ effectType: "status-cure", target: "ally" });
    expect(result.messages[0]).toContain(STATUS_IDS.burn);
  });

  it("given Healer in doubles with healthy ally, when turn ends, then does not activate", () => {
    const healer = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.audino, {
      abilityOverride: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    healer.pokemon.uid = HEALER_UID;
    const ally = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.charizard, {
      abilityOverride: ABILITY_IDS.blaze,
      nickname: "Charizard",
    });
    const side0 = createGen5BattleSide(0, [healer, ally]);
    const side1 = createGen5BattleSide(1);

    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.healer,
      trigger: TRIGGER_ON_TURN_END,
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.1],
      speciesId: GEN5_SPECIES_IDS.audino,
      nickname: "Audino",
    });
    ctx.pokemon.pokemon.uid = HEALER_UID;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Healer in doubles with poisoned ally and rng at 0.3, when turn ends, then does not cure", () => {
    const healer = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.audino, {
      abilityOverride: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    healer.pokemon.uid = HEALER_UID;
    const ally = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.charizard, {
      abilityOverride: ABILITY_IDS.blaze,
      nickname: "Charizard",
      primaryStatus: STATUS_IDS.poison,
    });
    const side0 = createGen5BattleSide(0, [healer, ally]);
    const side1 = createGen5BattleSide(1);

    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.healer,
      trigger: TRIGGER_ON_TURN_END,
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.3],
      speciesId: GEN5_SPECIES_IDS.audino,
      nickname: "Audino",
    });
    ctx.pokemon.pokemon.uid = HEALER_UID;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================\n+// FRISK (Gen 5)
// ===========================================================================

describe("handleGen5RemainingAbility on-switch-in -- Frisk", () => {
  it("given Frisk, when opponent holds an item, then reveals the item", () => {
    const opponent = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.charizard, {
      abilityOverride: ABILITY_IDS.blaze,
      nickname: "Charizard",
      heldItem: ITEM_IDS.choiceScarf,
    });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.frisk,
      trigger: TRIGGER_ON_SWITCH_IN,
      opponent,
      speciesId: GEN5_SPECIES_IDS.dusknoir,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("frisked");
    expect(result.messages[0]).toContain("Charizard");
    expect(result.messages[0]).toContain(ITEM_IDS.choiceScarf);
  });

  it("given Frisk, when opponent holds no item, then does not activate", () => {
    const opponent = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.charizard, {
      abilityOverride: ABILITY_IDS.blaze,
      nickname: "Charizard",
      heldItem: null,
    });
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.frisk,
      trigger: TRIGGER_ON_SWITCH_IN,
      opponent,
      speciesId: GEN5_SPECIES_IDS.dusknoir,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Frisk, when no opponent present, then does not activate", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.frisk,
      trigger: TRIGGER_ON_SWITCH_IN,
      speciesId: GEN5_SPECIES_IDS.dusknoir,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================\n+// TELEPATHY
// ===========================================================================

describe("handleGen5RemainingAbility passive-immunity -- Telepathy", () => {
  it("given Telepathy in singles, when checked, then does not activate (no ally exists)", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.telepathy,
      trigger: TRIGGER_PASSIVE_IMMUNITY,
      format: "singles",
      speciesId: GEN5_SPECIES_IDS.reuniclus,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Telepathy in doubles, when ally targets this Pokemon, then prevents the move", () => {
    const defender = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.reuniclus, {
      abilityOverride: ABILITY_IDS.telepathy,
      nickname: "Reuniclus",
    });
    defender.pokemon.uid = "defender-test";
    const allyAttacker = createGen5OnFieldPokemon(GEN5_SPECIES_IDS.chandelure, {
      abilityOverride: ABILITY_IDS.blaze,
      nickname: "Chandelure",
    });
    const side0 = createGen5BattleSide(0, [defender, allyAttacker]);
    const side1 = createGen5BattleSide(1);

    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.telepathy,
      trigger: TRIGGER_PASSIVE_IMMUNITY,
      format: "doubles",
      sides: [side0, side1],
      opponent: allyAttacker,
      move: createCanonicalMove(MOVE_IDS.earthquake),
      speciesId: GEN5_SPECIES_IDS.reuniclus,
      nickname: "Reuniclus",
    });
    ctx.pokemon.pokemon.uid = "defender-test";

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Telepathy");
  });
});

// ===========================================================================\n+// OBLIVIOUS (Gen 5)
// ===========================================================================

describe("handleGen5RemainingAbility passive-immunity -- Oblivious", () => {
  it("given Oblivious, when targeted by Attract, then blocks infatuation", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.oblivious,
      trigger: TRIGGER_PASSIVE_IMMUNITY,
      move: createCanonicalMove(MOVE_IDS.attract),
      speciesId: GEN5_SPECIES_IDS.musharna,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Oblivious");
    expect(result.messages[0]).toContain(CORE_VOLATILE_IDS.infatuation);
  });

  it("given Oblivious, when targeted by Captivate, then blocks Captivate", () => {
    const ctx = createGen5AbilityContext({
      ability: ABILITY_IDS.oblivious,
      trigger: TRIGGER_PASSIVE_IMMUNITY,
      move: createCanonicalMove(MOVE_IDS.captivate),
      speciesId: GEN5_SPECIES_IDS.musharna,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Captivate");
  });
});
