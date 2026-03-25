import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getBoostMultiplier,
  getHadronEngineMultiplier,
  getHighestBaseStat,
  getOrichalcumPulseMultiplier,
  handleGen9StatAbility,
  handleProtosynthesis,
  handleQuarkDrive,
  shouldProtosynthesisActivate,
  shouldQuarkDriveActivate,
} from "../src/Gen9AbilitiesStat";

/**
 * Gen 9 stat-boosting ability tests: Protosynthesis, Quark Drive,
 * Orichalcum Pulse multiplier, Hadron Engine multiplier.
 *
 * Source: Showdown data/abilities.ts:3427-3629 (Protosynthesis, Quark Drive)
 * Source: Showdown data/abilities.ts:3016-3035 (Orichalcum Pulse)
 * Source: Showdown data/abilities.ts:1725-1742 (Hadron Engine)
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
    next: () => 0,
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
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
}): AbilityContext {
  return {
    pokemon: overrides.pokemon as any,
    opponent: overrides.opponent as any,
    state: makeBattleState({
      weather: overrides.weather,
      terrain: overrides.terrain,
    }),
    rng: makeRng(),
    trigger: overrides.trigger as any,
  };
}

// ---------------------------------------------------------------------------
// getHighestBaseStat
// ---------------------------------------------------------------------------

describe("getHighestBaseStat", () => {
  it("given a Pokemon with highest Attack, when finding highest stat, then returns attack", () => {
    // Source: Showdown data/abilities.ts:3440-3455 -- iterates stats in order
    const pokemon = makeActivePokemon({
      calculatedStats: {
        hp: 200,
        attack: 150,
        defense: 80,
        spAttack: 90,
        spDefense: 80,
        speed: 100,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe("attack");
  });

  it("given a Pokemon with highest Speed, when finding highest stat, then returns speed", () => {
    // Source: Showdown data/abilities.ts:3440-3455
    const pokemon = makeActivePokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 80,
        spAttack: 90,
        spDefense: 80,
        speed: 130,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe("speed");
  });

  it("given a Pokemon with highest SpAttack, when finding highest stat, then returns spAttack", () => {
    // Source: Showdown data/abilities.ts:3440-3455
    const pokemon = makeActivePokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 80,
        spAttack: 140,
        spDefense: 80,
        speed: 100,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe("spAttack");
  });

  it("given a Pokemon with tied Attack and Defense, when finding highest stat, then returns attack (first in order)", () => {
    // Source: Showdown data/abilities.ts:3440-3455 -- ties broken by iteration order: atk > def > spa > spd > spe
    const pokemon = makeActivePokemon({
      calculatedStats: {
        hp: 200,
        attack: 120,
        defense: 120,
        spAttack: 80,
        spDefense: 80,
        speed: 80,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe("attack");
  });

  it("given a Pokemon with all equal stats, when finding highest stat, then returns attack (first in order)", () => {
    // Source: Showdown data/abilities.ts:3440-3455 -- first in iteration wins ties
    const pokemon = makeActivePokemon({
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe("attack");
  });

  it("given a Pokemon with highest Defense, when finding highest stat, then returns defense", () => {
    const pokemon = makeActivePokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 150,
        spAttack: 80,
        spDefense: 80,
        speed: 80,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe("defense");
  });

  it("given a Pokemon with highest SpDefense, when finding highest stat, then returns spDefense", () => {
    const pokemon = makeActivePokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 80,
        spAttack: 80,
        spDefense: 140,
        speed: 80,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe("spDefense");
  });
});

// ---------------------------------------------------------------------------
// getBoostMultiplier
// ---------------------------------------------------------------------------

describe("getBoostMultiplier", () => {
  it("given Speed stat, when getting boost multiplier, then returns 1.5 (50%)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    // "if (bestStat === 'spe') return this.chainModify(1.5)"
    expect(getBoostMultiplier("speed")).toBe(1.5);
  });

  it("given Attack stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    // "return this.chainModify([5325, 4096])"
    expect(getBoostMultiplier("attack")).toBeCloseTo(5325 / 4096, 10);
  });

  it("given Defense stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    expect(getBoostMultiplier("defense")).toBeCloseTo(5325 / 4096, 10);
  });

  it("given SpAttack stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    expect(getBoostMultiplier("spAttack")).toBeCloseTo(5325 / 4096, 10);
  });

  it("given SpDefense stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    expect(getBoostMultiplier("spDefense")).toBeCloseTo(5325 / 4096, 10);
  });
});

// ---------------------------------------------------------------------------
// shouldProtosynthesisActivate
// ---------------------------------------------------------------------------

describe("shouldProtosynthesisActivate", () => {
  it("given Sun weather, when checking activation, then activates without consuming Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- sun activates
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given Harsh Sun weather, when checking activation, then activates without consuming Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- desolate land (harsh-sun) also activates
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
      weather: { type: "harsh-sun", turnsLeft: 999, source: "desolate-land" },
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given no Sun but holding Booster Energy, when checking activation, then activates and consumes Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- Booster Energy item check
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis", heldItem: "booster-energy" }),
      trigger: "on-switch-in",
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(true);
  });

  it("given no Sun and no Booster Energy, when checking activation, then does not activate", () => {
    // Source: Showdown data/abilities.ts:3427-3440
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(false);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given Rain weather and no Booster Energy, when checking activation, then does not activate", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- only sun/harsh-sun triggers
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
      weather: { type: "rain", turnsLeft: 5, source: "drizzle" },
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(false);
  });

  it("given already active protosynthesis volatile, when checking activation, then does not activate again", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- doesn't stack
    const volatiles = new Map([["protosynthesis", { turnsLeft: -1 }]]);
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "protosynthesis",
        volatiles: volatiles as any,
      }),
      trigger: "on-switch-in",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleProtosynthesis
// ---------------------------------------------------------------------------

describe("handleProtosynthesis", () => {
  it("given on-switch-in in Sun with highest Attack, when handling, then sets volatile with attack boost", () => {
    // Source: Showdown data/abilities.ts:3427-3493
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "protosynthesis",
        calculatedStats: {
          hp: 200,
          attack: 150,
          defense: 80,
          spAttack: 90,
          spDefense: 80,
          speed: 100,
        },
      }),
      trigger: "on-switch-in",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        target: "self",
        volatile: "protosynthesis",
        data: { boostedStat: "attack", fromBoosterEnergy: false },
      }),
    );
  });

  it("given on-switch-in with Booster Energy and highest Speed, when handling, then consumes energy and boosts speed", () => {
    // Source: Showdown data/abilities.ts:3427-3493
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "protosynthesis",
        heldItem: "booster-energy",
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 80,
          spAttack: 80,
          spDefense: 80,
          speed: 130,
        },
      }),
      trigger: "on-switch-in",
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        data: { boostedStat: "speed", fromBoosterEnergy: true },
      }),
    );
    expect(result.messages[0]).toContain("Booster Energy");
  });

  it("given on-weather-change to Sun, when handling, then activates protosynthesis", () => {
    // Source: Showdown data/abilities.ts -- also triggers on weather change
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-weather-change",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-before-move trigger, when handling, then does not activate (wrong trigger)", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-before-move",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no Sun and no Booster Energy, when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(false);
  });

  it("given a nickname, when handling, then message uses nickname", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "protosynthesis",
        nickname: "SunnyBoy",
        calculatedStats: {
          hp: 200,
          attack: 150,
          defense: 80,
          spAttack: 80,
          spDefense: 80,
          speed: 80,
        },
      }),
      trigger: "on-switch-in",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.messages.some((m) => m.includes("SunnyBoy"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldQuarkDriveActivate
// ---------------------------------------------------------------------------

describe("shouldQuarkDriveActivate", () => {
  it("given Electric Terrain, when checking activation, then activates without consuming Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3564-3580
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "quark-drive" }),
      trigger: "on-switch-in",
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given no Electric Terrain but holding Booster Energy, when checking activation, then activates and consumes", () => {
    // Source: Showdown data/abilities.ts:3564-3580
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "quark-drive", heldItem: "booster-energy" }),
      trigger: "on-switch-in",
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(true);
  });

  it("given Grassy Terrain (not Electric), when checking activation, then does not activate", () => {
    // Source: Showdown data/abilities.ts:3564-3580 -- only electric terrain triggers
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "quark-drive" }),
      trigger: "on-switch-in",
      terrain: { type: "grassy", turnsLeft: 5, source: "grassy-surge" },
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(false);
  });

  it("given no terrain and no Booster Energy, when checking activation, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "quark-drive" }),
      trigger: "on-switch-in",
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(false);
  });

  it("given already active quarkdrive volatile, when checking activation, then does not activate again", () => {
    // Source: Showdown data/abilities.ts:3564-3580 -- doesn't stack
    const volatiles = new Map([["quarkdrive", { turnsLeft: -1 }]]);
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "quark-drive",
        volatiles: volatiles as any,
      }),
      trigger: "on-switch-in",
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleQuarkDrive
// ---------------------------------------------------------------------------

describe("handleQuarkDrive", () => {
  it("given on-switch-in on Electric Terrain with highest SpAttack, when handling, then sets volatile with spAttack boost", () => {
    // Source: Showdown data/abilities.ts:3564-3629
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "quark-drive",
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 80,
          spAttack: 140,
          spDefense: 80,
          speed: 100,
        },
      }),
      trigger: "on-switch-in",
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const result = handleQuarkDrive(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        target: "self",
        volatile: "quarkdrive",
        data: { boostedStat: "spAttack", fromBoosterEnergy: false },
      }),
    );
  });

  it("given on-terrain-change to Electric Terrain, when handling, then activates quark drive", () => {
    // Source: Showdown data/abilities.ts:3564-3629
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "quark-drive" }),
      trigger: "on-terrain-change",
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const result = handleQuarkDrive(ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-switch-in with Booster Energy and highest Speed, when handling, then consumes energy and boosts speed", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({
        ability: "quark-drive",
        heldItem: "booster-energy",
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 80,
          spAttack: 80,
          spDefense: 80,
          speed: 130,
        },
      }),
      trigger: "on-switch-in",
    });
    const result = handleQuarkDrive(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        data: { boostedStat: "speed", fromBoosterEnergy: true },
      }),
    );
    expect(result.messages[0]).toContain("Booster Energy");
  });

  it("given wrong trigger (on-contact), when handling, then does not activate", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "quark-drive" }),
      trigger: "on-contact",
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const result = handleQuarkDrive(ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleGen9StatAbility dispatch
// ---------------------------------------------------------------------------

describe("handleGen9StatAbility", () => {
  it("given protosynthesis ability in Sun, when dispatching, then activates protosynthesis", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = handleGen9StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: "protosynthesis" }));
  });

  it("given quark-drive ability on Electric Terrain, when dispatching, then activates quark drive", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "quark-drive" }),
      trigger: "on-switch-in",
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const result = handleGen9StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: "quarkdrive" }));
  });

  it("given unrelated ability, when dispatching, then returns inactive", () => {
    const ctx = makeAbilityContext({
      pokemon: makeActivePokemon({ ability: "intimidate" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Orichalcum Pulse multiplier
// ---------------------------------------------------------------------------

describe("getOrichalcumPulseMultiplier", () => {
  it("given Sun weather, when getting multiplier, then returns 5461/4096 (~1.333)", () => {
    // Source: Showdown data/abilities.ts:3028-3033
    // "return this.chainModify([5461, 4096])"
    expect(getOrichalcumPulseMultiplier("sun")).toBeCloseTo(5461 / 4096, 10);
  });

  it("given Harsh Sun weather, when getting multiplier, then returns 5461/4096 (~1.333)", () => {
    // Source: Showdown data/abilities.ts:3028-3033
    expect(getOrichalcumPulseMultiplier("harsh-sun")).toBeCloseTo(5461 / 4096, 10);
  });

  it("given Rain weather, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getOrichalcumPulseMultiplier("rain")).toBe(1);
  });

  it("given no weather, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getOrichalcumPulseMultiplier(undefined)).toBe(1);
  });

  it("given Sand weather, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getOrichalcumPulseMultiplier("sand")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Hadron Engine multiplier
// ---------------------------------------------------------------------------

describe("getHadronEngineMultiplier", () => {
  it("given Electric Terrain, when getting multiplier, then returns 5461/4096 (~1.333)", () => {
    // Source: Showdown data/abilities.ts:1733-1740
    // "return this.chainModify([5461, 4096])"
    expect(getHadronEngineMultiplier("electric")).toBeCloseTo(5461 / 4096, 10);
  });

  it("given Grassy Terrain, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getHadronEngineMultiplier("grassy")).toBe(1);
  });

  it("given no terrain, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getHadronEngineMultiplier(undefined)).toBe(1);
  });

  it("given Psychic Terrain, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getHadronEngineMultiplier("psychic")).toBe(1);
  });
});
