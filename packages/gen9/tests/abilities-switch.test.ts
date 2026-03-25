import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getWeatherDuration,
  handleGen9SwitchAbility,
  isMoldBreakerAbility,
  isSurgeAbility,
  MOLD_BREAKER_ALIASES,
  SCREEN_CLEANER_SCREENS,
  TRACE_UNCOPYABLE_ABILITIES,
  UNSUPPRESSABLE_ABILITIES,
} from "../src/Gen9AbilitiesSwitch";

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

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  calculatedStats?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: makeTestUid(),
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
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

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: string | null;
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
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
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

function makeRng(overrides?: Partial<SeededRandom>): SeededRandom {
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

function makeBattleState(overrides?: {
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
}): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: makeRng(),
  } as BattleState;
}

function makeAbilityContext(overrides: {
  pokemon: ReturnType<typeof makeActivePokemon>;
  opponent?: ReturnType<typeof makeActivePokemon>;
  trigger: string;
  rng?: Partial<SeededRandom>;
  state?: BattleState;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon as any,
    opponent: overrides.opponent as any,
    state: overrides.state ?? makeBattleState(),
    rng: makeRng(overrides.rng),
    trigger: overrides.trigger as any,
  };
}

// ---------------------------------------------------------------------------
// Weather duration
// ---------------------------------------------------------------------------

describe("getWeatherDuration", () => {
  it("given no held item, when getting weather duration, then returns 5 (base)", () => {
    // Source: Showdown data/items.ts -- base weather duration is 5 turns
    expect(getWeatherDuration(null, "rain")).toBe(5);
  });

  it("given Damp Rock and rain weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- damprock extends rain to 8 turns
    expect(getWeatherDuration("damp-rock", "rain")).toBe(8);
  });

  it("given Heat Rock and sun weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- heatrock extends sun to 8 turns
    expect(getWeatherDuration("heat-rock", "sun")).toBe(8);
  });

  it("given Smooth Rock and sand weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- smoothrock extends sand to 8 turns
    expect(getWeatherDuration("smooth-rock", "sand")).toBe(8);
  });

  it("given Icy Rock and snow weather, when getting duration, then returns 8", () => {
    // Source: Showdown data/items.ts -- icyrock extends snow to 8 turns (Gen 9: snow replaces hail)
    expect(getWeatherDuration("icy-rock", "snow")).toBe(8);
  });

  it("given wrong rock for weather, when getting duration, then returns 5 (base)", () => {
    // Source: Showdown data/items.ts -- Damp Rock only extends rain; sun stays at the base 5 turns.
    expect(getWeatherDuration("damp-rock", "sun")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Switch-in abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-switch-in", () => {
  it("given Intimidate with opponent, when switching in, then lowers opponent Attack by 1", () => {
    // Source: Showdown data/abilities.ts -- Intimidate
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intimidate", nickname: "Gyarados" }),
      opponent: makeActivePokemon({ types: ["normal"], nickname: "Metagross" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
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
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intimidate" }),
      opponent: makeActivePokemon({ substituteHp: 50 }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Intimidate with no opponent, when switching in, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intimidate" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Pressure, when switching in, then activates with message", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "pressure", nickname: "Mewtwo" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    // Source: Showdown data/abilities.ts -- Download raises one offensive stat by exactly 1 stage.
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: "none", target: "self" }],
      messages: ["Mewtwo is exerting its Pressure!"],
    });
  });

  it("given Drizzle, when switching in, then sets rain weather", () => {
    // Source: Showdown data/abilities.ts -- Drizzle sets rain
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "drizzle", nickname: "Pelipper" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: "rain",
          weatherTurns: 5,
        },
      ],
      messages: ["Pelipper's Drizzle made it rain!"],
    });
  });

  it("given Drizzle with Damp Rock, when switching in, then sets rain for 8 turns", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "drizzle",
        heldItem: "damp-rock",
        nickname: "Pelipper",
      }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: "rain",
          weatherTurns: 8,
        },
      ],
      messages: ["Pelipper's Drizzle made it rain!"],
    });
  });

  it("given Drought, when switching in, then sets sun weather", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "drought", nickname: "Torkoal" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: "sun",
          weatherTurns: 5,
        },
      ],
      messages: ["Torkoal's Drought intensified the sun's rays!"],
    });
  });

  it("given Sand Stream, when switching in, then sets sand weather", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "sand-stream", nickname: "Tyranitar" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: "sand",
          weatherTurns: 5,
        },
      ],
      messages: ["Tyranitar's Sand Stream whipped up a sandstorm!"],
    });
  });

  it("given Snow Warning, when switching in, then sets SNOW weather (not hail)", () => {
    // Source: Showdown data/abilities.ts -- snowwarning: sets "snow" in Gen 9
    // Source: specs/battle/10-gen9.md -- "Snow replaces Hail"
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "snow-warning", nickname: "Ninetales-Alola" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: "snow",
          weatherTurns: 5,
        },
      ],
      messages: ["Ninetales-Alola's Snow Warning made it snow!"],
    });
  });

  it("given Snow Warning with Icy Rock, when switching in, then sets snow for 8 turns", () => {
    // Source: Icy Rock extends snow duration to 8 turns
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "snow-warning",
        heldItem: "icy-rock",
        nickname: "Ninetales-Alola",
      }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: "snow",
          weatherTurns: 8,
        },
      ],
      messages: ["Ninetales-Alola's Snow Warning made it snow!"],
    });
  });

  it("given Orichalcum Pulse, when switching in, then sets sun weather", () => {
    // Source: Showdown data/abilities.ts:3016-3035
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "orichalcum-pulse", nickname: "Koraidon" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "weather-set",
          target: "field",
          weather: "sun",
          weatherTurns: 5,
        },
      ],
      messages: ["Koraidon's Orichalcum Pulse turned the sunlight harsh!"],
    });
  });

  it("given Hadron Engine, when switching in, then sets Electric Terrain on state", () => {
    // Source: Showdown data/abilities.ts:1725-1742
    const state = makeBattleState();
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "hadron-engine", nickname: "Miraidon" }),
      trigger: "on-switch-in",
      state,
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [],
      messages: ["Miraidon's Hadron Engine set Electric Terrain!"],
    });
    expect(state.terrain).toEqual({
      type: "electric",
      turnsLeft: 5,
      source: "hadron-engine",
    });
  });

  it("given Hadron Engine with Terrain Extender, when switching in, then terrain lasts 8 turns", () => {
    // Source: Showdown data/items.ts -- Terrain Extender raises terrain duration from 5 turns to 8.
    const state = makeBattleState();
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "hadron-engine", heldItem: "terrain-extender" }),
      trigger: "on-switch-in",
      state,
    });
    handleGen9SwitchAbility("on-switch-in", ctx);
    expect(state.terrain?.turnsLeft).toBe(8);
  });

  it("given Download with opponent lower Defense than SpDef, when switching in, then raises Attack", () => {
    // Source: Showdown data/abilities.ts -- Download
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "download", nickname: "Porygon-Z" }),
      opponent: makeActivePokemon({
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 80,
          spAttack: 100,
          spDefense: 120,
          speed: 100,
        },
      }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
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
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "download", nickname: "Porygon-Z" }),
      opponent: makeActivePokemon({
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 120,
          spAttack: 100,
          spDefense: 80,
          speed: 100,
        },
      }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
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
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "trace", nickname: "Gardevoir" }),
      opponent: makeActivePokemon({ ability: "intimidate", nickname: "Gyarados" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "ability-change",
          target: "self",
          newAbility: "intimidate",
        },
      ],
      messages: ["Gardevoir traced Gyarados's intimidate!"],
    });
  });

  it("given Trace with uncopyable opponent ability (protosynthesis), when switching in, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Trace ban list includes protosynthesis in Gen 9
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "trace" }),
      opponent: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mold Breaker, when switching in, then activates with message", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "mold-breaker", nickname: "Excadrill" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: "none", target: "self" }],
      messages: ["Excadrill breaks the mold!"],
    });
  });

  it("given Electric Surge, when switching in, then sets Electric Terrain on state", () => {
    // Source: Showdown data/abilities.ts -- Electric Surge
    const state = makeBattleState();
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "electric-surge" }),
      trigger: "on-switch-in",
      state,
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(state.terrain?.type).toBe("electric");
    expect(state.terrain?.turnsLeft).toBe(5);
  });

  it("given Grassy Surge with Terrain Extender, when switching in, then terrain lasts 8 turns", () => {
    // Source: Showdown data/items.ts -- Terrain Extender raises terrain duration from 5 turns to 8.
    const state = makeBattleState();
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "grassy-surge", heldItem: "terrain-extender" }),
      trigger: "on-switch-in",
      state,
    });
    handleGen9SwitchAbility("on-switch-in", ctx);
    expect(state.terrain?.turnsLeft).toBe(8);
  });

  it("given Screen Cleaner, when switching in, then activates with message", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "screen-cleaner", nickname: "Tsareena" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: "none", target: "field" }],
      messages: ["Tsareena's Screen Cleaner removed all screens!"],
    });
  });

  it("given unknown ability, when switching in, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "unknown-ability" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Switch-out abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-switch-out", () => {
  it("given Regenerator, when switching out, then heals 1/3 max HP", () => {
    // Source: Showdown data/abilities.ts -- Regenerator heals 1/3 max HP
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "regenerator",
        maxHp: 300,
        currentHp: 100,
        nickname: "Slowbro",
      }),
      trigger: "on-switch-out",
    });
    const result = handleGen9SwitchAbility("on-switch-out", ctx);
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
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "regenerator",
        maxHp: 201,
        currentHp: 50,
        nickname: "Slowbro",
      }),
      trigger: "on-switch-out",
    });
    const result = handleGen9SwitchAbility("on-switch-out", ctx);
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
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "natural-cure",
        status: "paralysis",
        nickname: "Chansey",
      }),
      trigger: "on-switch-out",
    });
    const result = handleGen9SwitchAbility("on-switch-out", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: "status-cure", target: "self" }],
      messages: ["Chansey's Natural Cure cured its status!"],
    });
  });

  it("given Natural Cure with no status, when switching out, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "natural-cure" }),
      trigger: "on-switch-out",
    });
    const result = handleGen9SwitchAbility("on-switch-out", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contact abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-contact", () => {
  it("given Static with 30% roll, when contacted, then paralyzes attacker", () => {
    // Source: Showdown data/abilities.ts -- Static: 30% paralysis on contact
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "static", nickname: "Pikachu" }),
      opponent: makeActivePokemon({ nickname: "Garchomp" }),
      trigger: "on-contact",
      rng: { next: () => 0.1 }, // < 0.3 threshold
    });
    const result = handleGen9SwitchAbility("on-contact", ctx);
    // Source: Showdown data/abilities.ts -- Rough Skin deals floor(200 / 8) = 25 chip damage.
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: "paralysis",
        },
      ],
      messages: ["Pikachu's Static paralyzed the attacker!"],
    });
  });

  it("given Static with roll above 30%, when contacted, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "static" }),
      opponent: makeActivePokemon({}),
      trigger: "on-contact",
      rng: { next: () => 0.5 }, // >= 0.3
    });
    const result = handleGen9SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Flame Body with 30% roll, when contacted, then burns attacker", () => {
    // Source: Showdown data/abilities.ts -- Flame Body: 30% burn on contact
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "flame-body", nickname: "Talonflame" }),
      opponent: makeActivePokemon({ nickname: "Garchomp" }),
      trigger: "on-contact",
      rng: { next: () => 0.1 },
    });
    const result = handleGen9SwitchAbility("on-contact", ctx);
    // Source: Showdown data/abilities.ts -- Iron Barbs deals floor(160 / 8) = 20 chip damage.
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: "burn",
        },
      ],
      messages: ["Talonflame's Flame Body burned the attacker!"],
    });
  });

  it("given Poison Point with 30% roll, when contacted, then poisons attacker", () => {
    // Source: Showdown data/abilities.ts -- Poison Point: 30% poison on contact
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "poison-point", nickname: "Nidoqueen" }),
      opponent: makeActivePokemon({ nickname: "Garchomp" }),
      trigger: "on-contact",
      rng: { next: () => 0.1 },
    });
    const result = handleGen9SwitchAbility("on-contact", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: "poison",
        },
      ],
      messages: ["Nidoqueen's Poison Point poisoned the attacker!"],
    });
  });

  it("given contact ability with opponent already statused, when contacted, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "static" }),
      opponent: makeActivePokemon({ status: "burn" }),
      trigger: "on-contact",
      rng: { next: () => 0.1 },
    });
    const result = handleGen9SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Rough Skin, when contacted, then deals 1/8 max HP chip damage", () => {
    // Source: Showdown data/abilities.ts -- Rough Skin: 1/8 max HP
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "rough-skin", nickname: "Garchomp" }),
      opponent: makeActivePokemon({ maxHp: 200, nickname: "Scizor" }),
      trigger: "on-contact",
    });
    const result = handleGen9SwitchAbility("on-contact", ctx);
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
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "iron-barbs", nickname: "Ferrothorn" }),
      opponent: makeActivePokemon({ maxHp: 160, nickname: "Scizor" }),
      trigger: "on-contact",
    });
    const result = handleGen9SwitchAbility("on-contact", ctx);
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
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "synchronize", status: "burn", nickname: "Espeon" }),
      opponent: makeActivePokemon({ nickname: "Garchomp" }),
      trigger: "on-status-inflicted",
    });
    const result = handleGen9SwitchAbility("on-status-inflicted", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: "burn",
        },
      ],
      messages: ["Espeon's Synchronize passed the status!"],
    });
  });

  it("given Synchronize with paralysis, when status inflicted, then passes paralysis", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "synchronize",
        status: "paralysis",
        nickname: "Espeon",
      }),
      opponent: makeActivePokemon({ nickname: "Garchomp" }),
      trigger: "on-status-inflicted",
    });
    const result = handleGen9SwitchAbility("on-status-inflicted", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: "paralysis",
        },
      ],
      messages: ["Espeon's Synchronize passed the status!"],
    });
  });

  it("given Synchronize with sleep (non-sync-able status), when status inflicted, then does not pass", () => {
    // Synchronize only passes burn, poison, and paralysis
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "synchronize", status: "sleep" }),
      opponent: makeActivePokemon({}),
      trigger: "on-status-inflicted",
    });
    const result = handleGen9SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Synchronize when opponent already has status, when status inflicted, then does not pass", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "synchronize", status: "burn" }),
      opponent: makeActivePokemon({ status: "paralysis" }),
      trigger: "on-status-inflicted",
    });
    const result = handleGen9SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Turn-end abilities
// ---------------------------------------------------------------------------

describe("handleGen9SwitchAbility -- on-turn-end", () => {
  it("given Speed Boost, when turn ends, then raises Speed by 1", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost: +1 Speed at end of turn
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "speed-boost", nickname: "Ninjask" }),
      trigger: "on-turn-end",
    });
    const result = handleGen9SwitchAbility("on-turn-end", ctx);
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
    expect(TRACE_UNCOPYABLE_ABILITIES.has("protosynthesis")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("quark-drive")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("orichalcum-pulse")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("hadron-engine")).toBe(true);
  });

  it("includes all 4 Embody Aspect variants", () => {
    expect(TRACE_UNCOPYABLE_ABILITIES.has("embody-aspect-teal")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("embody-aspect-hearthflame")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("embody-aspect-wellspring")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("embody-aspect-cornerstone")).toBe(true);
  });

  it("given the Trace uncopyable set, when checking classic entries, then it includes Trace, Illusion, and Imposter", () => {
    expect(TRACE_UNCOPYABLE_ABILITIES.has("trace")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("illusion")).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has("imposter")).toBe(true);
  });
});

describe("UNSUPPRESSABLE_ABILITIES", () => {
  it("includes Gen 9 additions including good-as-gold", () => {
    // Source: Showdown data/abilities.ts -- cantsuppress
    expect(UNSUPPRESSABLE_ABILITIES.has("protosynthesis")).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has("quark-drive")).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has("good-as-gold")).toBe(true);
  });

  it("includes all 4 Embody Aspect variants", () => {
    expect(UNSUPPRESSABLE_ABILITIES.has("embody-aspect-teal")).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has("embody-aspect-hearthflame")).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has("embody-aspect-wellspring")).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has("embody-aspect-cornerstone")).toBe(true);
  });
});

describe("MOLD_BREAKER_ALIASES", () => {
  it("given the Mold Breaker aliases set, when checking contents, then it contains only mold-breaker, teravolt, and turboblaze", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker/teravolt/turboblaze
    expect(MOLD_BREAKER_ALIASES).toEqual(new Set(["mold-breaker", "teravolt", "turboblaze"]));
  });
});

describe("SCREEN_CLEANER_SCREENS", () => {
  it("given the Screen Cleaner screen set, when checking contents, then it contains only reflect, light-screen, and aurora-veil", () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner onStart
    expect(SCREEN_CLEANER_SCREENS).toEqual(["reflect", "light-screen", "aurora-veil"]);
  });
});

// ---------------------------------------------------------------------------
// Helper function checks
// ---------------------------------------------------------------------------

describe("isMoldBreakerAbility", () => {
  it("given mold-breaker, when checking, then returns true", () => {
    expect(isMoldBreakerAbility("mold-breaker")).toBe(true);
  });

  it("given teravolt, when checking, then returns true", () => {
    expect(isMoldBreakerAbility("teravolt")).toBe(true);
  });

  it("given turboblaze, when checking, then returns true", () => {
    expect(isMoldBreakerAbility("turboblaze")).toBe(true);
  });

  it("given intimidate, when checking, then returns false", () => {
    expect(isMoldBreakerAbility("intimidate")).toBe(false);
  });
});

describe("isSurgeAbility", () => {
  it("given electric-surge, when checking, then returns true", () => {
    expect(isSurgeAbility("electric-surge")).toBe(true);
  });

  it("given grassy-surge, when checking, then returns true", () => {
    expect(isSurgeAbility("grassy-surge")).toBe(true);
  });

  it("given psychic-surge, when checking, then returns true", () => {
    expect(isSurgeAbility("psychic-surge")).toBe(true);
  });

  it("given misty-surge, when checking, then returns true", () => {
    expect(isSurgeAbility("misty-surge")).toBe(true);
  });

  it("given unrelated ability, when checking, then returns false", () => {
    expect(isSurgeAbility("intimidate")).toBe(false);
  });
});
