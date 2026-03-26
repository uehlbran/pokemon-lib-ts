/**
 * Cloud Nine / Air Lock weather suppression tests for Gen 8.
 *
 * Cloud Nine and Air Lock negate all weather effects while the ability holder
 * is on the field: weather damage boosts, weather chip, and speed abilities.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() checks for Cloud Nine and Air Lock
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
import type { ActivePokemon, BattleSide, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src";
import { calculateGen8Damage } from "../src/Gen8DamageCalc";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";
import {
  applyGen8WeatherEffects,
  isWeatherSuppressedGen8,
  isWeatherSuppressedOnFieldGen8,
} from "../src/Gen8Weather";

const ABILITIES = GEN8_ABILITY_IDS;
const MOVES = GEN8_MOVE_IDS;
const NATURES = GEN8_NATURE_IDS;
const SPECIES = GEN8_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const WEATHERS = CORE_WEATHER_IDS;
const GEN8_DATA = createGen8DataManager();
const DEFAULT_SPECIES_ID = GEN8_DATA.getSpecies(SPECIES.pikachu).id;
const DEFAULT_NATURE = GEN8_DATA.getNature(NATURES.hardy).id;

// ---------------------------------------------------------------------------
// Helper factories (same pattern as gen5/gen6 cloud-nine-suppression tests)
// ---------------------------------------------------------------------------

function createSyntheticActive(overrides: {
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
  speciesId?: number;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? DEFAULT_SPECIES_ID,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.blaze,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: {
        hp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.blaze,
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
  } as ActivePokemon;
}

function createCanonicalMove(moveId: string): MoveData {
  const base = GEN8_DATA.getMove(moveId);
  const move = { ...base, flags: { ...base.flags } } as MoveData;
  move.id = moveId;
  return move;
}

function createBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [BattleSide, BattleSide];
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 8,
    turnNumber: 1,
    sides: overrides?.sides ?? ([{}, {}] as unknown as [BattleSide, BattleSide]),
  } as unknown as BattleState;
}

function createBattleSide(active: ActivePokemon, index: 0 | 1 = 0): BattleSide {
  return {
    index,
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as unknown as BattleSide;
}

function createDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createSyntheticActive({}),
    defender: overrides.defender ?? createSyntheticActive({}),
    move: overrides.move ?? createCanonicalMove(MOVES.tackle),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// isWeatherSuppressedGen8 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedGen8", () => {
  it("given attacker has Cloud Nine, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Cloud Nine
    const cloudNine = createSyntheticActive({ ability: ABILITIES.cloudNine });
    const normal = createSyntheticActive({ ability: ABILITIES.blaze });
    expect(isWeatherSuppressedGen8(cloudNine, normal)).toBe(true);
  });

  it("given defender has Air Lock, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Air Lock
    const normal = createSyntheticActive({ ability: ABILITIES.blaze });
    const airLock = createSyntheticActive({ ability: ABILITIES.airLock });
    expect(isWeatherSuppressedGen8(normal, airLock)).toBe(true);
  });

  it("given neither has Cloud Nine or Air Lock, when checking suppression, then returns false", () => {
    // Source: Showdown sim/battle.ts — no suppression without Cloud Nine/Air Lock
    const a = createSyntheticActive({ ability: ABILITIES.blaze });
    const b = createSyntheticActive({ ability: ABILITIES.torrent });
    expect(isWeatherSuppressedGen8(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWeatherSuppressedOnFieldGen8 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedOnFieldGen8", () => {
  it("given Cloud Nine user on side 0, when checking field, then returns true", () => {
    const cloudNine = createSyntheticActive({ ability: ABILITIES.cloudNine });
    const normal = createSyntheticActive({ ability: ABILITIES.blaze });
    const state = createBattleState({
      weather: { type: WEATHERS.sand, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(cloudNine, 0), createBattleSide(normal, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen8(state)).toBe(true);
  });

  it("given Air Lock user on side 1, when checking field, then returns true", () => {
    const normal = createSyntheticActive({ ability: ABILITIES.blaze });
    const airLock = createSyntheticActive({ ability: ABILITIES.airLock });
    const state = createBattleState({
      weather: { type: WEATHERS.rain, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(normal, 0), createBattleSide(airLock, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen8(state)).toBe(true);
  });

  it("given no suppression abilities on field, when checking, then returns false", () => {
    const a = createSyntheticActive({ ability: ABILITIES.blaze });
    const b = createSyntheticActive({ ability: ABILITIES.torrent });
    const state = createBattleState({
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(a, 0), createBattleSide(b, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen8(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Damage calc integration: weather power boost suppression
// ---------------------------------------------------------------------------

describe("Gen8 Cloud Nine damage calc integration", () => {
  it("given Cloud Nine attacker in sun, when using Fire move, then no 1.5x sun boost applied", () => {
    // Without Cloud Nine, Fire moves get 1.5x in sun.
    // With Cloud Nine, the sun boost is suppressed — damage should equal no-weather damage.
    //
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather modifier in damage calc
    const attacker = createSyntheticActive({
      ability: ABILITIES.cloudNine,
      attack: 100,
      types: [TYPES.fire],
    });
    const defender = createSyntheticActive({
      ability: ABILITIES.blaze,
      defense: 100,
      types: [TYPES.normal],
    });
    const fireMove = createCanonicalMove(MOVES.flamethrower);

    const sunState = createBattleState({
      weather: { type: WEATHERS.sun, turnsLeft: 5, source: "test" },
    });
    const noWeatherState = createBattleState();

    // Seed 12345 for deterministic RNG
    const sunResult = calculateGen8Damage(
      createDamageContext({ attacker, defender, move: fireMove, state: sunState, seed: 12345 }),
      GEN8_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen8Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: noWeatherState,
        seed: 12345,
      }),
      GEN8_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // With Cloud Nine: sun boost is suppressed, so damage equals no-weather damage
    expect(sunResult.damage).toBe(noWeatherResult.damage);
  });

  it("given no Cloud Nine in rain, when using Water move, then 1.5x rain boost IS applied", () => {
    // Confirm that without Cloud Nine / Air Lock, rain boost works normally.
    //
    // Source: Showdown sim/battle-actions.ts — weather modifier 1.5x for Water in rain
    const attacker = createSyntheticActive({
      ability: ABILITIES.torrent,
      attack: 100,
      types: [TYPES.water],
    });
    const defender = createSyntheticActive({
      ability: ABILITIES.blaze,
      defense: 100,
      types: [TYPES.normal],
    });
    const waterMove = createCanonicalMove(MOVES.surf);

    const rainState = createBattleState({
      weather: { type: WEATHERS.rain, turnsLeft: 5, source: "test" },
    });
    const noWeatherState = createBattleState();

    const rainResult = calculateGen8Damage(
      createDamageContext({ attacker, defender, move: waterMove, state: rainState, seed: 12345 }),
      GEN8_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen8Damage(
      createDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: noWeatherState,
        seed: 12345,
      }),
      GEN8_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // Without suppression: rain DOES boost Water damage
    expect(rainResult.damage).toBeGreaterThan(noWeatherResult.damage);
  });

  it("given Air Lock defender in rain, when using Water move, then no 1.5x rain boost applied", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather modifier in damage calc
    const attacker = createSyntheticActive({
      ability: ABILITIES.torrent,
      attack: 100,
      types: [TYPES.water],
    });
    const defender = createSyntheticActive({
      ability: ABILITIES.airLock,
      defense: 100,
      types: [TYPES.normal],
    });
    const waterMove = createCanonicalMove(MOVES.surf);

    const rainState = createBattleState({
      weather: { type: WEATHERS.rain, turnsLeft: 5, source: "test" },
    });
    const noWeatherState = createBattleState();

    const rainResult = calculateGen8Damage(
      createDamageContext({ attacker, defender, move: waterMove, state: rainState, seed: 99999 }),
      GEN8_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen8Damage(
      createDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: noWeatherState,
        seed: 99999,
      }),
      GEN8_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // With Air Lock: rain boost is suppressed
    expect(rainResult.damage).toBe(noWeatherResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Weather chip damage suppression
// ---------------------------------------------------------------------------

describe("Gen8 Cloud Nine weather chip suppression", () => {
  it("given Cloud Nine user on field in sandstorm, when applying weather effects, then no chip damage dealt", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
    const cloudNine = createSyntheticActive({
      ability: ABILITIES.cloudNine,
      types: [TYPES.normal],
      hp: 200,
      currentHp: 200,
    });
    const normalMon = createSyntheticActive({
      ability: ABILITIES.blaze,
      types: [TYPES.normal],
      hp: 200,
      currentHp: 200,
    });
    const state = createBattleState({
      weather: { type: WEATHERS.sand, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(cloudNine, 0), createBattleSide(normalMon, 1)],
    });

    const results = applyGen8WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given Air Lock user on field in hail, when applying weather effects, then no chip damage dealt", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
    const normalMon = createSyntheticActive({
      ability: ABILITIES.blaze,
      types: [TYPES.normal],
      hp: 200,
      currentHp: 200,
    });
    const airLock = createSyntheticActive({
      ability: ABILITIES.airLock,
      types: [TYPES.normal],
      hp: 200,
      currentHp: 200,
    });
    const state = createBattleState({
      weather: { type: WEATHERS.hail, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(normalMon, 0), createBattleSide(airLock, 1)],
    });

    const results = applyGen8WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given no suppression in hail, when applying weather effects, then chip damage is dealt to non-immune Pokemon", () => {
    // Source: Showdown data/conditions.ts — hail deals 1/16 max HP chip damage
    const normalMon1 = createSyntheticActive({
      ability: ABILITIES.blaze,
      types: [TYPES.normal],
      hp: 200,
      currentHp: 200,
    });
    const normalMon2 = createSyntheticActive({
      ability: ABILITIES.blaze,
      types: [TYPES.fire],
      hp: 240,
      currentHp: 240,
    });
    const state = createBattleState({
      weather: { type: WEATHERS.hail, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(normalMon1, 0), createBattleSide(normalMon2, 1)],
    });

    const results = applyGen8WeatherEffects(state);
    expect(results.length).toBe(2);
    // floor(200/16) = 12
    expect(results[0].damage).toBe(12);
    // floor(240/16) = 15
    expect(results[1].damage).toBe(15);
  });
});
