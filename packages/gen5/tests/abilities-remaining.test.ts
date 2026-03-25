import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  FRIEND_GUARD_DAMAGE_MULTIPLIER,
  getSereneGraceMultiplier,
  getWeightMultiplier,
  HARVEST_BASE_PROBABILITY,
  HARVEST_SUN_PROBABILITY,
  HEALER_PROBABILITY,
  HEAVY_METAL_WEIGHT_MULTIPLIER,
  handleGen5RemainingAbility,
  LIGHT_METAL_WEIGHT_MULTIPLIER,
  SERENE_GRACE_CHANCE_MULTIPLIER,
} from "../src/Gen5AbilitiesRemaining";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import {
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_SPECIES_IDS,
  createGen5DataManager,
} from "@pokemon-lib-ts/gen5";

const gen5DataManager = createGen5DataManager();
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN5_MOVE_IDS } as const;
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS } as const;
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN5_ITEM_IDS } as const;
const SPECIES_IDS = GEN5_SPECIES_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const TYPE_IDS = CORE_TYPE_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;

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

function makePokemonInstance(overrides: {
  uid?: string;
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  gender?: Gender;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: overrides.uid ?? "test",
    speciesId: overrides.speciesId ?? SPECIES_IDS.darmanitan,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? ABILITY_IDS.none,
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: (overrides.gender ?? "male") as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  uid?: string;
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      uid: overrides.uid,
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      gender: overrides.gender,
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [TYPE_IDS.normal],
    ability: overrides.ability ?? ABILITY_IDS.none,
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
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as unknown as ActivePokemon;
}

function makeSide(index: 0 | 1, active: (ActivePokemon | null)[] = []): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active,
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function makeBattleState(overrides?: {
  format?: "singles" | "doubles";
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [BattleSide, BattleSide];
}): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: overrides?.format ?? "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [makeSide(0), makeSide(1)],
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeMove(overrides?: Partial<MoveData>): MoveData {
  const moveId = overrides?.id ?? MOVE_IDS.tackle;
  const baseMove = gen5DataManager.getMove(moveId);
  return {
    ...baseMove,
    id: moveId,
    displayName: overrides?.displayName ?? baseMove.displayName,
    type: overrides?.type ?? baseMove.type,
    category: overrides?.category ?? baseMove.category,
    power: overrides?.power ?? baseMove.power,
    accuracy: baseMove.accuracy,
    pp: baseMove.pp,
    maxPp: baseMove.pp,
    priority: baseMove.priority,
    target: baseMove.target,
    flags: { ...baseMove.flags, ...overrides?.flags },
    effectChance: baseMove.effectChance ?? null,
    secondaryEffects: baseMove.secondaryEffects ?? [],
    generation: baseMove.generation,
  } as unknown as MoveData;
}

function makeContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ActivePokemon;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  rngNextValues?: number[];
  move?: MoveData;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  format?: "singles" | "doubles";
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [BattleSide, BattleSide];
}): AbilityContext {
  const state = makeBattleState({
    format: opts.format,
    weather: opts.weather,
    sides: opts.sides,
  });
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    heldItem: opts.heldItem,
    volatiles: opts.volatiles,
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
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// ZEN MODE
// ===========================================================================

describe("handleGen5RemainingAbility on-turn-end -- Zen Mode", () => {
  it("given Darmanitan at exactly 50% HP without Zen Mode volatile, when turn ends, then transforms to Zen Mode", () => {
    // Source: Showdown data/abilities.ts -- zenmode onResidual
    //   pokemon.hp <= pokemon.maxhp / 2 triggers zen mode
    // 100 HP / 200 maxHp = exactly 50%, which is <= 50%
    const ctx = makeContext({
      ability: ABILITY_IDS.zenMode,
      trigger: "on-turn-end",
      currentHp: 100,
      maxHp: 200,
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
    // Source: Showdown data/abilities.ts -- 60/200 = 30% < 50%, triggers zen mode
    const ctx = makeContext({
      ability: ABILITY_IDS.zenMode,
      trigger: "on-turn-end",
      currentHp: 60,
      maxHp: 200,
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
    // Source: Showdown data/abilities.ts -- 101/200 > 50%, no transformation
    // floor(200/2) = 100; 101 > 100, so no zen mode
    const ctx = makeContext({
      ability: ABILITY_IDS.zenMode,
      trigger: "on-turn-end",
      currentHp: 101,
      maxHp: 200,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Darmanitan already in Zen Mode above 50% HP, when turn ends, then reverts to standard form via volatile-remove", () => {
    // Source: Showdown data/abilities.ts -- zenmode onResidual:
    //   pokemon.hp > pokemon.maxhp / 2 && Zen form => formeChange back to standard
    // Source: Bulbapedia -- Zen Mode: reverts when HP rises above 50%
    const zenVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    zenVolatiles.set(ABILITY_IDS.zenMode as never, { turnsLeft: -1 });
    const ctx = makeContext({
      ability: ABILITY_IDS.zenMode,
      trigger: "on-turn-end",
      currentHp: 150,
      maxHp: 200,
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
    // Source: Showdown data/abilities.ts -- zenmode onResidual:
    //   pokemon.hp > pokemon.maxhp / 2 => revert to standard form
    // 101/200: floor(200/2) = 100; 101 > 100 => reversion triggers
    const zenVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    zenVolatiles.set(ABILITY_IDS.zenMode as never, { turnsLeft: -1 });
    const ctx = makeContext({
      ability: ABILITY_IDS.zenMode,
      trigger: "on-turn-end",
      currentHp: 101,
      maxHp: 200,
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
    // Source: Showdown data/abilities.ts -- 100/200 = 50%, which is <= 50%
    // Already in Zen Mode AND at 50% => neither branch triggers
    const zenVolatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    zenVolatiles.set(ABILITY_IDS.zenMode as never, { turnsLeft: -1 });
    const ctx = makeContext({
      ability: ABILITY_IDS.zenMode,
      trigger: "on-turn-end",
      currentHp: 100,
      maxHp: 200,
      volatiles: zenVolatiles,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// HARVEST
// ===========================================================================

describe("handleGen5RemainingAbility on-turn-end -- Harvest", () => {
  it("given Harvest with consumed berry and sun active, when turn ends, then restores berry via item-restore", () => {
    // Source: Showdown data/abilities.ts -- harvest: 100% in sun, always restores.
    // Source: Bulbapedia -- Harvest: "Always restores the Berry in sunlight."
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set("harvest-berry" as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.sitrusBerry },
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.harvest,
      trigger: "on-turn-end",
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: { type: WEATHER_IDS.sun, turnsLeft: 5, source: ABILITY_IDS.drought },
      rngNextValues: [0.9], // would fail the 50% check, but sun overrides
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
    // Source: Showdown data/abilities.ts -- harvest: this.randomChance(1, 2) = 50%
    // rng.next() returns 0.3 < 0.5 => the 50% check passes, berry is restored.
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set("harvest-berry" as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.lumBerry },
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.harvest,
      trigger: "on-turn-end",
      heldItem: null,
      volatiles: harvestVolatiles,
      rngNextValues: [0.3],
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
    // Source: Showdown data/abilities.ts -- harvest: this.randomChance(1, 2) = 50%
    // rng.next() returns 0.5 >= 0.5 => fails
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set("harvest-berry" as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.sitrusBerry },
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.harvest,
      trigger: "on-turn-end",
      heldItem: null,
      volatiles: harvestVolatiles,
      rngNextValues: [0.5],
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Harvest but Pokemon still holding an item, when turn ends, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- harvest: !pokemon.item check
    const harvestVolatiles = new Map<
      string,
      { turnsLeft: number; data?: Record<string, unknown> }
    >();
    harvestVolatiles.set("harvest-berry" as never, {
      turnsLeft: -1,
      data: { berryId: ITEM_IDS.sitrusBerry },
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.harvest,
      trigger: "on-turn-end",
      heldItem: ITEM_IDS.leftovers,
      volatiles: harvestVolatiles,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Harvest but no consumed berry tracked, when turn ends, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- harvest: pokemon.lastItem must be a berry
    const ctx = makeContext({
      ability: ABILITY_IDS.harvest,
      trigger: "on-turn-end",
      heldItem: null,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// HEALER
// ===========================================================================

describe("handleGen5RemainingAbility on-turn-end -- Healer", () => {
  it("given Healer in singles format, when turn ends, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- healer: pokemon.adjacentAllies()
    // In singles, there are no adjacent allies
    const ctx = makeContext({
      ability: ABILITY_IDS.healer,
      trigger: "on-turn-end",
      format: "singles",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Healer in doubles with poisoned ally and rng below 0.3, when turn ends, then activates with status-cure targeting ally", () => {
    // Source: Showdown data/abilities.ts -- healer: this.randomChance(3, 10) = 30%
    // rng.next() returns 0.2 < 0.3 => the 30% check passes, Healer cures ally's status
    const healer = makeActivePokemon({
      uid: ABILITY_IDS.healer,
      ability: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    const ally = makeActivePokemon({
      uid: "ally",
      ability: ABILITY_IDS.blaze,
      nickname: "Charizard",
      status: STATUS_IDS.poison,
    });
    const side0 = makeSide(0, [healer, ally]);
    const side1 = makeSide(1);

    const ctx = makeContext({
      ability: ABILITY_IDS.healer,
      trigger: "on-turn-end",
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.2],
    });
    // Manually set the pokemon uid to match the side
    (ctx.pokemon as any).pokemon.uid = ABILITY_IDS.healer;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({ effectType: "status-cure", target: "ally" });
    expect(result.messages[0]).toContain("Healer");
    expect(result.messages[0]).toContain("Charizard");
    expect(result.messages[0]).toContain(STATUS_IDS.poison);
  });

  it("given Healer in doubles with burned ally and rng below 0.3, when turn ends, then activates with status-cure targeting ally", () => {
    // Source: Showdown data/abilities.ts -- healer: allyActive.cureStatus()
    // Healer cures any primary status, not just poison. Test with burn to triangulate.
    const healer = makeActivePokemon({
      uid: ABILITY_IDS.healer,
      ability: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    const ally = makeActivePokemon({
      uid: "ally",
      ability: ABILITY_IDS.blaze,
      nickname: "Arcanine",
      status: STATUS_IDS.burn,
    });
    const side0 = makeSide(0, [healer, ally]);
    const side1 = makeSide(1);

    const ctx = makeContext({
      ability: ABILITY_IDS.healer,
      trigger: "on-turn-end",
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.1],
    });
    (ctx.pokemon as any).pokemon.uid = ABILITY_IDS.healer;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({ effectType: "status-cure", target: "ally" });
    expect(result.messages[0]).toContain(STATUS_IDS.burn);
  });

  it("given Healer in doubles with healthy ally, when turn ends, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- healer: `if (allyActive.status)`
    // Only activates when ally has a status condition
    const healer = makeActivePokemon({
      uid: ABILITY_IDS.healer,
      ability: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    const ally = makeActivePokemon({
      uid: "ally",
      ability: ABILITY_IDS.blaze,
      nickname: "Charizard",
    });
    const side0 = makeSide(0, [healer, ally]);
    const side1 = makeSide(1);

    const ctx = makeContext({
      ability: ABILITY_IDS.healer,
      trigger: "on-turn-end",
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.1],
    });
    (ctx.pokemon as any).pokemon.uid = ABILITY_IDS.healer;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Healer in doubles with poisoned ally and rng at 0.3, when turn ends, then does not cure", () => {
    // Source: Showdown data/abilities.ts -- healer: this.randomChance(3, 10) = 30%
    // rng.next() returns 0.3 >= 0.3 => fails
    const healer = makeActivePokemon({
      uid: ABILITY_IDS.healer,
      ability: ABILITY_IDS.healer,
      nickname: "Audino",
    });
    const ally = makeActivePokemon({
      uid: "ally",
      ability: ABILITY_IDS.blaze,
      nickname: "Charizard",
      status: STATUS_IDS.poison,
    });
    const side0 = makeSide(0, [healer, ally]);
    const side1 = makeSide(1);

    const ctx = makeContext({
      ability: ABILITY_IDS.healer,
      trigger: "on-turn-end",
      format: "doubles",
      sides: [side0, side1],
      rngNextValues: [0.3],
    });
    (ctx.pokemon as any).pokemon.uid = ABILITY_IDS.healer;

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// FRISK (Gen 5)
// ===========================================================================

describe("handleGen5RemainingAbility on-switch-in -- Frisk", () => {
  it("given Frisk, when opponent holds an item, then reveals the item", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- frisk onStart
    //   reveals ONE random foe's item
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      nickname: "Charizard",
      heldItem: ITEM_IDS.choiceScarf,
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.frisk,
      trigger: "on-switch-in",
      opponent,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("frisked");
    expect(result.messages[0]).toContain("Charizard");
    expect(result.messages[0]).toContain(ITEM_IDS.choiceScarf);
  });

  it("given Frisk, when opponent holds no item, then does not activate", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- frisk: target?.item check
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      nickname: "Charizard",
      heldItem: null,
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.frisk,
      trigger: "on-switch-in",
      opponent,
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Frisk, when no opponent present, then does not activate", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- frisk: pokemon.side.randomFoe()
    // If no foe exists, returns undefined
    const ctx = makeContext({
      ability: ABILITY_IDS.frisk,
      trigger: "on-switch-in",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// TELEPATHY
// ===========================================================================

describe("handleGen5RemainingAbility passive-immunity -- Telepathy", () => {
  it("given Telepathy in singles, when checked, then does not activate (no ally exists)", () => {
    // Source: Showdown data/abilities.ts -- telepathy onTryHit
    // In singles, there are no allies, so Telepathy is a no-op
    const ctx = makeContext({
      ability: ABILITY_IDS.telepathy,
      trigger: "passive-immunity",
      format: "singles",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Telepathy in doubles, when ally targets this Pokemon, then prevents the move", () => {
    // Source: Showdown data/abilities.ts -- telepathy onTryHit
    //   `if (target !== source && target.isAlly(source) && move.category !== 'Status')`
    //   `return null;` nullifies the move when target.isAlly(source)
    // ctx.opponent must be on the SAME side as ctx.pokemon for Telepathy to activate.
    const defender = makeActivePokemon({
      uid: "defender",
      ability: ABILITY_IDS.telepathy,
      nickname: "Reuniclus",
    });
    const allyAttacker = makeActivePokemon({
      uid: "ally-attacker",
      ability: ABILITY_IDS.blaze,
      nickname: "Infernape",
    });
    // Both on side 0 -- so attacker is an ally
    const side0 = makeSide(0, [defender, allyAttacker]);
    const side1 = makeSide(1);

    const ctx = makeContext({
      ability: ABILITY_IDS.telepathy,
      trigger: "passive-immunity",
      format: "doubles",
      sides: [side0, side1],
      opponent: allyAttacker,
      move: makeMove({ id: MOVE_IDS.earthquake, category: "physical" }),
    });
    // Manually set the pokemon uid to match the side
    (ctx.pokemon as any).pokemon.uid = "defender";

    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Telepathy");
  });
});

// ===========================================================================
// OBLIVIOUS (Gen 5)
// ===========================================================================

describe("handleGen5RemainingAbility passive-immunity -- Oblivious", () => {
  it("given Oblivious, when targeted by Attract, then blocks infatuation", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- oblivious onUpdate
    //   removes attract volatile
    const ctx = makeContext({
      ability: ABILITY_IDS.oblivious,
      trigger: "passive-immunity",
      move: makeMove({ id: MOVE_IDS.attract }),
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Oblivious");
    expect(result.messages[0]).toContain(CORE_VOLATILE_IDS.infatuation);
  });

  it("given Oblivious, when targeted by Captivate, then blocks Captivate", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- oblivious onTryHit
    //   blocks captivate specifically
    const ctx = makeContext({
      ability: ABILITY_IDS.oblivious,
      trigger: "passive-immunity",
      move: makeMove({ id: MOVE_IDS.captivate }),
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Captivate");
  });

  it("given Oblivious, when targeted by Intimidate, then does NOT block (Gen 5 behavior)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- oblivious
    //   Gen 5 does NOT block Intimidate (Gen 8+ does)
    const ctx = makeContext({
      ability: ABILITY_IDS.oblivious,
      trigger: "passive-immunity",
      move: { ...makeMove({ id: MOVE_IDS.tackle }), id: ABILITY_IDS.intimidate, displayName: "Intimidate" },
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Oblivious, when targeted by a normal move, then does not activate", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- oblivious only blocks attract/captivate
    const ctx = makeContext({
      ability: ABILITY_IDS.oblivious,
      trigger: "passive-immunity",
      move: makeMove({ id: MOVE_IDS.tackle }),
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// KEEN EYE (Gen 5)
// ===========================================================================

describe("handleGen5RemainingAbility passive-immunity -- Keen Eye", () => {
  it("given Keen Eye in Gen 5, when checked as passive-immunity, then returns no effect (evasion bypass is Gen 6+)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- keeneye
    //   `onModifyMove() {}` -- empty override removes the Gen 6+ evasion bypass
    // Source: Bulbapedia -- Keen Eye Gen III-V: only prevents accuracy from being lowered
    const ctx = makeContext({
      ability: ABILITY_IDS.keenEye,
      trigger: "passive-immunity",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Keen Eye in Gen 5, when checked with a move context, then still returns no effect for passive-immunity", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- keeneye passive-immunity is a no-op
    const ctx = makeContext({
      ability: ABILITY_IDS.keenEye,
      trigger: "passive-immunity",
      move: makeMove({ id: MOVE_IDS.tackle }),
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// FRIEND GUARD
// ===========================================================================

describe("handleGen5RemainingAbility on-damage-calc -- Friend Guard", () => {
  it("given Friend Guard in doubles, when ally takes damage, then activates with damage-reduction", () => {
    // Source: Showdown data/abilities.ts -- friendguard
    //   `return this.chainModify(0.75);` -- 25% damage reduction for allies
    const ctx = makeContext({
      ability: ABILITY_IDS.friendGuard,
      trigger: "on-damage-calc",
      format: "doubles",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "damage-reduction", target: "self" });
    expect(result.messages[0]).toContain("Friend Guard");
  });

  it("given Friend Guard in singles, when checked, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- friendguard
    //   Only activates when target.isAlly(this.effectState.target) -- requires ally
    const ctx = makeContext({
      ability: ABILITY_IDS.friendGuard,
      trigger: "on-damage-calc",
      format: "singles",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// SERENE GRACE (Gen 5)
// ===========================================================================

describe("handleGen5RemainingAbility on-damage-calc -- Serene Grace", () => {
  it("given Serene Grace with a normal move, when checked, then activates", () => {
    // Source: Showdown data/abilities.ts -- serenegrace
    //   doubles secondary effect chances
    const ctx = makeContext({
      ability: ABILITY_IDS.sereneGrace,
      trigger: "on-damage-calc",
      move: makeMove({ id: MOVE_IDS.ironHead }),
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(true);
  });

  it("given Serene Grace with Secret Power in Gen 5, when checked, then does NOT activate", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- serenegrace
    //   `move.id !== 'secretpower'` -- Secret Power excluded in Gen 5
    const ctx = makeContext({
      ability: ABILITY_IDS.sereneGrace,
      trigger: "on-damage-calc",
      move: makeMove({ id: MOVE_IDS.secretPower }),
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });

  it("given Serene Grace with no move context, when checked, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- serenegrace: requires a move
    const ctx = makeContext({
      ability: ABILITY_IDS.sereneGrace,
      trigger: "on-damage-calc",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// WEIGHT MODIFIERS
// ===========================================================================

describe("getWeightMultiplier", () => {
  it("given Heavy Metal, when calculating weight, then returns 2x multiplier", () => {
    // Source: Showdown data/abilities.ts -- heavymetal onModifyWeight
    //   `return weighthg * 2;`
    expect(getWeightMultiplier(ABILITY_IDS.heavyMetal)).toBe(HEAVY_METAL_WEIGHT_MULTIPLIER);
    expect(getWeightMultiplier(ABILITY_IDS.heavyMetal)).toBe(2);
  });

  it("given Light Metal, when calculating weight, then returns 0.5x multiplier", () => {
    // Source: Showdown data/abilities.ts -- lightmetal onModifyWeight
    //   `return this.trunc(weighthg / 2);`
    expect(getWeightMultiplier(ABILITY_IDS.lightMetal)).toBe(LIGHT_METAL_WEIGHT_MULTIPLIER);
    expect(getWeightMultiplier(ABILITY_IDS.lightMetal)).toBe(0.5);
  });

  it("given an unrelated ability, when calculating weight, then returns 1x (no change)", () => {
    // Source: No weight modifier for abilities not in { heavy-metal, light-metal }
    expect(getWeightMultiplier(ABILITY_IDS.blaze)).toBe(1);
  });

  it("given Heavy Metal with a 100kg Pokemon, when applying multiplier, then weight is 200kg", () => {
    // Source: Showdown data/abilities.ts -- heavymetal: weighthg * 2
    // 100 * 2 = 200
    const baseWeight = 100;
    const result = baseWeight * getWeightMultiplier(ABILITY_IDS.heavyMetal);
    expect(result).toBe(200);
  });

  it("given Light Metal with a 100kg Pokemon, when applying multiplier, then weight is 50kg", () => {
    // Source: Showdown data/abilities.ts -- lightmetal: this.trunc(weighthg / 2)
    // 100 * 0.5 = 50
    const baseWeight = 100;
    const result = baseWeight * getWeightMultiplier(ABILITY_IDS.lightMetal);
    expect(result).toBe(50);
  });
});

// ===========================================================================
// SERENE GRACE MULTIPLIER HELPER
// ===========================================================================

describe("getSereneGraceMultiplier", () => {
  it("given Serene Grace with Iron Head, when getting multiplier, then returns 2", () => {
    // Source: Showdown data/abilities.ts -- serenegrace: secondary.chance *= 2
    expect(getSereneGraceMultiplier(ABILITY_IDS.sereneGrace, MOVE_IDS.ironHead)).toBe(
      SERENE_GRACE_CHANCE_MULTIPLIER,
    );
    expect(getSereneGraceMultiplier(ABILITY_IDS.sereneGrace, MOVE_IDS.ironHead)).toBe(2);
  });

  it("given Serene Grace with Secret Power in Gen 5, when getting multiplier, then returns 1 (excluded)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- serenegrace
    //   move.id !== 'secretpower' check excludes Secret Power
    expect(getSereneGraceMultiplier(ABILITY_IDS.sereneGrace, MOVE_IDS.secretPower)).toBe(1);
  });

  it("given a non-Serene-Grace ability, when getting multiplier, then returns 1", () => {
    // Source: only serene-grace doubles chances
    expect(getSereneGraceMultiplier(ABILITY_IDS.blaze, MOVE_IDS.ironHead)).toBe(1);
  });
});

// ===========================================================================
// EXPORTED CONSTANTS
// ===========================================================================

describe("exported ability constants", () => {
  it("Friend Guard damage multiplier is 0.75", () => {
    // Source: Showdown data/abilities.ts -- friendguard: this.chainModify(0.75)
    expect(FRIEND_GUARD_DAMAGE_MULTIPLIER).toBe(0.75);
  });

  it("Harvest base probability is 0.5", () => {
    // Source: Showdown data/abilities.ts -- harvest: this.randomChance(1, 2)
    expect(HARVEST_BASE_PROBABILITY).toBe(0.5);
  });

  it("Harvest sun probability is 1.0", () => {
    // Source: Showdown data/abilities.ts -- harvest: guaranteed in sun
    expect(HARVEST_SUN_PROBABILITY).toBe(1.0);
  });

  it("Healer probability is 0.3", () => {
    // Source: Showdown data/abilities.ts -- healer: this.randomChance(3, 10)
    expect(HEALER_PROBABILITY).toBe(0.3);
  });

  it("Serene Grace chance multiplier is 2", () => {
    // Source: Showdown data/abilities.ts -- serenegrace: secondary.chance *= 2
    expect(SERENE_GRACE_CHANCE_MULTIPLIER).toBe(2);
  });

  it("Heavy Metal weight multiplier is 2", () => {
    // Source: Showdown data/abilities.ts -- heavymetal: weighthg * 2
    expect(HEAVY_METAL_WEIGHT_MULTIPLIER).toBe(2);
  });

  it("Light Metal weight multiplier is 0.5", () => {
    // Source: Showdown data/abilities.ts -- lightmetal: this.trunc(weighthg / 2)
    expect(LIGHT_METAL_WEIGHT_MULTIPLIER).toBe(0.5);
  });
});

// ===========================================================================
// DISPATCH EDGE CASES
// ===========================================================================

describe("handleGen5RemainingAbility dispatch", () => {
  it("given an unknown trigger, when dispatched, then returns no effect", () => {
    const ctx = makeContext({
      ability: ABILITY_IDS.zenMode,
      trigger: "on-faint",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });

  it("given an unknown ability on a known trigger, when dispatched, then returns no effect", () => {
    const ctx = makeContext({
      ability: "unknown-ability",
      trigger: "on-turn-end",
    });
    const result = handleGen5RemainingAbility(ctx);

    expect(result.activated).toBe(false);
  });
});
