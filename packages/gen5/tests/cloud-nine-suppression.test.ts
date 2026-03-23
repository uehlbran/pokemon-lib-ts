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
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";
import {
  applyGen5WeatherEffects,
  isWeatherSuppressedGen5,
  isWeatherSuppressedOnFieldGen5,
} from "../src/Gen5Weather";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

function makeActive(overrides: {
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
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 5,
    critRatio: 0,
  } as MoveData;
}

function makeState(overrides?: {
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

function makeSide(active: ActivePokemon, index: 0 | 1 = 0): BattleSide {
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

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// isWeatherSuppressedGen5 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedGen5", () => {
  it("given attacker has Cloud Nine, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Cloud Nine
    const cloudNine = makeActive({ ability: "cloud-nine" });
    const normal = makeActive({ ability: "blaze" });
    expect(isWeatherSuppressedGen5(cloudNine, normal)).toBe(true);
  });

  it("given defender has Air Lock, when checking suppression, then returns true", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() returns true for Air Lock
    const normal = makeActive({ ability: "blaze" });
    const airLock = makeActive({ ability: "air-lock" });
    expect(isWeatherSuppressedGen5(normal, airLock)).toBe(true);
  });

  it("given neither has Cloud Nine or Air Lock, when checking suppression, then returns false", () => {
    // Source: Showdown sim/battle.ts — no suppression without Cloud Nine/Air Lock
    const a = makeActive({ ability: "blaze" });
    const b = makeActive({ ability: "torrent" });
    expect(isWeatherSuppressedGen5(a, b)).toBe(false);
  });

  it("given undefined pokemon, when checking suppression, then handles gracefully", () => {
    const a = makeActive({ ability: "cloud-nine" });
    expect(isWeatherSuppressedGen5(a, undefined)).toBe(true);
    expect(isWeatherSuppressedGen5(undefined, undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWeatherSuppressedOnFieldGen5 unit tests
// ---------------------------------------------------------------------------

describe("isWeatherSuppressedOnFieldGen5", () => {
  it("given Cloud Nine user on side 0, when checking field, then returns true", () => {
    const cloudNine = makeActive({ ability: "cloud-nine" });
    const normal = makeActive({ ability: "blaze" });
    const state = makeState({
      weather: { type: "sand", turnsLeft: 5, source: "test" },
      sides: [makeSide(cloudNine, 0), makeSide(normal, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen5(state)).toBe(true);
  });

  it("given Air Lock user on side 1, when checking field, then returns true", () => {
    const normal = makeActive({ ability: "blaze" });
    const airLock = makeActive({ ability: "air-lock" });
    const state = makeState({
      weather: { type: "rain", turnsLeft: 5, source: "test" },
      sides: [makeSide(normal, 0), makeSide(airLock, 1)],
    });
    expect(isWeatherSuppressedOnFieldGen5(state)).toBe(true);
  });

  it("given no Cloud Nine or Air Lock on field, when checking, then returns false", () => {
    const a = makeActive({ ability: "blaze" });
    const b = makeActive({ ability: "torrent" });
    const state = makeState({
      weather: { type: "sun", turnsLeft: 5, source: "test" },
      sides: [makeSide(a, 0), makeSide(b, 1)],
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
    const attacker = makeActive({ ability: "cloud-nine", attack: 100, types: ["water"] });
    const defender = makeActive({ ability: "blaze", defense: 100, types: ["normal"] });
    const waterMove = makeMove({ id: "surf", type: "water", category: "special", power: 90 });

    const rainState = makeState({
      weather: { type: "rain", turnsLeft: 5, source: "test" },
    });
    const noWeatherState = makeState();

    // Seed 12345 for deterministic RNG
    const rainResult = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: waterMove, state: rainState, seed: 12345 }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen5Damage(
      makeDamageContext({
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
    const attacker = makeActive({ ability: "blaze", attack: 100, types: ["fire"] });
    const defender = makeActive({ ability: "air-lock", defense: 100, types: ["normal"] });
    const fireMove = makeMove({ id: "flamethrower", type: "fire", category: "special", power: 90 });

    const sunState = makeState({
      weather: { type: "sun", turnsLeft: 5, source: "test" },
    });
    const noWeatherState = makeState();

    const sunResult = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove, state: sunState, seed: 99999 }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: fireMove, state: noWeatherState, seed: 99999 }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );

    // With Air Lock: sun boost is suppressed, so damage equals no-weather damage
    expect(sunResult.damage).toBe(noWeatherResult.damage);
  });

  it("given no suppression in rain, when using Water move, then 1.5x rain boost IS applied", () => {
    // Confirm that without Cloud Nine / Air Lock, rain boost works normally.
    //
    // Source: Showdown sim/battle-actions.ts — weather modifier 1.5x for Water in rain
    const attacker = makeActive({ ability: "torrent", attack: 100, types: ["water"] });
    const defender = makeActive({ ability: "blaze", defense: 100, types: ["normal"] });
    const waterMove = makeMove({ id: "surf", type: "water", category: "special", power: 90 });

    const rainState = makeState({
      weather: { type: "rain", turnsLeft: 5, source: "test" },
    });
    const noWeatherState = makeState();

    const rainResult = calculateGen5Damage(
      makeDamageContext({ attacker, defender, move: waterMove, state: rainState, seed: 12345 }),
      GEN5_TYPE_CHART as Record<string, Record<string, number>>,
    );
    const noWeatherResult = calculateGen5Damage(
      makeDamageContext({
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
    const cloudNine = makeActive({
      ability: "cloud-nine",
      types: ["normal"],
      hp: 200,
      currentHp: 200,
    });
    const normalMon = makeActive({ ability: "blaze", types: ["normal"], hp: 200, currentHp: 200 });
    const state = makeState({
      weather: { type: "sand", turnsLeft: 5, source: "test" },
      sides: [makeSide(cloudNine, 0), makeSide(normalMon, 1)],
    });

    const results = applyGen5WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given Air Lock user on field in hail, when applying weather effects, then no chip damage dealt", () => {
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather residual damage
    const normalMon = makeActive({ ability: "blaze", types: ["normal"], hp: 200, currentHp: 200 });
    const airLock = makeActive({ ability: "air-lock", types: ["normal"], hp: 200, currentHp: 200 });
    const state = makeState({
      weather: { type: "hail", turnsLeft: 5, source: "test" },
      sides: [makeSide(normalMon, 0), makeSide(airLock, 1)],
    });

    const results = applyGen5WeatherEffects(state);
    expect(results.length).toBe(0);
  });

  it("given no suppression in sandstorm, when applying weather effects, then chip damage is dealt to non-immune Pokemon", () => {
    // Source: Showdown data/conditions.ts — sandstorm deals 1/16 max HP chip damage
    const normalMon1 = makeActive({ ability: "blaze", types: ["normal"], hp: 200, currentHp: 200 });
    const normalMon2 = makeActive({ ability: "blaze", types: ["normal"], hp: 160, currentHp: 160 });
    const state = makeState({
      weather: { type: "sand", turnsLeft: 5, source: "test" },
      sides: [makeSide(normalMon1, 0), makeSide(normalMon2, 1)],
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
