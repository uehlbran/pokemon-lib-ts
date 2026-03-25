import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  handleGen5SwitchAbility,
  isMoldBreakerAbility,
  isTrappedByAbility,
  VICTORY_STAR_ACCURACY_MULTIPLIER,
} from "../src/Gen5AbilitiesSwitch";
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
 * Gen 5 Ability Tests — switch-in, contact, passive, and utility abilities.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 * Source: references/pokemon-showdown/data/abilities.ts
 * Source: Bulbapedia — individual ability pages
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
  gender?: Gender;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: overrides.speciesId ?? SPECIES_IDS.charizard,
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
      defense: overrides.defense ?? 100,
      spAttack: 100,
      spDefense: overrides.spDefense ?? 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  substituteHp?: number;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      defense: overrides.defense,
      spDefense: overrides.spDefense,
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
    substituteHp: overrides.substituteHp ?? 0,
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
  } as unknown as BattleSide;
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: "singles",
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

function makeMove(type: PokemonType, overrides?: Partial<MoveData>): MoveData {
  const moveId = overrides?.id ?? MOVE_IDS.tackle;
  const baseMove = gen5DataManager.getMove(moveId);
  return {
    ...baseMove,
    id: moveId,
    displayName: overrides?.displayName ?? baseMove.displayName,
    type: overrides?.type ?? type ?? baseMove.type,
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
  opponent?: ReturnType<typeof makeActivePokemon>;
  status?: STATUS_IDS.burn | STATUS_IDS.poison | STATUS_IDS.badlyPoisoned | STATUS_IDS.paralysis | STATUS_IDS.sleep | STATUS_IDS.freeze | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
  rngNextValues?: number[];
  move?: MoveData;
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  substituteHp?: number;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    heldItem: opts.heldItem,
    defense: opts.defense,
    spDefense: opts.spDefense,
    gender: opts.gender,
    volatiles: opts.volatiles,
    substituteHp: opts.substituteHp,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    statChange: opts.statChange,
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
// ON-SWITCH-IN ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-switch-in -- Intimidate", () => {
  it("given Intimidate, when Pokemon switches in with opponent present, then lowers opponent Attack by 1", () => {
    // Source: Showdown data/abilities.ts — Intimidate: -1 Atk to opponent on switch-in
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, nickname: "Charizard" });
    const ctx = makeContext({ ability: ABILITY_IDS.intimidate, trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "opponent",
      stat: "attack",
      stages: -1,
    });
  });

  it("given Intimidate, when opponent has Substitute, then does not lower Attack", () => {
    // Source: Showdown data/abilities.ts — Intimidate blocked by Substitute
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      nickname: "Charizard",
      substituteHp: 50,
    });
    const ctx = makeContext({ ability: ABILITY_IDS.intimidate, trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Pressure", () => {
  it("given Pressure, when Pokemon switches in, then emits announcement message", () => {
    // Source: Showdown data/abilities.ts — Pressure onStart message
    const ctx = makeContext({ ability: ABILITY_IDS.pressure, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Pressure");
  });

  it("given Pressure, when Pokemon switches in, then effect is none (informational only)", () => {
    // Source: Showdown data/abilities.ts — Pressure onStart has no stat/status effect
    const ctx = makeContext({ ability: ABILITY_IDS.pressure, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Weather setters", () => {
  it("given Drizzle, when Pokemon switches in, then sets permanent rain", () => {
    // Source: Showdown Gen 5 — Drizzle sets permanent rain (weatherTurns=-1)
    const ctx = makeContext({ ability: ABILITY_IDS.drizzle, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: WEATHER_IDS.rain,
      weatherTurns: -1,
    });
  });

  it("given Drought, when Pokemon switches in, then sets permanent sun", () => {
    // Source: Showdown Gen 5 — Drought sets permanent sun (weatherTurns=-1)
    const ctx = makeContext({ ability: ABILITY_IDS.drought, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: WEATHER_IDS.sun,
      weatherTurns: -1,
    });
  });

  it("given Sand Stream, when Pokemon switches in, then sets permanent sandstorm", () => {
    // Source: Showdown Gen 5 — Sand Stream sets permanent sandstorm (weatherTurns=-1)
    const sandWeather = ABILITY_IDS.sandStream.replace("-stream", "");
    const ctx = makeContext({ ability: ABILITY_IDS.sandStream, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: sandWeather,
      weatherTurns: -1,
    });
  });

  it("given Snow Warning, when Pokemon switches in, then sets permanent hail", () => {
    // Source: Showdown Gen 5 — Snow Warning sets permanent hail (weatherTurns=-1)
    const ctx = makeContext({ ability: ABILITY_IDS.snowWarning, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: WEATHER_IDS.hail,
      weatherTurns: -1,
    });
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Download", () => {
  it("given Download with opponent's Def < SpDef, when switches in, then raises Attack", () => {
    // Source: Showdown data/abilities.ts — Download compares foe Def vs SpDef
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      defense: 80,
      spDefense: 120,
    });
    const ctx = makeContext({ ability: ABILITY_IDS.download, trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Download with opponent's Def >= SpDef, when switches in, then raises SpAtk", () => {
    // Source: Showdown data/abilities.ts — Download: Def >= SpDef means raise SpAtk
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      defense: 120,
      spDefense: 80,
    });
    const ctx = makeContext({ ability: ABILITY_IDS.download, trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Trace", () => {
  it("given Trace with copyable opponent ability, when switches in, then copies ability", () => {
    // Source: Showdown data/abilities.ts — Trace copies opponent's ability
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, nickname: "Foe" });
    const ctx = makeContext({ ability: ABILITY_IDS.trace, trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: ABILITY_IDS.blaze,
    });
  });

  it("given Trace with Illusion opponent, when switches in, then fails (uncopyable)", () => {
    // Source: Bulbapedia — Trace cannot copy Illusion in Gen 5
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.illusion, nickname: "Foe" });
    const ctx = makeContext({ ability: ABILITY_IDS.trace, trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Mold Breaker / Teravolt / Turboblaze", () => {
  it("given Mold Breaker, when switches in, then emits 'breaks the mold' message", () => {
    // Source: Showdown data/abilities.ts — Mold Breaker switch-in announcement
    const ctx = makeContext({ ability: ABILITY_IDS.moldBreaker, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("breaks the mold");
  });

  it("given Teravolt, when switches in, then emits 'bursting aura' message", () => {
    // Source: Showdown data/abilities.ts — Teravolt switch-in announcement
    const ctx = makeContext({ ability: ABILITY_IDS.teravolt, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("bursting aura");
  });

  it("given Turboblaze, when switches in, then emits 'blazing aura' message", () => {
    // Source: Showdown data/abilities.ts — Turboblaze switch-in announcement
    const ctx = makeContext({ ability: ABILITY_IDS.turboblaze, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("blazing aura");
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Imposter", () => {
  it("given Imposter with opponent present, when switches in, then emits transform message", () => {
    // Source: Showdown data/abilities.ts — Imposter transforms into opponent
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, nickname: "Foe" });
    const ctx = makeContext({ ability: ABILITY_IDS.imposter, trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("transformed into");
  });

  it("given Imposter without opponent, when switches in, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Imposter requires a target
    const ctx = makeContext({ ability: ABILITY_IDS.imposter, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Illusion", () => {
  it("given Illusion, when switches in, then sets illusion volatile", () => {
    // Source: Showdown data/abilities.ts — Illusion onStart
    const ctx = makeContext({ ability: ABILITY_IDS.illusion, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: ABILITY_IDS.illusion,
    });
  });

  it("given Illusion, when switches in, then no messages (disguise is silent)", () => {
    // Source: Showdown data/abilities.ts — Illusion: no message on activation
    const ctx = makeContext({ ability: ABILITY_IDS.illusion, trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.messages).toHaveLength(0);
  });
});

// ===========================================================================
// ON-SWITCH-OUT ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-switch-out -- Regenerator", () => {
  it("given Regenerator with 300 max HP, when switches out, then heals 100 HP (floor(300/3))", () => {
    // Source: Showdown data/abilities.ts — Regenerator: pokemon.heal(pokemon.baseMaxhp / 3)
    // floor(300 / 3) = 100
    const ctx = makeContext({
      ability: ABILITY_IDS.regenerator,
      trigger: "on-switch-out",
      maxHp: 300,
      currentHp: 100,
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(true);
    // Source: Showdown data/abilities.ts — Regenerator heals floor(maxHp/3) = floor(300/3) = 100
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 100 });
  });

  it("given Regenerator with 200 max HP, when switches out, then heals 66 HP (floor(200/3))", () => {
    // Source: Showdown data/abilities.ts — Regenerator: heals floor(maxHp/3)
    // floor(200 / 3) = 66
    const ctx = makeContext({
      ability: ABILITY_IDS.regenerator,
      trigger: "on-switch-out",
      maxHp: 200,
      currentHp: 50,
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(true);
    // Source: Showdown data/abilities.ts — Regenerator heals floor(maxHp/3) = floor(200/3) = 66
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 66 });
  });
});

describe("handleGen5SwitchAbility on-switch-out -- Natural Cure", () => {
  it("given Natural Cure with burn status, when switches out, then cures status", () => {
    // Source: Showdown data/abilities.ts — Natural Cure: cures status on switch-out
    const ctx = makeContext({
      ability: ABILITY_IDS.naturalCure,
      trigger: "on-switch-out",
      status: STATUS_IDS.burn,
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "status-cure", target: "self" });
  });

  it("given Natural Cure with no status, when switches out, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Natural Cure: no-op without status
    const ctx = makeContext({
      ability: ABILITY_IDS.naturalCure,
      trigger: "on-switch-out",
      status: null,
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// ON-CONTACT ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-contact -- Static", () => {
  it("given Static with RNG < 0.3, when attacker makes contact, then paralyzes attacker", () => {
    // Source: Showdown data/abilities.ts — Static: 30% paralysis on contact
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.static,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1], // < 0.3 = triggers
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUS_IDS.paralysis,
    });
  });

  it("given Static with RNG >= 0.3, when attacker makes contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Static: 30% threshold
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.static,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.5], // >= 0.3 = no trigger
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Flame Body", () => {
  it("given Flame Body with RNG < 0.3, when attacker makes contact, then burns attacker", () => {
    // Source: Showdown data/abilities.ts — Flame Body: 30% burn on contact
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.flameBody,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUS_IDS.burn,
    });
  });

  it("given Flame Body when attacker already has status, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — cannot inflict status if already statused
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, status: STATUS_IDS.poison });
    const ctx = makeContext({
      ability: ABILITY_IDS.flameBody,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Poison Point", () => {
  it("given Poison Point with RNG < 0.3, when attacker makes contact, then poisons attacker", () => {
    // Source: Showdown data/abilities.ts — Poison Point: 30% poison on contact
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.poisonPoint,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.2],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUS_IDS.poison,
    });
  });

  it("given Poison Point with RNG >= 0.3, when attacker makes contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Poison Point: 30% threshold
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.poisonPoint,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.9],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Rough Skin / Iron Barbs", () => {
  it("given Rough Skin with 200 HP attacker, when contact, then deals 25 chip (floor(200/8))", () => {
    // Source: Showdown data/abilities.ts — Rough Skin: source.baseMaxhp / 8
    // floor(200 / 8) = 25
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, maxHp: 200 });
    const ctx = makeContext({
      ability: ABILITY_IDS.roughSkin,
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 25,
    });
  });

  it("given Iron Barbs with 160 HP attacker, when contact, then deals 20 chip (floor(160/8))", () => {
    // Source: Showdown data/abilities.ts — Iron Barbs: identical to Rough Skin (1/8 HP)
    // floor(160 / 8) = 20
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, maxHp: 160 });
    const ctx = makeContext({
      ability: ABILITY_IDS.ironBarbs,
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 20,
    });
    expect(result.messages[0]).toContain("Iron Barbs");
  });
});

describe("handleGen5SwitchAbility on-contact -- Effect Spore", () => {
  it("given Effect Spore with roll 5 (0-10 range), when contact, then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts — Effect Spore: roll < 11 = sleep
    // RNG value 0.05 => floor(0.05 * 100) = 5
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.effectSpore,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.05],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUS_IDS.sleep,
    });
  });

  it("given Effect Spore with roll 15 (11-20 range), when contact, then inflicts poison", () => {
    // Source: Showdown data/abilities.ts — Effect Spore: 11 <= roll < 21 = poison
    // RNG value 0.15 => floor(0.15 * 100) = 15
    // Note: Showdown thresholds are < 11 = sleep, < 21 = poison, < 30 = paralysis
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.effectSpore,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.15],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUS_IDS.poison,
    });
  });

  it("given Effect Spore with Grass-type attacker, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Gen 5+: Grass types immune to Effect Spore
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, types: [TYPE_IDS.grass] });
    const ctx = makeContext({
      ability: ABILITY_IDS.effectSpore,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.05],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Cute Charm", () => {
  it("given Cute Charm with opposite genders and RNG < 0.3, when contact, then infatuates", () => {
    // Source: Showdown data/abilities.ts — Cute Charm: 30% infatuation, opposite genders required
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      gender: "male",
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.cuteCharm,
      trigger: "on-contact",
      opponent,
      gender: "female",
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "opponent",
      volatile: CORE_VOLATILE_IDS.infatuation,
    });
  });

  it("given Cute Charm with same genders, when contact, then does not infatuate", () => {
    // Source: Showdown data/abilities.ts — Cute Charm: fails with same gender
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      gender: "male",
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.cuteCharm,
      trigger: "on-contact",
      opponent,
      gender: "male",
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Aftermath", () => {
  it("given Aftermath holder at 0 HP and 400 HP attacker, when contact KOs, then deals 100 chip", () => {
    // Source: Showdown data/abilities.ts — Aftermath: source.baseMaxhp / 4
    // floor(400 / 4) = 100
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, maxHp: 400 });
    const ctx = makeContext({
      ability: ABILITY_IDS.aftermath,
      trigger: "on-contact",
      opponent,
      currentHp: 0,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 100,
    });
  });

  it("given Aftermath holder still alive, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Aftermath only triggers when holder faints
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, maxHp: 400 });
    const ctx = makeContext({
      ability: ABILITY_IDS.aftermath,
      trigger: "on-contact",
      opponent,
      currentHp: 50,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Mummy", () => {
  it("given Mummy and attacker with regular ability, when contact, then changes attacker ability to Mummy", () => {
    // Source: Showdown data/abilities.ts — Mummy: source.setAbility('mummy', target)
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze, nickname: "Foe" });
    const ctx = makeContext({
      ability: ABILITY_IDS.mummy,
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "opponent",
      newAbility: ABILITY_IDS.mummy,
    });
  });

  it("given Mummy and attacker already has Mummy, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Mummy: sourceAbility.id === 'mummy' check
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.mummy, nickname: "Foe" });
    const ctx = makeContext({
      ability: ABILITY_IDS.mummy,
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Mummy and attacker with Multitype, when contact, then does not overwrite (unsuppressable)", () => {
    // Source: Showdown data/abilities.ts — Mummy: cantsuppress flag blocks
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.multitype, nickname: "Foe" });
    const ctx = makeContext({
      ability: ABILITY_IDS.mummy,
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Poison Touch", () => {
  it("given Poison Touch attacker with RNG < 0.3, when making contact, then poisons target", () => {
    // Source: Showdown data/abilities.ts — Poison Touch: 30% poison on own contact moves
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.poisonTouch,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUS_IDS.poison,
    });
  });

  it("given Poison Touch attacker with RNG >= 0.3, when making contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Poison Touch: 30% threshold
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.poisonTouch,
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.5],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Pickpocket", () => {
  it("given Pickpocket holder without item and attacker with item, when contact, then steals item", () => {
    // Source: Showdown data/abilities.ts — Pickpocket: steals attacker's item
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      heldItem: ITEM_IDS.leftovers,
      nickname: "Foe",
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.pickpocket,
      trigger: "on-contact",
      opponent,
      heldItem: null,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain(ITEM_IDS.leftovers);
  });

  it("given Pickpocket holder already has item, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Pickpocket: target.item check
    const opponent = makeActivePokemon({
      ability: ABILITY_IDS.blaze,
      heldItem: ITEM_IDS.leftovers,
      nickname: "Foe",
    });
    const ctx = makeContext({
      ability: ABILITY_IDS.pickpocket,
      trigger: "on-contact",
      opponent,
      heldItem: ITEM_IDS.choiceBand,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// ON-DAMAGE-TAKEN ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-damage-taken -- Cursed Body", () => {
  it("given Cursed Body with RNG < 0.3, when hit, then disables attacker's move", () => {
    // Source: Showdown data/abilities.ts — Cursed Body: randomChance(3, 10) = 30%
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.cursedBody,
      trigger: "on-damage-taken",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "opponent",
      volatile: MOVE_IDS.disable,
      data: { turnsLeft: 4 },
    });
  });

  it("given Cursed Body when attacker already disabled, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Cursed Body: source.volatiles['disable'] check
    const disableVolatile = new Map([[MOVE_IDS.disable, { turnsLeft: 3 }]]) as unknown as Map<
      string,
      { turnsLeft: number }
    >;
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    (opponent as any).volatileStatuses = disableVolatile;
    const ctx = makeContext({
      ability: ABILITY_IDS.cursedBody,
      trigger: "on-damage-taken",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-damage-taken -- Rattled", () => {
  it("given Rattled hit by Dark-type move, when takes damage, then Speed +1", () => {
    // Source: Showdown data/abilities.ts — Rattled: ['Dark', 'Bug', 'Ghost'].includes(move.type)
    const move = makeMove(TYPE_IDS.dark);
    const ctx = makeContext({
      ability: ABILITY_IDS.rattled,
      trigger: "on-damage-taken",
      move,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Rattled hit by Bug-type move, when takes damage, then Speed +1", () => {
    // Source: Showdown data/abilities.ts — Rattled triggers on Bug moves too
    const move = makeMove(TYPE_IDS.bug);
    const ctx = makeContext({
      ability: ABILITY_IDS.rattled,
      trigger: "on-damage-taken",
      move,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Rattled hit by Normal-type move, when takes damage, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Rattled: only Bug/Dark/Ghost
    const move = makeMove(TYPE_IDS.normal);
    const ctx = makeContext({
      ability: ABILITY_IDS.rattled,
      trigger: "on-damage-taken",
      move,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-damage-taken -- Illusion break", () => {
  it("given Illusion active, when takes damaging hit, then Illusion breaks", () => {
    // Source: Showdown data/abilities.ts — Illusion: onDamagingHit breaks disguise
    const volatiles = new Map([[ABILITY_IDS.illusion, { turnsLeft: -1 }]]) as unknown as Map<
      string,
      { turnsLeft: number }
    >;
    const ctx = makeContext({
      ability: ABILITY_IDS.illusion,
      trigger: "on-damage-taken",
      volatiles,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Illusion was broken");
  });

  it("given no Illusion volatile, when takes damaging hit, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Illusion: only breaks if volatile exists
    const ctx = makeContext({
      ability: ABILITY_IDS.illusion,
      trigger: "on-damage-taken",
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-status-inflicted -- Synchronize", () => {
  it("given Synchronize with burn, when status inflicted, then spreads burn to opponent", () => {
    // Source: Showdown data/abilities.ts — Synchronize: onAfterSetStatus fires when status is SET
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.synchronize,
      trigger: "on-status-inflicted",
      status: STATUS_IDS.burn,
      opponent,
    });
    const result = handleGen5SwitchAbility("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUS_IDS.burn,
    });
  });

  it("given Synchronize with sleep, when status inflicted, then does NOT spread (sleep excluded)", () => {
    // Source: Showdown data/abilities.ts — Synchronize: status.id !== 'slp' && !== 'frz'
    const opponent = makeActivePokemon({ ability: ABILITY_IDS.blaze });
    const ctx = makeContext({
      ability: ABILITY_IDS.synchronize,
      trigger: "on-status-inflicted",
      status: STATUS_IDS.sleep,
      opponent,
    });
    const result = handleGen5SwitchAbility("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// PASSIVE-IMMUNITY ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility passive-immunity -- Levitate", () => {
  it("given Levitate and incoming Ground move, when passive check, then blocks move", () => {
    // Source: Showdown data/abilities.ts — Levitate: Ground immunity
    const move = makeMove(TYPE_IDS.ground);
    const ctx = makeContext({ ability: ABILITY_IDS.levitate, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
  });

  it("given Levitate and incoming Fire move, when passive check, then does not block", () => {
    // Source: Showdown data/abilities.ts — Levitate: only Ground
    const move = makeMove(TYPE_IDS.fire);
    const ctx = makeContext({ ability: ABILITY_IDS.levitate, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Flash Fire", () => {
  it("given Flash Fire and incoming Fire move, when passive check, then activates boost", () => {
    // Source: Showdown data/abilities.ts — Flash Fire: Fire immunity + flash-fire volatile
    const move = makeMove(TYPE_IDS.fire);
    const ctx = makeContext({ ability: ABILITY_IDS.flashFire, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: ABILITY_IDS.flashFire,
    });
  });

  it("given Flash Fire when frozen, when hit by Fire, then does NOT activate (allows thaw)", () => {
    // Source: Showdown — frozen Pokemon cannot activate Flash Fire
    const move = makeMove(TYPE_IDS.fire);
    const ctx = makeContext({
      ability: ABILITY_IDS.flashFire,
      trigger: "passive-immunity",
      move,
      status: STATUS_IDS.freeze,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Water Absorb", () => {
  it("given Water Absorb with 200 HP and incoming Water move, when passive check, then heals 50 HP", () => {
    // Source: Showdown data/abilities.ts — Water Absorb: heal 1/4 max HP
    // floor(200 / 4) = 50
    const move = makeMove(TYPE_IDS.water);
    const ctx = makeContext({
      ability: ABILITY_IDS.waterAbsorb,
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    // Source: Showdown data/abilities.ts — Water Absorb heals floor(maxHp/4) = floor(200/4) = 50
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 50 });
  });

  it("given Water Absorb and incoming Fire move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Water Absorb: only Water
    const move = makeMove(TYPE_IDS.fire);
    const ctx = makeContext({
      ability: ABILITY_IDS.waterAbsorb,
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Volt Absorb", () => {
  it("given Volt Absorb with 160 HP and incoming Electric move, when passive check, then heals 40 HP", () => {
    // Source: Showdown data/abilities.ts — Volt Absorb: heal 1/4 max HP
    // floor(160 / 4) = 40
    const move = makeMove(TYPE_IDS.electric);
    const ctx = makeContext({
      ability: ABILITY_IDS.voltAbsorb,
      trigger: "passive-immunity",
      move,
      maxHp: 160,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    // Source: Showdown data/abilities.ts — Volt Absorb heals floor(maxHp/4) = floor(160/4) = 40
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 40 });
  });

  it("given Volt Absorb and incoming Water move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Volt Absorb: only Electric
    const move = makeMove(TYPE_IDS.water);
    const ctx = makeContext({
      ability: ABILITY_IDS.voltAbsorb,
      trigger: "passive-immunity",
      move,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Motor Drive", () => {
  it("given Motor Drive and incoming Electric move, when passive check, then raises Speed +1", () => {
    // Source: Showdown data/abilities.ts — Motor Drive: Electric immune + Speed +1
    const move = makeMove(TYPE_IDS.electric);
    const ctx = makeContext({ ability: ABILITY_IDS.motorDrive, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Motor Drive and incoming Ground move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Motor Drive: only Electric
    const move = makeMove(TYPE_IDS.ground);
    const ctx = makeContext({ ability: ABILITY_IDS.motorDrive, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Dry Skin", () => {
  it("given Dry Skin with 200 HP and incoming Water move, when passive check, then heals 50 HP", () => {
    // Source: Showdown data/abilities.ts — Dry Skin: Water immune + heal 1/4 HP
    // floor(200 / 4) = 50
    const move = makeMove(TYPE_IDS.water);
    const ctx = makeContext({
      ability: ABILITY_IDS.drySkin,
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    // Source: Showdown data/abilities.ts — Dry Skin heals floor(maxHp/4) = floor(200/4) = 50 from Water
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 50 });
  });

  it("given Dry Skin and incoming Fire move, when passive check, then does not activate (Fire weakness handled in damage calc)", () => {
    // Source: Showdown data/abilities.ts — Dry Skin passive: only Water
    const move = makeMove(TYPE_IDS.fire);
    const ctx = makeContext({
      ability: ABILITY_IDS.drySkin,
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Overcoat", () => {
  it("given Overcoat, when passive check triggered, then returns no passive-immunity effect", () => {
    // Source: Showdown data/mods/gen5/abilities.ts — Overcoat's weather immunity is handled
    // by the weather module, not the passive-immunity ability hook.
    const ctx = makeContext({ ability: ABILITY_IDS.overcoat, trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Overcoat, when passive check triggered, then no messages (silent)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts — Overcoat: no announcement
    const ctx = makeContext({ ability: ABILITY_IDS.overcoat, trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.messages).toHaveLength(0);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Sand Rush", () => {
  it("given Sand Rush, when passive check triggered, then returns no passive-immunity effect", () => {
    // Source: Showdown data/abilities.ts — Sand Rush's sandstorm immunity is handled by the
    // weather module, not the passive-immunity ability hook.
    const ctx = makeContext({ ability: ABILITY_IDS.sandRush, trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Sand Rush, when passive check triggered, then speed doubling handled elsewhere", () => {
    // Source: Bulbapedia — Sand Rush: speed handled in getEffectiveSpeed, not here
    const ctx = makeContext({ ability: ABILITY_IDS.sandRush, trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    // Just confirm it remains a no-op, not a stat-change hook.
    expect(result.effects.every((e) => e.effectType !== "stat-change")).toBe(true);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Sap Sipper", () => {
  it("given Sap Sipper and incoming Grass move, when passive check, then raises Attack +1", () => {
    // Source: Showdown data/abilities.ts — Sap Sipper: Grass immune + Atk +1
    const move = makeMove(TYPE_IDS.grass);
    const ctx = makeContext({ ability: ABILITY_IDS.sapSipper, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Sap Sipper and incoming Water move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Sap Sipper: only Grass
    const move = makeMove(TYPE_IDS.water);
    const ctx = makeContext({ ability: ABILITY_IDS.sapSipper, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Magic Guard", () => {
  it("given Magic Guard, when passive check triggered, then activates (signals indirect damage immunity)", () => {
    // Source: Showdown data/abilities.ts — Magic Guard: immune to non-move damage
    const ctx = makeContext({ ability: ABILITY_IDS.magicGuard, trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
  });

  it("given Magic Guard, when passive check triggered, then effect is none (flag only)", () => {
    // Source: Showdown data/abilities.ts — Magic Guard: no specific effects, just a flag
    const ctx = makeContext({ ability: ABILITY_IDS.magicGuard, trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Storm Drain (Gen 5+)", () => {
  it("given Storm Drain and incoming Water move, when passive check, then raises SpAtk +1", () => {
    // Source: Bulbapedia — Storm Drain (Gen 5+): Water immune + SpAtk +1
    // Gen 5 changed from redirect-only (Gen 4) to immunity + boost
    const move = makeMove(TYPE_IDS.water);
    const ctx = makeContext({ ability: ABILITY_IDS.stormDrain, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Storm Drain and incoming Fire move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Storm Drain: only Water
    const move = makeMove(TYPE_IDS.fire);
    const ctx = makeContext({ ability: ABILITY_IDS.stormDrain, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Lightning Rod (Gen 5+)", () => {
  it("given Lightning Rod and incoming Electric move, when passive check, then raises SpAtk +1", () => {
    // Source: Bulbapedia — Lightning Rod (Gen 5+): Electric immune + SpAtk +1
    // Gen 5 changed from redirect-only (Gen 3-4) to immunity + boost
    const move = makeMove(TYPE_IDS.electric);
    const ctx = makeContext({ ability: ABILITY_IDS.lightningRod, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Lightning Rod and incoming Water move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Lightning Rod: only Electric
    const move = makeMove(TYPE_IDS.water);
    const ctx = makeContext({ ability: ABILITY_IDS.lightningRod, trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// ON-STAT-CHANGE ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-stat-change -- Big Pecks", () => {
  it("given Big Pecks and an incoming Defense drop, when stat change triggers, then activates to block it", () => {
    // Source: Showdown data/abilities.ts — Big Pecks onTryBoost:
    //   if (boost.def && boost.def < 0) { delete boost.def; ... }
    // Source: Bulbapedia — Big Pecks: "Prevents Defense from being lowered."
    const ctx = makeContext({
      ability: ABILITY_IDS.bigPecks,
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -1, source: "opponent" },
    });
    const result = handleGen5SwitchAbility("on-stat-change", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Defense");
  });

  it("given Big Pecks and an incoming Defense drop, when stat change triggers, then effect is informational only", () => {
    // Source: Showdown — Big Pecks: engine reads activated=true to block the drop
    const ctx = makeContext({
      ability: ABILITY_IDS.bigPecks,
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -2, source: "opponent" },
    });
    const result = handleGen5SwitchAbility("on-stat-change", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });

  it("given Big Pecks and an incoming Attack drop (not Defense), when stat change triggers, then does NOT activate", () => {
    // Source: Showdown — Big Pecks only blocks Defense drops, not other stat drops
    const ctx = makeContext({
      ability: ABILITY_IDS.bigPecks,
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen5SwitchAbility("on-stat-change", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Big Pecks and a Defense boost (positive stage), when stat change triggers, then does NOT activate", () => {
    // Source: Showdown — Big Pecks only blocks drops; boosts are not blocked
    const ctx = makeContext({
      ability: ABILITY_IDS.bigPecks,
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: 1, source: "opponent" },
    });
    const result = handleGen5SwitchAbility("on-stat-change", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// ON-ACCURACY-CHECK ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-accuracy-check -- Victory Star", () => {
  it("given Victory Star, when accuracy check triggers, then activates", () => {
    // Source: Showdown data/abilities.ts — Victory Star: accuracy * 4506/4096
    const ctx = makeContext({ ability: ABILITY_IDS.victoryStar, trigger: "on-accuracy-check" });
    const result = handleGen5SwitchAbility("on-accuracy-check", ctx);

    expect(result.activated).toBe(true);
  });

  it("given Victory Star, when accuracy check triggers, then effect is informational", () => {
    // Source: Showdown data/abilities.ts — actual accuracy modification is in engine
    const ctx = makeContext({ ability: ABILITY_IDS.victoryStar, trigger: "on-accuracy-check" });
    const result = handleGen5SwitchAbility("on-accuracy-check", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });
});

// ===========================================================================
// TRAPPING ABILITIES
// ===========================================================================

describe("isTrappedByAbility", () => {
  it("given Shadow Tag trapper and non-Shadow-Tag opponent, when check, then trapped", () => {
    // Source: Showdown data/abilities.ts — Shadow Tag: traps unless opponent also has Shadow Tag
    const result = isTrappedByAbility(
      { ability: ABILITY_IDS.shadowTag },
      { ability: ABILITY_IDS.blaze, types: [TYPE_IDS.fire] },
      true,
    );
    // Source: Showdown data/abilities.ts — Shadow Tag: traps unless opponent also has Shadow Tag
    expect(result).toBe(true);
  });

  it("given Shadow Tag trapper and Shadow Tag opponent, when check, then not trapped", () => {
    // Source: Showdown data/abilities.ts — Shadow Tag: does not trap another Shadow Tag
    const result = isTrappedByAbility(
      { ability: ABILITY_IDS.shadowTag },
      { ability: ABILITY_IDS.shadowTag, types: ["psychic"] },
      true,
    );
    // Source: Showdown data/abilities.ts — Shadow Tag: does not trap another pokemon with Shadow Tag
    expect(result).toBe(false);
  });

  it("given Arena Trap trapper and grounded opponent, when check, then trapped", () => {
    // Source: Showdown data/abilities.ts — Arena Trap: traps grounded opponents
    const result = isTrappedByAbility(
      { ability: ABILITY_IDS.arenaTrap },
      { ability: ABILITY_IDS.blaze, types: [TYPE_IDS.fire] },
      true,
    );
    // Source: Showdown data/abilities.ts — Arena Trap: traps grounded opponents
    expect(result).toBe(true);
  });

  it("given Arena Trap trapper and non-grounded opponent, when check, then not trapped", () => {
    // Source: Showdown data/abilities.ts — Arena Trap: does not trap flying/levitating
    const result = isTrappedByAbility(
      { ability: ABILITY_IDS.arenaTrap },
      { ability: ABILITY_IDS.levitate, types: [TYPE_IDS.fire] },
      false,
    );
    // Source: Showdown data/abilities.ts — Arena Trap: does not trap Flying-type or Levitate pokemon
    expect(result).toBe(false);
  });

  it("given Magnet Pull trapper and Steel-type opponent, when check, then trapped", () => {
    // Source: Showdown data/abilities.ts — Magnet Pull: traps Steel types
    const result = isTrappedByAbility(
      { ability: ABILITY_IDS.magnetPull },
      { ability: ABILITY_IDS.blaze, types: ["steel"] },
      true,
    );
    // Source: Showdown data/abilities.ts — Magnet Pull: traps Steel-type opponents
    expect(result).toBe(true);
  });

  it("given Magnet Pull trapper and non-Steel opponent, when check, then not trapped", () => {
    // Source: Showdown data/abilities.ts — Magnet Pull: only Steel types
    const result = isTrappedByAbility(
      { ability: ABILITY_IDS.magnetPull },
      { ability: ABILITY_IDS.blaze, types: [TYPE_IDS.fire] },
      true,
    );
    // Source: Showdown data/abilities.ts — Magnet Pull: does not trap non-Steel types
    expect(result).toBe(false);
  });
});

// ===========================================================================
// UTILITY EXPORTS
// ===========================================================================

describe("isMoldBreakerAbility", () => {
  it("given mold-breaker, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts — Mold Breaker sets move.ignoreAbility
    expect(isMoldBreakerAbility(ABILITY_IDS.moldBreaker)).toBe(true);
  });

  it("given teravolt, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts — Teravolt sets move.ignoreAbility
    expect(isMoldBreakerAbility(ABILITY_IDS.teravolt)).toBe(true);
  });

  it("given turboblaze, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts — Turboblaze sets move.ignoreAbility
    expect(isMoldBreakerAbility(ABILITY_IDS.turboblaze)).toBe(true);
  });

  it("given blaze, when checking, then returns false", () => {
    // Source: Showdown data/abilities.ts — Blaze is not a Mold Breaker variant
    expect(isMoldBreakerAbility(ABILITY_IDS.blaze)).toBe(false);
  });
});

describe("VICTORY_STAR_ACCURACY_MULTIPLIER", () => {
  it("equals approximately 1.1 (4506/4096 from Showdown)", () => {
    // Source: Showdown data/abilities.ts — victorystar: chainModify([4506, 4096])
    // 4506 / 4096 = 1.10009765625
    expect(VICTORY_STAR_ACCURACY_MULTIPLIER).toBeCloseTo(1.1, 2);
  });

  it("equals exactly 4506/4096", () => {
    // Source: Showdown data/abilities.ts — victorystar: chainModify([4506, 4096])
    expect(VICTORY_STAR_ACCURACY_MULTIPLIER).toBe(4506 / 4096);
  });
});

// ===========================================================================
// UNKNOWN / DEFAULT TRIGGERS
// ===========================================================================

describe("handleGen5SwitchAbility default behavior", () => {
  it("given unknown ability for any trigger, when dispatched, then returns no effect", () => {
    const ctx = makeContext({ ability: "some-unknown-ability", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given unknown trigger type, when dispatched, then returns no effect", () => {
    const ctx = makeContext({ ability: ABILITY_IDS.intimidate, trigger: "on-turn-end" });
    const result = handleGen5SwitchAbility("on-turn-end" as any, ctx);

    expect(result.activated).toBe(false);
  });
});
