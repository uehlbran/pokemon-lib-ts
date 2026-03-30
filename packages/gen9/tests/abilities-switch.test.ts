import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import {
  type AbilityTrigger,
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  type PokemonInstance,
  type PokemonType,
  type PrimaryStatus,
  type SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen9DataManager } from "../src";
import { GEN9_ABILITY_IDS, GEN9_ITEM_IDS, GEN9_NATURE_IDS, GEN9_SPECIES_IDS } from "../src/data";
import {
  getWeatherDuration,
  handleGen9SwitchAbility,
  isMoldBreakerAbility,
  isSurgeAbility,
  MOLD_BREAKER_ALIASES,
  SCREEN_CLEANER_SCREENS,
  TRACE_UNCOPYABLE_ABILITIES,
  UNSUPPRESSABLE_ABILITIES,
} from "../src/internal";

const A = GEN9_ABILITY_IDS;
const I = GEN9_ITEM_IDS;
const N = GEN9_NATURE_IDS;
const C = CORE_ABILITY_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const SC = CORE_SCREEN_IDS;
const T = CORE_TYPE_IDS;
const S = CORE_STATUS_IDS;
const W = CORE_WEATHER_IDS;
const TE = CORE_TERRAIN_IDS;
const DATA_MANAGER = createGen9DataManager();
const HARDY_NATURE = DATA_MANAGER.getNature(N.hardy).id;
const BASE_WEATHER_DURATION = 5;
const EXTENDED_WEATHER_DURATION = 8;
const UNKNOWN_ABILITY = "unknown-ability" as const;

/**
 * Gen 9 switch-in, switch-out, contact, passive, and turn-end ability tests.
 *
 * Source: Showdown data/abilities.ts
 * Source: specs/battle/10-gen9.md -- Gen 9 weather (Snow replaces Hail)
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function makeTestUid() {
  return `test-${nextTestUid++}`;
}

function createPokemonInstance(overrides: {
  speciesId?: (typeof GEN9_SPECIES_IDS)[keyof typeof GEN9_SPECIES_IDS];
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: PrimaryStatus | null;
  calculatedStats?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}): PokemonInstance {
  const speciesId = overrides.speciesId ?? GEN9_SPECIES_IDS.pikachu;
  const species = DATA_MANAGER.getSpecies(speciesId);
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: makeTestUid(),
    speciesId: species.id,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: HARDY_NATURE,
    ivs: createIvs({ hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 }),
    evs: createEvs(),
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? C.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: overrides.calculatedStats ?? {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function createOnFieldPokemon(overrides: {
  speciesId?: (typeof GEN9_SPECIES_IDS)[keyof typeof GEN9_SPECIES_IDS];
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: PrimaryStatus | null;
  heldItem?: string | null;
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  calculatedStats?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}) {
  const speciesId = overrides.speciesId ?? GEN9_SPECIES_IDS.pikachu;
  const species = DATA_MANAGER.getSpecies(speciesId);
  return {
    pokemon: createPokemonInstance({
      speciesId,
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      status: overrides.status,
      heldItem: overrides.heldItem,
      calculatedStats: overrides.calculatedStats,
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
    types: overrides.types ?? [...species.types],
    ability: overrides.ability ?? C.none,
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
    stellarBoostedTypes: [],
    forcedMove: null,
  };
}

function createSide(index: 0 | 1): BattleSide {
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

function createMockRng(overrides?: Partial<SeededRandom>): SeededRandom {
  return {
    next: () => 0.5,
    int: () => 1,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
    ...overrides,
  };
}

function createBattleState(overrides?: {
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
}): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
    format: "singles",
    turnNumber: 1,
    sides: [createSide(0), createSide(1)],
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: createMockRng(),
  } as BattleState;
}

function createAbilityContext(overrides: {
  pokemon: ReturnType<typeof createOnFieldPokemon>;
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  trigger: AbilityTrigger;
  rng?: Partial<SeededRandom>;
  state?: BattleState;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon as unknown as ActivePokemon,
    opponent: overrides.opponent as unknown as ActivePokemon,
    state: overrides.state ?? createBattleState(),
    rng: createMockRng(overrides.rng),
    trigger: overrides.trigger,
  };
}

// ---------------------------------------------------------------------------
// Weather duration
// ---------------------------------------------------------------------------

describe("getWeatherDuration", () => {
  it("given no held item, when getting weather duration, then returns 5 (base)", () => {
    // Source: Showdown data/items.ts -- base weather duration is 5 turns
    expect(getWeatherDuration(null, W.rain)).toBe(BASE_WEATHER_DURATION);
  });

  it("given Damp Rock and rain weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- damprock extends rain to 8 turns
    expect(getWeatherDuration(I.dampRock, W.rain)).toBe(EXTENDED_WEATHER_DURATION);
  });

  it("given Heat Rock and sun weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- heatrock extends sun to 8 turns
    expect(getWeatherDuration(I.heatRock, W.sun)).toBe(EXTENDED_WEATHER_DURATION);
  });

  it("given Smooth Rock and sand weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- smoothrock extends sand to 8 turns
    expect(getWeatherDuration(I.smoothRock, W.sand)).toBe(EXTENDED_WEATHER_DURATION);
  });

  it("given Icy Rock and snow weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- icyrock extends snow to 8 turns (Gen 9: snow replaces hail)
    expect(getWeatherDuration(I.icyRock, W.snow)).toBe(EXTENDED_WEATHER_DURATION);
  });

  it("given wrong rock for weather, when getting duration, then returns 5 (base)", () => {
    // Source: Showdown data/items.ts -- Damp Rock only extends rain; sun stays at the base 5 turns.
    expect(getWeatherDuration(I.dampRock, W.sun)).toBe(BASE_WEATHER_DURATION);
  });
});

// ---------------------------------------------------------------------------
// Switch-in abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-switch-in", () => {
  it("given Intimidate with opponent, when switching in, then lowers opponent Attack by 1", () => {
    // Source: Showdown data/abilities.ts -- Intimidate
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.intimidate, nickname: "Gyarados" }),
      opponent: createOnFieldPokemon({ types: [T.normal], nickname: "Metagross" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    // Source: Showdown data/items.ts -- Icy Rock extends Snow Warning weather from 5 turns to 8.
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "stat-change",
          target: "opponent",
          stat: "attack",
          stages: -1,
        },
      ],
      messages: ["Gyarados's Intimidate cut Metagross's Attack!"],
    });
  });

  it("given Intimidate with opponent behind Substitute, when switching in, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Intimidate blocked by Substitute
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.intimidate }),
      opponent: createOnFieldPokemon({ substituteHp: 50 }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Intimidate with no opponent, when switching in, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.intimidate }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Pressure, when switching in, then activates with message", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.pressure, nickname: "Mewtwo" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    // Source: Showdown data/abilities.ts -- Download raises one offensive stat by exactly 1 stage.
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: C.none, target: "self" }],
      messages: ["Mewtwo is exerting its Pressure!"],
    });
  });

  it("given Drizzle, when switching in, then sets rain weather", () => {
    // Source: Showdown data/abilities.ts -- Drizzle sets rain
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.drizzle, nickname: "Pelipper" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: W.rain,
          weatherTurns: BASE_WEATHER_DURATION,
        },
      ],
      messages: ["Pelipper's Drizzle made it rain!"],
    });
  });

  it("given Drizzle with Damp Rock, when switching in, then sets rain for 8 turns", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: C.drizzle,
        heldItem: I.dampRock,
        nickname: "Pelipper",
      }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: W.rain,
          weatherTurns: EXTENDED_WEATHER_DURATION,
        },
      ],
      messages: ["Pelipper's Drizzle made it rain!"],
    });
  });

  it("given Drought, when switching in, then sets sun weather", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.drought, nickname: "Torkoal" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: W.sun,
          weatherTurns: BASE_WEATHER_DURATION,
        },
      ],
      messages: ["Torkoal's Drought intensified the sun's rays!"],
    });
  });

  it("given Sand Stream, when switching in, then sets sand weather", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.sandStream, nickname: "Tyranitar" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: W.sand,
          weatherTurns: 5,
        },
      ],
      messages: ["Tyranitar's Sand Stream whipped up a sandstorm!"],
    });
  });

  it("given Snow Warning, when switching in, then sets SNOW weather (not hail)", () => {
    // Source: Showdown data/abilities.ts -- snowwarning: sets W.snow in Gen 9
    // Source: specs/battle/10-gen9.md -- "Snow replaces Hail"
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.snowWarning, nickname: "Ninetales-Alola" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: W.snow,
          weatherTurns: 5,
        },
      ],
      messages: ["Ninetales-Alola's Snow Warning made it snow!"],
    });
  });

  it("given Snow Warning with Icy Rock, when switching in, then sets snow for 8 turns", () => {
    // Source: Icy Rock extends snow duration to 8 turns
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: A.snowWarning,
        heldItem: I.icyRock,
        nickname: "Ninetales-Alola",
      }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: W.snow,
          weatherTurns: 8,
        },
      ],
      messages: ["Ninetales-Alola's Snow Warning made it snow!"],
    });
  });

  it("given Orichalcum Pulse, when switching in, then sets sun weather", () => {
    // Source: Showdown data/abilities.ts:3016-3035
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.orichalcumPulse, nickname: "Koraidon" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: W.sun,
          weatherTurns: 5,
        },
      ],
      messages: ["Koraidon's Orichalcum Pulse turned the sunlight harsh!"],
    });
  });

  it("given Hadron Engine, when switching in, then sets Electric Terrain on state", () => {
    // Source: Showdown data/abilities.ts:1725-1742
    const state = createBattleState();
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.hadronEngine, nickname: "Miraidon" }),
      trigger: TRIGGERS.onSwitchIn,
      state,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [],
      messages: ["Miraidon's Hadron Engine set Electric Terrain!"],
    });
    expect(state.terrain).toEqual({
      type: TE.electric,
      turnsLeft: BASE_WEATHER_DURATION,
      source: A.hadronEngine,
    });
  });

  it("given Hadron Engine with Terrain Extender, when switching in, then terrain lasts 8 turns", () => {
    // Source: Showdown data/items.ts -- Terrain Extender raises terrain duration from 5 turns to 8.
    const state = createBattleState();
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.hadronEngine, heldItem: I.terrainExtender }),
      trigger: TRIGGERS.onSwitchIn,
      state,
    });
    handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(state.terrain?.turnsLeft).toBe(EXTENDED_WEATHER_DURATION);
  });

  it("given Download with opponent lower Defense than SpDef, when switching in, then raises Attack", () => {
    // Source: Showdown data/abilities.ts -- Download
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.download, nickname: "Porygon-Z" }),
      opponent: createOnFieldPokemon({
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 80,
          spAttack: 100,
          spDefense: 120,
          speed: 100,
        },
      }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "stat-change",
          target: "self",
          stat: "attack",
          stages: 1,
        },
      ],
      messages: ["Porygon-Z's Download raised its Attack!"],
    });
  });

  it("given Download with opponent equal/higher Defense, when switching in, then raises SpAttack", () => {
    // Source: Showdown data/abilities.ts -- Download
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.download, nickname: "Porygon-Z" }),
      opponent: createOnFieldPokemon({
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 120,
          spAttack: 100,
          spDefense: 80,
          speed: 100,
        },
      }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "stat-change",
          target: "self",
          stat: "spAttack",
          stages: 1,
        },
      ],
      messages: ["Porygon-Z's Download raised its Sp. Atk!"],
    });
  });

  it("given Trace with copyable opponent ability, when switching in, then copies ability", () => {
    // Source: Showdown data/abilities.ts -- Trace
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.trace, nickname: "Gardevoir" }),
      opponent: createOnFieldPokemon({ ability: C.intimidate, nickname: "Gyarados" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "ability-change",
          target: "self",
          newAbility: C.intimidate,
        },
      ],
      messages: ["Gardevoir traced Gyarados's intimidate!"],
    });
  });

  it("given Trace with uncopyable opponent ability (protosynthesis), when switching in, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Trace ban list includes protosynthesis in Gen 9
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.trace }),
      opponent: createOnFieldPokemon({ ability: A.protosynthesis }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mold Breaker, when switching in, then activates with message", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.moldBreaker, nickname: "Excadrill" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: C.none, target: "self" }],
      messages: ["Excadrill breaks the mold!"],
    });
  });

  it("given Electric Surge, when switching in, then sets Electric Terrain on state", () => {
    // Source: Showdown data/abilities.ts -- Electric Surge
    const state = createBattleState();
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.electricSurge }),
      trigger: TRIGGERS.onSwitchIn,
      state,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(state.terrain?.type).toBe(TE.electric);
    expect(state.terrain?.turnsLeft).toBe(BASE_WEATHER_DURATION);
  });

  it("given Grassy Surge with Terrain Extender, when switching in, then terrain lasts 8 turns", () => {
    // Source: Showdown data/items.ts -- Terrain Extender raises terrain duration from 5 turns to 8.
    const state = createBattleState();
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.grassySurge, heldItem: I.terrainExtender }),
      trigger: TRIGGERS.onSwitchIn,
      state,
    });
    handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(state.terrain?.turnsLeft).toBe(EXTENDED_WEATHER_DURATION);
  });

  it("given Screen Cleaner, when switching in, then activates with message", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.screenCleaner, nickname: "Tsareena" }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: C.none, target: "field" }],
      messages: ["Tsareena's Screen Cleaner removed all screens!"],
    });
  });

  it("given unknown ability, when switching in, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: UNKNOWN_ABILITY }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Switch-out abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-switch-out", () => {
  it("given Regenerator, when switching out, then heals 1/3 max HP", () => {
    // Source: Showdown data/abilities.ts -- Regenerator heals 1/3 max HP
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: A.regenerator,
        maxHp: 300,
        currentHp: 100,
        nickname: "Slowbro",
      }),
      trigger: TRIGGERS.onSwitchOut,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "heal",
          target: "self",
          value: 100,
        },
      ],
      messages: ["Slowbro's Regenerator restored its HP!"],
    });
  });

  it("given Regenerator with 201 max HP, when switching out, then heals floor(201/3) = 67", () => {
    // Triangulation: different max HP
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: A.regenerator,
        maxHp: 201,
        currentHp: 50,
        nickname: "Slowbro",
      }),
      trigger: TRIGGERS.onSwitchOut,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "heal",
          target: "self",
          value: 67,
        },
      ],
      messages: ["Slowbro's Regenerator restored its HP!"],
    });
  });

  it("given Natural Cure with status, when switching out, then cures status", () => {
    // Source: Showdown data/abilities.ts -- Natural Cure
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: C.naturalCure,
        status: S.paralysis,
        nickname: "Chansey",
      }),
      trigger: TRIGGERS.onSwitchOut,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: "status-cure", target: "self" }],
      messages: ["Chansey's Natural Cure cured its status!"],
    });
  });

  it("given Natural Cure with no status, when switching out, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.naturalCure }),
      trigger: TRIGGERS.onSwitchOut,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contact abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-contact", () => {
  it("given Static with 30% roll, when contacted, then paralyzes attacker", () => {
    // Source: Showdown data/abilities.ts -- Static: 30% paralysis on contact
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.static, nickname: "Pikachu" }),
      opponent: createOnFieldPokemon({ nickname: "Garchomp" }),
      trigger: TRIGGERS.onContact,
      rng: { next: () => 0.1 }, // < 0.3 threshold
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onContact, ctx);
    // Source: Showdown data/abilities.ts -- Rough Skin deals floor(200 / 8) = 25 chip damage.
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: S.paralysis,
        },
      ],
      messages: ["Pikachu's Static paralyzed the attacker!"],
    });
  });

  it("given Static with roll above 30%, when contacted, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.static }),
      opponent: createOnFieldPokemon({}),
      trigger: TRIGGERS.onContact,
      rng: { next: () => 0.5 }, // >= 0.3
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Flame Body with 30% roll, when contacted, then burns attacker", () => {
    // Source: Showdown data/abilities.ts -- Flame Body: 30% burn on contact
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.flameBody, nickname: "Talonflame" }),
      opponent: createOnFieldPokemon({ nickname: "Garchomp" }),
      trigger: TRIGGERS.onContact,
      rng: { next: () => 0.1 },
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onContact, ctx);
    // Source: Showdown data/abilities.ts -- Iron Barbs deals floor(160 / 8) = 20 chip damage.
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: S.burn,
        },
      ],
      messages: ["Talonflame's Flame Body burned the attacker!"],
    });
  });

  it("given Poison Point with 30% roll, when contacted, then poisons attacker", () => {
    // Source: Showdown data/abilities.ts -- Poison Point: 30% poison on contact
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.poisonPoint, nickname: "Nidoqueen" }),
      opponent: createOnFieldPokemon({ nickname: "Garchomp" }),
      trigger: TRIGGERS.onContact,
      rng: { next: () => 0.1 },
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: S.poison,
        },
      ],
      messages: ["Nidoqueen's Poison Point poisoned the attacker!"],
    });
  });

  it("given contact ability with opponent already statused, when contacted, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.static }),
      opponent: createOnFieldPokemon({ status: S.burn }),
      trigger: TRIGGERS.onContact,
      rng: { next: () => 0.1 },
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Rough Skin, when contacted, then deals 1/8 max HP chip damage", () => {
    // Source: Showdown data/abilities.ts -- Rough Skin: 1/8 max HP
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.roughSkin, nickname: "Garchomp" }),
      opponent: createOnFieldPokemon({ maxHp: 200, nickname: "Scizor" }),
      trigger: TRIGGERS.onContact,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "chip-damage",
          target: "opponent",
          value: 25,
        },
      ],
      messages: ["Garchomp's Rough Skin hurt the attacker!"],
    });
  });

  it("given Iron Barbs, when contacted, then deals 1/8 max HP chip damage", () => {
    // Source: Showdown data/abilities.ts -- Iron Barbs: 1/8 max HP (same as Rough Skin)
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.ironBarbs, nickname: "Ferrothorn" }),
      opponent: createOnFieldPokemon({ maxHp: 160, nickname: "Scizor" }),
      trigger: TRIGGERS.onContact,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "chip-damage",
          target: "opponent",
          value: 20,
        },
      ],
      messages: ["Ferrothorn's Iron Barbs hurt the attacker!"],
    });
  });
});

// ---------------------------------------------------------------------------
// Status inflicted
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-status-inflicted", () => {
  it("given Synchronize with burn, when status inflicted, then passes burn to opponent", () => {
    // Source: Showdown data/abilities.ts -- Synchronize
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.synchronize, status: S.burn, nickname: "Espeon" }),
      opponent: createOnFieldPokemon({ nickname: "Garchomp" }),
      trigger: TRIGGERS.onStatusInflicted,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: S.burn,
        },
      ],
      messages: ["Espeon's Synchronize passed the status!"],
    });
  });

  it("given Synchronize with paralysis, when status inflicted, then passes paralysis", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: A.synchronize,
        status: S.paralysis,
        nickname: "Espeon",
      }),
      opponent: createOnFieldPokemon({ nickname: "Garchomp" }),
      trigger: TRIGGERS.onStatusInflicted,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: S.paralysis,
        },
      ],
      messages: ["Espeon's Synchronize passed the status!"],
    });
  });

  it("given Synchronize with sleep (non-sync-able status), when status inflicted, then does not pass", () => {
    // Synchronize only passes burn, poison, and paralysis
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.synchronize, status: S.sleep }),
      opponent: createOnFieldPokemon({}),
      trigger: TRIGGERS.onStatusInflicted,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Synchronize when opponent already has status, when status inflicted, then does not pass", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: A.synchronize, status: S.burn }),
      opponent: createOnFieldPokemon({ status: S.paralysis }),
      trigger: TRIGGERS.onStatusInflicted,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Turn-end abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-turn-end", () => {
  it("given Speed Boost, when turn ends, then raises Speed by 1", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost: +1 Speed at end of turn
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: C.speedBoost, nickname: "Ninjask" }),
      trigger: TRIGGERS.onTurnEnd,
    });
    const result = handleGen9SwitchAbility(TRIGGERS.onTurnEnd, ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "stat-change",
          target: "self",
          stat: "speed",
          stages: 1,
        },
      ],
      messages: ["Ninjask's Speed Boost raised its Speed!"],
    });
  });
});

// ---------------------------------------------------------------------------
// Constant sets
// ---------------------------------------------------------------------------

describe("TRACE_UNCOPYABLE_ABILITIES", () => {
  it("includes Gen 9 additions (protosynthesis, quark-drive, orichalcum-pulse, hadron-engine)", () => {
    // Source: Showdown data/abilities.ts -- trace.onUpdate ban list
    expect(TRACE_UNCOPYABLE_ABILITIES.has(A.protosynthesis)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(A.quarkDrive)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(A.orichalcumPulse)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(A.hadronEngine)).toBe(true);
  });

  it("given the legacy Trace ban list, when checking core exclusions, then trace, illusion, and imposter are included", () => {
    expect(TRACE_UNCOPYABLE_ABILITIES.has(A.trace)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(A.illusion)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(A.imposter)).toBe(true);
  });
});

describe("UNSUPPRESSABLE_ABILITIES", () => {
  it("includes Gen 9 additions including good-as-gold", () => {
    // Source: Showdown data/abilities.ts -- cantsuppress
    expect(UNSUPPRESSABLE_ABILITIES.has(A.protosynthesis)).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has(A.quarkDrive)).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has(A.goodAsGold)).toBe(true);
  });
});

describe("MOLD_BREAKER_ALIASES", () => {
  it("given the Mold Breaker aliases set, when checking contents, then it contains mold breaker, teravolt, and turboblaze", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker/teravolt/turboblaze
    expect(MOLD_BREAKER_ALIASES).toEqual(new Set([C.moldBreaker, A.teravolt, A.turboblaze]));
  });
});

describe("SCREEN_CLEANER_SCREENS", () => {
  it("given the Screen Cleaner screen set, when checking contents, then it contains reflect, light screen, and aurora veil", () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner onStart
    expect(SCREEN_CLEANER_SCREENS).toEqual([SC.reflect, SC.lightScreen, SC.auroraVeil]);
  });
});

// ---------------------------------------------------------------------------
// Helper function checks
// ---------------------------------------------------------------------------

describe("isMoldBreakerAbility", () => {
  it("given mold breaker, when checking the alias helper, then returns true", () => {
    expect(isMoldBreakerAbility(C.moldBreaker)).toBe(true);
  });

  it("given teravolt, when checking, then returns true", () => {
    expect(isMoldBreakerAbility(A.teravolt)).toBe(true);
  });

  it("given turboblaze, when checking, then returns true", () => {
    expect(isMoldBreakerAbility(A.turboblaze)).toBe(true);
  });

  it("given intimidate, when checking, then returns false", () => {
    expect(isMoldBreakerAbility(C.intimidate)).toBe(false);
  });
});

describe("isSurgeAbility", () => {
  it("given electric-surge, when checking, then returns true", () => {
    expect(isSurgeAbility(A.electricSurge)).toBe(true);
  });

  it("given grassy-surge, when checking, then returns true", () => {
    expect(isSurgeAbility(A.grassySurge)).toBe(true);
  });

  it("given psychic-surge, when checking, then returns true", () => {
    expect(isSurgeAbility(A.psychicSurge)).toBe(true);
  });

  it("given misty-surge, when checking, then returns true", () => {
    expect(isSurgeAbility(A.mistySurge)).toBe(true);
  });

  it("given unrelated ability, when checking, then returns false", () => {
    expect(isSurgeAbility(C.intimidate)).toBe(false);
  });
});
