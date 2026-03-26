import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import {
  FRIEND_GUARD_DAMAGE_MULTIPLIER,
  getSereneGraceMultiplier,
  getWeightMultiplier,
  HARVEST_BASE_PROBABILITY,
  HARVEST_SUN_PROBABILITY,
  HEALER_PROBABILITY,
  HEAVY_METAL_WEIGHT_MULTIPLIER,
  handleGen6RemainingAbility,
  LIGHT_METAL_WEIGHT_MULTIPLIER,
  SERENE_GRACE_CHANCE_MULTIPLIER,
} from "../src/Gen6AbilitiesRemaining";

/**
 * Gen 6 remaining ability tests.
 *
 * Tests Gen 6-specific behavior including:
 *   - Frisk: reveals ALL foes' items (Gen 6 change from Gen 5 single reveal)
 *   - Serene Grace: no longer excludes Secret Power (Gen 6 change from Gen 5)
 *   - Carry-forward: Zen Mode, Harvest, Healer, Friend Guard, Telepathy, Oblivious
 *   - Weight multiplier utilities: Heavy Metal, Light Metal
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

const ABILITIES = GEN6_ABILITY_IDS;
const CORE_ABILITIES = CORE_ABILITY_IDS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const GENDERS = CORE_GENDERS;
const CORE_ITEMS = CORE_ITEM_IDS;
const ITEMS = GEN6_ITEM_IDS;
const MOVES = GEN6_MOVE_IDS;
const NATURES = GEN6_NATURE_IDS;
const SPECIES = GEN6_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const WEATHER = CORE_WEATHER_IDS;
const dataManager = createGen6DataManager();
const DEFAULT_MOVE = dataManager.getMove(MOVES.tackle);

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: createTestUid(),
    speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: NATURES.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? CORE_ABILITIES.none,
    abilitySlot: ABILITY_SLOTS.normal1 as const,
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: createFriendship(0),
    gender: GENDERS.male as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
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

function createSyntheticOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}) {
  return {
    pokemon: createSyntheticPokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      status: overrides.status,
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? CORE_ABILITIES.none,
    suppressedAbility: null,
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
    forcedMove: null,
  };
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

function createBattleState(weather?: { type: string } | null): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
    weather: weather ?? null,
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

function createSyntheticMoveFromCanonical(
  type: PokemonType,
  opts: {
    id?: string;
    category?: "physical" | "special" | "status";
  } = {},
): MoveData {
  const baseMove = (() => {
    try {
      return dataManager.getMove(opts.id ?? MOVES.tackle);
    } catch {
      return DEFAULT_MOVE;
    }
  })();
  return {
    ...baseMove,
    id: opts.id ?? baseMove.id,
    displayName: baseMove.displayName,
    type,
    category: opts.category ?? baseMove.category,
    power: opts.category === CORE_MOVE_CATEGORIES.status ? 0 : baseMove.power,
    accuracy: baseMove.accuracy,
    pp: baseMove.pp,
    priority: baseMove.priority,
    target: baseMove.target,
    generation: baseMove.generation,
    flags: baseMove.flags,
    effect: baseMove.effect,
  } as unknown as MoveData;
}

function createAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createSyntheticOnFieldPokemon>;
  move?: MoveData;
  nickname?: string;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  rngNext?: number;
  weather?: { type: string } | null;
  format?: "singles" | "doubles";
}): AbilityContext {
  const state = createBattleState(opts.weather);
  if (opts.format) {
    // @ts-expect-error - override format for doubles tests
    state.format = opts.format;
  }
  const pokemon = createSyntheticOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    heldItem: opts.heldItem,
    status: opts.status,
    volatiles: opts.volatiles,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    rng: {
      next: () => opts.rngNext ?? 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// on-turn-end: Zen Mode
// ===========================================================================

describe("Zen Mode (on-turn-end)", () => {
  it("given Zen Mode Darmanitan below 50% HP, when on-turn-end, then transforms to Zen", () => {
    // Source: Showdown data/abilities.ts -- zenmode: form change below 50% HP at turn end
    // Source: Bulbapedia "Zen Mode" -- "Activates when HP drops below half at end of turn."
    // 100/300 = 33% HP, below 50% threshold (floor(300/2) = 150)
    const ctx = createAbilityContext({
      ability: ABILITIES.zenMode,
      trigger: TRIGGERS.onTurnEnd,
      currentHp: 100,
      maxHp: 300,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-inflict");
    expect(volatileEffect?.volatile).toBe(ABILITIES.zenMode);
  });

  it("given Zen Mode Darmanitan above 50% HP while in Zen Form, when on-turn-end, then reverts", () => {
    // Source: Showdown data/abilities.ts -- zenmode: reverts when HP > 50% and in Zen form
    const zenVolatiles = new Map([[ABILITIES.zenMode, { turnsLeft: -1 }]]);
    const ctx = createAbilityContext({
      ability: ABILITIES.zenMode,
      trigger: TRIGGERS.onTurnEnd,
      currentHp: 250,
      maxHp: 300,
      volatiles: zenVolatiles,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-remove");
    expect(volatileEffect?.volatile).toBe(ABILITIES.zenMode);
  });
});

// ===========================================================================
// on-turn-end: Harvest
// ===========================================================================

describe("Harvest (on-turn-end)", () => {
  it("given Harvest in sun with consumed berry, when on-turn-end, then always restores berry", () => {
    // Source: Showdown data/abilities.ts -- harvest: 100% restore in sun
    // Source: Bulbapedia "Harvest" -- "Guaranteed in sunlight."
    const harvestVolatiles = new Map([
      ["harvest-berry", { turnsLeft: -1, data: { berryId: ITEMS.oranBerry } }],
    ]);
    const ctx = createAbilityContext({
      ability: CORE_ABILITIES.harvest,
      trigger: TRIGGERS.onTurnEnd,
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: { type: WEATHER.sun },
      rngNext: 0.9, // Would fail 50% roll, but sun makes it 100%
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const itemEffect = result.effects.find((e) => e.effectType === "item-restore");
    expect(itemEffect?.item).toBe(ITEMS.oranBerry);
  });

  it("given Harvest with no sun and RNG >= 50%, when on-turn-end, then does not restore", () => {
    // Source: Showdown data/abilities.ts -- harvest: 50% chance outside sun
    // rngNext = 0.7 >= 0.5, so restore fails
    const harvestVolatiles = new Map([
      ["harvest-berry", { turnsLeft: -1, data: { berryId: ITEMS.sitrusBerry } }],
    ]);
    const ctx = createAbilityContext({
      ability: CORE_ABILITIES.harvest,
      trigger: TRIGGERS.onTurnEnd,
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: null,
      rngNext: 0.7,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Harvest in harsh-sun (Desolate Land) with consumed berry, when on-turn-end, then always restores berry", () => {
    // Source: Showdown data/abilities.ts -- harvest: `this.field.isWeather(['sunnyday', 'desolateland'])`
    // Both regular sun and harsh sun (Desolate Land) guarantee Harvest activation.
    // Bug #673: Previously only checked for "sun", missing "harsh-sun".
    const harvestVolatiles = new Map([
      ["harvest-berry", { turnsLeft: -1, data: { berryId: ITEMS.lumBerry } }],
    ]);
    const ctx = createAbilityContext({
      ability: CORE_ABILITIES.harvest,
      trigger: TRIGGERS.onTurnEnd,
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: { type: WEATHER.harshSun },
      rngNext: 0.9, // Would fail 50% roll, but harsh-sun makes it 100%
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const itemEffect = result.effects.find((e) => e.effectType === "item-restore");
    expect(itemEffect?.item).toBe(ITEMS.lumBerry);
  });
});

// ===========================================================================
// on-switch-in: Frisk (Gen 6: reveals ALL foes)
// ===========================================================================

describe("Frisk (Gen 6: reveals all foes)", () => {
  it("given Frisk, when opponent has a held item, then reveals it", () => {
    // Source: Showdown data/abilities.ts (base Gen 6+) -- frisk: reveals ALL foes
    // Source: Bulbapedia "Frisk" Gen VI -- "Checks all foes' held items."
    // In singles, there is only one foe so result is same as Gen 5 single reveal
    const opponent = createSyntheticOnFieldPokemon({
      ability: CORE_ABILITIES.none,
      heldItem: CORE_ITEMS.choiceBand,
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.frisk,
      trigger: TRIGGERS.onSwitchIn,
      opponent,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain(CORE_ITEMS.choiceBand);
  });

  it("given Frisk, when opponent has no held item, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- frisk: only reveals if item exists
    const opponent = createSyntheticOnFieldPokemon({
      ability: CORE_ABILITIES.none,
      heldItem: null,
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.frisk,
      trigger: TRIGGERS.onSwitchIn,
      opponent,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Oblivious
// ===========================================================================

describe("Oblivious (passive-immunity)", () => {
  it("given Oblivious, when targeted by Attract, then blocks infatuation", () => {
    // Source: Showdown data/abilities.ts -- oblivious: blocks Attract
    const attractMove = createSyntheticMoveFromCanonical(TYPES.normal, {
      id: MOVES.attract,
      category: "status",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.oblivious,
      trigger: TRIGGERS.passiveImmunity,
      move: attractMove,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given Oblivious, when targeted by Captivate, then blocks it", () => {
    // Source: Showdown data/abilities.ts -- oblivious: blocks Captivate
    const captivateMove = createSyntheticMoveFromCanonical(TYPES.normal, {
      id: MOVES.captivate,
      category: "status",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.oblivious,
      trigger: TRIGGERS.passiveImmunity,
      move: captivateMove,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });
});

// ===========================================================================
// on-damage-calc: Serene Grace (Gen 6: no Secret Power exclusion)
// ===========================================================================

describe("Serene Grace (Gen 6: no Secret Power exclusion)", () => {
  it("given Serene Grace, when used with any move, then activates and doubles secondary chance", () => {
    // Source: Showdown data/abilities.ts (base Gen 6+) -- serenegrace: no move exclusions
    // Gen 6 change: Secret Power exclusion removed (was Gen 5 specific)
    const tbolt = createSyntheticMoveFromCanonical(TYPES.electric, { id: MOVES.thunderbolt });
    const ctx = createAbilityContext({
      ability: ABILITIES.sereneGrace,
      trigger: TRIGGERS.onDamageCalc,
      move: tbolt,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Serene Grace, when used with Secret Power (Gen 5 excluded it), then still activates in Gen 6", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- excluded secretpower (Gen 5 only)
    // Source: Showdown data/abilities.ts (base) -- no exclusion in Gen 6
    const secretPower = createSyntheticMoveFromCanonical(TYPES.normal, { id: MOVES.secretPower });
    const ctx = createAbilityContext({
      ability: ABILITIES.sereneGrace,
      trigger: TRIGGERS.onDamageCalc,
      move: secretPower,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });
});

describe("getSereneGraceMultiplier utility (Gen 6)", () => {
  it("given serene-grace ability, then returns 2x multiplier", () => {
    // Source: Showdown data/abilities.ts -- serenegrace: doubles secondary chance
    expect(getSereneGraceMultiplier(ABILITIES.sereneGrace)).toBe(SERENE_GRACE_CHANCE_MULTIPLIER);
    expect(getSereneGraceMultiplier(ABILITIES.sereneGrace)).toBe(SERENE_GRACE_CHANCE_MULTIPLIER);
  });

  it("given a non-Serene Grace ability, then returns 1 (no boost)", () => {
    // Source: Showdown data/abilities.ts -- only serenegrace activates this
    expect(getSereneGraceMultiplier(CORE_ABILITIES.intimidate)).toBe(1);
  });
});

// ===========================================================================
// on-damage-calc: Friend Guard (doubles only)
// ===========================================================================

describe("Friend Guard (on-damage-calc)", () => {
  it("given Friend Guard in doubles, when on-damage-calc, then activates damage reduction", () => {
    // Source: Showdown data/abilities.ts -- friendguard: reduces ally damage by 25% in doubles
    // Source: Bulbapedia "Friend Guard" -- "Reduces damage done to allies by 25%."
    const ctx = createAbilityContext({
      ability: ABILITIES.friendGuard,
      trigger: TRIGGERS.onDamageCalc,
      format: "doubles",
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("damage-reduction");
  });

  it("given Friend Guard in singles format, when on-damage-calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- friendguard: no allies in singles
    const ctx = createAbilityContext({
      ability: ABILITIES.friendGuard,
      trigger: TRIGGERS.onDamageCalc,
      format: "singles",
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Constants
// ===========================================================================

describe("Constant values", () => {
  it("FRIEND_GUARD_DAMAGE_MULTIPLIER is 0.75", () => {
    // Source: Showdown data/abilities.ts -- friendguard: chainModify(0.75)
    expect(FRIEND_GUARD_DAMAGE_MULTIPLIER).toBe(0.75);
  });

  it("SERENE_GRACE_CHANCE_MULTIPLIER is 2", () => {
    // Source: Showdown data/abilities.ts -- serenegrace: secondary.chance *= 2
    expect(SERENE_GRACE_CHANCE_MULTIPLIER).toBe(2);
  });

  it("HARVEST_BASE_PROBABILITY is 0.5 (50%)", () => {
    // Source: Showdown data/abilities.ts -- harvest: randomChance(1, 2) = 50%
    expect(HARVEST_BASE_PROBABILITY).toBe(0.5);
  });

  it("HARVEST_SUN_PROBABILITY is 1.0 (100%)", () => {
    // Source: Showdown data/abilities.ts -- harvest: 100% in sun
    expect(HARVEST_SUN_PROBABILITY).toBe(1.0);
  });

  it("HEALER_PROBABILITY is 0.3 (30%)", () => {
    // Source: Showdown data/abilities.ts -- healer: randomChance(3, 10) = 30%
    expect(HEALER_PROBABILITY).toBe(0.3);
  });

  it("HEAVY_METAL_WEIGHT_MULTIPLIER is 2", () => {
    // Source: Showdown data/abilities.ts -- heavymetal: weighthg * 2
    expect(HEAVY_METAL_WEIGHT_MULTIPLIER).toBe(2);
  });

  it("LIGHT_METAL_WEIGHT_MULTIPLIER is 0.5", () => {
    // Source: Showdown data/abilities.ts -- lightmetal: trunc(weighthg / 2) = 50%
    expect(LIGHT_METAL_WEIGHT_MULTIPLIER).toBe(0.5);
  });
});

// ===========================================================================
// Weight multiplier utility
// ===========================================================================

describe("getWeightMultiplier utility", () => {
  it("given heavy-metal, then returns 2x multiplier", () => {
    // Source: Showdown data/abilities.ts -- heavymetal: doubles weight
    expect(getWeightMultiplier(ABILITIES.heavyMetal)).toBe(HEAVY_METAL_WEIGHT_MULTIPLIER);
  });

  it("given light-metal, then returns 0.5x multiplier", () => {
    // Source: Showdown data/abilities.ts -- lightmetal: halves weight
    expect(getWeightMultiplier(ABILITIES.lightMetal)).toBe(LIGHT_METAL_WEIGHT_MULTIPLIER);
  });

  it("given a non-weight-modifying ability, then returns 1 (no change)", () => {
    // Source: Showdown data/abilities.ts -- only heavy-metal and light-metal modify weight
    expect(getWeightMultiplier(CORE_ABILITIES.levitate)).toBe(1);
  });
});
