/**
 * Cloud Nine / Air Lock weather suppression tests for Gen 5.
 *
 * Cloud Nine and Air Lock negate all weather effects while the ability holder
 * is on the field: weather damage boosts, weather chip, and speed abilities.
 *
 * Source: Showdown sim/battle.ts — suppressingWeather() checks for Cloud Nine and Air Lock
 * Source: Bulbapedia — "Cloud Nine / Air Lock: the effects of weather are negated"
 */
import type { ActivePokemon, BattleSide, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import {
  createOnFieldPokemon as createBattleOnFieldPokemon,
  createDefaultStatStages,
} from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";
import {
  applyGen5WeatherEffects,
  isWeatherSuppressedGen5,
  isWeatherSuppressedOnFieldGen5,
} from "../src/Gen5Weather";

const abilityIds = GEN5_ABILITY_IDS;
const moveIds = GEN5_MOVE_IDS;
const natureIds = GEN5_NATURE_IDS;
const speciesIds = GEN5_SPECIES_IDS;
const typeIds = CORE_TYPE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const dataManager = createGen5DataManager();
const defaultSpecies = dataManager.getSpecies(speciesIds.pikachu);
const defaultNatureId = dataManager.getNature(natureIds.hardy).id;
const DEFAULT_LEVEL = 50;
const DEFAULT_CONTEXT_SEED = 42;
const DEFAULT_TEST_STATS = {
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

function createSyntheticOnFieldPokemon(overrides: {
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
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const hp = overrides.hp ?? DEFAULT_TEST_STATS.hp;
  const pokemon = createPokemonInstance(
    species,
    overrides.level ?? DEFAULT_LEVEL,
    new SeededRandom(DEFAULT_CONTEXT_SEED),
    {
      nature: defaultNatureId,
      ivs: createIvs(),
      evs: createEvs(),
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      friendship: createFriendship(species.baseFriendship),
      gender: species.genderRatio === null ? CORE_GENDERS.genderless : CORE_GENDERS.male,
      metLocation: "test",
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
    },
  );
  pokemon.uid = `test-${species.id}-${pokemon.level}`;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = overrides.ability ?? abilityIds.blaze;
  pokemon.status = (overrides.status ?? null) as typeof pokemon.status;
  pokemon.calculatedStats = {
    hp,
    attack: overrides.attack ?? DEFAULT_TEST_STATS.attack,
    defense: overrides.defense ?? DEFAULT_TEST_STATS.defense,
    spAttack: overrides.spAttack ?? DEFAULT_TEST_STATS.spAttack,
    spDefense: overrides.spDefense ?? DEFAULT_TEST_STATS.spDefense,
    speed: overrides.speed ?? DEFAULT_TEST_STATS.speed,
  };

  const activePokemon = createBattleOnFieldPokemon(pokemon, 0, overrides.types ?? [typeIds.normal]);
  activePokemon.statStages = createDefaultStatStages();
  return activePokemon;
}

function createSyntheticMoveFrom(moveId: string): MoveData {
  const base = dataManager.getMove(moveId);
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
    generation: 5,
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
    attacker: overrides.attacker ?? createSyntheticOnFieldPokemon({}),
    defender: overrides.defender ?? createSyntheticOnFieldPokemon({}),
    move: overrides.move ?? createSyntheticMoveFrom(moveIds.tackle),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? DEFAULT_CONTEXT_SEED),
    isCrit: overrides.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// isWeatherSuppressedGen5 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedGen5", () => {
  it("given attacker has Cloud Nine, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Cloud Nine
    const cloudNine = createSyntheticOnFieldPokemon({ ability: abilityIds.cloudNine });
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    expect(isWeatherSuppressedGen5(cloudNine, normal)).toBe(true);
  });

  it("given defender has Air Lock, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Air Lock
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const airLock = createSyntheticOnFieldPokemon({ ability: abilityIds.airLock });
    expect(isWeatherSuppressedGen5(normal, airLock)).toBe(true);
  });

  it("given neither has Cloud Nine or Air Lock, when checking suppression, then returns false", () => {
    // Source: Showdown sim/battle.ts — no suppression without Cloud Nine/Air Lock
    const a = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const b = createSyntheticOnFieldPokemon({ ability: abilityIds.torrent });
    expect(isWeatherSuppressedGen5(a, b)).toBe(false);
  });

  it("given undefined pokemon, when checking suppression, then handles gracefully", () => {
    const a = createSyntheticOnFieldPokemon({ ability: abilityIds.cloudNine });
    expect(isWeatherSuppressedGen5(a, undefined)).toBe(true);
    expect(isWeatherSuppressedGen5(undefined, undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWeatherSuppressedOnFieldGen5 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedOnFieldGen5", () => {
  it("given Cloud Nine user on side 0, when checking field, then returns true", () => {
    const cloudNine = createSyntheticOnFieldPokemon({ ability: abilityIds.cloudNine });
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const state = createBattleState({
      weather: { type: weatherIds.sand, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(cloudNine, 0), createBattleSide(normal, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen5(state)).toBe(true);
  });

  it("given Air Lock user on side 1, when checking field, then returns true", () => {
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const airLock = createSyntheticOnFieldPokemon({ ability: abilityIds.airLock });
    const state = createBattleState({
      weather: { type: weatherIds.rain, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(normal, 0), createBattleSide(airLock, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen5(state)).toBe(true);
  });

  it("given no Cloud Nine or Air Lock on field, when checking, then returns false", () => {
    const a = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const b = createSyntheticOnFieldPokemon({ ability: abilityIds.torrent });
    const state = createBattleState({
      weather: { type: weatherIds.sun, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(a, 0), createBattleSide(b, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen5(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Damage calc integration: weather power boost suppression
// ---------------------------------------------------------------------------

describe("Gen5 Cloud Nine damage calc integration", () => {
  it("given Cloud Nine attacker in rain, when using Water move, then no 1.5x rain boost applied", () => {
    // Without Cloud Nine, Water moves get 1.5x in rain.
    // With Cloud Nine, the rain boost is suppressed — damage should equal no-weather damage.
    //
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather modifier in damage calc
    const attacker = createSyntheticOnFieldPokemon({
      ability: abilityIds.cloudNine,
      attack: 100,
      types: [typeIds.water],
    });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      defense: 100,
      types: [typeIds.normal],
    });
    const waterMove = createSyntheticMoveFrom(moveIds.surf);

    const rainState = createBattleState({
      weather: { type: weatherIds.rain, turnsLeft: 5, source: "test" },
    });
    const noWeatherState = createBattleState();

    // Seed 12345 for deterministic RNG
    const rainResult = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: waterMove, state: rainState, seed: 12345 }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen5Damage(
      createDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: noWeatherState,
        seed: 12345,
      }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // With Cloud Nine: rain boost is suppressed, so damage equals no-weather damage
    expect(rainResult.damage).toBe(noWeatherResult.damage);
  });

  it("given Air Lock defender in sun, when using Fire move, then no 1.5x sun boost applied", () => {
    // Without Air Lock, Fire moves get 1.5x in sun.
    // With Air Lock, the sun boost is suppressed.
    //
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather modifier in damage calc
    const attacker = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      attack: 100,
      types: [typeIds.fire],
    });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.airLock,
      defense: 100,
      types: [typeIds.normal],
    });
    const fireMove = createSyntheticMoveFrom(moveIds.flamethrower);

    const sunState = createBattleState({
      weather: { type: weatherIds.sun, turnsLeft: 5, source: "test" },
    });
    const noWeatherState = createBattleState();

    const sunResult = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: fireMove, state: sunState, seed: 99999 }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen5Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: noWeatherState,
        seed: 99999,
      }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // With Air Lock: sun boost is suppressed, so damage equals no-weather damage
    expect(sunResult.damage).toBe(noWeatherResult.damage);
  });

  it("given no suppression in rain, when using Water move, then 1.5x rain boost IS applied", () => {
    // Confirm that without Cloud Nine / Air Lock, rain boost works normally.
    //
    // Source: Showdown sim/battle-actions.ts — weather modifier 1.5x for Water in rain
    const attacker = createSyntheticOnFieldPokemon({
      ability: abilityIds.torrent,
      attack: 100,
      types: [typeIds.water],
    });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      defense: 100,
      types: [typeIds.normal],
    });
    const waterMove = createSyntheticMoveFrom(moveIds.surf);

    const rainState = createBattleState({
      weather: { type: weatherIds.rain, turnsLeft: 5, source: "test" },
    });
    const noWeatherState = createBattleState();

    const rainResult = calculateGen5Damage(
      createDamageContext({ attacker, defender, move: waterMove, state: rainState, seed: 12345 }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen5Damage(
      createDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: noWeatherState,
        seed: 12345,
      }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // Without suppression: rain DOES boost Water damage (should be > no-weather)
    expect(rainResult.damage).toBeGreaterThan(noWeatherResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Weather chip damage suppression
// ---------------------------------------------------------------------------

describe("Gen5 Cloud Nine weather chip suppression", () => {
  it("given Cloud Nine user on field in sandstorm, when applying weather effects, then no chip damage dealt", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
    const cloudNine = createSyntheticOnFieldPokemon({
      ability: abilityIds.cloudNine,
      types: [typeIds.normal],
      hp: 200,
      currentHp: 200,
    });
    const normalMon = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.normal],
      hp: 200,
      currentHp: 200,
    });
    const state = createBattleState({
      weather: { type: weatherIds.sand, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(cloudNine, 0), createBattleSide(normalMon, 1)],
    });

    const results = applyGen5WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given Air Lock user on field in hail, when applying weather effects, then no chip damage dealt", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
    const normalMon = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.normal],
      hp: 200,
      currentHp: 200,
    });
    const airLock = createSyntheticOnFieldPokemon({
      ability: abilityIds.airLock,
      types: [typeIds.normal],
      hp: 200,
      currentHp: 200,
    });
    const state = createBattleState({
      weather: { type: weatherIds.hail, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(normalMon, 0), createBattleSide(airLock, 1)],
    });

    const results = applyGen5WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given no suppression in sandstorm, when applying weather effects, then chip damage is dealt to non-immune Pokemon", () => {
    // Source: Showdown data/conditions.ts — sandstorm deals 1/16 max HP chip damage
    const normalMon1 = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.normal],
      hp: 200,
      currentHp: 200,
    });
    const normalMon2 = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.normal],
      hp: 160,
      currentHp: 160,
    });
    const state = createBattleState({
      weather: { type: weatherIds.sand, turnsLeft: 5, source: "test" },
      sides: [createBattleSide(normalMon1, 0), createBattleSide(normalMon2, 1)],
    });

    const results = applyGen5WeatherEffects(state);
    // Both non-immune Normal-types take chip damage
    expect(results.length).toBe(2);
    // floor(200/16) = 12
    expect(results[0].damage).toBe(12);
    // floor(160/16) = 10
    expect(results[1].damage).toBe(10);
  });
});
