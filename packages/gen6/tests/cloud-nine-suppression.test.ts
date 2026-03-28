/**
 * Cloud Nine / Air Lock weather suppression tests for Gen 6.
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
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import { calculateGen6Damage } from "../src/Gen6DamageCalc.js";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart.js";
import {
  applyGen6WeatherEffects,
  isWeatherSuppressedGen6,
  isWeatherSuppressedOnFieldGen6,
} from "../src/Gen6Weather.js";

const abilityIds = GEN6_ABILITY_IDS;
const moveIds = GEN6_MOVE_IDS;
const natureIds = GEN6_NATURE_IDS;
const speciesIds = GEN6_SPECIES_IDS;
const typeIds = CORE_TYPE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const dataManager = createGen6DataManager();
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
const defaultSpeciesIdsByAbility = {
  [abilityIds.blaze]: speciesIds.charmander,
  [abilityIds.torrent]: speciesIds.squirtle,
  [abilityIds.cloudNine]: speciesIds.golduck,
  [abilityIds.airLock]: speciesIds.rayquaza,
} as const satisfies Record<string, number>;
function resolveWeatherSource(weatherType: string): string {
  if (weatherType === weatherIds.sand) return moveIds.sandstorm;
  if (weatherType === weatherIds.rain) return moveIds.rainDance;
  if (weatherType === weatherIds.sun) return moveIds.sunnyDay;
  if (weatherType === weatherIds.hail) return moveIds.hail;

  return moveIds.sandstorm;
}

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function resolveDefaultSpeciesId(abilityId?: string): number {
  if (abilityId && abilityId in defaultSpeciesIdsByAbility) {
    return defaultSpeciesIdsByAbility[abilityId];
  }

  return speciesIds.charmander;
}

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
  const resolvedAbilityId = overrides.ability ?? abilityIds.blaze;
  const species = dataManager.getSpecies(
    overrides.speciesId ?? resolveDefaultSpeciesId(resolvedAbilityId),
  );
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
      gender: species.genderRatio === -1 ? CORE_GENDERS.genderless : CORE_GENDERS.male,
      metLocation: "test",
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
      moves: [],
    },
  );

  pokemon.uid = `test-${species.id}-${pokemon.level}`;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = resolvedAbilityId;
  pokemon.status = (overrides.status ?? null) as typeof pokemon.status;
  pokemon.calculatedStats = {
    hp,
    attack: overrides.attack ?? DEFAULT_TEST_STATS.attack,
    defense: overrides.defense ?? DEFAULT_TEST_STATS.defense,
    spAttack: overrides.spAttack ?? DEFAULT_TEST_STATS.spAttack,
    spDefense: overrides.spDefense ?? DEFAULT_TEST_STATS.spDefense,
    speed: overrides.speed ?? DEFAULT_TEST_STATS.speed,
  };

  const onFieldPokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...species.types],
  );
  onFieldPokemon.statStages = createDefaultStatStages();
  return onFieldPokemon;
}

function createBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [BattleSide, BattleSide];
}): BattleState {
  return {
    weather: overrides?.weather
      ? { ...overrides.weather, source: resolveWeatherSource(overrides.weather.type) }
      : null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 6,
    turnNumber: 1,
    sides: overrides?.sides ?? ([{}, {}] as unknown as [BattleSide, BattleSide]),
  } as unknown as BattleState;
}

function createBattleSide(activePokemon: ActivePokemon, index: 0 | 1 = 0): BattleSide {
  return {
    index,
    active: [activePokemon],
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
    move: overrides.move ?? dataManager.getMove(moveIds.tackle),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? DEFAULT_CONTEXT_SEED),
    isCrit: overrides.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// isWeatherSuppressedGen6 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedGen6", () => {
  it("given attacker has Cloud Nine, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Cloud Nine
    const cloudNine = createSyntheticOnFieldPokemon({ ability: abilityIds.cloudNine });
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    expect(isWeatherSuppressedGen6(cloudNine, normal)).toBe(true);
  });

  it("given defender has Air Lock, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Air Lock
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const airLock = createSyntheticOnFieldPokemon({ ability: abilityIds.airLock });
    expect(isWeatherSuppressedGen6(normal, airLock)).toBe(true);
  });

  it("given neither has Cloud Nine or Air Lock, when checking suppression, then returns false", () => {
    const a = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const b = createSyntheticOnFieldPokemon({ ability: abilityIds.torrent });
    expect(isWeatherSuppressedGen6(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWeatherSuppressedOnFieldGen6 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedOnFieldGen6", () => {
  it("given Cloud Nine user on side 0, when checking field, then returns true", () => {
    const cloudNine = createSyntheticOnFieldPokemon({ ability: abilityIds.cloudNine });
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const state = createBattleState({
      weather: { type: weatherIds.sand, turnsLeft: 5 },
      sides: [createBattleSide(cloudNine, 0), createBattleSide(normal, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen6(state)).toBe(true);
  });

  it("given Air Lock user on side 1, when checking field, then returns true", () => {
    const normal = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const airLock = createSyntheticOnFieldPokemon({ ability: abilityIds.airLock });
    const state = createBattleState({
      weather: { type: weatherIds.rain, turnsLeft: 5 },
      sides: [createBattleSide(normal, 0), createBattleSide(airLock, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen6(state)).toBe(true);
  });

  it("given no suppression abilities on field, when checking, then returns false", () => {
    const a = createSyntheticOnFieldPokemon({ ability: abilityIds.blaze });
    const b = createSyntheticOnFieldPokemon({ ability: abilityIds.torrent });
    const state = createBattleState({
      weather: { type: weatherIds.sun, turnsLeft: 5 },
      sides: [createBattleSide(a, 0), createBattleSide(b, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen6(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Damage calc integration: weather power boost suppression
// ---------------------------------------------------------------------------

describe("Gen6 Cloud Nine damage calc integration", () => {
  it("given Cloud Nine attacker in rain, when using Water move, then no 1.5x rain boost applied", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather modifier in damage calc
    const attacker = createSyntheticOnFieldPokemon({
      ability: abilityIds.cloudNine,
      attack: DEFAULT_TEST_STATS.attack,
      types: [typeIds.water],
    });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      defense: DEFAULT_TEST_STATS.defense,
      types: [typeIds.normal],
    });
    const waterMove = dataManager.getMove(moveIds.surf);

    const rainState = createBattleState({
      weather: { type: weatherIds.rain, turnsLeft: 5 },
    });
    const noWeatherState = createBattleState();

    const rainResult = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: waterMove, state: rainState, seed: 12345 }),
      GEN6_TYPE_CHART,
    );
    const noWeatherResult = calculateGen6Damage(
      createDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: noWeatherState,
        seed: 12345,
      }),
      GEN6_TYPE_CHART,
    );

    // With Cloud Nine: rain boost is suppressed
    expect(rainResult.damage).toBe(noWeatherResult.damage);
  });

  it("given Air Lock defender in sun, when using Fire move, then no 1.5x sun boost applied", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather modifier in damage calc
    const attacker = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      attack: DEFAULT_TEST_STATS.attack,
      types: [typeIds.fire],
    });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.airLock,
      defense: DEFAULT_TEST_STATS.defense,
      types: [typeIds.normal],
    });
    const fireMove = dataManager.getMove(moveIds.flamethrower);

    const sunState = createBattleState({
      weather: { type: weatherIds.sun, turnsLeft: 5 },
    });
    const noWeatherState = createBattleState();

    const sunResult = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, state: sunState, seed: 99999 }),
      GEN6_TYPE_CHART,
    );
    const noWeatherResult = calculateGen6Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: noWeatherState,
        seed: 99999,
      }),
      GEN6_TYPE_CHART,
    );

    // With Air Lock: sun boost is suppressed
    expect(sunResult.damage).toBe(noWeatherResult.damage);
  });

  it("given no suppression in sun, when using Fire move, then 1.5x sun boost IS applied", () => {
    // Source: Showdown sim/battle-actions.ts — weather modifier 1.5x for Fire in sun
    const attacker = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      attack: DEFAULT_TEST_STATS.attack,
      types: [typeIds.fire],
    });
    const defender = createSyntheticOnFieldPokemon({
      ability: abilityIds.torrent,
      defense: DEFAULT_TEST_STATS.defense,
      types: [typeIds.normal],
    });
    const fireMove = dataManager.getMove(moveIds.flamethrower);

    const sunState = createBattleState({
      weather: { type: weatherIds.sun, turnsLeft: 5 },
    });
    const noWeatherState = createBattleState();

    const sunResult = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, state: sunState, seed: 12345 }),
      GEN6_TYPE_CHART,
    );
    const noWeatherResult = calculateGen6Damage(
      createDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: noWeatherState,
        seed: 12345,
      }),
      GEN6_TYPE_CHART,
    );

    // Without suppression: sun DOES boost Fire damage
    expect(sunResult.damage).toBeGreaterThan(noWeatherResult.damage);
  });
});

// ---------------------------------------------------------------------------
// Weather chip damage suppression
// ---------------------------------------------------------------------------

describe("Gen6 Cloud Nine weather chip suppression", () => {
  it("given Cloud Nine user on field in sandstorm, when applying weather effects, then no chip damage dealt", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
    const maxHp = DEFAULT_TEST_STATS.hp;
    const cloudNine = createSyntheticOnFieldPokemon({
      ability: abilityIds.cloudNine,
      types: [typeIds.normal],
      hp: maxHp,
      currentHp: maxHp,
    });
    const normalMon = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.normal],
      hp: maxHp,
      currentHp: maxHp,
    });
    const state = createBattleState({
      weather: { type: weatherIds.sand, turnsLeft: 5 },
      sides: [createBattleSide(cloudNine, 0), createBattleSide(normalMon, 1)],
    });

    const results = applyGen6WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given Air Lock user on field in hail, when applying weather effects, then no chip damage dealt", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
    const maxHp = DEFAULT_TEST_STATS.hp;
    const normalMon = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.normal],
      hp: maxHp,
      currentHp: maxHp,
    });
    const airLock = createSyntheticOnFieldPokemon({
      ability: abilityIds.airLock,
      types: [typeIds.normal],
      hp: maxHp,
      currentHp: maxHp,
    });
    const state = createBattleState({
      weather: { type: weatherIds.hail, turnsLeft: 5 },
      sides: [createBattleSide(normalMon, 0), createBattleSide(airLock, 1)],
    });

    const results = applyGen6WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given no suppression in hail, when applying weather effects, then chip damage is dealt to non-immune Pokemon", () => {
    // Source: Showdown data/conditions.ts — hail deals 1/16 max HP chip damage
    const firstMaxHp = DEFAULT_TEST_STATS.hp;
    const secondMaxHp = 240;
    const normalMon1 = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.normal],
      hp: firstMaxHp,
      currentHp: firstMaxHp,
    });
    const normalMon2 = createSyntheticOnFieldPokemon({
      ability: abilityIds.blaze,
      types: [typeIds.fire],
      hp: secondMaxHp,
      currentHp: secondMaxHp,
    });
    const state = createBattleState({
      weather: { type: weatherIds.hail, turnsLeft: 5 },
      sides: [createBattleSide(normalMon1, 0), createBattleSide(normalMon2, 1)],
    });

    const results = applyGen6WeatherEffects(state);
    expect(results.length).toBe(2);
    expect(results[0].damage).toBe(Math.floor(firstMaxHp / 16));
    expect(results[1].damage).toBe(Math.floor(secondMaxHp / 16));
  });
});
