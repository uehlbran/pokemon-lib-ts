import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MECHANIC_MULTIPLIERS,
  CORE_NATURE_IDS,
  CORE_STAT_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen9DataManager } from "../src";
import { GEN9_ABILITY_IDS, GEN9_ITEM_IDS, GEN9_NATURE_IDS, GEN9_SPECIES_IDS } from "../src/data";
import {
  GEN9_ORICHALCUM_HADRON_MULTIPLIER,
  GEN9_STAT_ABILITY_SPEED_MULTIPLIER,
  GEN9_STAT_ABILITY_STANDARD_MULTIPLIER,
  getBoostMultiplier,
  getHadronEngineMultiplier,
  getHighestBaseStat,
  getOrichalcumPulseMultiplier,
  handleGen9StatAbility,
  handleProtosynthesis,
  handleQuarkDrive,
  shouldProtosynthesisActivate,
  shouldQuarkDriveActivate,
} from "../src/internal";

const ABILITIES = GEN9_ABILITY_IDS;
const CORE_ABILITIES = CORE_ABILITY_IDS;
const ITEMS = GEN9_ITEM_IDS;
const SPECIES = GEN9_SPECIES_IDS;
const TERRAINS = CORE_TERRAIN_IDS;
const _TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const WEATHERS = CORE_WEATHER_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const dataManager = createGen9DataManager();
const defaultSpecies = dataManager.getSpecies(SPECIES.bulbasaur);
const DEFAULT_NATURE = dataManager.getNature(
  (CORE_NATURE_IDS.hardy ?? GEN9_NATURE_IDS.hardy) as typeof GEN9_NATURE_IDS.hardy,
).id;

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
function createTestUid() {
  return `test-${nextTestUid++}`;
}

function createSyntheticPokemonInstance(overrides: {
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
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, makeRng(), {
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    friendship: createFriendship(species.baseFriendship),
    moves: [],
    isShiny: false,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
  });
  pokemon.uid = createTestUid();
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? CORE_ABILITIES.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = (overrides.status ?? null) as PokemonInstance["status"];
  pokemon.calculatedStats = overrides.calculatedStats ?? {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return pokemon;
}

function createOnFieldPokemon(overrides: {
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
  const pokemon = createSyntheticPokemonInstance({
    ability: overrides.ability,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    speciesId: overrides.speciesId,
    status: overrides.status,
    heldItem: overrides.heldItem,
    calculatedStats: overrides.calculatedStats,
  });
  const species = dataManager.getSpecies(pokemon.speciesId);
  const activePokemon = createBattleOnFieldPokemon(pokemon, 0, [
    ...(overrides.types ?? species.types),
  ]);
  activePokemon.ability = pokemon.ability;
  activePokemon.volatileStatuses = overrides.volatiles ?? new Map();
  activePokemon.substituteHp = overrides.substituteHp ?? 0;
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

function createBattleState(overrides?: {
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
}): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
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

function createAbilityContext(overrides: {
  pokemon: ReturnType<typeof createOnFieldPokemon>;
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  trigger: (typeof TRIGGERS)[keyof typeof TRIGGERS];
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
}): AbilityContext {
  return {
    pokemon: overrides.pokemon as any,
    opponent: overrides.opponent as any,
    state: createBattleState({
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
    const pokemon = createOnFieldPokemon({
      calculatedStats: {
        hp: 200,
        attack: 150,
        defense: 80,
        spAttack: 90,
        spDefense: 80,
        speed: 100,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe(CORE_STAT_IDS.attack);
  });

  it("given a Pokemon with highest Speed, when finding highest stat, then returns speed", () => {
    // Source: Showdown data/abilities.ts:3440-3455
    const pokemon = createOnFieldPokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 80,
        spAttack: 90,
        spDefense: 80,
        speed: 130,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe(CORE_STAT_IDS.speed);
  });

  it("given a Pokemon with highest SpAttack, when finding highest stat, then returns spAttack", () => {
    // Source: Showdown data/abilities.ts:3440-3455
    const pokemon = createOnFieldPokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 80,
        spAttack: 140,
        spDefense: 80,
        speed: 100,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe(CORE_STAT_IDS.spAttack);
  });

  it("given a Pokemon with tied Attack and Defense, when finding highest stat, then returns attack (first in order)", () => {
    // Source: Showdown data/abilities.ts:3440-3455 -- ties broken by iteration order: atk > def > spa > spd > spe
    const pokemon = createOnFieldPokemon({
      calculatedStats: {
        hp: 200,
        attack: 120,
        defense: 120,
        spAttack: 80,
        spDefense: 80,
        speed: 80,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe(CORE_STAT_IDS.attack);
  });

  it("given a Pokemon with all equal stats, when finding highest stat, then returns attack (first in order)", () => {
    // Source: Showdown data/abilities.ts:3440-3455 -- first in iteration wins ties
    const pokemon = createOnFieldPokemon({
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe(CORE_STAT_IDS.attack);
  });

  it("given a Pokemon with highest Defense, when finding highest stat, then returns defense", () => {
    const pokemon = createOnFieldPokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 150,
        spAttack: 80,
        spDefense: 80,
        speed: 80,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe(CORE_STAT_IDS.defense);
  });

  it("given a Pokemon with highest SpDefense, when finding highest stat, then returns spDefense", () => {
    const pokemon = createOnFieldPokemon({
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 80,
        spAttack: 80,
        spDefense: 140,
        speed: 80,
      },
    });
    expect(getHighestBaseStat(pokemon as any)).toBe(CORE_STAT_IDS.spDefense);
  });
});

// ---------------------------------------------------------------------------
// getBoostMultiplier
// ---------------------------------------------------------------------------

describe("getBoostMultiplier", () => {
  it("given Speed stat, when getting boost multiplier, then returns 1.5 (50%)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    // "if (bestStat === 'spe') return this.chainModify(1.5)"
    expect(getBoostMultiplier(CORE_STAT_IDS.speed)).toBe(GEN9_STAT_ABILITY_SPEED_MULTIPLIER);
  });

  it("given Attack stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    // "return this.chainModify([5325, 4096])"
    expect(getBoostMultiplier(CORE_STAT_IDS.attack)).toBeCloseTo(
      GEN9_STAT_ABILITY_STANDARD_MULTIPLIER,
      10,
    );
  });

  it("given Defense stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    expect(getBoostMultiplier(CORE_STAT_IDS.defense)).toBeCloseTo(
      GEN9_STAT_ABILITY_STANDARD_MULTIPLIER,
      10,
    );
  });

  it("given SpAttack stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    expect(getBoostMultiplier(CORE_STAT_IDS.spAttack)).toBeCloseTo(
      GEN9_STAT_ABILITY_STANDARD_MULTIPLIER,
      10,
    );
  });

  it("given SpDefense stat, when getting boost multiplier, then returns 5325/4096 (~1.3)", () => {
    // Source: Showdown data/abilities.ts:3480-3483
    expect(getBoostMultiplier("spDefense")).toBeCloseTo(GEN9_STAT_ABILITY_STANDARD_MULTIPLIER, 10);
  });
});

// ---------------------------------------------------------------------------
// shouldProtosynthesisActivate
// ---------------------------------------------------------------------------

describe("shouldProtosynthesisActivate", () => {
  it("given Sun weather, when checking activation, then activates without consuming Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- sun activates
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onSwitchIn,
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: CORE_ABILITIES.drought },
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given Harsh Sun weather, when checking activation, then activates without consuming Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- desolate land (harsh-sun) also activates
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onSwitchIn,
      weather: { type: WEATHERS.harshSun, turnsLeft: 999, source: ABILITIES.desolateLand },
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given no Sun but holding Booster Energy, when checking activation, then activates and consumes Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- Booster Energy item check
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.protosynthesis,
        heldItem: ITEMS.boosterEnergy,
      }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(true);
  });

  it("given no Sun and no Booster Energy, when checking activation, then does not activate", () => {
    // Source: Showdown data/abilities.ts:3427-3440
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(false);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given Rain weather and no Booster Energy, when checking activation, then does not activate", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- only sun/harsh-sun triggers
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onSwitchIn,
      weather: { type: WEATHERS.rain, turnsLeft: 5, source: CORE_ABILITIES.drizzle },
    });
    const result = shouldProtosynthesisActivate(ctx);
    expect(result.activate).toBe(false);
  });

  it("given already active protosynthesis volatile, when checking activation, then does not activate again", () => {
    // Source: Showdown data/abilities.ts:3427-3440 -- doesn't stack
    const volatiles = new Map([[VOLATILES.protosynthesis, { turnsLeft: -1 }]]);
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.protosynthesis,
        volatiles: volatiles as any,
      }),
      trigger: TRIGGERS.onSwitchIn,
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: CORE_ABILITIES.drought },
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
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.protosynthesis,
        calculatedStats: {
          hp: 200,
          attack: 150,
          defense: 80,
          spAttack: 90,
          spDefense: 80,
          speed: 100,
        },
      }),
      trigger: TRIGGERS.onSwitchIn,
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: CORE_ABILITIES.drought },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        target: "self",
        volatile: VOLATILES.protosynthesis,
        data: { boostedStat: "attack", fromBoosterEnergy: false },
      }),
    );
  });

  it("given on-switch-in with Booster Energy and highest Speed, when handling, then consumes energy and boosts speed", () => {
    // Source: Showdown data/abilities.ts:3427-3493
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.protosynthesis,
        heldItem: ITEMS.boosterEnergy,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 80,
          spAttack: 80,
          spDefense: 80,
          speed: 130,
        },
      }),
      trigger: TRIGGERS.onSwitchIn,
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
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onWeatherChange,
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: CORE_ABILITIES.drought },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-before-move trigger, when handling, then does not activate (wrong trigger)", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onBeforeMove,
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: CORE_ABILITIES.drought },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no Sun and no Booster Energy, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleProtosynthesis(ctx);
    expect(result.activated).toBe(false);
  });

  it("given a nickname, when handling, then message uses nickname", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.protosynthesis,
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
      trigger: TRIGGERS.onSwitchIn,
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: CORE_ABILITIES.drought },
    });
    const result = handleProtosynthesis(ctx);
    expect(result.messages).toEqual(["SunnyBoy's Protosynthesis boosted its Attack!"]);
  });
});

// ---------------------------------------------------------------------------
// shouldQuarkDriveActivate
// ---------------------------------------------------------------------------

describe("shouldQuarkDriveActivate", () => {
  it("given Electric Terrain, when checking activation, then activates without consuming Booster Energy", () => {
    // Source: Showdown data/abilities.ts:3564-3580
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.quarkDrive }),
      trigger: TRIGGERS.onSwitchIn,
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ABILITIES.electricSurge },
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(false);
  });

  it("given no Electric Terrain but holding Booster Energy, when checking activation, then activates and consumes", () => {
    // Source: Showdown data/abilities.ts:3564-3580
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.quarkDrive,
        heldItem: ITEMS.boosterEnergy,
      }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(true);
    expect(result.consumeBoosterEnergy).toBe(true);
  });

  it("given Grassy Terrain (not Electric), when checking activation, then does not activate", () => {
    // Source: Showdown data/abilities.ts:3564-3580 -- only electric terrain triggers
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.quarkDrive }),
      trigger: TRIGGERS.onSwitchIn,
      terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: ABILITIES.grassySurge },
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(false);
  });

  it("given no terrain and no Booster Energy, when checking activation, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.quarkDrive }),
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = shouldQuarkDriveActivate(ctx);
    expect(result.activate).toBe(false);
  });

  it("given already active quarkdrive volatile, when checking activation, then does not activate again", () => {
    // Source: Showdown data/abilities.ts:3564-3580 -- doesn't stack
    const volatiles = new Map([[VOLATILES.quarkDrive, { turnsLeft: -1 }]]);
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.quarkDrive,
        volatiles: volatiles as any,
      }),
      trigger: TRIGGERS.onSwitchIn,
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ABILITIES.electricSurge },
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
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.quarkDrive,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 80,
          spAttack: 140,
          spDefense: 80,
          speed: 100,
        },
      }),
      trigger: TRIGGERS.onSwitchIn,
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ABILITIES.electricSurge },
    });
    const result = handleQuarkDrive(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({
        effectType: "volatile-inflict",
        target: "self",
        volatile: VOLATILES.quarkDrive,
        data: { boostedStat: "spAttack", fromBoosterEnergy: false },
      }),
    );
  });

  it("given on-terrain-change to Electric Terrain, when handling, then activates quark drive", () => {
    // Source: Showdown data/abilities.ts:3564-3629
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.quarkDrive }),
      trigger: TRIGGERS.onTerrainChange,
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ABILITIES.electricSurge },
    });
    const result = handleQuarkDrive(ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-switch-in with Booster Energy and highest Speed, when handling, then consumes energy and boosts speed", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.quarkDrive,
        heldItem: ITEMS.boosterEnergy,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 80,
          spAttack: 80,
          spDefense: 80,
          speed: 130,
        },
      }),
      trigger: TRIGGERS.onSwitchIn,
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
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.quarkDrive }),
      trigger: TRIGGERS.onContact,
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ABILITIES.electricSurge },
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
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protosynthesis }),
      trigger: TRIGGERS.onSwitchIn,
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: CORE_ABILITIES.drought },
    });
    const result = handleGen9StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ volatile: VOLATILES.protosynthesis }),
    );
  });

  it("given quark-drive ability on Electric Terrain, when dispatching, then activates quark drive", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.quarkDrive }),
      trigger: TRIGGERS.onSwitchIn,
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: ABILITIES.electricSurge },
    });
    const result = handleGen9StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: VOLATILES.quarkDrive }));
  });

  it("given unrelated ability, when dispatching, then returns inactive", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: CORE_ABILITIES.intimidate }),
      trigger: TRIGGERS.onSwitchIn,
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
    expect(getOrichalcumPulseMultiplier(WEATHERS.sun)).toBeCloseTo(
      GEN9_ORICHALCUM_HADRON_MULTIPLIER,
      10,
    );
  });

  it("given Harsh Sun weather, when getting multiplier, then returns 5461/4096 (~1.333)", () => {
    // Source: Showdown data/abilities.ts:3028-3033
    expect(getOrichalcumPulseMultiplier(WEATHERS.harshSun)).toBeCloseTo(
      GEN9_ORICHALCUM_HADRON_MULTIPLIER,
      10,
    );
  });

  it("given Rain weather, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getOrichalcumPulseMultiplier(WEATHERS.rain)).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });

  it("given no weather, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getOrichalcumPulseMultiplier(undefined)).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });

  it("given Sand weather, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getOrichalcumPulseMultiplier(WEATHERS.sand)).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });
});

// ---------------------------------------------------------------------------
// Hadron Engine multiplier
// ---------------------------------------------------------------------------

describe("getHadronEngineMultiplier", () => {
  it("given Electric Terrain, when getting multiplier, then returns 5461/4096 (~1.333)", () => {
    // Source: Showdown data/abilities.ts:1733-1740
    // "return this.chainModify([5461, 4096])"
    expect(getHadronEngineMultiplier(TERRAINS.electric)).toBeCloseTo(
      GEN9_ORICHALCUM_HADRON_MULTIPLIER,
      10,
    );
  });

  it("given Grassy Terrain, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getHadronEngineMultiplier(TERRAINS.grassy)).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });

  it("given no terrain, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getHadronEngineMultiplier(undefined)).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });

  it("given Psychic Terrain, when getting multiplier, then returns 1 (no boost)", () => {
    expect(getHadronEngineMultiplier(TERRAINS.psychic)).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });
});
