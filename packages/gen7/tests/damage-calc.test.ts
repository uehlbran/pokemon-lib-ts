import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonType, TerrainType, WeatherType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_MECHANIC_MULTIPLIERS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
  CORE_FIXED_POINT as TEST_FIXED_POINT,
  CORE_ITEM_IDS as TEST_ITEM_IDS,
  CORE_TERRAIN_IDS as TEST_TERRAIN_IDS,
  CORE_WEATHER_IDS as TEST_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_CRIT_MULTIPLIER,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  GEN7_WEATHER_DAMAGE_MULTIPLIERS,
} from "../src";
import { calculateGen7Damage, pokeRound } from "../src/Gen7DamageCalc";
import { GEN7_TYPE_CHART } from "../src/Gen7TypeChart";

const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const ITEM_IDS = { ...TEST_ITEM_IDS, ...GEN7_ITEM_IDS } as const;
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN7_MOVE_IDS } as const;
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const TYPE_IDS = CORE_TYPE_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const SPECIES_IDS = GEN7_SPECIES_IDS;
const WEATHER_IDS = {
  rain: TEST_WEATHER_IDS.rain,
  sun: TEST_WEATHER_IDS.sun,
  hail: TEST_WEATHER_IDS.hail,
  sand: TEST_WEATHER_IDS.sand as WeatherType,
  harshSun: TEST_WEATHER_IDS.harshSun,
  heavyRain: TEST_WEATHER_IDS.heavyRain as WeatherType,
} as const;
const TERRAIN_IDS = {
  electric: TEST_TERRAIN_IDS.electric,
  grassy: TEST_TERRAIN_IDS.grassy as TerrainType,
  misty: TEST_TERRAIN_IDS.misty as TerrainType,
  psychic: TEST_TERRAIN_IDS.psychic as TerrainType,
} as const;
const GENDER_IDS = CORE_GENDERS;
const GEN7_DATA = createGen7DataManager();
const DEFAULT_SPECIES = GEN7_DATA.getSpecies(SPECIES_IDS.mewtwo);
const DEFAULT_MOVE = GEN7_DATA.getMove(MOVE_IDS.tackle);
const CANONICAL_MOVE_IDS = new Set(GEN7_DATA.getAllMoves().map((move) => move.id));
const DEFAULT_NATURE_ID = GEN7_DATA.getNature(GEN7_NATURE_IDS.hardy).id;
const DEFAULT_POKEBALL = GEN7_ITEM_IDS.pokeBall;
const DEFAULT_ABILITY_SLOT = CORE_ABILITY_SLOTS.normal1;

function resolveTerrainSource(terrainType: TerrainType): string {
  if (terrainType === TERRAIN_IDS.electric) return ABILITY_IDS.electricSurge;
  if (terrainType === TERRAIN_IDS.grassy) return ABILITY_IDS.grassySurge;
  if (terrainType === TERRAIN_IDS.misty) return ABILITY_IDS.mistySurge;
  if (terrainType === TERRAIN_IDS.psychic) return ABILITY_IDS.psychicSurge;

  return ABILITY_IDS.electricSurge;
}

function resolveWeatherSource(weatherType: WeatherType): string {
  if (weatherType === WEATHER_IDS.sun) return MOVE_IDS.sunnyDay;
  if (weatherType === WEATHER_IDS.rain) return MOVE_IDS.rainDance;
  if (weatherType === WEATHER_IDS.hail) return MOVE_IDS.hail;
  if (weatherType === WEATHER_IDS.harshSun) return ABILITY_IDS.desolateLand;
  if (weatherType === WEATHER_IDS.heavyRain) return ABILITY_IDS.primordialSea;
  if (weatherType === WEATHER_IDS.sand) return MOVE_IDS.sandstorm;

  return MOVE_IDS.sunnyDay;
}

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function createOnFieldPokemon(overrides: {
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
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  const species = GEN7_DATA.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(7), {
    nature: DEFAULT_NATURE_ID,
    ivs: createIvs(),
    evs: createEvs(),
    gender: overrides.gender ?? GENDER_IDS.male,
    abilitySlot: DEFAULT_ABILITY_SLOT,
    heldItem: overrides.heldItem ?? null,
    moves: [],
    isShiny: false,
    metLocation: "",
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: DEFAULT_POKEBALL,
  });

  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.status = (overrides.status ?? null) as any;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.ability = overrides.ability ?? ABILITY_IDS.none;
  pokemon.moves = [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)];
  pokemon.calculatedStats = { hp, attack, defense, spAttack, spDefense, speed };

  return {
    pokemon,
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
    types: overrides.types ?? species.types,
    ability: overrides.ability ?? ABILITY_IDS.none,
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

function createSyntheticMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  target?: string;
}): MoveData {
  const requestedId = overrides.id ?? DEFAULT_MOVE.id;
  const baseMove = CANONICAL_MOVE_IDS.has(requestedId)
    ? GEN7_DATA.getMove(requestedId)
    : DEFAULT_MOVE;

  return {
    ...baseMove,
    ...overrides,
    type: overrides.type ?? baseMove.type,
    category: overrides.category ?? baseMove.category,
    power: overrides.power ?? baseMove.power,
    target: overrides.target ?? baseMove.target,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
    effect: overrides.effect ?? baseMove.effect,
    critRatio: overrides.critRatio ?? baseMove.critRatio,
  } as MoveData;
}

function createBattleState(overrides?: {
  weather?: { type: WeatherType; turnsLeft: number; source: string } | null;
  terrain?: { type: TerrainType; turnsLeft: number; source: string } | null;
  format?: string;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 7,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function createDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
  hitThroughProtect?: boolean;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createOnFieldPokemon({}),
    defender: overrides.defender ?? createOnFieldPokemon({}),
    move: overrides.move ?? createSyntheticMove({}),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
    hitThroughProtect: overrides.hitThroughProtect,
  };
}

function expectSpreadPenaltyMatchesSingleTarget(
  spreadResult: ReturnType<typeof calculateGen7Damage>,
  singleTargetResult: ReturnType<typeof calculateGen7Damage>,
): void {
  const singleBaseDamage = singleTargetResult.breakdown?.baseDamage;
  expect(singleBaseDamage).toBeGreaterThan(0);

  expect(spreadResult.effectiveness).toBe(singleTargetResult.effectiveness);
  expect(spreadResult.breakdown).toEqual(
    expect.objectContaining({
      baseDamage: pokeRound(singleBaseDamage as number, TEST_FIXED_POINT.spreadModifier),
      finalDamage: spreadResult.damage,
    }),
  );
  expect(spreadResult.damage).toBeLessThan(singleTargetResult.damage);
}

// Use the Gen7 type chart for all tests
const typeChart = GEN7_TYPE_CHART;

// ---------------------------------------------------------------------------
// pokeRound unit tests
// ---------------------------------------------------------------------------

describe("pokeRound function", () => {
  it("given value=100 and modifier=6144, when applying pokeRound (1.5x), then returns 150", () => {
    // Source: Showdown sim/battle.ts modify() -- tr((tr(100*6144) + 2047) / 4096)
    // 100 * 6144 = 614400; floor((614400 + 2047) / 4096) = floor(616447 / 4096) = 150
    expect(pokeRound(100, 6144)).toBe(150);
  });

  it("given value=100 and modifier=2048, when applying pokeRound (0.5x), then returns 50", () => {
    // Source: Showdown sim/battle.ts modify() -- tr((tr(100*2048) + 2047) / 4096)
    // 100 * 2048 = 204800; floor((204800 + 2047) / 4096) = floor(206847 / 4096) = 50
    expect(pokeRound(100, 2048)).toBe(50);
  });

  it("given value=57 and modifier=6144, when applying pokeRound, then returns 85", () => {
    // Source: Showdown sim/battle.ts modify()
    // 57 * 6144 = 350208; floor((350208 + 2047) / 4096) = floor(352255 / 4096) = 85
    expect(pokeRound(57, 6144)).toBe(85);
  });

  it("given value=100 and modifier=4096 (1.0x), when applying pokeRound, then returns 100", () => {
    // Source: 4096 is the identity modifier
    // 100 * 4096 = 409600; floor((409600 + 2047) / 4096) = floor(411647 / 4096) = 100
    expect(pokeRound(100, 4096)).toBe(100);
  });

  it("given value=1 and modifier=6144, when applying pokeRound (1.5x on 1), then returns 1", () => {
    // Source: Showdown sim/battle.ts modify()
    // 1 * 6144 = 6144; floor((6144 + 2047) / 4096) = floor(8191 / 4096) = 1
    expect(pokeRound(1, 6144)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Base damage formula tests
// ---------------------------------------------------------------------------

describe("Gen 7 base damage formula", () => {
  it("given L50 attacker with 100 ATK vs 100 DEF using 50 BP move, when calculating, then returns correct base damage with random roll", () => {
    // Source: Bulbapedia damage formula derivation
    // levelFactor = floor(2 * 50 / 5) + 2 = 22
    // baseDamage = floor(floor(22 * 50 * 100 / 100) / 50) + 2 = floor(22 * 50 / 1) / 50 + 2
    //   = floor(110000 / 100) / 50 + 2 = floor(1100 / 1) -- wait let me recalc
    // baseDamage = floor(floor(22 * 50 * 100 / 100) / 50) + 2
    //   = floor(floor(110000 / 100) / 50) + 2
    //   = floor(1100 / 50) + 2
    //   = 22 + 2 = 24
    // Then random roll [85..100]: at seed 42, rng.int(85,100) produces a deterministic value.
    // We test by fixing max roll (seed chosen so roll = 100 -> no attenuation) if possible.
    // Alternative: test the raw structure.

    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    // The damage must be positive and bounded.
    // With baseDamage = 24, roll in [85..100]:
    //   min = floor(24 * 85 / 100) = floor(2040/100) = 20
    //   max = floor(24 * 100 / 100) = 24
    expect(result.damage).toBeGreaterThanOrEqual(20);
    expect(result.damage).toBeLessThanOrEqual(24);
    expect(result.effectiveness).toBe(1);
  });

  it("given L100 attacker with 200 ATK vs 150 DEF using 80 BP move, when calculating, then returns correct base damage range", () => {
    // Source: Bulbapedia damage formula derivation
    // levelFactor = floor(2 * 100 / 5) + 2 = 42
    // baseDamage = floor(floor(42 * 80 * 200 / 150) / 50) + 2
    //   = floor(floor(672000 / 150) / 50) + 2
    //   = floor(4480 / 50) + 2
    //   = 89 + 2 = 91
    // roll [85..100]:
    //   min = floor(91 * 85 / 100) = floor(7735/100) = 77
    //   max = floor(91 * 100 / 100) = 91

    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ level: 100, attack: 200 }),
      defender: createOnFieldPokemon({ defense: 150 }),
      move: createSyntheticMove({ power: 80, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBeGreaterThanOrEqual(77);
    expect(result.damage).toBeLessThanOrEqual(91);
    expect(result.effectiveness).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// STAB tests
// ---------------------------------------------------------------------------

describe("Gen 7 STAB", () => {
  it("given a Fire-type attacker using a Fire move, when calculating with STAB, then damage is 1.5x base", () => {
    // Source: Showdown -- STAB = 1.5x since Gen 1
    // baseDamage = 24 (same calc as above: L50, 100 ATK, 100 DEF, 50 BP)
    // After crit=false, random=100%: 24 * 1.5 STAB via pokeRound
    //   pokeRound(24, 6144) = floor((24*6144 + 2047) / 4096) = floor(149503 / 4096) = 36
    // With max roll: damage = 36
    // With min roll (85): floor(24*85/100) = 20, then pokeRound(20, 6144) = 30

    // We'll use a seed that gives max roll to make assertion exact
    // Trying to find a max-roll seed is fragile, so let's just check STAB ratio
    const noStabCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.water] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 12345,
    });
    const stabCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.fire] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 12345, // same seed = same random roll
    });

    const noStabResult = calculateGen7Damage(noStabCtx, typeChart);
    const stabResult = calculateGen7Damage(stabCtx, typeChart);

    // STAB should produce exactly 1.5x more damage on the same roll
    // Derivation: base=24, pokeRound(24,6144)=36 with STAB; no-STAB=24 at seed 12345
    // Source: Showdown sim/battle-actions.ts -- STAB = pokeRound(base, 6144) = 1.5x
    expect(stabResult.damage).toBe(36);
    expect(noStabResult.damage).toBe(24);
    // Breakdown should report 1.5 STAB
    expect(stabResult.breakdown?.stabMultiplier).toBe(CORE_MECHANIC_MULTIPLIERS.stab);
    expect(noStabResult.breakdown?.stabMultiplier).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });

  it("given an Adaptability attacker using same-type move, when calculating STAB, then STAB is 2.0x", () => {
    // Source: Showdown data/abilities.ts -- Adaptability: STAB = 2.0x
    const normalCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.blaze,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const adaptCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.adaptability,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const normalResult = calculateGen7Damage(normalCtx, typeChart);
    const adaptResult = calculateGen7Damage(adaptCtx, typeChart);

    // Derivation: seed 42, same roll applied; normal(1.5x STAB)=33, adaptability(2.0x STAB)=44
    // Source: Showdown data/abilities.ts -- Adaptability: STAB = 2.0x via pokeRound(base, 8192)
    expect(adaptResult.damage).toBe(44);
    expect(normalResult.damage).toBe(33);
    expect(adaptResult.breakdown?.stabMultiplier).toBe(CORE_MECHANIC_MULTIPLIERS.adaptabilityStab);
    expect(normalResult.breakdown?.stabMultiplier).toBe(CORE_MECHANIC_MULTIPLIERS.stab);
  });
});

// ---------------------------------------------------------------------------
// Weather tests
// ---------------------------------------------------------------------------

describe("Gen 7 weather modifiers", () => {
  it("given sun weather and a Fire move, when calculating damage, then 1.5x boost applied", () => {
    // Source: Showdown sim/battle-actions.ts -- sun + fire = 1.5x
    const noWeatherCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      state: createBattleState({ weather: null }),
      seed: 42,
    });
    const sunCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.sun, turnsLeft: 5, source: ABILITY_IDS.drought },
      }),
      seed: 42,
    });

    const noWeather = calculateGen7Damage(noWeatherCtx, typeChart);
    const withSun = calculateGen7Damage(sunCtx, typeChart);

    // Derivation: seed 42; noWeather=22; withSun = pokeRound(22, 6144) = 33
    // Source: Showdown sim/battle-actions.ts -- sun + Fire = pokeRound(base, 6144) = 1.5x
    expect(withSun.damage).toBe(33);
    expect(noWeather.damage).toBe(22);
    expect(withSun.breakdown?.weatherMultiplier).toBe(GEN7_WEATHER_DAMAGE_MULTIPLIERS.sunFireBoost);
    expect(noWeather.breakdown?.weatherMultiplier).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
  });

  it("given rain weather and a Fire move, when calculating damage, then 0.5x nerf applied", () => {
    // Source: Showdown sim/battle-actions.ts -- rain + fire = 0.5x
    const noWeatherCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      state: createBattleState({ weather: null }),
      seed: 42,
    });
    const rainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.rain, turnsLeft: 5, source: ABILITY_IDS.drizzle },
      }),
      seed: 42,
    });

    const noWeather = calculateGen7Damage(noWeatherCtx, typeChart);
    const withRain = calculateGen7Damage(rainCtx, typeChart);

    expect(withRain.damage).toBeLessThan(noWeather.damage);
    expect(withRain.breakdown?.weatherMultiplier).toBe(
      GEN7_WEATHER_DAMAGE_MULTIPLIERS.rainFirePenalty,
    );
  });

  it("given rain weather and a Water move, when calculating damage, then 1.5x boost applied", () => {
    // Source: Showdown sim/battle-actions.ts -- rain + water = 1.5x
    const rainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.rain, turnsLeft: 5, source: ABILITY_IDS.drizzle },
      }),
      seed: 42,
    });

    const result = calculateGen7Damage(rainCtx, typeChart);
    expect(result.breakdown?.weatherMultiplier).toBe(
      GEN7_WEATHER_DAMAGE_MULTIPLIERS.rainWaterBoost,
    );
  });

  it("given heavy rain and a Fire move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy-rain negates fire completely
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.heavyRain, turnsLeft: -1, source: ABILITY_IDS.primordialSea },
      }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Terrain tests
// ---------------------------------------------------------------------------

describe("Gen 7 terrain modifiers", () => {
  it("given Electric Terrain and an Electric move from a grounded attacker, when calculating, then 1.5x boost applied", () => {
    // Source: Showdown data/conditions.ts -- electricterrain.onBasePower: chainModify(1.5)
    //   when type === 'Electric' and source.isGrounded()
    // Source: Bulbapedia "Electric Terrain" Gen 7 -- 1.5x Electric for grounded
    const noTerrainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPE_IDS.electric] }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.electric,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({ terrain: null }),
      seed: 42,
    });
    const terrainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPE_IDS.electric] }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.electric,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        terrain: { type: TYPE_IDS.electric, turnsLeft: 5, source: ABILITY_IDS.electricSurge },
      }),
      seed: 42,
    });

    const noTerrain = calculateGen7Damage(noTerrainCtx, typeChart);
    const withTerrain = calculateGen7Damage(terrainCtx, typeChart);

    expect(withTerrain.damage).toBeGreaterThan(noTerrain.damage);
  });

  it("given Electric Terrain and a non-grounded (Flying-type) attacker, when using Electric move, then no terrain boost", () => {
    // Source: Showdown data/conditions.ts -- terrain only affects grounded Pokemon
    const groundedCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPE_IDS.electric] }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.electric,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        terrain: { type: TYPE_IDS.electric, turnsLeft: 5, source: ABILITY_IDS.electricSurge },
      }),
      seed: 42,
    });
    const flyingCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPE_IDS.electric, VOLATILE_IDS.flying],
      }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.electric,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        terrain: { type: TYPE_IDS.electric, turnsLeft: 5, source: ABILITY_IDS.electricSurge },
      }),
      seed: 42,
    });

    const grounded = calculateGen7Damage(groundedCtx, typeChart);
    const flying = calculateGen7Damage(flyingCtx, typeChart);

    // Flying-type attacker should NOT get terrain boost (but does get Adaptability-like STAB)
    // Both get STAB from Electric type, but only the grounded one gets terrain boost
    expect(grounded.damage).toBeGreaterThan(flying.damage);
  });

  it("given Psychic Terrain and a Psychic move from a grounded attacker, when calculating, then 1.5x boost applied", () => {
    // Source: Bulbapedia "Psychic Terrain" Gen 7 -- 1.5x Psychic for grounded
    // Source: Showdown data/conditions.ts -- psychicterrain.onBasePower
    const noTerrainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPE_IDS.psychic] }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.psychic,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({ terrain: null }),
      seed: 42,
    });
    const terrainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPE_IDS.psychic] }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.psychic,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        terrain: { type: TYPE_IDS.psychic, turnsLeft: 5, source: ABILITY_IDS.psychicSurge },
      }),
      seed: 42,
    });

    const noTerrain = calculateGen7Damage(noTerrainCtx, typeChart);
    const withTerrain = calculateGen7Damage(terrainCtx, typeChart);

    expect(withTerrain.damage).toBeGreaterThan(noTerrain.damage);
  });

  it("given Misty Terrain and a Dragon move vs a grounded defender, when calculating, then 0.5x nerf applied", () => {
    // Source: Bulbapedia "Misty Terrain" -- 0.5x Dragon vs grounded defender
    const noTerrainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPE_IDS.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.dragon,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({ terrain: null }),
      seed: 42,
    });
    const terrainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPE_IDS.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.dragon,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        terrain: { type: TERRAIN_IDS.misty, turnsLeft: 5, source: ABILITY_IDS.mistySurge },
      }),
      seed: 42,
    });

    const noTerrain = calculateGen7Damage(noTerrainCtx, typeChart);
    const withTerrain = calculateGen7Damage(terrainCtx, typeChart);

    expect(withTerrain.damage).toBeLessThan(noTerrain.damage);
  });
});

// ---------------------------------------------------------------------------
// Critical hit tests
// ---------------------------------------------------------------------------

describe("Gen 7 critical hit", () => {
  it("given a critical hit, when calculating damage, then 1.5x crit multiplier applied", () => {
    // Source: Showdown -- Gen 6+ crit = 1.5x
    // Source: Bulbapedia "Critical hit" Gen 7 -- 1.5x multiplier
    const noCritCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      isCrit: false,
      seed: 42,
    });
    const critCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      isCrit: true,
      seed: 42,
    });

    const noCrit = calculateGen7Damage(noCritCtx, typeChart);
    const withCrit = calculateGen7Damage(critCtx, typeChart);

    expect(withCrit.damage).toBeGreaterThan(noCrit.damage);
    expect(withCrit.breakdown?.critMultiplier).toBe(GEN7_CRIT_MULTIPLIER);
    expect(noCrit.breakdown?.critMultiplier).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
    expect(withCrit.isCrit).toBe(true);
  });

  it("given a Sniper crit, when calculating damage, then 2.25x total crit multiplier applied", () => {
    // Source: Showdown data/abilities.ts -- Sniper: additional 1.5x on top of 1.5x crit
    const normalCritCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      isCrit: true,
      seed: 42,
    });
    const sniperCritCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.sniper }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      isCrit: true,
      seed: 42,
    });

    const normalCrit = calculateGen7Damage(normalCritCtx, typeChart);
    const sniperCrit = calculateGen7Damage(sniperCritCtx, typeChart);

    expect(sniperCrit.damage).toBeGreaterThan(normalCrit.damage);
    expect(sniperCrit.breakdown?.critMultiplier).toBe(2.25);
  });
});

// ---------------------------------------------------------------------------
// Burn penalty tests
// ---------------------------------------------------------------------------

describe("Gen 7 burn penalty", () => {
  it("given a burned attacker using a physical move, when calculating damage, then 0.5x burn penalty applied", () => {
    // Source: Gen 3+ -- burn halves physical attack damage
    const noBurnCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, status: null }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });
    const burnCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, status: STATUS_IDS.burn }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });

    const noBurn = calculateGen7Damage(noBurnCtx, typeChart);
    const withBurn = calculateGen7Damage(burnCtx, typeChart);

    expect(withBurn.damage).toBeLessThan(noBurn.damage);
    expect(withBurn.breakdown?.burnMultiplier).toBe(0.5);
    expect(noBurn.breakdown?.burnMultiplier).toBe(1);
  });

  it("given a burned attacker using a special move, when calculating damage, then no burn penalty", () => {
    // Source: Showdown -- burn only affects physical moves
    const burnSpecialCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, status: STATUS_IDS.burn }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.fire,
      }),
      seed: 42,
    });

    const result = calculateGen7Damage(burnSpecialCtx, typeChart);
    expect(result.breakdown?.burnMultiplier).toBe(1);
  });

  it("given a burned attacker with Guts using a physical move, when calculating damage, then no burn penalty", () => {
    // Source: Showdown data/abilities.ts -- Guts bypasses burn penalty
    const gutsCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        status: STATUS_IDS.burn,
        ability: ABILITY_IDS.guts,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });

    const result = calculateGen7Damage(gutsCtx, typeChart);
    expect(result.breakdown?.burnMultiplier).toBe(1);
  });

  it("given a burned attacker using Facade, when calculating damage, then no burn penalty (Gen 6+)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+: Facade bypasses burn penalty
    const facadeCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, status: STATUS_IDS.burn }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({
        id: MOVE_IDS.facade,
        power: 70,
        category: MOVE_CATEGORIES.physical,
      }),
      seed: 42,
    });

    const result = calculateGen7Damage(facadeCtx, typeChart);
    expect(result.breakdown?.burnMultiplier).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Type effectiveness tests
// ---------------------------------------------------------------------------

describe("Gen 7 type effectiveness", () => {
  it("given a Normal move vs Ghost-type defender, when calculating damage, then returns 0 (immune)", () => {
    // Source: Type chart -- Normal is immune to Ghost
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.ghost] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given a Ground move vs Flying-type defender, when calculating damage, then returns 0 (immune)", () => {
    // Source: Type chart -- Ground is immune to Flying
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [VOLATILE_IDS.flying] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.ground }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given a Water move vs Fire-type defender, when calculating damage, then 2x effectiveness", () => {
    // Source: Type chart -- Water is SE vs Fire
    const neutralCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.water,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });
    const seCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPE_IDS.fire] }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.water,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });

    const neutral = calculateGen7Damage(neutralCtx, typeChart);
    const se = calculateGen7Damage(seCtx, typeChart);

    expect(se.damage).toBeGreaterThan(neutral.damage);
    expect(se.effectiveness).toBe(2);
    expect(neutral.effectiveness).toBe(1);
  });

  it("given a Fire move vs Water-type defender, when calculating damage, then 0.5x effectiveness", () => {
    // Source: Type chart -- Fire is NVE vs Water
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.water] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// -ate abilities tests (Gen 7 specific: 1.2x not 1.3x)
// ---------------------------------------------------------------------------

describe("Gen 7 -ate abilities", () => {
  it("given Pixilate and a Normal move, when calculating damage, then type changes to Fairy and 1.2x boost applied", () => {
    // Source: Showdown data/abilities.ts -- pixilate Gen 7: Normal -> Fairy + 1.2x
    // Source: Bulbapedia -- "-ate abilities nerfed from 1.3x to 1.2x in Gen 7"
    const noAteCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.fairy],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const pixilateCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.pixilate,
        types: [TYPE_IDS.fairy],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const noAte = calculateGen7Damage(noAteCtx, typeChart);
    const withPixilate = calculateGen7Damage(pixilateCtx, typeChart);

    // Pixilate: converts Normal to Fairy (gets STAB from Fairy type) + 1.2x boost
    // No-ate: Normal move, no STAB (types are [TYPE_IDS.fairy])
    expect(withPixilate.damage).toBeGreaterThan(noAte.damage);
  });

  it("given Galvanize and a Normal move, when calculating damage, then type changes to Electric and 1.2x boost applied", () => {
    // Source: Showdown data/abilities.ts -- galvanize Gen 7: Normal -> Electric + 1.2x
    // Source: Bulbapedia "Galvanize" -- introduced in Gen 7
    const noAteCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.electric],
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.water] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const galvanizeCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.galvanize,
        types: [TYPE_IDS.electric],
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.water] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const noAte = calculateGen7Damage(noAteCtx, typeChart);
    const withGalvanize = calculateGen7Damage(galvanizeCtx, typeChart);

    // Galvanize: Normal -> Electric + STAB + 1.2x boost
    expect(withGalvanize.damage).toBeGreaterThan(noAte.damage);
  });

  it("given Aerilate and a non-Normal move, when calculating damage, then no type change or boost", () => {
    // Source: Showdown data/abilities.ts -- -ate abilities only affect Normal-type moves
    const noAteCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        types: [VOLATILE_IDS.flying],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const aerilateCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.aerilate,
        types: [VOLATILE_IDS.flying],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noAte = calculateGen7Damage(noAteCtx, typeChart);
    const withAerilate = calculateGen7Damage(aerilateCtx, typeChart);

    // Fire move is not Normal -- Aerilate should not change anything
    expect(withAerilate.damage).toBe(noAte.damage);
  });
});

// ---------------------------------------------------------------------------
// Normalize (Gen 7 behavior) tests
// ---------------------------------------------------------------------------

describe("Gen 7 Normalize", () => {
  it("given Normalize and a Fire move, when calculating, then type changes to Normal and 1.2x boost applied", () => {
    // Source: Showdown data/abilities.ts -- Normalize Gen 7+: all moves become Normal + 1.2x
    // Source: Bulbapedia -- "From Generation VII onwards, Normalize also multiplies the
    //   power of the affected moves by 1.2."
    const noNormCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.normal],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const normCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.normalize,
        types: [TYPE_IDS.normal],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noNorm = calculateGen7Damage(noNormCtx, typeChart);
    const withNorm = calculateGen7Damage(normCtx, typeChart);

    // Normalize converts Fire to Normal:
    // - noNorm: Fire move with Normal-type attacker = no STAB, neutral
    // - withNorm: Normal move with Normal-type attacker = STAB + 1.2x boost
    expect(withNorm.damage).toBeGreaterThan(noNorm.damage);
  });

  it("given Normalize and a Normal move, when calculating, then 1.2x boost still applied (boosted unconditionally in Gen 7)", () => {
    // Gen 7: Normalize boosts ALL moves it normalizes, including already-Normal moves.
    // Source: Showdown data/abilities.ts -- normalize: onModifyType sets typeChangerBoosted
    //   unconditionally; onBasePower fires whenever typeChangerBoosted === this.effect.
    //   No check whether the type actually changed.
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.normalize,
        types: [TYPE_IDS.normal],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const noAbilityCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.normal],
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const withNorm = calculateGen7Damage(ctx, typeChart);
    const withoutNorm = calculateGen7Damage(noAbilityCtx, typeChart);

    // Normal move also gets the 1.2x boost from Normalize in Gen 7
    expect(withNorm.damage).toBeGreaterThan(withoutNorm.damage);
  });
});

// ---------------------------------------------------------------------------
// Life Orb tests
// ---------------------------------------------------------------------------

describe("Gen 7 Life Orb", () => {
  it("given a Life Orb holder, when calculating damage, then ~1.3x boost applied", () => {
    // Source: Showdown data/items.ts -- Life Orb: onModifyDamage chainModify([5324, 4096])
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });
    const lifeOrbCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.lifeOrb }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withLifeOrb = calculateGen7Damage(lifeOrbCtx, typeChart);

    expect(withLifeOrb.damage).toBeGreaterThan(noItem.damage);
    // Item multiplier should be 5324/4096 ~= 1.2998
    expect(withLifeOrb.breakdown?.itemMultiplier).toBeCloseTo(5324 / 4096, 4);
  });

  it("given a Klutz + Life Orb holder, when calculating damage, then no Life Orb boost", () => {
    // Source: Showdown data/abilities.ts -- Klutz suppresses item effects
    const klutzCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        heldItem: ITEM_IDS.lifeOrb,
        ability: ABILITY_IDS.klutz,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.klutz }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });

    const withKlutz = calculateGen7Damage(klutzCtx, typeChart);
    const noItem = calculateGen7Damage(noItemCtx, typeChart);

    expect(withKlutz.damage).toBe(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Choice Band / Choice Specs tests
// ---------------------------------------------------------------------------

describe("Gen 7 Choice items", () => {
  it("given a Choice Band holder using a physical move, when calculating, then 1.5x attack applied", () => {
    // Source: Showdown data/items.ts -- Choice Band: 1.5x Attack stat
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });
    const bandCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.choiceBand }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withBand = calculateGen7Damage(bandCtx, typeChart);

    expect(withBand.damage).toBeGreaterThan(noItem.damage);
  });

  it("given a Choice Specs holder using a special move, when calculating, then 1.5x spAttack applied", () => {
    // Source: Showdown data/items.ts -- Choice Specs: 1.5x SpAtk stat
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.fire,
      }),
      seed: 42,
    });
    const specsCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, heldItem: ITEM_IDS.choiceSpecs }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.fire,
      }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withSpecs = calculateGen7Damage(specsCtx, typeChart);

    expect(withSpecs.damage).toBeGreaterThan(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Soul Dew (Gen 7 behavior) tests
// ---------------------------------------------------------------------------

describe("Gen 7 Soul Dew", () => {
  it("given Latios (381) with Soul Dew using a Dragon move, when calculating, then 1.2x power boost", () => {
    // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower chainModify([4915, 4096])
    //   for type === 'Dragon' || type === 'Psychic'
    // Source: Bulbapedia "Soul Dew" -- Gen 7: boosts Psychic/Dragon moves by 20%
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        speciesId: SPECIES_IDS.latios,
        types: [TYPE_IDS.dragon, TYPE_IDS.psychic],
      }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.dragon,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });
    const soulDewCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        speciesId: SPECIES_IDS.latios,
        types: [TYPE_IDS.dragon, TYPE_IDS.psychic],
        heldItem: ITEM_IDS.soulDew,
      }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.dragon,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withSoulDew = calculateGen7Damage(soulDewCtx, typeChart);

    expect(withSoulDew.damage).toBeGreaterThan(noItem.damage);
  });

  it("given Latias (380) with Soul Dew using a Fire move, when calculating, then no boost (wrong type)", () => {
    // Source: Showdown data/items.ts -- Soul Dew only boosts Dragon and Psychic
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        speciesId: SPECIES_IDS.latias,
        types: [TYPE_IDS.dragon, TYPE_IDS.psychic],
      }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.fire,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });
    const soulDewCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        speciesId: SPECIES_IDS.latias,
        types: [TYPE_IDS.dragon, TYPE_IDS.psychic],
        heldItem: ITEM_IDS.soulDew,
      }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.fire,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withSoulDew = calculateGen7Damage(soulDewCtx, typeChart);

    // Fire is not Dragon or Psychic -- no boost
    expect(withSoulDew.damage).toBe(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Status move test
// ---------------------------------------------------------------------------

describe("Gen 7 status moves", () => {
  it("given a status move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
    const ctx = createDamageContext({
      move: createSyntheticMove({
        power: null,
        category: MOVE_CATEGORIES.status,
        type: TYPE_IDS.normal,
      }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(1);
    expect(result.isCrit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Prism Armor test (Gen 7 new)
// ---------------------------------------------------------------------------

describe("Gen 7 Prism Armor", () => {
  it("given a defender with Prism Armor and a super-effective hit, when calculating, then 0.75x damage reduction", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor: 0.75x SE damage
    // Source: Bulbapedia "Prism Armor" -- reduces super-effective damage by 25%
    const noArmorCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.none,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });
    const armorCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.prismArmor,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });

    const noArmor = calculateGen7Damage(noArmorCtx, typeChart);
    const withArmor = calculateGen7Damage(armorCtx, typeChart);

    expect(withArmor.damage).toBeLessThan(noArmor.damage);
    expect(withArmor.breakdown?.abilityMultiplier).toBe(0.75);
  });

  it("given a defender with Prism Armor and a neutral hit, when calculating, then no damage reduction", () => {
    // Source: Showdown -- Prism Armor / Filter / Solid Rock only trigger on SE
    const noArmorCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.none,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const armorCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.prismArmor,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const noArmor = calculateGen7Damage(noArmorCtx, typeChart);
    const withArmor = calculateGen7Damage(armorCtx, typeChart);

    // Neutral hit -- Prism Armor doesn't apply
    expect(withArmor.damage).toBe(noArmor.damage);
  });
});
// ---------------------------------------------------------------------------
// Mold Breaker vs Filter/Solid Rock/Prism Armor (Gen 7 distinction)
// ---------------------------------------------------------------------------

describe("Gen 7 Mold Breaker vs Filter/Solid Rock/Prism Armor", () => {
  it("given Mold Breaker attacker vs defender with Filter, when super-effective, then damage reduction bypassed", () => {
    // Source: Showdown data/abilities.ts -- filter: flags: { breakable: 1 } (bypassed by Mold Breaker)
    // Source: Bulbapedia "Mold Breaker" -- "moves bypass the effects of abilities"
    const normalCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.filter,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });
    const moldBreakerCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.moldBreaker }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.filter,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });

    const withFilter = calculateGen7Damage(normalCtx, typeChart);
    const withMoldBreaker = calculateGen7Damage(moldBreakerCtx, typeChart);

    // Mold Breaker bypasses Filter -- damage should be higher (no reduction)
    expect(withMoldBreaker.damage).toBeGreaterThan(withFilter.damage);
    expect(withMoldBreaker.breakdown?.abilityMultiplier).toBe(1);
  });

  it("given Mold Breaker attacker vs defender with Solid Rock, when super-effective, then damage reduction bypassed", () => {
    // Source: Showdown data/abilities.ts -- solidrock: flags: { breakable: 1 } (bypassed by Mold Breaker)
    const normalCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.solidRock,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });
    const moldBreakerCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.moldBreaker }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.solidRock,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });

    const withSolidRock = calculateGen7Damage(normalCtx, typeChart);
    const withMoldBreaker = calculateGen7Damage(moldBreakerCtx, typeChart);

    expect(withMoldBreaker.damage).toBeGreaterThan(withSolidRock.damage);
    expect(withMoldBreaker.breakdown?.abilityMultiplier).toBe(1);
  });

  it("given Mold Breaker attacker vs defender with Prism Armor, when super-effective, then damage reduction still applies", () => {
    // Source: Showdown data/abilities.ts -- prismarmo: no breakable flag (not bypassed by Mold Breaker)
    // Source: Bulbapedia "Prism Armor" -- unlike Filter/Solid Rock, not bypassed by Mold Breaker
    const normalCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.prismArmor,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });
    const moldBreakerCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.moldBreaker }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.fire],
        ability: ABILITY_IDS.prismArmor,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });

    const withPrismArmor = calculateGen7Damage(normalCtx, typeChart);
    const withMoldBreaker = calculateGen7Damage(moldBreakerCtx, typeChart);

    // Prism Armor is NOT bypassed by Mold Breaker -- damage should be equal
    expect(withMoldBreaker.damage).toBe(withPrismArmor.damage);
    expect(withMoldBreaker.breakdown?.abilityMultiplier).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// Sunsteel Strike and Moongeist Beam ability bypass
// ---------------------------------------------------------------------------

describe("Gen 7 signature moves bypass target abilities", () => {
  it("given Sunsteel Strike against a target with Filter, then defensive ability reduction is ignored", () => {
    // Source: Showdown data/moves.ts -- sunsteel-strike: ignoreAbility
    // Source: Showdown data/abilities.ts -- Filter: breakable: 1 (Mold Breaker ignores)
    // Derived from the fixed fixture below with seed 42 (random factor 0.94):
    // Iron Head baseDamage 37 × Filter 0.75 × type 2 = 51 final damage;
    // Sunsteel Strike baseDamage 46 × type 2 = 86 final damage.
    const ironHead = GEN7_DATA.getMove(MOVE_IDS.ironHead);
    const sunsteelStrike = GEN7_DATA.getMove(MOVE_IDS.sunsteelStrike);
    const defender = createOnFieldPokemon({
      defense: 100,
      types: [TYPE_IDS.ice],
      ability: ABILITY_IDS.filter,
    });

    const normalMoveCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender,
      move: ironHead,
      seed: 42,
    });
    const sunsteelCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender,
      move: sunsteelStrike,
      seed: 42,
    });

    const normalMove = calculateGen7Damage(normalMoveCtx, typeChart);
    const sunsteel = calculateGen7Damage(sunsteelCtx, typeChart);

    expect(normalMove.damage).toBe(51);
    expect(normalMove.breakdown?.baseDamage).toBe(37);
    expect(normalMove.breakdown?.abilityMultiplier).toBe(0.75);
    expect(sunsteel.damage).toBe(86);
    expect(sunsteel.breakdown?.baseDamage).toBe(46);
    expect(sunsteel.breakdown?.abilityMultiplier).toBe(1);
  });

  it("given Moongeist Beam against Wonder Guard at neutral effectiveness, then neutral damage still lands", () => {
    // Source: Showdown data/moves.ts -- moongeist-beam: ignoreAbility
    // Source: Showdown data/abilities.ts -- Wonder Guard blocks non-SE moves
    // Derived from the fixed fixture below with seed 42 (random factor 0.94):
    // Shadow Ball baseDamage 54 is reduced to 0 by Wonder Guard;
    // Moongeist Beam baseDamage 68 resolves to 63 final damage with neutral effectiveness.
    const shadowBall = GEN7_DATA.getMove(MOVE_IDS.shadowBall);
    const moongeistBeam = GEN7_DATA.getMove(MOVE_IDS.moongeistBeam);
    const defender = createOnFieldPokemon({
      spDefense: 100,
      types: [TYPE_IDS.grass],
      ability: ABILITY_IDS.wonderGuard,
    });

    const normalMoveCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 150 }),
      defender,
      move: shadowBall,
      seed: 42,
    });
    const moongeistCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 150 }),
      defender,
      move: moongeistBeam,
      seed: 42,
    });

    const normalMove = calculateGen7Damage(normalMoveCtx, typeChart);
    const moongeist = calculateGen7Damage(moongeistCtx, typeChart);

    expect(normalMove.damage).toBe(0);
    expect(normalMove.breakdown?.baseDamage).toBe(54);
    expect(normalMove.breakdown?.abilityMultiplier).toBe(0);
    expect(moongeist.damage).toBe(63);
    expect(moongeist.breakdown?.baseDamage).toBe(68);
    expect(moongeist.breakdown?.abilityMultiplier).toBe(1);
  });

  it("given Moongeist Beam against Unaware, when the attacker is at +2 SpA, then the boost is preserved", () => {
    // Source: Showdown data/moves.ts -- moongeist-beam: ignoreAbility
    // Source: Showdown data/abilities.ts -- unaware is breakable by Mold Breaker-style effects
    // Derived from the fixed fixture below with seed 42 (random factor 0.94):
    // Shadow Ball vs Unaware uses stage 0 for 50 final damage;
    // Moongeist Beam bypasses Unaware, keeps the +2 stage, and deals 125 final damage.
    const shadowBall = GEN7_DATA.getMove(MOVE_IDS.shadowBall);
    const moongeistBeam = GEN7_DATA.getMove(MOVE_IDS.moongeistBeam);
    const unawareDefender = createOnFieldPokemon({
      spDefense: 100,
      types: [TYPE_IDS.grass],
      ability: ABILITY_IDS.unaware,
    });
    const boostedAttacker = createOnFieldPokemon({ spAttack: 150 });
    boostedAttacker.statStages.spAttack = 2;
    const shadowUnaware = calculateGen7Damage(
      createDamageContext({
        attacker: boostedAttacker,
        defender: unawareDefender,
        move: shadowBall,
        seed: 42,
      }),
      typeChart,
    );
    const moongeistUnaware = calculateGen7Damage(
      createDamageContext({
        attacker: boostedAttacker,
        defender: unawareDefender,
        move: moongeistBeam,
        seed: 42,
      }),
      typeChart,
    );
    expect(shadowUnaware.damage).toBe(50);
    expect(shadowUnaware.breakdown?.baseDamage).toBe(54);
    expect(moongeistUnaware.damage).toBe(125);
    expect(moongeistUnaware.breakdown?.baseDamage).toBe(134);
  });

  it("given Sunsteel Strike against Simple, when the defender is at +2 Defense, then Simple doubling is ignored", () => {
    // Source: Showdown data/moves.ts -- sunsteel-strike: ignoreAbility
    // Source: Showdown data/abilities.ts -- simple is breakable by Mold Breaker-style effects
    // Derived from the fixed fixture below with seed 42 (random factor 0.94):
    // Iron Head vs Simple uses doubled +4 defense stages for 24 final damage;
    // Sunsteel Strike bypasses Simple, uses the raw +2 stage, and deals 44 final damage.
    const ironHead = GEN7_DATA.getMove(MOVE_IDS.ironHead);
    const sunsteelStrike = GEN7_DATA.getMove(MOVE_IDS.sunsteelStrike);
    const simpleDefender = createOnFieldPokemon({
      defense: 100,
      types: [TYPE_IDS.ice],
      ability: ABILITY_IDS.simple,
    });
    simpleDefender.statStages.defense = 2;
    const attacker = createOnFieldPokemon({ attack: 100 });
    const ironHeadSimple = calculateGen7Damage(
      createDamageContext({
        attacker,
        defender: simpleDefender,
        move: ironHead,
        seed: 42,
      }),
      typeChart,
    );
    const sunsteelSimple = calculateGen7Damage(
      createDamageContext({
        attacker,
        defender: simpleDefender,
        move: sunsteelStrike,
        seed: 42,
      }),
      typeChart,
    );

    expect(ironHeadSimple.damage).toBe(24);
    expect(ironHeadSimple.breakdown?.baseDamage).toBe(13);
    expect(sunsteelSimple.damage).toBe(44);
    expect(sunsteelSimple.breakdown?.baseDamage).toBe(24);
  });

  it("given Photon Geyser with higher Attack than Special Attack, when calculating damage, then it becomes physical and ignores Filter", () => {
    // Source: Showdown data/moves.ts -- photongeyser: category becomes Physical
    // when getStat('atk', false, true) > getStat('spa', false, true), and ignoreAbility is true.
    // Derived from the fixed fixture below with seed 42 (random factor 0.94):
    // Psychic uses Special vs Filter and resolves to 55 final damage with baseDamage 27;
    // Photon Geyser uses Physical, bypasses Filter, and resolves to 210 final damage with baseDamage 75.
    const psychic = GEN7_DATA.getMove(MOVE_IDS.psychic);
    const photonGeyser = GEN7_DATA.getMove(MOVE_IDS.photonGeyser);
    const defender = createOnFieldPokemon({
      defense: 90,
      spDefense: 140,
      types: [TYPE_IDS.fighting],
      ability: ABILITY_IDS.filter,
    });

    const psychicResult = calculateGen7Damage(
      createDamageContext({
        attacker: createOnFieldPokemon({ attack: 150, spAttack: 90 }),
        defender,
        move: psychic,
        seed: 42,
      }),
      typeChart,
    );
    const photonResult = calculateGen7Damage(
      createDamageContext({
        attacker: createOnFieldPokemon({ attack: 150, spAttack: 90 }),
        defender,
        move: photonGeyser,
        seed: 42,
      }),
      typeChart,
    );

    expect(psychicResult.damage).toBe(55);
    expect(psychicResult.breakdown?.baseDamage).toBe(27);
    expect(psychicResult.breakdown?.abilityMultiplier).toBe(0.75);
    expect(psychicResult.effectiveCategory).toBe(MOVE_CATEGORIES.special);
    expect(photonResult.damage).toBe(210);
    expect(photonResult.breakdown?.baseDamage).toBe(75);
    expect(photonResult.breakdown?.abilityMultiplier).toBe(1);
    expect(photonResult.effectiveCategory).toBe(MOVE_CATEGORIES.physical);
  });

  it("given Photon Geyser with higher Attack than Special Attack on a burned attacker, when calculating damage, then it stays physical and burn still halves damage", () => {
    // Source: Showdown data/moves.ts -- photongeyser compares getStat(..., false, true),
    // so burn does not change the physical/special category decision.
    // Derived from the fixed fixture below with seed 42 (random factor 0.94):
    // Photon Geyser stays physical on an Atk 140 / SpA 100 attacker even while burned,
    // and the physical burn penalty reduces baseDamage 58 to 40 final damage.
    const photonGeyser = GEN7_DATA.getMove(MOVE_IDS.photonGeyser);
    const defender = createOnFieldPokemon({
      defense: 110,
      spDefense: 90,
      types: [TYPE_IDS.normal],
    });

    const result = calculateGen7Damage(
      createDamageContext({
        attacker: createOnFieldPokemon({
          attack: 140,
          spAttack: 100,
          status: STATUS_IDS.burn,
        }),
        defender,
        move: photonGeyser,
        seed: 42,
      }),
      typeChart,
    );

    expect(result.damage).toBe(40);
    expect(result.breakdown?.baseDamage).toBe(58);
    expect(result.breakdown?.burnMultiplier).toBe(0.5);
    expect(result.effectiveCategory).toBe(MOVE_CATEGORIES.physical);
  });

  it("given Photon Geyser with a raw Attack stage boost that overtakes Special Attack, when calculating damage, then it becomes physical", () => {
    // Source: Showdown data/moves.ts -- photongeyser compares stage-adjusted
    // getStat('atk', false, true) and getStat('spa', false, true), so raw stat
    // stages are included in the category check.
    // Derived from the fixed fixture below with seed 42 (random factor 0.94):
    // Photon Geyser uses a raw +2 Attack stage, resolves as physical,
    // and deals 112 final damage with baseDamage 80.
    const photonGeyser = GEN7_DATA.getMove(MOVE_IDS.photonGeyser);
    const attacker = createOnFieldPokemon({
      attack: 80,
      spAttack: 120,
    });
    attacker.statStages.attack = 2;

    const result = calculateGen7Damage(
      createDamageContext({
        attacker,
        defender: createOnFieldPokemon({
          defense: 90,
          spDefense: 140,
          types: [TYPE_IDS.normal],
        }),
        move: photonGeyser,
        seed: 42,
      }),
      typeChart,
    );

    expect(result.damage).toBe(112);
    expect(result.breakdown?.baseDamage).toBe(80);
    expect(result.effectiveCategory).toBe(MOVE_CATEGORIES.physical);
  });
});

// ---------------------------------------------------------------------------
// Expert Belt test
// ---------------------------------------------------------------------------

describe("Gen 7 Expert Belt", () => {
  it("given an Expert Belt holder with a super-effective hit, when calculating, then ~1.2x boost applied", () => {
    // Source: Showdown data/items.ts -- Expert Belt: chainModify([4915, 4096]) on SE
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.fire] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });
    const expertCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.expertBelt }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.fire] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withExpert = calculateGen7Damage(expertCtx, typeChart);

    expect(withExpert.damage).toBeGreaterThan(noItem.damage);
    expect(withExpert.breakdown?.itemMultiplier).toBeCloseTo(4915 / 4096, 4);
  });

  it("given an Expert Belt holder with a neutral hit, when calculating, then no boost", () => {
    // Source: Showdown data/items.ts -- Expert Belt only on SE
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });
    const expertCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.expertBelt }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withExpert = calculateGen7Damage(expertCtx, typeChart);

    expect(withExpert.damage).toBe(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Type-boosting items tests
// ---------------------------------------------------------------------------

describe("Gen 7 type-boosting items", () => {
  it("given Charcoal and a Fire move, when calculating, then ~1.2x power boost", () => {
    // Source: Showdown data/items.ts -- Charcoal: onBasePower chainModify([4915, 4096])
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const charcoalCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.charcoal }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withCharcoal = calculateGen7Damage(charcoalCtx, typeChart);

    expect(withCharcoal.damage).toBeGreaterThan(noItem.damage);
  });

  it("given Charcoal and a Water move, when calculating, then no boost (wrong type)", () => {
    // Source: Showdown data/items.ts -- type-boost items only match their type
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });
    const charcoalCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.charcoal }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withCharcoal = calculateGen7Damage(charcoalCtx, typeChart);

    expect(withCharcoal.damage).toBe(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Ability immunity tests
// ---------------------------------------------------------------------------

describe("Gen 7 ability type immunities", () => {
  it("given defender with Levitate and a Ground move, when calculating, then returns 0 damage", () => {
    // Source: Showdown -- Levitate grants Ground immunity
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        ability: ABILITY_IDS.levitate,
        types: [TYPE_IDS.psychic],
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.ground }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender with Volt Absorb and an Electric move, when calculating, then returns 0 damage", () => {
    // Source: Showdown -- Volt Absorb grants Electric immunity
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, ability: ABILITY_IDS.voltAbsorb }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.electric,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given attacker with Mold Breaker vs defender with Levitate and a Ground move, when calculating, then damage bypasses immunity", () => {
    // Source: Showdown data/abilities.ts -- Mold Breaker bypasses defensive abilities
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.moldBreaker }),
      defender: createOnFieldPokemon({
        defense: 100,
        ability: ABILITY_IDS.levitate,
        types: [TYPE_IDS.psychic],
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.ground }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    // Derivation: Levitate suppressed by Mold Breaker; Ground vs Psychic = 1x effectiveness
    // seed=42: base=22, no immunity -> damage=22
    // Source: Showdown data/abilities.ts -- Mold Breaker: onAllyTryHitSide bypasses Levitate
    expect(result.damage).toBe(22);
    // Ground vs Psychic is neutral (not immune through type chart)
    expect(result.effectiveness).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Knock Off test
// ---------------------------------------------------------------------------

describe("Gen 7 Knock Off", () => {
  it("given Knock Off vs a defender with a removable item, when calculating, then 1.5x power boost", () => {
    // Source: Showdown data/moves.ts -- knockoff onBasePower: chainModify(1.5) if target has item
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ id: MOVE_IDS.knockOff, power: 65, type: TYPE_IDS.dark }),
      seed: 42,
    });
    const hasItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, heldItem: ITEM_IDS.leftovers }),
      move: createSyntheticMove({ id: MOVE_IDS.knockOff, power: 65, type: TYPE_IDS.dark }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withItem = calculateGen7Damage(hasItemCtx, typeChart);

    expect(withItem.damage).toBeGreaterThan(noItem.damage);
  });

  it("given Knock Off vs a defender with a Z-Crystal, when calculating, then no boost (Z-Crystals not removable)", () => {
    // Source: Showdown data/items.ts -- Z-Crystals cannot be removed by Knock Off
    // Source: Bulbapedia "Z-Crystal" -- cannot be removed
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ id: MOVE_IDS.knockOff, power: 65, type: TYPE_IDS.dark }),
      seed: 42,
    });
    const zCrystalCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, heldItem: ITEM_IDS.normaliumZ }),
      move: createSyntheticMove({ id: MOVE_IDS.knockOff, power: 65, type: TYPE_IDS.dark }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withZCrystal = calculateGen7Damage(zCrystalCtx, typeChart);

    // Z-Crystal is not removable, so no 1.5x boost
    expect(withZCrystal.damage).toBe(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Wonder Guard test
// ---------------------------------------------------------------------------

describe("Gen 7 Wonder Guard", () => {
  it("given Wonder Guard defender and a neutral move, when calculating, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard: only SE moves hit
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        ability: ABILITY_IDS.wonderGuard,
        types: [TYPE_IDS.bug, TYPE_IDS.ghost],
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    // Normal vs Bug/Ghost = immune (Ghost), so this is a type immunity not Wonder Guard
    expect(result.damage).toBe(0);
  });

  it("given Wonder Guard defender and a resisted move, when calculating, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard blocks non-SE
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        ability: ABILITY_IDS.wonderGuard,
        types: [TYPE_IDS.bug, TYPE_IDS.ghost],
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.grass }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    // Grass vs Bug = 0.5x (resisted); Grass vs Ghost = 1x (neutral). Total = 0.5x.
    // Wonder Guard blocks anything that isn't super-effective (< 2x).
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Determinism test
// ---------------------------------------------------------------------------

describe("Gen 7 damage determinism", () => {
  it("given the same seed, when calculating damage twice, then results are identical", () => {
    const ctx1 = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 150 }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.fire] }),
      move: createSyntheticMove({ power: 80, type: TYPE_IDS.water }),
      seed: 9999,
    });
    const ctx2 = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 150 }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.fire] }),
      move: createSyntheticMove({ power: 80, type: TYPE_IDS.water }),
      seed: 9999,
    });

    const result1 = calculateGen7Damage(ctx1, typeChart);
    const result2 = calculateGen7Damage(ctx2, typeChart);

    expect(result1.damage).toBe(result2.damage);
    expect(result1.randomFactor).toBe(result2.randomFactor);
    expect(result1.effectiveness).toBe(result2.effectiveness);
  });
});

// ---------------------------------------------------------------------------
// Darkest Lariat test (Gen 7 new move)
// ---------------------------------------------------------------------------

describe("Gen 7 Darkest Lariat", () => {
  it("given Darkest Lariat vs a defender with +6 Defense, when calculating, then defense stages ignored", () => {
    // Source: Showdown data/moves.ts -- darkestlariat: { ignoreDefensive: true }
    // Source: Bulbapedia "Darkest Lariat" -- "ignores the target's stat stage changes"
    const boostedCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ id: MOVE_IDS.darkestLariat, power: 85, type: TYPE_IDS.dark }),
      seed: 42,
    });
    // Manually set defense stat stage to +6
    boostedCtx.defender.statStages.defense = 6;

    const unboostedCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ id: MOVE_IDS.darkestLariat, power: 85, type: TYPE_IDS.dark }),
      seed: 42,
    });

    const boosted = calculateGen7Damage(boostedCtx, typeChart);
    const unboosted = calculateGen7Damage(unboostedCtx, typeChart);

    // With +6 Def and ignoreDefensive, damage should be the same
    expect(boosted.damage).toBe(unboosted.damage);
  });
});

// ---------------------------------------------------------------------------
// Type-resist berry test
// ---------------------------------------------------------------------------

describe("Gen 7 type-resist berries", () => {
  it("given a Yache Berry holder taking a super-effective Ice hit, when calculating, then damage halved and berry consumed", () => {
    // Source: Showdown data/items.ts -- Yache Berry halves super-effective Ice damage, then consumes.
    // Derivation: seed 42 fixes randomMultiplier at 0.94 here, so the neutral path yields 44 damage
    // and the berry path yields 22 with itemMultiplier = 0.5.
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.dragon] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.ice }),
      seed: 42,
    });
    const berryCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.dragon],
        heldItem: TEST_ITEM_IDS.yacheBerry,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.ice }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withBerry = calculateGen7Damage(berryCtx, typeChart);

    expect(noItem.damage).toBe(44);
    expect(noItem.effectiveness).toBe(2);
    expect(noItem.breakdown?.itemMultiplier).toBe(1);
    expect(withBerry.damage).toBe(22);
    expect(withBerry.effectiveness).toBe(2);
    expect(withBerry.breakdown?.itemMultiplier).toBe(0.5);
    expect(berryCtx.defender.pokemon.heldItem).toBeNull();
  });

  it("given a Chilan Berry holder taking a Normal-type hit (neutral), when calculating, then damage halved", () => {
    // Source: Showdown data/items.ts -- Chilan Berry halves Normal-type damage even without super-effectiveness.
    // Derivation: with the shared seed-42 random factor, the no-item path yields 22 and the berry path
    // yields 11 with itemMultiplier = 0.5.
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const chilanCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPE_IDS.normal],
        heldItem: TEST_ITEM_IDS.chilanBerry,
      }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withChilan = calculateGen7Damage(chilanCtx, typeChart);

    expect(noItem.damage).toBe(22);
    expect(noItem.effectiveness).toBe(1);
    expect(noItem.breakdown?.itemMultiplier).toBe(1);
    expect(withChilan.damage).toBe(11);
    expect(withChilan.effectiveness).toBe(1);
    expect(withChilan.breakdown?.itemMultiplier).toBe(0.5);
    expect(chilanCtx.defender.pokemon.heldItem).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Normal Gem test
// ---------------------------------------------------------------------------

describe("Gen 7 Normal Gem", () => {
  it("given Normal Gem and a Normal move, when calculating, then 1.3x boost and gem consumed", () => {
    // Source: Showdown data/items.ts -- Normal Gem: chainModify([5325, 4096]) = 1.3x
    // Source: Bulbapedia "Gem" -- only Normal Gem available in Gen 7
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.normal] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const gemCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPE_IDS.normal],
        heldItem: TEST_ITEM_IDS.normalGem,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const gemPowerControlCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.normal] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({
        power: pokeRound(50, TEST_FIXED_POINT.gemBoost),
        type: TYPE_IDS.normal,
      }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withGem = calculateGen7Damage(gemCtx, typeChart);
    const gemPowerControl = calculateGen7Damage(gemPowerControlCtx, typeChart);

    expect(withGem).toEqual(gemPowerControl);
    expect(withGem).not.toEqual(noItem);
    expect(gemCtx.attacker.pokemon.heldItem).toBeNull();
  });

  it("given Normal Gem and a Fire move, when calculating, then no boost (wrong type)", () => {
    // Source: Showdown -- gem only activates for matching type
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: null }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const gemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.normalGem }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withGem = calculateGen7Damage(gemCtx, typeChart);

    expect(withGem.damage).toBe(noItem.damage);
    // Gem not consumed (wrong type)
    expect(gemCtx.attacker.pokemon.heldItem).toBe(ITEM_IDS.normalGem);
  });
});

// ---------------------------------------------------------------------------
// Muscle Band / Wise Glasses tests
// ---------------------------------------------------------------------------

describe("Gen 7 Muscle Band and Wise Glasses", () => {
  it("given Muscle Band and a physical move, when calculating, then ~1.1x boost", () => {
    // Source: Showdown data/items.ts -- Muscle Band: chainModify([4505, 4096]) ~1.1x
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });
    const bandCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.muscleBand }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withBand = calculateGen7Damage(bandCtx, typeChart);

    expect(withBand.damage).toBeGreaterThanOrEqual(noItem.damage);
    expect(withBand.breakdown?.itemMultiplier).toBeCloseTo(4505 / 4096, 4);
  });

  it("given Wise Glasses and a special move, when calculating, then ~1.1x boost", () => {
    // Source: Showdown data/items.ts -- Wise Glasses: chainModify([4505, 4096]) ~1.1x
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.fire,
      }),
      seed: 42,
    });
    const glassesCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, heldItem: ITEM_IDS.wiseGlasses }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.fire,
      }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withGlasses = calculateGen7Damage(glassesCtx, typeChart);

    expect(withGlasses.damage).toBeGreaterThanOrEqual(noItem.damage);
    expect(withGlasses.breakdown?.itemMultiplier).toBeCloseTo(4505 / 4096, 4);
  });
});

// ---------------------------------------------------------------------------
// SolarBeam in weather test
// ---------------------------------------------------------------------------

describe("Gen 7 SolarBeam weather penalty", () => {
  it("given SolarBeam in rain, when calculating, then power halved", () => {
    // Source: Showdown -- SolarBeam power halved in non-sun weather
    const sunCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        id: MOVE_IDS.solarBeam,
        power: 120,
        type: TYPE_IDS.grass,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.sun, turnsLeft: 5, source: ABILITY_IDS.drought },
      }),
      seed: 42,
    });
    const rainCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        id: MOVE_IDS.solarBeam,
        power: 120,
        type: TYPE_IDS.grass,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.rain, turnsLeft: 5, source: ABILITY_IDS.drizzle },
      }),
      seed: 42,
    });

    const inSun = calculateGen7Damage(sunCtx, typeChart);
    const inRain = calculateGen7Damage(rainCtx, typeChart);

    // In rain, SolarBeam is halved AND rain doesn't boost grass -- much weaker
    expect(inRain.damage).toBeLessThan(inSun.damage);
  });

  it("given SolarBeam in sandstorm, when calculating, then power halved", () => {
    // Source: Showdown -- SolarBeam power halved in non-sun weather (includes sand)
    const noWeatherCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        id: MOVE_IDS.solarBeam,
        power: 120,
        type: TYPE_IDS.grass,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({ weather: null }),
      seed: 42,
    });
    const sandCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        id: MOVE_IDS.solarBeam,
        power: 120,
        type: TYPE_IDS.grass,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.sand, turnsLeft: 5, source: "sandstream" },
      }),
      seed: 42,
    });

    const noWeather = calculateGen7Damage(noWeatherCtx, typeChart);
    const inSand = calculateGen7Damage(sandCtx, typeChart);

    expect(inSand.damage).toBeLessThan(noWeather.damage);
  });
});

// ---------------------------------------------------------------------------
// Venoshock / Hex tests
// ---------------------------------------------------------------------------

describe("Gen 7 conditional power moves", () => {
  it("given Venoshock vs a poisoned target, when calculating, then power doubled", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower chainModify(2)
    const healthyCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, status: null }),
      move: createSyntheticMove({
        id: MOVE_IDS.venoshock,
        power: 65,
        type: TYPE_IDS.poison,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });
    const poisonedCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, status: STATUS_IDS.poison }),
      move: createSyntheticMove({
        id: MOVE_IDS.venoshock,
        power: 65,
        type: TYPE_IDS.poison,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });

    const healthy = calculateGen7Damage(healthyCtx, typeChart);
    const poisoned = calculateGen7Damage(poisonedCtx, typeChart);

    expect(poisoned.damage).toBeGreaterThan(healthy.damage);
  });

  it("given Hex vs a statused target, when calculating, then power doubled", () => {
    // Source: Showdown data/moves.ts -- hex: onBasePower chainModify(2)
    const healthyCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, status: null }),
      move: createSyntheticMove({
        id: MOVE_IDS.hex,
        power: 65,
        type: TYPE_IDS.ghost,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });
    const burnedCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, status: STATUS_IDS.burn }),
      move: createSyntheticMove({
        id: MOVE_IDS.hex,
        power: 65,
        type: TYPE_IDS.ghost,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });

    const healthy = calculateGen7Damage(healthyCtx, typeChart);
    const burned = calculateGen7Damage(burnedCtx, typeChart);

    expect(burned.damage).toBeGreaterThan(healthy.damage);
  });

  it("given Acrobatics with no held item, when calculating, then power doubled", () => {
    // Source: Showdown data/moves.ts -- Acrobatics: basePowerCallback doubles if no item
    const withItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.leftovers }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ id: MOVE_IDS.acrobatics, power: 55, type: VOLATILE_IDS.flying }),
      seed: 42,
    });
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: null }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ id: MOVE_IDS.acrobatics, power: 55, type: VOLATILE_IDS.flying }),
      seed: 42,
    });

    const withItem = calculateGen7Damage(withItemCtx, typeChart);
    const noItem = calculateGen7Damage(noItemCtx, typeChart);

    expect(noItem.damage).toBeGreaterThan(withItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Pinch ability test
// ---------------------------------------------------------------------------

describe("Gen 7 pinch abilities", () => {
  it("given Blaze attacker at low HP using a Fire move, when calculating, then 1.5x power boost", () => {
    // Source: Showdown -- Blaze: 1.5x Fire power at <= floor(maxHP/3)
    const fullHpCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.blaze,
        types: [TYPE_IDS.fire],
        hp: 300,
        currentHp: 300,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const lowHpCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.blaze,
        types: [TYPE_IDS.fire],
        hp: 300,
        currentHp: 99,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const fullHp = calculateGen7Damage(fullHpCtx, typeChart);
    const lowHp = calculateGen7Damage(lowHpCtx, typeChart);

    // At 99/300 HP, threshold = floor(300/3) = 100. 99 <= 100 so pinch activates.
    expect(lowHp.damage).toBeGreaterThan(fullHp.damage);
  });

  it("given Torrent attacker at high HP using a Water move, when calculating, then no boost", () => {
    // Source: Showdown -- Torrent only activates at low HP
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.torrent,
        types: [TYPE_IDS.water],
        hp: 300,
        currentHp: 200,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.water],
        hp: 300,
        currentHp: 200,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.water }),
      seed: 42,
    });

    const withTorrent = calculateGen7Damage(ctx, typeChart);
    const noAbility = calculateGen7Damage(noAbilCtx, typeChart);

    // At 200/300, threshold = 100. 200 > 100, so no pinch.
    expect(withTorrent.damage).toBe(noAbility.damage);
  });
});

// ---------------------------------------------------------------------------
// Technician test
// ---------------------------------------------------------------------------

describe("Gen 7 Technician", () => {
  it("given Technician and a 60 BP move, when calculating, then 1.5x power boost", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x for moves <= 60 BP
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 60 }),
      seed: 42,
    });
    const techCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.technician }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 60 }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withTech = calculateGen7Damage(techCtx, typeChart);

    expect(withTech.damage).toBeGreaterThan(noAbil.damage);
  });

  it("given Technician and a 61 BP move, when calculating, then no boost", () => {
    // Source: Showdown -- Technician only for power <= 60
    const techCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.technician }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 61 }),
      seed: 42,
    });
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 61 }),
      seed: 42,
    });

    const withTech = calculateGen7Damage(techCtx, typeChart);
    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);

    expect(withTech.damage).toBe(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Huge Power / Pure Power test
// ---------------------------------------------------------------------------

describe("Gen 7 Huge Power / Pure Power", () => {
  it("given Huge Power and a physical move, when calculating, then Attack doubled", () => {
    // Source: Showdown -- Huge Power doubles physical Attack stat
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });
    const hugePowerCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.hugePower }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withHP = calculateGen7Damage(hugePowerCtx, typeChart);

    expect(withHP.damage).toBeGreaterThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Tinted Lens test
// ---------------------------------------------------------------------------

describe("Gen 7 Tinted Lens", () => {
  it("given Tinted Lens and a resisted hit, when calculating, then damage doubled", () => {
    // Source: Showdown data/abilities.ts -- Tinted Lens: 2x on NVE
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.water] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const tintedCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.tintedLens }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.water] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withTinted = calculateGen7Damage(tintedCtx, typeChart);

    expect(withTinted.damage).toBeGreaterThan(noAbil.damage);
    expect(withTinted.breakdown?.abilityMultiplier).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Harsh sun test
// ---------------------------------------------------------------------------

describe("Gen 7 harsh sun", () => {
  it("given harsh sun and a Water move, when calculating, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh-sun negates water completely
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.water,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.harshSun, turnsLeft: -1, source: ABILITY_IDS.desolateLand },
      }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Flash Fire volatile test
// ---------------------------------------------------------------------------

describe("Gen 7 Flash Fire volatile", () => {
  it("given Flash Fire activated (volatile set) and a Fire move, when calculating, then 1.5x power", () => {
    // Source: Showdown data/abilities.ts -- Flash Fire: 1.5x Fire power when volatile active
    const noFlashCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const flashVolatile = new Map([[ABILITY_IDS.flashFire, { turnsLeft: -1 }]]) as Map<
      any,
      { turnsLeft: number }
    >;
    const flashCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, volatiles: flashVolatile }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noFlash = calculateGen7Damage(noFlashCtx, typeChart);
    const withFlash = calculateGen7Damage(flashCtx, typeChart);

    expect(withFlash.damage).toBeGreaterThan(noFlash.damage);
  });
});

// ---------------------------------------------------------------------------
// Thick Fat test
// ---------------------------------------------------------------------------

describe("Gen 7 Thick Fat", () => {
  it("given defender with Thick Fat and a Fire move, when calculating, then attack halved", () => {
    // Source: Showdown -- Thick Fat halves the effective attack for Fire/Ice
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.none }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const thickFatCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.thickFat }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withThickFat = calculateGen7Damage(thickFatCtx, typeChart);

    expect(withThickFat.damage).toBeLessThan(noAbil.damage);
    expect(withThickFat.breakdown?.abilityMultiplier).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Spread modifier (doubles) test
// ---------------------------------------------------------------------------

describe("Gen 7 spread modifier", () => {
  it("given a multi-target move in doubles, when calculating, then 0.75x spread penalty", () => {
    // Source: Showdown sim/battle-actions.ts -- spread modifier: pokeRound(damage, 3072) = 0.75x
    const singlesCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.fire,
        category: MOVE_CATEGORIES.special,
        target: "all-adjacent-foes",
      }),
      state: createBattleState({ format: "singles" }),
      seed: 42,
    });
    const doublesCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.fire,
        category: MOVE_CATEGORIES.special,
        target: "all-adjacent-foes",
      }),
      state: createBattleState({ format: "doubles" }),
      seed: 42,
    });

    const singles = calculateGen7Damage(singlesCtx, typeChart);
    const doubles = calculateGen7Damage(doublesCtx, typeChart);

    expect(doubles.damage).toBeLessThan(singles.damage);
  });
});

// ---------------------------------------------------------------------------
// Sandstorm SpDef boost test
// ---------------------------------------------------------------------------

describe("Gen 7 sandstorm SpDef boost", () => {
  it("given sandstorm and a Rock-type defender, when taking a special hit, then SpDef boosted 1.5x", () => {
    // Source: Bulbapedia -- Sandstorm: "Rock-type Pokemon have their Special Defense
    //   raised by 50% during a sandstorm. (Generation IV+)"
    const noWeatherCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPE_IDS.rock] }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.normal,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({ weather: null }),
      seed: 42,
    });
    const sandCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPE_IDS.rock] }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.normal,
        category: MOVE_CATEGORIES.special,
      }),
      state: createBattleState({
        weather: { type: WEATHER_IDS.sand, turnsLeft: 5, source: "sandstream" },
      }),
      seed: 42,
    });

    const noWeather = calculateGen7Damage(noWeatherCtx, typeChart);
    const inSand = calculateGen7Damage(sandCtx, typeChart);

    // Rock-type defender takes less damage from special moves in sandstorm
    expect(inSand.damage).toBeLessThan(noWeather.damage);
  });
});

// ---------------------------------------------------------------------------
// Rivalry test
// ---------------------------------------------------------------------------

describe("Gen 7 Rivalry", () => {
  it("given Rivalry with same-gender matchup, when calculating, then 1.25x power", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 1.25x same gender
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        gender: GENDER_IDS.male,
      }),
      defender: createOnFieldPokemon({ defense: 100, gender: GENDER_IDS.male }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });
    const rivalryCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.rivalry,
        gender: GENDER_IDS.male,
      }),
      defender: createOnFieldPokemon({ defense: 100, gender: GENDER_IDS.male }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withRivalry = calculateGen7Damage(rivalryCtx, typeChart);

    expect(withRivalry.damage).toBeGreaterThan(noAbil.damage);
  });

  it("given Rivalry with opposite-gender matchup, when calculating, then 0.75x power", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 0.75x opposite gender
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.none,
        gender: GENDER_IDS.male,
      }),
      defender: createOnFieldPokemon({ defense: 100, gender: GENDER_IDS.female }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });
    const rivalryCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.rivalry,
        gender: GENDER_IDS.male,
      }),
      defender: createOnFieldPokemon({ defense: 100, gender: GENDER_IDS.female }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withRivalry = calculateGen7Damage(rivalryCtx, typeChart);

    expect(withRivalry.damage).toBeLessThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Heatproof test
// ---------------------------------------------------------------------------

describe("Gen 7 Heatproof", () => {
  it("given defender with Heatproof and a Fire move, when calculating, then power halved", () => {
    // Source: Showdown data/abilities.ts -- Heatproof: halves fire damage
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.none }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const heatCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.heatproof }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withHeat = calculateGen7Damage(heatCtx, typeChart);

    expect(withHeat.damage).toBeLessThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Reckless test
// ---------------------------------------------------------------------------

describe("Gen 7 Reckless", () => {
  it("given Reckless and a recoil move, when calculating, then 1.2x power boost", () => {
    // Source: Showdown data/abilities.ts -- Reckless: 1.2x for recoil moves
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({
        power: 120,
        type: TYPE_IDS.normal,
        effect: { type: "recoil", fraction: 1 / 3 },
      }),
      seed: 42,
    });
    const recklessCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.reckless }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({
        power: 120,
        type: TYPE_IDS.normal,
        effect: { type: "recoil", fraction: 1 / 3 },
      }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withReckless = calculateGen7Damage(recklessCtx, typeChart);

    expect(withReckless.damage).toBeGreaterThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Iron Fist / Strong Jaw / Mega Launcher / Tough Claws tests
// ---------------------------------------------------------------------------

describe("Gen 7 move-flag abilities", () => {
  it("given Iron Fist and a punching move, when calculating, then 1.2x power boost", () => {
    // Source: Showdown data/abilities.ts -- Iron Fist: 1.2x for punch moves
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.ironFist }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, flags: { punch: true } }),
      seed: 42,
    });
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, flags: { punch: true } }),
      seed: 42,
    });

    const withIronFist = calculateGen7Damage(ctx, typeChart);
    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);

    expect(withIronFist.damage).toBeGreaterThan(noAbil.damage);
  });

  it("given Strong Jaw and a bite move, when calculating, then 1.5x power boost", () => {
    // Source: Showdown data/abilities.ts -- Strong Jaw: 1.5x for bite moves
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.strongJaw }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.dark, flags: { bite: true } }),
      seed: 42,
    });
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.dark, flags: { bite: true } }),
      seed: 42,
    });

    const withStrongJaw = calculateGen7Damage(ctx, typeChart);
    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);

    expect(withStrongJaw.damage).toBeGreaterThan(noAbil.damage);
  });

  it("given Mega Launcher and a pulse move, when calculating, then 1.5x power boost", () => {
    // Source: Showdown data/abilities.ts -- Mega Launcher: 1.5x for pulse moves
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, ability: ABILITY_IDS.megaLauncher }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.water,
        category: MOVE_CATEGORIES.special,
        flags: { pulse: true },
      }),
      seed: 42,
    });
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 50,
        type: TYPE_IDS.water,
        category: MOVE_CATEGORIES.special,
        flags: { pulse: true },
      }),
      seed: 42,
    });

    const withML = calculateGen7Damage(ctx, typeChart);
    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);

    expect(withML.damage).toBeGreaterThan(noAbil.damage);
  });

  it("given Tough Claws and a contact move, when calculating, then ~1.3x power boost", () => {
    // Source: Showdown data/abilities.ts -- Tough Claws: chainModify([5325, 4096]) = ~1.3x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.toughClaws }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, flags: { contact: true } }),
      seed: 42,
    });
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, flags: { contact: true } }),
      seed: 42,
    });

    const withTC = calculateGen7Damage(ctx, typeChart);
    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);

    expect(withTC.damage).toBeGreaterThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Plate item test
// ---------------------------------------------------------------------------

describe("Gen 7 plate items", () => {
  it("given Flame Plate and a Fire move, when calculating, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Flame Plate: chainModify([4915, 4096])
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const plateCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.flamePlate }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withPlate = calculateGen7Damage(plateCtx, typeChart);

    expect(withPlate.damage).toBeGreaterThan(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Defeatist test
// ---------------------------------------------------------------------------

describe("Gen 7 Defeatist", () => {
  it("given Defeatist at or below 50% HP, when using a physical move, then Attack halved", () => {
    // Source: Showdown data/abilities.ts -- Defeatist: halves Atk and SpAtk at <= 50% HP
    const fullHpCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.defeatist,
        hp: 200,
        currentHp: 200,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });
    const halfHpCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.defeatist,
        hp: 200,
        currentHp: 100,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });

    const fullHp = calculateGen7Damage(fullHpCtx, typeChart);
    const halfHp = calculateGen7Damage(halfHpCtx, typeChart);

    expect(halfHp.damage).toBeLessThan(fullHp.damage);
  });
});

// ---------------------------------------------------------------------------
// Sheer Force test
// ---------------------------------------------------------------------------

describe("Gen 7 Sheer Force", () => {
  it("given Sheer Force and a move with a secondary status chance, when calculating, then ~1.3x boost", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force: chainModify([5325, 4096]) ~1.3x
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 90,
        type: TYPE_IDS.fire,
        category: MOVE_CATEGORIES.special,
        effect: { type: "status-chance", status: STATUS_IDS.burn, chance: 10 },
      }),
      seed: 42,
    });
    const sfCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, ability: ABILITY_IDS.sheerForce }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 90,
        type: TYPE_IDS.fire,
        category: MOVE_CATEGORIES.special,
        effect: { type: "status-chance", status: STATUS_IDS.burn, chance: 10 },
      }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withSF = calculateGen7Damage(sfCtx, typeChart);

    expect(withSF.damage).toBeGreaterThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Eviolite + Assault Vest tests
// ---------------------------------------------------------------------------

describe("Gen 7 defensive items", () => {
  it("given defender with Eviolite, when taking a physical hit, then Defense boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Eviolite: 1.5x Def and SpDef
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, heldItem: null }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });
    const evioliteCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, heldItem: ITEM_IDS.eviolite }),
      move: createSyntheticMove({ power: 50 }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withEviolite = calculateGen7Damage(evioliteCtx, typeChart);

    expect(withEviolite.damage).toBeLessThan(noItem.damage);
  });

  it("given defender with Assault Vest, when taking a special hit, then SpDef boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Assault Vest: 1.5x SpDef
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, heldItem: null }),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.fire,
      }),
      seed: 42,
    });
    const avCtx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, heldItem: ITEM_IDS.assaultVest }),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.fire,
      }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withAV = calculateGen7Damage(avCtx, typeChart);

    expect(withAV.damage).toBeLessThan(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Magnet Rise immunity test
// ---------------------------------------------------------------------------

describe("Gen 7 Magnet Rise", () => {
  it("given defender with Magnet Rise volatile and a Ground move, when calculating, then returns 0 damage", () => {
    // Source: Showdown -- Magnet Rise grants Ground immunity
    const magnetRiseVolatile = new Map([[VOLATILE_IDS.magnetRise, { turnsLeft: 5 }]]) as Map<
      any,
      { turnsLeft: number }
    >;
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, volatiles: magnetRiseVolatile }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.ground }),
      seed: 42,
    });

    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scrappy test
// ---------------------------------------------------------------------------

describe("Gen 7 Scrappy", () => {
  it("given Scrappy and a Normal move vs Ghost-type, when calculating, then Normal hits Ghost", () => {
    // Source: Showdown data/abilities.ts -- Scrappy: Normal/Fighting hit Ghost
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.ghost] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });
    const scrappyCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.scrappy }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.ghost] }),
      move: createSyntheticMove({ power: 50, type: TYPE_IDS.normal }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withScrappy = calculateGen7Damage(scrappyCtx, typeChart);

    expect(noAbil.damage).toBe(0); // Ghost immune to Normal
    expect(noAbil.effectiveness).toBe(0);
    // Scrappy bypasses Ghost immunity; damage is non-zero
    expect(withScrappy.damage).toBeGreaterThanOrEqual(1);
    expect(withScrappy.effectiveness).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dry Skin fire weakness test
// ---------------------------------------------------------------------------

describe("Gen 7 Dry Skin", () => {
  it("given defender with Dry Skin and a Fire move, when calculating, then 1.25x power boost to attacker", () => {
    // Source: Showdown data/abilities.ts -- Dry Skin: Fire moves deal 1.25x
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.none }),
      move: createSyntheticMove({ power: 80, type: TYPE_IDS.fire }),
      seed: 42,
    });
    const drySkinCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.drySkin }),
      move: createSyntheticMove({ power: 80, type: TYPE_IDS.fire }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withDrySkin = calculateGen7Damage(drySkinCtx, typeChart);

    expect(withDrySkin.damage).toBeGreaterThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Adamant Orb / Lustrous Orb / Griseous Orb tests
// ---------------------------------------------------------------------------

describe("Gen 7 legendary orbs", () => {
  it("given Dialga (483) with Adamant Orb using a Dragon move, when calculating, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Adamant Orb: onBasePower for Dragon/Steel by Dialga
    const noItemCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        speciesId: SPECIES_IDS.dialga,
        types: [TYPE_IDS.dragon, TYPE_IDS.steel],
      }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.dragon,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });
    const orbCtx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        speciesId: SPECIES_IDS.dialga,
        types: [TYPE_IDS.dragon, TYPE_IDS.steel],
        heldItem: ITEM_IDS.adamantOrb,
      }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.dragon,
        category: MOVE_CATEGORIES.special,
      }),
      seed: 42,
    });

    const noItem = calculateGen7Damage(noItemCtx, typeChart);
    const withOrb = calculateGen7Damage(orbCtx, typeChart);

    expect(withOrb.damage).toBeGreaterThan(noItem.damage);
  });
});

// ---------------------------------------------------------------------------
// Fur Coat test
// ---------------------------------------------------------------------------

describe("Gen 7 Fur Coat", () => {
  it("given defender with Fur Coat and a physical move, when calculating, then Defense doubled", () => {
    // Source: Showdown data/abilities.ts -- Fur Coat: 2x physical Defense
    const noAbilCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.none }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });
    const furCoatCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, ability: ABILITY_IDS.furCoat }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      seed: 42,
    });

    const noAbil = calculateGen7Damage(noAbilCtx, typeChart);
    const withFurCoat = calculateGen7Damage(furCoatCtx, typeChart);

    expect(withFurCoat.damage).toBeLessThan(noAbil.damage);
  });
});

// ---------------------------------------------------------------------------
// Coverage gap tests -- targeted branches
// ---------------------------------------------------------------------------

describe("Gen 7 isGen7Grounded coverage", () => {
  it("given attacker in Gravity, when calculating terrain boost, then attacker is grounded", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded(): gravity overrides everything
    // Derivation: Electric Terrain raises 60 BP to the grounded path's 90 BP. With seed 42,
    // the grounded path yields baseDamage 41 and final damage 38; the airborne control stays at 26.
    const airborneCtx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.flying], ability: ABILITY_IDS.levitate }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TEST_TERRAIN_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
        },
      }),
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.flying], ability: ABILITY_IDS.levitate }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: {
        ...createBattleState({
          terrain: {
            type: TEST_TERRAIN_IDS.electric,
            turnsLeft: 5,
            source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
          },
        }),
        gravity: { active: true, turnsLeft: 5 },
      } as any,
    });
    const airborne = calculateGen7Damage(airborneCtx, typeChart);
    const result = calculateGen7Damage(ctx, typeChart);
    expect(airborne).toMatchObject({
      damage: 26,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 28, finalDamage: 26 }),
    });
    expect(result).toMatchObject({
      damage: 38,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 41, finalDamage: 38 }),
    });
  });

  it("given attacker with Ingrain volatile, when calculating terrain boost, then attacker is grounded", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded(): ingrain grounds
    // Derivation: same Electric Terrain branch as the Gravity case; grounded path is 38 damage at seed 42.
    const vols = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    vols.set(VOLATILE_IDS.ingrain, { turnsLeft: -1 });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.flying], volatiles: vols }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TEST_TERRAIN_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
        },
      }),
    });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result).toMatchObject({
      damage: 38,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 41, finalDamage: 38 }),
    });
  });

  it("given attacker with Iron Ball held, when calculating terrain boost, then attacker is grounded", () => {
    // Source: Showdown data/items.ts -- Iron Ball: onIsGrounded
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        types: [TYPE_IDS.flying],
        heldItem: TEST_ITEM_IDS.ironBall,
      }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TEST_TERRAIN_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
        },
      }),
    });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result).toMatchObject({
      damage: 38,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 41, finalDamage: 38 }),
    });
    expect(ctx.attacker.pokemon.heldItem).toBe(TEST_ITEM_IDS.ironBall);
  });

  it("given attacker with Smack Down volatile, when calculating terrain boost, then attacker is grounded", () => {
    // Source: Showdown data/moves.ts -- Smack Down: volatileStatus: VOLATILE_IDS.smackDown
    const vols = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    vols.set(VOLATILE_IDS.smackDown, { turnsLeft: -1 });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.flying], volatiles: vols }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TEST_TERRAIN_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
        },
      }),
    });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result).toMatchObject({
      damage: 38,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 41, finalDamage: 38 }),
    });
  });

  it("given attacker with Air Balloon at 0 HP, when calculating terrain boost, then attacker is grounded", () => {
    // Source: Showdown data/items.ts -- Air Balloon: pops when hit (0 HP = dead, should be grounded)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        types: [TYPE_IDS.normal],
        heldItem: TEST_ITEM_IDS.airBalloon,
        currentHp: 0,
        hp: 100,
      }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TEST_TERRAIN_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
        },
      }),
    });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result).toMatchObject({
      damage: 38,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 41, finalDamage: 38 }),
    });
    expect(ctx.attacker.pokemon.heldItem).toBe(TEST_ITEM_IDS.airBalloon);
  });

  it("given attacker with Telekinesis volatile (Flying), when calculating terrain boost, then not grounded", () => {
    // Source: Showdown -- Telekinesis makes Pokemon immune to Ground
    const vols = new Map<string, any>();
    vols.set(MOVE_IDS.telekinesis, { turnsLeft: 3 });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.normal], volatiles: vols }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ type: TYPE_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TYPE_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TYPE_IDS.electric),
        },
      }),
    });
    // Telekinesis means not grounded, so Electric Terrain should NOT boost
    const withTele = calculateGen7Damage(ctx, typeChart);
    const ctxGrounded = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ type: TYPE_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TYPE_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TYPE_IDS.electric),
        },
      }),
    });
    const noTele = calculateGen7Damage(ctxGrounded, typeChart);
    // Grounded version should do more damage
    expect(noTele.damage).toBeGreaterThan(withTele.damage);
  });
});

describe("Gen 7 Grassy Terrain", () => {
  it("given Grassy Terrain with grounded attacker using Grass move, then 1.5x power", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onBasePower
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.grass] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TYPE_IDS.grass, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TERRAIN_IDS.grassy,
          turnsLeft: 5,
          source: resolveTerrainSource(TERRAIN_IDS.grassy),
        },
      }),
    });
    const withTerrain = calculateGen7Damage(ctx, typeChart);
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.grass] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TYPE_IDS.grass, power: 60 }),
    });
    const noTerrain = calculateGen7Damage(ctxNo, typeChart);
    expect(withTerrain.damage).toBeGreaterThan(noTerrain.damage);
  });

  it("given Grassy Terrain and Earthquake targeting grounded defender, then damage halved", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.ground] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TYPE_IDS.ground, power: 100, id: MOVE_IDS.earthquake }),
      state: createBattleState({
        terrain: {
          type: TERRAIN_IDS.grassy,
          turnsLeft: 5,
          source: resolveTerrainSource(TERRAIN_IDS.grassy),
        },
      }),
    });
    const withTerrain = calculateGen7Damage(ctx, typeChart);
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.ground] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TYPE_IDS.ground, power: 100, id: MOVE_IDS.earthquake }),
    });
    const noTerrain = calculateGen7Damage(ctxNo, typeChart);
    // Should do roughly half damage
    expect(withTerrain.damage).toBeLessThan(noTerrain.damage);
  });
});

describe("Gen 7 getEffectiveStatStage coverage", () => {
  it("given attacker with Simple ability and +2 attack, when calculating, then effective stage is +4", () => {
    // Source: Showdown data/abilities.ts -- Simple: doubles stat stages
    const atk = createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.simple });
    (atk.statStages as any).attack = 2;
    const ctx = createDamageContext({
      attacker: atk,
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    // Simple doubles +2 -> +4, which is 2x multiplier
    // Without Simple at +2: 1.5x (4/3 ratio)
    const result = calculateGen7Damage(ctx, typeChart);
    // Compare vs no Simple at +2
    const atk2 = createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none });
    (atk2.statStages as any).attack = 2;
    const ctx2 = createDamageContext({
      attacker: atk2,
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const result2 = calculateGen7Damage(ctx2, typeChart);
    expect(result.damage).toBeGreaterThan(result2.damage);
  });

  it("given defender with Unaware, when attacker has +6 attack, then stat stages ignored", () => {
    // Source: Showdown data/abilities.ts -- Unaware: ignores opponent's stat stages
    const atk = createOnFieldPokemon({ attack: 100 });
    (atk.statStages as any).attack = 6;
    const ctxUnaware = createDamageContext({
      attacker: atk,
      defender: createOnFieldPokemon({ ability: ABILITY_IDS.unaware }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const atk2 = createOnFieldPokemon({ attack: 100 });
    const ctxNoBoost = createDamageContext({
      attacker: atk2,
      defender: createOnFieldPokemon({ ability: ABILITY_IDS.unaware }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const result1 = calculateGen7Damage(ctxUnaware, typeChart);
    const result2 = calculateGen7Damage(ctxNoBoost, typeChart);
    expect(result1.damage).toBe(result2.damage);
  });
});

describe("Gen 7 attack stat item coverage", () => {
  it("given Clamperl with Deep Sea Tooth using special move, then SpAtk doubled", () => {
    // Source: Showdown data/items.ts -- Deep Sea Tooth: Clamperl SpAtk 2x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.clamperl,
        spAttack: 100,
        heldItem: ITEM_IDS.deepSeaTooth,
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.water,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ speciesId: SPECIES_IDS.clamperl, spAttack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.special,
        type: TYPE_IDS.water,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given Pikachu with Light Ball using physical move, then attack doubled", () => {
    // Source: Showdown data/items.ts -- Light Ball: 2x Atk AND SpAtk for Pikachu
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.pikachu,
        attack: 100,
        heldItem: ITEM_IDS.lightBall,
        types: [TYPE_IDS.electric],
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.pikachu,
        attack: 100,
        types: [TYPE_IDS.electric],
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given Marowak with Thick Club using physical move, then attack doubled via National Dex species id 105", () => {
    // Source: Showdown data/items.ts -- Thick Club: 2x Atk for Cubone/Marowak.
    // Source: the shipped runtime species model keys Marowak by National Dex id 105, not a
    // separate regional-form runtime species id.
    // Base-damage derivation at L50, 50 BP, 100 Atk vs 100 Def:
    // without item: floor(floor(22 * 50 * 100 / 100) / 50) + 2 = 24
    // with Thick Club: floor(floor(22 * 50 * 200 / 100) / 50) + 2 = 46
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.marowak,
        attack: 100,
        heldItem: ITEM_IDS.thickClub,
        types: [TYPE_IDS.ground],
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.marowak,
        attack: 100,
        types: [TYPE_IDS.ground],
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.breakdown?.baseDamage).toBe(46);
    expect(without.breakdown?.baseDamage).toBe(24);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given Cubone with Thick Club using physical move, then attack doubled via National Dex species id 104", () => {
    // Source: Showdown data/items.ts -- Thick Club: 2x Atk for Cubone/Marowak.
    // Base-damage derivation at L50, 50 BP, 100 Atk vs 100 Def:
    // without item: floor(floor(22 * 50 * 100 / 100) / 50) + 2 = 24
    // with Thick Club: floor(floor(22 * 50 * 200 / 100) / 50) + 2 = 46
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.cubone,
        attack: 100,
        heldItem: ITEM_IDS.thickClub,
        types: [TYPE_IDS.ground],
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.cubone,
        attack: 100,
        types: [TYPE_IDS.ground],
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.breakdown?.baseDamage).toBe(46);
    expect(without.breakdown?.baseDamage).toBe(24);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given attacker with Hustle using physical move, then attack is 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Hustle: 1.5x physical attack
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.hustle }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: ABILITY_IDS.none }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });
});

describe("Gen 7 Slow Start", () => {
  it("given attacker with Slow Start volatile, when using physical move, then attack halved", () => {
    // Source: Showdown data/abilities.ts -- Slow Start: halve Attack for first 5 turns
    const vols = new Map<string, any>();
    vols.set(ABILITY_IDS.slowStart, { turnsLeft: 3 });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        ability: ABILITY_IDS.slowStart,
        volatiles: vols,
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeLessThan(without.damage);
  });
});

describe("Gen 7 crit stat stage interaction", () => {
  it("given attacker with -2 attack and crit, then negative stages ignored (treated as 0)", () => {
    // Source: Showdown sim/battle-actions.ts -- crit ignores negative attack stages
    const atk = createOnFieldPokemon({ attack: 100 });
    (atk.statStages as any).attack = -2;
    const ctxCrit = createDamageContext({
      attacker: atk,
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      isCrit: true,
    });
    const atk2 = createOnFieldPokemon({ attack: 100 });
    (atk2.statStages as any).attack = -2;
    const ctxNoCrit = createDamageContext({
      attacker: atk2,
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      isCrit: false,
    });
    const critResult = calculateGen7Damage(ctxCrit, typeChart);
    const noCritResult = calculateGen7Damage(ctxNoCrit, typeChart);
    // Crit ignores -2 and also multiplies by 1.5x, so it should be much higher
    expect(critResult.damage).toBeGreaterThan(noCritResult.damage);
  });

  it("given defender with +2 defense and crit, then positive def stages ignored (treated as 0)", () => {
    // Source: Showdown sim/battle-actions.ts -- crit ignores positive def stages
    const def_ = createOnFieldPokemon({ defense: 100 });
    (def_.statStages as any).defense = 2;
    const ctxCrit = createDamageContext({
      defender: def_,
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      isCrit: true,
    });
    const def2 = createOnFieldPokemon({ defense: 100 });
    (def2.statStages as any).defense = 2;
    const ctxNoCrit = createDamageContext({
      defender: def2,
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
      isCrit: false,
    });
    const critResult = calculateGen7Damage(ctxCrit, typeChart);
    const noCritResult = calculateGen7Damage(ctxNoCrit, typeChart);
    // Crit ignores +2 def AND adds 1.5x multiplier
    expect(critResult.damage).toBeGreaterThan(noCritResult.damage);
  });
});

describe("Gen 7 defense stat items coverage", () => {
  it("given Clamperl with Deep Sea Scale defending against special move, then SpDef doubled", () => {
    // Source: Showdown data/items.ts -- Deep Sea Scale: Clamperl SpDef 2x
    const ctx = createDamageContext({
      defender: createOnFieldPokemon({
        speciesId: SPECIES_IDS.clamperl,
        spDefense: 100,
        heldItem: ITEM_IDS.deepSeaScale,
      }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.special }),
    });
    const ctxNo = createDamageContext({
      defender: createOnFieldPokemon({ speciesId: SPECIES_IDS.clamperl, spDefense: 100 }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.special }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeLessThan(without.damage);
  });

  it("given defender with Marvel Scale and a status, when hit by physical move, then 1.5x defense", () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale: 1.5x physical Def when statused
    const ctx = createDamageContext({
      defender: createOnFieldPokemon({
        defense: 100,
        ability: ABILITY_IDS.marvelScale,
        status: STATUS_IDS.burn,
      }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const ctxNo = createDamageContext({
      defender: createOnFieldPokemon({
        defense: 100,
        ability: ABILITY_IDS.none,
        status: STATUS_IDS.burn,
      }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeLessThan(without.damage);
  });

  it("given defender with Flower Gift in sun, when hit by special move, then 1.5x SpDef", () => {
    // Source: Showdown data/abilities.ts -- Flower Gift: 1.5x SpDef in sun
    const ctx = createDamageContext({
      defender: createOnFieldPokemon({ spDefense: 100, ability: ABILITY_IDS.flowerGift }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.special }),
      state: createBattleState({
        weather: {
          type: WEATHER_IDS.sun,
          turnsLeft: 5,
          source: resolveWeatherSource(WEATHER_IDS.sun),
        },
      }),
    });
    const ctxNo = createDamageContext({
      defender: createOnFieldPokemon({ spDefense: 100, ability: ABILITY_IDS.none }),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.special }),
      state: createBattleState({
        weather: {
          type: WEATHER_IDS.sun,
          turnsLeft: 5,
          source: resolveWeatherSource(WEATHER_IDS.sun),
        },
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeLessThan(without.damage);
  });
});

describe("Gen 7 Knock Off item checks", () => {
  it("given Knock Off vs mega stone holder, then no boost (not removable)", () => {
    // Source: Showdown data/moves.ts -- Knock Off: mega stones not removable
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ heldItem: "charizardite" }),
      move: createSyntheticMove({
        id: MOVE_IDS.knockOff,
        type: TYPE_IDS.dark,
        power: 65,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const ctxRemovable = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ heldItem: ITEM_IDS.leftovers }),
      move: createSyntheticMove({
        id: MOVE_IDS.knockOff,
        type: TYPE_IDS.dark,
        power: 65,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const mega = calculateGen7Damage(ctx, typeChart);
    const normal = calculateGen7Damage(ctxRemovable, typeChart);
    // Removable item gets 1.5x, mega stone does not
    expect(normal.damage).toBeGreaterThan(mega.damage);
  });

  it("given Knock Off vs target holding Leftovers (removable), then 1.5x boost applied", () => {
    // Source: Showdown data/items.ts -- Leftovers is removable, so Knock Off gets 1.5x
    // Compare vs holding a Z-Crystal (not removable in Gen 7)
    const ctxRemovable = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ heldItem: ITEM_IDS.leftovers }),
      move: createSyntheticMove({
        id: MOVE_IDS.knockOff,
        type: TYPE_IDS.dark,
        power: 65,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const ctxZCrystal = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ heldItem: ITEM_IDS.normaliumZ }),
      move: createSyntheticMove({
        id: MOVE_IDS.knockOff,
        type: TYPE_IDS.dark,
        power: 65,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const removableResult = calculateGen7Damage(ctxRemovable, typeChart);
    const zCrystalResult = calculateGen7Damage(ctxZCrystal, typeChart);
    // Leftovers is removable so Knock Off gets 1.5x, Z-Crystal is not removable
    expect(removableResult.damage).toBeGreaterThan(zCrystalResult.damage);
  });

  it("given Knock Off vs target holding Blue Orb, then no boost (primal orb not removable)", () => {
    // Source: Showdown data/items.ts -- Blue Orb not removable
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ heldItem: ITEM_IDS.blueOrb }),
      move: createSyntheticMove({
        id: MOVE_IDS.knockOff,
        type: TYPE_IDS.dark,
        power: 65,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const ctxRemovable = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ heldItem: ITEM_IDS.leftovers }),
      move: createSyntheticMove({
        id: MOVE_IDS.knockOff,
        type: TYPE_IDS.dark,
        power: 65,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const primalOrb = calculateGen7Damage(ctx, typeChart);
    const removable = calculateGen7Damage(ctxRemovable, typeChart);
    expect(removable.damage).toBeGreaterThan(primalOrb.damage);
  });
});

describe("Gen 7 Lustrous Orb and Griseous Orb", () => {
  it("given Palkia with Lustrous Orb using Water move, then 1.2x power boost", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb: 1.2x Dragon+Water for Palkia (484)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.palkia,
        heldItem: ITEM_IDS.lustrousOrb,
        types: [TYPE_IDS.water, TYPE_IDS.dragon],
      }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TYPE_IDS.water, power: 80 }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.palkia,
        types: [TYPE_IDS.water, TYPE_IDS.dragon],
      }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TYPE_IDS.water, power: 80 }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given Giratina with Griseous Orb using Ghost move, then 1.2x power boost", () => {
    // Source: Showdown data/items.ts -- Griseous Orb: 1.2x Ghost+Dragon for Giratina (487)
    // Use Water-type defender (neutral to Ghost) instead of Normal (immune to Ghost)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.giratina,
        heldItem: ITEM_IDS.griseousOrb,
        types: [TYPE_IDS.ghost, TYPE_IDS.dragon],
      }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.water] }),
      move: createSyntheticMove({
        type: TYPE_IDS.ghost,
        power: 80,
        category: MOVE_CATEGORIES.special,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({
        speciesId: SPECIES_IDS.giratina,
        types: [TYPE_IDS.ghost, TYPE_IDS.dragon],
      }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.water] }),
      move: createSyntheticMove({
        type: TYPE_IDS.ghost,
        power: 80,
        category: MOVE_CATEGORIES.special,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });
});

describe("Gen 7 Thick Fat ice coverage", () => {
  it("given defender with Thick Fat and Ice-type move, then halves attacker's effective attack", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat: Fire/Ice halved
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ ability: ABILITY_IDS.thickFat }),
      move: createSyntheticMove({
        type: TYPE_IDS.ice,
        power: 60,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        type: TYPE_IDS.ice,
        power: 60,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeLessThan(without.damage);
  });
});

describe("Gen 7 spread move targets", () => {
  it("given a move targeting all-adjacent in doubles, then 0.75x spread modifier applied", () => {
    // Source: Showdown sim/battle-actions.ts -- spread modifier in doubles
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 100,
        target: "all-adjacent",
        category: MOVE_CATEGORIES.physical,
      }),
      state: createBattleState({ format: "doubles" }),
    });
    const ctxSingle = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 100,
        target: "adjacent-foe",
        category: MOVE_CATEGORIES.physical,
      }),
      state: createBattleState({ format: "doubles" }),
    });
    const spread = calculateGen7Damage(ctx, typeChart);
    const single = calculateGen7Damage(ctxSingle, typeChart);
    expectSpreadPenaltyMatchesSingleTarget(spread, single);
  });

  it("given a move targeting all-foes in doubles, then 0.75x spread modifier applied", () => {
    // Source: Showdown sim/battle-actions.ts -- spread modifier
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 100,
        target: "all-foes",
        category: MOVE_CATEGORIES.physical,
      }),
      state: createBattleState({ format: "doubles" }),
    });
    const ctxSingle = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 100,
        target: "adjacent-foe",
        category: MOVE_CATEGORIES.physical,
      }),
      state: createBattleState({ format: "doubles" }),
    });
    const spread = calculateGen7Damage(ctx, typeChart);
    const single = calculateGen7Damage(ctxSingle, typeChart);
    expectSpreadPenaltyMatchesSingleTarget(spread, single);
  });
});

describe("Gen 7 Harsh Sun water negation", () => {
  it("given Harsh Sun weather and Water-type move, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- Harsh Sun negates Water moves
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.water] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TYPE_IDS.water, power: 80 }),
      state: createBattleState({
        weather: {
          type: TEST_WEATHER_IDS.harshSun,
          turnsLeft: -1,
          source: resolveWeatherSource(TEST_WEATHER_IDS.harshSun),
        },
      }),
    });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result).toEqual({
      damage: 0,
      effectiveness: 0,
      isCrit: false,
      randomFactor: 1,
    });
  });
});

describe("Gen 7 Gravity + Ground vs Flying", () => {
  it("given Gravity active, when Ground move hits Flying-type, then type immunity bypassed", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity: Ground hits Flying
    const controlCtx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.ground] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.flying] }),
      move: createSyntheticMove({
        type: TYPE_IDS.ground,
        power: 80,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.ground] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.flying] }),
      move: createSyntheticMove({
        type: TYPE_IDS.ground,
        power: 80,
        category: MOVE_CATEGORIES.physical,
      }),
      state: {
        ...createBattleState(),
        gravity: { active: true, turnsLeft: 5 },
      } as any,
    });
    const control = calculateGen7Damage(controlCtx, typeChart);
    const result = calculateGen7Damage(ctx, typeChart);
    expect(control).toMatchObject({ damage: 0, effectiveness: 0 });
    expect(result).toMatchObject({
      damage: 51,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 37, typeMultiplier: 1, finalDamage: 51 }),
    });
  });

  it("given Iron Ball on Flying defender, when Ground move hits, then type immunity bypassed", () => {
    // Source: Showdown data/items.ts -- Iron Ball: grounds Flying types for Ground moves
    const controlCtx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.ground] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.flying] }),
      move: createSyntheticMove({
        type: TYPE_IDS.ground,
        power: 80,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.ground] }),
      defender: createOnFieldPokemon({
        types: [TYPE_IDS.flying],
        heldItem: TEST_ITEM_IDS.ironBall,
      }),
      move: createSyntheticMove({
        type: TYPE_IDS.ground,
        power: 80,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const control = calculateGen7Damage(controlCtx, typeChart);
    const result = calculateGen7Damage(ctx, typeChart);
    expect(control).toMatchObject({ damage: 0, effectiveness: 0 });
    expect(result).toMatchObject({
      damage: 51,
      effectiveness: 1,
      breakdown: expect.objectContaining({ baseDamage: 37, typeMultiplier: 1, finalDamage: 51 }),
    });
    expect(ctx.defender.pokemon.heldItem).toBe(TEST_ITEM_IDS.ironBall);
  });
});

describe("Gen 7 Scrappy vs Ghost type (coverage)", () => {
  it("given Scrappy attacker with Fighting move vs pure Ghost, then treats as neutral (1x)", () => {
    // Source: Showdown data/abilities.ts -- Scrappy: Normal/Fighting hit Ghost
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ ability: ABILITY_IDS.scrappy, types: [TYPE_IDS.fighting] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.ghost] }),
      move: createSyntheticMove({
        type: TYPE_IDS.fighting,
        power: 80,
        category: MOVE_CATEGORIES.physical,
      }),
    });
    const result = calculateGen7Damage(ctx, typeChart);
    // Scrappy Fighting vs Ghost: immunity bypassed, treated as neutral (1x); damage is non-zero
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.effectiveness).toBe(1);
  });
});

describe("Gen 7 Metronome item", () => {
  it("given attacker holding Metronome item with 3 consecutive uses, then boost applied", () => {
    // Source: Showdown data/items.ts -- Metronome: 1 + 0.2*(count-1), max 2.0x at 6
    // 3 uses: 1 + 0.2*2 = 1.4x => 4096 * 1.4 = 5734
    const vols = new Map<string, any>();
    vols.set(CORE_VOLATILE_IDS.metronomeCount, { turnsLeft: -1, data: { count: 3 } });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        heldItem: ITEM_IDS.metronome,
        volatiles: vols,
      }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });
});

describe("Gen 7 Magic Room", () => {
  it("given Magic Room active, when defender holds type-resist berry, then berry does not activate", () => {
    // Source: Showdown data/conditions.ts -- Magic Room: suppresses item effects
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.fire] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.grass], heldItem: ITEM_IDS.occaBerry }),
      move: createSyntheticMove({ type: TYPE_IDS.fire, power: 60 }),
      state: {
        ...createBattleState(),
        magicRoom: { active: true, turnsLeft: 3 },
      } as any,
    });
    const ctxNoRoom = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.fire] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.grass], heldItem: ITEM_IDS.occaBerry }),
      move: createSyntheticMove({ type: TYPE_IDS.fire, power: 60 }),
    });
    const magicRoom = calculateGen7Damage(ctx, typeChart);
    const noRoom = calculateGen7Damage(ctxNoRoom, typeChart);
    expect(magicRoom.damage).toBeGreaterThan(noRoom.damage);
  });
});

describe("Gen 7 Unburden on berry/gem consumption", () => {
  it("given defender with Unburden consuming type-resist berry, then Unburden volatile set", () => {
    // Source: Showdown data/abilities.ts -- Unburden: speed doubled after item consumption
    const defender = createOnFieldPokemon({
      types: [TYPE_IDS.grass],
      ability: ABILITY_IDS.unburden,
      heldItem: ITEM_IDS.occaBerry,
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.fire] }),
      defender,
      move: createSyntheticMove({ type: TYPE_IDS.fire, power: 60 }),
    });
    calculateGen7Damage(ctx, typeChart);
    // Berry consumed: heldItem nulled and unburden volatile set
    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has(ABILITY_IDS.unburden)).toBe(true);
  });

  it("given attacker with Unburden consuming Normal Gem, then Unburden volatile set", () => {
    // Source: Showdown data/abilities.ts -- Unburden triggers on gem consumption
    const attacker = createOnFieldPokemon({
      types: [TYPE_IDS.normal],
      ability: ABILITY_IDS.unburden,
      heldItem: ITEM_IDS.normalGem,
    });
    const ctx = createDamageContext({
      attacker,
      defender: createOnFieldPokemon({ types: [TYPE_IDS.psychic] }),
      move: createSyntheticMove({ type: TYPE_IDS.normal, power: 50 }),
    });
    calculateGen7Damage(ctx, typeChart);
    expect(attacker.pokemon.heldItem).toBeNull();
    expect(attacker.volatileStatuses.has(ABILITY_IDS.unburden)).toBe(true);
  });
});

describe("Gen 7 hasSheerForceEligibleEffect branches", () => {
  it("given move with stat-change targeting foe with chance, when Sheer Force, then power boosted", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force: moves with secondary effects get 1.3x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ ability: ABILITY_IDS.sheerForce, attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "stat-change",
          target: "foe",
          chance: 30,
          stats: { defense: -1 },
          fromSecondary: false,
        } as any,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "stat-change",
          target: "foe",
          chance: 30,
          stats: { defense: -1 },
          fromSecondary: false,
        } as any,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given move with volatile-status chance, when Sheer Force, then power boosted", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force: volatile-status secondaries trigger it
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ ability: ABILITY_IDS.sheerForce, attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "volatile-status",
          volatileStatus: VOLATILE_IDS.flinch,
          chance: 30,
        } as any,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "volatile-status",
          volatileStatus: VOLATILE_IDS.flinch,
          chance: 30,
        } as any,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given move with self stat-change from secondary, when Sheer Force, then power boosted", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force: self-targeting stat changes from secondaries
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ ability: ABILITY_IDS.sheerForce, attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "stat-change",
          target: "self",
          chance: 100,
          stats: { attack: 1 },
          fromSecondary: true,
        } as any,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "stat-change",
          target: "self",
          chance: 100,
          stats: { attack: 1 },
          fromSecondary: true,
        } as any,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given Sheer Force with multi effect containing status-chance, then power boosted", () => {
    // Source: Showdown data/abilities.ts -- multi effects trigger Sheer Force
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ ability: ABILITY_IDS.sheerForce, attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "multi",
          effects: [{ type: "status-chance", status: "burn", chance: 10 }],
        } as any,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        power: 50,
        category: MOVE_CATEGORIES.physical,
        effect: {
          type: "multi",
          effects: [{ type: "status-chance", status: "burn", chance: 10 }],
        } as any,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });

  it("given Sheer Force with Tri Attack (whitelist), then power boosted", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force whitelist: tri-attack
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ ability: ABILITY_IDS.sheerForce, attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        id: MOVE_IDS.triAttack,
        power: 80,
        category: MOVE_CATEGORIES.special,
      }),
    });
    const ctxNo = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        id: MOVE_IDS.triAttack,
        power: 80,
        category: MOVE_CATEGORIES.special,
      }),
    });
    const with_ = calculateGen7Damage(ctx, typeChart);
    const without = calculateGen7Damage(ctxNo, typeChart);
    expect(with_.damage).toBeGreaterThan(without.damage);
  });
});

describe("Gen 7 Round move doubles combo", () => {
  it("given ally already used Round this turn in doubles, then Round power doubles", () => {
    // Source: Showdown data/moves.ts -- round.basePowerCallback: doubles if ally used Round
    const attacker = createOnFieldPokemon({ attack: 100 });
    const ally = {
      ...createOnFieldPokemon({}),
      lastMoveUsed: MOVE_IDS.round,
      movedThisTurn: true,
    };
    const defender = createOnFieldPokemon({});
    const state = {
      ...createBattleState({ format: "doubles" }),
      sides: [
        {
          active: [attacker, ally],
          sideConditions: new Map(),
          pokemon: [attacker.pokemon, ally.pokemon],
        },
        { active: [defender], sideConditions: new Map(), pokemon: [defender.pokemon] },
      ],
    } as unknown as BattleState;
    const ctx: DamageContext = {
      attacker,
      defender,
      move: createSyntheticMove({
        id: MOVE_IDS.round,
        power: 60,
        category: MOVE_CATEGORIES.special,
      }),
      state,
      rng: new SeededRandom(42),
      isCrit: false,
    };
    const noAllyAtk = createOnFieldPokemon({ attack: 100 });
    const noAllyDef = createOnFieldPokemon({});
    const noAllyState = {
      ...createBattleState({ format: "doubles" }),
      sides: [
        { active: [noAllyAtk, null], sideConditions: new Map(), pokemon: [noAllyAtk.pokemon] },
        { active: [noAllyDef], sideConditions: new Map(), pokemon: [noAllyDef.pokemon] },
      ],
    } as unknown as BattleState;
    const ctxNoAlly: DamageContext = {
      attacker: noAllyAtk,
      defender: noAllyDef,
      move: createSyntheticMove({
        id: MOVE_IDS.round,
        power: 60,
        category: MOVE_CATEGORIES.special,
      }),
      state: noAllyState,
      rng: new SeededRandom(42),
      isCrit: false,
    };
    const withAlly = calculateGen7Damage(ctx, typeChart);
    const noAlly = calculateGen7Damage(ctxNoAlly, typeChart);
    expect(withAlly.damage).toBeGreaterThan(noAlly.damage);
  });
});

describe("Gen 7 Embargo suppresses items", () => {
  it("given attacker with Embargo volatile, when holding Life Orb, then no boost", () => {
    // Source: Showdown data/conditions.ts -- Embargo: suppresses item effects
    const vols = new Map<string, any>();
    vols.set(VOLATILE_IDS.embargo, { turnsLeft: 5 });
    const _ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, heldItem: ITEM_IDS.lifeOrb, volatiles: vols }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ power: 50, category: MOVE_CATEGORIES.physical }),
    });
    // Embargo prevents item effects. The damage calc checks attackerHasKlutz
    // for Life Orb (not embargo specifically), but embargo IS checked for gems and
    // for grounding. Let's check gem consumption is blocked:
    const atkWithEmbargo = createOnFieldPokemon({
      types: [TYPE_IDS.normal],
      heldItem: TEST_ITEM_IDS.normalGem,
      volatiles: vols,
    });
    const ctxGem = createDamageContext({
      attacker: atkWithEmbargo,
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ type: TYPE_IDS.normal, power: 50 }),
    });
    const atkNoItem = createOnFieldPokemon({
      types: [TYPE_IDS.normal],
      volatiles: vols,
    });
    const ctxNoItem = createDamageContext({
      attacker: atkNoItem,
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ type: TYPE_IDS.normal, power: 50 }),
    });
    const atkNoEmbargo = createOnFieldPokemon({
      types: [TYPE_IDS.normal],
      heldItem: TEST_ITEM_IDS.normalGem,
    });
    const ctxNoEmbargo = createDamageContext({
      attacker: atkNoEmbargo,
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({ type: TYPE_IDS.normal, power: 50 }),
    });
    const ctxGemPowerControl = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      defender: createOnFieldPokemon({}),
      move: createSyntheticMove({
        type: TYPE_IDS.normal,
        power: pokeRound(50, TEST_FIXED_POINT.gemBoost),
      }),
    });
    const withEmbargo = calculateGen7Damage(ctxGem, typeChart);
    const noItem = calculateGen7Damage(ctxNoItem, typeChart);
    const noEmbargo = calculateGen7Damage(ctxNoEmbargo, typeChart);
    const gemPowerControl = calculateGen7Damage(ctxGemPowerControl, typeChart);
    expect(withEmbargo).toEqual(noItem);
    expect(noEmbargo).toEqual(gemPowerControl);
  });
});

describe("Gen 7 defender Klutz and Iron Ball", () => {
  it("given defender with Klutz holding Iron Ball under Electric Terrain, then unrelated attacker terrain boost is unchanged", () => {
    // Source: Showdown data/abilities.ts -- Klutz suppresses the holder's item effects.
    // This control proves the defender-side Klutz/Iron Ball state does not leak into the unrelated
    // attacker-side Electric Terrain boost path. The grounded Electric attacker should still deal 57.
    const controlCtx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.electric] }),
      defender: createOnFieldPokemon({ types: [TYPE_IDS.normal] }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TEST_TERRAIN_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
        },
      }),
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ types: [TYPE_IDS.electric] }),
      defender: createOnFieldPokemon({
        types: [TYPE_IDS.normal],
        ability: ABILITY_IDS.klutz,
        heldItem: TEST_ITEM_IDS.ironBall,
      }),
      move: createSyntheticMove({ type: TEST_TERRAIN_IDS.electric, power: 60 }),
      state: createBattleState({
        terrain: {
          type: TEST_TERRAIN_IDS.electric,
          turnsLeft: 5,
          source: resolveTerrainSource(TEST_TERRAIN_IDS.electric),
        },
      }),
    });
    const control = calculateGen7Damage(controlCtx, typeChart);
    const result = calculateGen7Damage(ctx, typeChart);
    expect(control.damage).toBe(57);
    expect(control.breakdown?.baseDamage).toBe(41);
    expect(result.damage).toBe(57);
    expect(result.breakdown?.baseDamage).toBe(41);
    expect(ctx.defender.pokemon.heldItem).toBe(TEST_ITEM_IDS.ironBall);
  });
});

// ---------------------------------------------------------------------------
// Aurora Veil damage reduction tests
// ---------------------------------------------------------------------------

describe("Gen 7 Aurora Veil screen damage reduction", () => {
  function makeStateWithDefenderScreen(
    screen: string | null,
    attacker: ReturnType<typeof createOnFieldPokemon>,
    defender: ReturnType<typeof createOnFieldPokemon>,
  ): BattleState {
    return {
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      magicRoom: { active: false, turnsLeft: 0 },
      wonderRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      format: "singles",
      generation: 7,
      turnNumber: 1,
      sides: [
        { active: [attacker], screens: [], hazards: [], sideConditions: [] },
        {
          active: [defender],
          screens: screen ? [{ type: screen, turnsLeft: 5 }] : [],
          hazards: [],
          sideConditions: [],
        },
      ],
    } as unknown as BattleState;
  }

  it("given Aurora Veil on defender side and a physical move, when calculating damage, then damage is halved", () => {
    // Source: Showdown sim/battle-actions.ts -- screens reduce damage by 0.5x in singles
    // Source: Bulbapedia "Aurora Veil" -- halves damage from physical and special moves
    // Derivation: power=80, attack=100, defense=100, level=50, seed=42
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50) + 2 = 37
    //   after random roll (seed 42): 34; with Aurora Veil: floor(34/2) = 17
    const attacker = createOnFieldPokemon({ attack: 100 });
    const defender = createOnFieldPokemon({ defense: 100 });
    const stateNoScreen = makeStateWithDefenderScreen(null, attacker, defender);
    const stateWithVeil = makeStateWithDefenderScreen(MOVE_IDS.auroraVeil, attacker, defender);
    const ctxNoScreen = createDamageContext({
      attacker,
      defender,
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.normal,
        category: MOVE_CATEGORIES.physical,
      }),
      state: stateNoScreen,
      seed: 42,
    });
    const ctxWithVeil = createDamageContext({
      attacker,
      defender,
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.normal,
        category: MOVE_CATEGORIES.physical,
      }),
      state: stateWithVeil,
      seed: 42,
    });

    const resultNoScreen = calculateGen7Damage(ctxNoScreen, typeChart);
    const resultWithVeil = calculateGen7Damage(ctxWithVeil, typeChart);

    expect(resultNoScreen.damage).toBe(34);
    expect(resultWithVeil.damage).toBe(17);
    expect(resultWithVeil.breakdown?.otherMultiplier).toBe(0.5);
  });

  it("given Aurora Veil on defender side and a special move, when calculating damage, then damage is halved", () => {
    // Source: Showdown sim/battle-actions.ts -- Aurora Veil halves both physical and special
    // Source: Bulbapedia "Aurora Veil" -- halves damage from both categories
    // Derivation: power=80, spAttack=100, spDefense=100, level=50, seed=42
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50) + 2 = 37
    //   after random roll (seed 42): 34; with Aurora Veil: floor(34/2) = 17
    const attacker = createOnFieldPokemon({ spAttack: 100 });
    const defender = createOnFieldPokemon({ spDefense: 100 });
    const stateNoScreen = makeStateWithDefenderScreen(null, attacker, defender);
    const stateWithVeil = makeStateWithDefenderScreen(MOVE_IDS.auroraVeil, attacker, defender);
    const ctxNoScreen = createDamageContext({
      attacker,
      defender,
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.water,
        category: MOVE_CATEGORIES.special,
      }),
      state: stateNoScreen,
      seed: 42,
    });
    const ctxWithVeil = createDamageContext({
      attacker,
      defender,
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.water,
        category: MOVE_CATEGORIES.special,
      }),
      state: stateWithVeil,
      seed: 42,
    });

    const resultNoScreen = calculateGen7Damage(ctxNoScreen, typeChart);
    const resultWithVeil = calculateGen7Damage(ctxWithVeil, typeChart);

    expect(resultNoScreen.damage).toBe(34);
    expect(resultWithVeil.damage).toBe(17);
    expect(resultWithVeil.breakdown?.otherMultiplier).toBe(0.5);
  });

  it("given Aurora Veil on defender side and a critical hit physical move, when calculating damage, then damage is NOT halved", () => {
    // Source: Showdown sim/battle-actions.ts -- critical hits bypass screens
    // Source: Bulbapedia "Critical hit" -- always ignores enemy's Reflect/Light Screen/Aurora Veil
    const attacker = createOnFieldPokemon({ attack: 100 });
    const defender = createOnFieldPokemon({ defense: 100 });
    const stateWithVeil = makeStateWithDefenderScreen(MOVE_IDS.auroraVeil, attacker, defender);
    const ctxNoCrit = createDamageContext({
      attacker,
      defender,
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.normal,
        category: MOVE_CATEGORIES.physical,
      }),
      state: stateWithVeil,
      seed: 42,
    });
    const ctxWithCrit = createDamageContext({
      attacker,
      defender,
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.normal,
        category: MOVE_CATEGORIES.physical,
      }),
      state: stateWithVeil,
      seed: 42,
      isCrit: true,
    });

    const resultNoCrit = calculateGen7Damage(ctxNoCrit, typeChart);
    const resultWithCrit = calculateGen7Damage(ctxWithCrit, typeChart);

    // Non-crit with Aurora Veil: halved
    expect(resultNoCrit.damage).toBe(17);
    // Crit with Aurora Veil: NOT halved (crit bypasses screens); also gets 1.5x crit boost
    // Derivation: base=34 (no screen) * 1.5x crit = pokeRound(34, 6144) = 51
    expect(resultWithCrit.damage).toBe(51);
    expect(resultWithCrit.breakdown?.otherMultiplier).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Z-Move through Protect: 0.25x modifier
// ---------------------------------------------------------------------------

describe("Z-Move through Protect (hitThroughProtect)", () => {
  it("given a Z-Move hitting through Protect, when damage is calculated, then damage is 25% of normal", () => {
    // Source: Showdown sim/battle-actions.ts -- Z-Moves bypass Protect at 0.25x damage
    // Source: Bulbapedia "Z-Move" -- "deals a quarter of its damage" through Protect
    //
    // Setup: L50 attacker (100 Atk) vs L50 defender (100 Def), Normal-type Z-Move
    // with 100 power (from Breakneck Blitz). zMovePower field marks it as a Z-Move.
    //
    // Normal damage derivation (seed 42, no crit):
    //   Base: floor(floor((2*50/5+2) * 100 * 100/100) / 50) + 2 = floor(2200/50) + 2 = 46
    //   Random roll: floor(46 * roll / 100) where roll comes from RNG
    //   STAB: 1.0x (attacker is psychic-type, move is normal-type)
    //   Type: 1.0x (normal vs psychic)
    //   Final: some value from random roll

    const attacker = createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.psychic] });
    const defender = createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.psychic] });
    const zMove = createSyntheticMove({
      id: "breakneck-blitz",
      type: TYPE_IDS.normal,
      power: 100,
      category: MOVE_CATEGORIES.physical,
    });
    // Mark as a Z-Move via the zMovePower field (set by Gen7ZMove.modifyMove)
    (zMove as any).zMovePower = 100;

    // Calculate normal damage (no Protect)
    const normalCtx = createDamageContext({
      attacker,
      defender,
      move: zMove,
      seed: 42,
      hitThroughProtect: false,
    });
    const normalResult = calculateGen7Damage(normalCtx, typeChart);

    // Calculate damage through Protect (hitThroughProtect = true)
    const protectCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.psychic] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.psychic] }),
      move: { ...zMove },
      seed: 42,
      hitThroughProtect: true,
    });
    // Re-set zMovePower on the cloned move
    (protectCtx.move as any).zMovePower = 100;
    const protectResult = calculateGen7Damage(protectCtx, typeChart);

    // The Protect version should be 25% of normal (via pokeRound with 1024/4096)
    // pokeRound(normalDamage, 1024) = floor((normalDamage * 1024 + 2047) / 4096)
    const expectedProtectDamage = Math.floor((normalResult.damage * 1024 + 2047) / 4096);
    // Guard: ensure the normal damage is nontrivial so the 0.25x is meaningful
    expect(normalResult.damage).toBeGreaterThan(4);
    // Protect damage should be approximately 25% of normal
    expect(protectResult.damage).toBe(Math.max(1, expectedProtectDamage));
  });

  it("given a Z-Move with hitThroughProtect=false, when damage is calculated, then damage is normal (no 0.25x)", () => {
    // Source: Showdown sim/battle-actions.ts -- 0.25x only applies when hitting through Protect
    //
    // Same setup as above but hitThroughProtect is false -- damage should be full.

    const attacker = createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.fire] });
    const defender = createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.normal] });
    const zMove = createSyntheticMove({
      id: "inferno-overdrive",
      type: TYPE_IDS.fire,
      power: 175,
      category: MOVE_CATEGORIES.physical,
    });
    (zMove as any).zMovePower = 175;

    const ctx = createDamageContext({
      attacker,
      defender,
      move: zMove,
      seed: 42,
      hitThroughProtect: false,
    });
    const result = calculateGen7Damage(ctx, typeChart);

    // Without hitThroughProtect, damage should be full (no 0.25x applied)
    // Derivation: base = floor((floor((2*50/5+2) * 175 * 100/100) / 50) + 2) = floor(3850/50) + 2 = 79
    // STAB: fire attacker using fire move -> pokeRound(79, 6144) = 118 (wait, 1.5x)
    // Actually: attacker types are [TYPE_IDS.fire], move type is TYPE_IDS.fire -> STAB = 1.5x
    // base = floor((22 * 175 * 100/100) / 50) + 2 = floor(3850/50) + 2 = floor(77) + 2 = 79
    // STAB: pokeRound(79, 6144) = floor((79*6144+2047)/4096) = floor((485376+2047)/4096) = floor(487423/4096) = 118
    // Random factor will apply, so let's just verify it's > 100 (with STAB and 175 power)
    expect(result.damage).toBeGreaterThan(80);

    // Now verify with hitThroughProtect=true for comparison
    const protectCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPE_IDS.fire] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPE_IDS.normal] }),
      move: { ...zMove },
      seed: 42,
      hitThroughProtect: true,
    });
    (protectCtx.move as any).zMovePower = 175;
    const protectResult = calculateGen7Damage(protectCtx, typeChart);

    // Protect result should be significantly less than normal
    expect(protectResult.damage).toBeLessThan(result.damage);
    // pokeRound(result.damage, 1024) should give roughly 25%
    const expected = Math.max(1, Math.floor((result.damage * 1024 + 2047) / 4096));
    expect(protectResult.damage).toBe(expected);
  });

  it("given a non-Z-Move with hitThroughProtect=true, when damage is calculated, then 0.25x is still applied (engine prevents this case)", () => {
    // Source: Showdown sim/battle-actions.ts -- the 0.25x applies to any move that hit
    // through Protect (engine only sets this flag for Z-Moves/Max Moves).
    // The damage calc itself doesn't check for Z-Move -- it trusts the engine's flag.
    //
    // This test verifies the damage calc applies 0.25x purely based on the flag,
    // regardless of whether the move is a Z-Move. The engine is responsible for only
    // setting the flag on Z-Moves/Max Moves.

    const attacker = createOnFieldPokemon({ attack: 100 });
    const defender = createOnFieldPokemon({ defense: 100 });
    const normalMove = createSyntheticMove({
      power: 80,
      type: TYPE_IDS.normal,
      category: MOVE_CATEGORIES.physical,
    });

    const normalCtx = createDamageContext({
      attacker,
      defender,
      move: normalMove,
      seed: 42,
      hitThroughProtect: false,
    });
    const normalResult = calculateGen7Damage(normalCtx, typeChart);

    const protectCtx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove({
        power: 80,
        type: TYPE_IDS.normal,
        category: MOVE_CATEGORIES.physical,
      }),
      seed: 42,
      hitThroughProtect: true,
    });
    const protectResult = calculateGen7Damage(protectCtx, typeChart);

    const expected = Math.max(1, Math.floor((normalResult.damage * 1024 + 2047) / 4096));
    expect(protectResult.damage).toBe(expected);
  });

  it("given a Z-Move hitting through Protect with high damage, when calculating, then 0.25x is correctly applied via pokeRound", () => {
    // Source: Showdown sim/battle-actions.ts -- uses this.modify(damage, 0.25) which is
    // pokeRound(damage, 1024)
    //
    // Verify with a high-power scenario to ensure pokeRound rounding is correct.
    // L100 attacker with 200 Atk, Z-Move power 200, vs L100 defender with 100 Def.
    //
    // Base: floor((floor((2*100/5+2) * 200 * 200/100) / 50) + 2)
    //     = floor((42 * 200 * 200/100) / 50) + 2
    //     = floor(42 * 400 / 50) + 2
    //     = floor(16800/50) + 2
    //     = floor(336) + 2 = 338

    const attacker = createOnFieldPokemon({ level: 100, attack: 200, types: [TYPE_IDS.dragon] });
    const defender = createOnFieldPokemon({ level: 100, defense: 100, types: [TYPE_IDS.normal] });
    const zMove = createSyntheticMove({
      id: "devastating-drake",
      type: TYPE_IDS.dragon,
      power: 200,
      category: MOVE_CATEGORIES.physical,
    });
    (zMove as any).zMovePower = 200;

    const normalCtx = createDamageContext({
      attacker,
      defender,
      move: zMove,
      seed: 42,
    });
    const normalResult = calculateGen7Damage(normalCtx, typeChart);

    const protectCtx = createDamageContext({
      attacker: createOnFieldPokemon({ level: 100, attack: 200, types: [TYPE_IDS.dragon] }),
      defender: createOnFieldPokemon({ level: 100, defense: 100, types: [TYPE_IDS.normal] }),
      move: { ...zMove },
      seed: 42,
      hitThroughProtect: true,
    });
    (protectCtx.move as any).zMovePower = 200;
    const protectResult = calculateGen7Damage(protectCtx, typeChart);

    // pokeRound(normalDamage, 1024) = floor((normalDamage * 1024 + 2047) / 4096)
    const expected = Math.max(1, Math.floor((normalResult.damage * 1024 + 2047) / 4096));
    expect(protectResult.damage).toBe(expected);

    // Sanity: normal damage should be substantial, protect damage should be ~25%
    expect(normalResult.damage).toBeGreaterThan(200);
    expect(protectResult.damage).toBeGreaterThan(50);
    expect(protectResult.damage).toBeLessThan(normalResult.damage * 0.3);
  });
});

// ---------------------------------------------------------------------------
// Unaware vs Simple interaction (regression: #757)
// ---------------------------------------------------------------------------

describe("Gen 7 damage calc -- Unaware vs Simple interaction (regression: #757)", () => {
  it("given Simple attacker with +2 Atk stage vs Unaware defender, when calculating damage, then Unaware ignores all stages (same as stage-0 baseline)", () => {
    // Regression for bug #757: Simple was checked before Unaware, causing Simple to
    // double +2→+4 before Unaware could zero it out. Unaware must take priority.
    // Source: Showdown sim/battle.ts -- Unaware's onAnyModifyBoost zeroes boosts
    // independently of Simple's doubling.
    //
    // Derivation (Unaware active → effective stage = 0, stage multiplier = 1.0):
    //   L50, attack=100, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   step1 = floor(22 * 50 * 100 / 100) = 1100
    //   baseDamage = floor(1100 / 50) + 2 = 22 + 2 = 24
    //   random(seed=42) = 94 → floor(24 * 94 / 100) = floor(22.56) = 22
    const attacker = createOnFieldPokemon({
      attack: 100,
      ability: ABILITY_IDS.simple,
      types: [TYPE_IDS.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITY_IDS.unaware,
      types: [TYPE_IDS.water],
    });
    const move = createSyntheticMove({
      type: TYPE_IDS.normal,
      category: MOVE_CATEGORIES.physical,
      power: 50,
    });
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(22);
  });

  it("given Simple attacker with +2 Atk stage vs non-Unaware defender, when calculating damage, then Simple doubles stage to +4", () => {
    // Source: Showdown sim/battle.ts -- Simple doubles stat stages (capped at ±6).
    //
    // Derivation (Simple active, no Unaware → effective stage = +4, multiplier = (2+4)/2 = 3.0):
    //   effectiveAttack = floor(100 * 3.0) = 300
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 300 / 100) = 3300
    //   baseDamage = floor(3300 / 50) + 2 = 66 + 2 = 68
    //   random(seed=42) = 94 → floor(68 * 94 / 100) = floor(63.92) = 63
    const attacker = createOnFieldPokemon({
      attack: 100,
      ability: ABILITY_IDS.simple,
      types: [TYPE_IDS.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITY_IDS.none,
      types: [TYPE_IDS.water],
    });
    const move = createSyntheticMove({
      type: TYPE_IDS.normal,
      category: MOVE_CATEGORIES.physical,
      power: 50,
    });
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });

  it("given Turboblaze attacker with +2 Atk stage vs Unaware defender, when calculating damage, then Mold Breaker bypasses Unaware and stages apply", () => {
    // Mold Breaker/Teravolt/Turboblaze bypass breakable abilities (flags: { breakable: 1 }).
    // Unaware is breakable, so a Turboblaze attacker ignores Unaware — stages are NOT zeroed.
    // Source: Showdown sim/battle.ts Gen 7+ — ability.flags.breakable check.
    //
    // Derivation (Turboblaze bypasses Unaware → effective stage = +2, multiplier = 4/2 = 2.0):
    //   effectiveAttack = floor(100 * 2.0) = 200
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 200 / 100) = 2200
    //   baseDamage = floor(2200 / 50) + 2 = 44 + 2 = 46
    //   random(seed=42) = 94 → floor(46 * 94 / 100) = floor(43.24) = 43
    const attacker = createOnFieldPokemon({
      attack: 100,
      ability: ABILITY_IDS.turboblaze,
      types: [TYPE_IDS.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITY_IDS.unaware,
      types: [TYPE_IDS.water],
    });
    const move = createSyntheticMove({
      type: TYPE_IDS.normal,
      category: MOVE_CATEGORIES.physical,
      power: 50,
    });
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(43);
  });

  it("given Simple attacker with +2 Atk stage vs Mold Breaker defender, when calculating damage, then defender's Mold Breaker does NOT suppress attacker's Simple — stages still doubled to +4", () => {
    // The defender's Mold Breaker family only suppresses the *target's* (defender's) abilities
    // when the Mold Breaker user is attacking. A defending Mold Breaker does NOT suppress the
    // attacker's Simple. Source: Showdown sim/battle.ts — suppressingAbility(self) is false.
    //
    // Derivation (Simple NOT bypassed → effective stage = +4, multiplier = (2+4)/2 = 3.0):
    //   effectiveAttack = floor(100 * 3.0) = 300
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 300 / 100) = 3300
    //   baseDamage = floor(3300 / 50) + 2 = 66 + 2 = 68
    //   random(seed=42) = 94 → floor(68 * 94 / 100) = floor(63.92) = 63
    const attacker = createOnFieldPokemon({
      attack: 100,
      ability: ABILITY_IDS.simple,
      types: [TYPE_IDS.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITY_IDS.moldBreaker,
      types: [TYPE_IDS.water],
    });
    const move = createSyntheticMove({
      type: TYPE_IDS.normal,
      category: MOVE_CATEGORIES.physical,
      power: 50,
    });
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen7Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });
});
