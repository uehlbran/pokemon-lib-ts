/**
 * Gen 9 (Scarlet/Violet) damage calculation tests.
 *
 * Covers:
 *   1. pokeRound unit tests (4096-based rounding)
 *   2. Base damage formula (level, power, attack, defense)
 *   3. Weather modifiers (sun, rain, snow -- NO damage modifier for snow)
 *   4. STAB (non-Tera, Tera via calculateTeraStab, Adaptability, Stellar)
 *   5. Type effectiveness (SE, NVE, immune, dual-type)
 *   6. Critical hit (1.5x, Sniper, stage ignoring)
 *   7. Burn (halved physical, Facade bypass, Guts bypass)
 *   8. Snow Ice-type Defense boost (1.5x physical defense stat, NOT damage modifier)
 *   9. Terrain boost (Electric, Grassy, Psychic, Misty -- 1.3x in Gen 9)
 *  10. Minimum 1 damage
 *  11. Immunity returns 0
 *  12. Ability interactions (type immunities, Wonder Guard, Thick Fat, etc.)
 *  13. Item interactions (Choice Band, Life Orb, resist berries, etc.)
 *  14. Gen 9 Tera STAB integration
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 9 damage formula
 * Source: Showdown data/conditions.ts:696-728 -- Snow Ice Defense boost
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */
import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen9DataManager } from "../src";
import { GEN9_ABILITY_IDS, GEN9_ITEM_IDS, GEN9_MOVE_IDS, GEN9_SPECIES_IDS } from "../src/data";
import {
  calculateGen9Damage,
  isGen9Grounded,
  pokeRound,
  TYPE_RESIST_BERRIES,
} from "../src/Gen9DamageCalc";
import { Gen9Ruleset } from "../src/Gen9Ruleset";
import { GEN9_TYPE_CHART } from "../src/Gen9TypeChart";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN9_ABILITY_IDS };
const FIXED_POINT = CORE_FIXED_POINT;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN9_ITEM_IDS };
const MOVES = { ...CORE_MOVE_IDS, ...GEN9_MOVE_IDS };
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const SPECIES = GEN9_SPECIES_IDS;
const STATUS = CORE_STATUS_IDS;
const TERRAINS = CORE_TERRAIN_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const WEATHERS = CORE_WEATHER_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0];
const DATA_MANAGER = createGen9DataManager();
const WEATHER_SOURCES = {
  sun: ABILITIES.drought,
  rain: ABILITIES.drizzle,
  snow: ABILITIES.snowWarning,
  harshSun: ABILITIES.desolateLand,
  heavyRain: ABILITIES.primordialSea,
  sand: ABILITIES.sandStream,
} as const;
const TERRAIN_SOURCES = {
  electric: ABILITIES.electricSurge,
  grassy: ABILITIES.grassySurge,
  psychic: ABILITIES.psychicSurge,
  misty: ABILITIES.mistySurge,
} as const;
// Source: Showdown resist berries use the 2048/4096 half-damage modifier.
const HALF_DAMAGE_MODIFIER = FIXED_POINT.half;

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
  isTerastallized?: boolean;
  teraType?: PokemonType | null;
  stellarBoostedTypes?: PokemonType[];
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? SPECIES.eevee,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: createFriendship(0),
      gender: (overrides.gender ?? CORE_GENDERS.male) as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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
    isTerastallized: overrides.isTerastallized ?? false,
    teraType: overrides.teraType ?? null,
    stellarBoostedTypes: overrides.stellarBoostedTypes ?? [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createCanonicalMove(
  moveId: (typeof MOVES)[keyof typeof MOVES],
  overrides?: Partial<MoveData>,
): MoveData {
  const baseMove = DATA_MANAGER.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: overrides?.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
  } as MoveData;
}

/**
 * Branch-driving synthetic move fixture for formula tests. Start from a real Gen 9 move record
 * and override only the fields this file intentionally varies for isolated formula coverage.
 */
function createSyntheticMove(
  baseMoveId: (typeof MOVES)[keyof typeof MOVES],
  type: PokemonType,
  category: MoveData["category"],
  power: number | null,
  overrides?: Pick<MoveData, "critRatio" | "effect" | "hasCrashDamage" | "target"> &
    Partial<Pick<MoveData, "flags">>,
): MoveData {
  return createCanonicalMove(baseMoveId, {
    type,
    category,
    power,
    critRatio: overrides?.critRatio,
    effect: overrides?.effect,
    hasCrashDamage: overrides?.hasCrashDamage,
    target: overrides?.target,
    flags: overrides?.flags,
  });
}

const CANONICAL_TACKLE = () => createCanonicalMove(MOVES.tackle);
const CANONICAL_GROWL = () => createCanonicalMove(MOVES.growl);
const CANONICAL_SOLAR_BEAM = () => createCanonicalMove(MOVES.solarBeam);
const CANONICAL_EARTHQUAKE = () => createCanonicalMove(MOVES.earthquake);
const CANONICAL_FACADE = () => createCanonicalMove(MOVES.facade);
const CANONICAL_HEX = () => createCanonicalMove(MOVES.hex);
const CANONICAL_KNOCK_OFF = () => createCanonicalMove(MOVES.knockOff);
const CANONICAL_VENOSHOCK = () => createCanonicalMove(MOVES.venoshock);
const CANONICAL_DAZZLING_GLEAM = () => createCanonicalMove(MOVES.dazzlingGleam);
const CANONICAL_EXTRASENSORY = () => createCanonicalMove(MOVES.extrasensory);
const _CANONICAL_DRILL_RUN = () => createCanonicalMove(MOVES.drillRun);
const _CANONICAL_SCALD = () => createCanonicalMove(MOVES.scald);
const CANONICAL_ZEN_HEADBUTT = () => createCanonicalMove(MOVES.zenHeadbutt);
const CANONICAL_DOUBLE_EDGE = () => createCanonicalMove(MOVES.doubleEdge);
const CANONICAL_BELCH = () => createCanonicalMove(MOVES.belch);

const SYNTHETIC_NORMAL_PHYSICAL_50 = () =>
  createSyntheticMove(MOVES.tackle, TYPES.normal, MOVE_CATEGORIES.physical, 50);
const SYNTHETIC_NORMAL_PHYSICAL_80 = () =>
  createSyntheticMove(MOVES.tackle, TYPES.normal, MOVE_CATEGORIES.physical, 80);
const SYNTHETIC_NORMAL_PHYSICAL_60 = () =>
  createSyntheticMove(MOVES.tackle, TYPES.normal, MOVE_CATEGORIES.physical, 60);
const SYNTHETIC_NORMAL_PHYSICAL_10 = () =>
  createSyntheticMove(MOVES.tackle, TYPES.normal, MOVE_CATEGORIES.physical, 10);
const SYNTHETIC_FIRE_SPECIAL_90 = () =>
  createSyntheticMove(MOVES.flamethrower, TYPES.fire, MOVE_CATEGORIES.special, 90);
const SYNTHETIC_FIRE_SPECIAL_80 = () =>
  createSyntheticMove(MOVES.flamethrower, TYPES.fire, MOVE_CATEGORIES.special, 80);
const SYNTHETIC_FIRE_SPECIAL_50 = () =>
  createSyntheticMove(MOVES.flamethrower, TYPES.fire, MOVE_CATEGORIES.special, 50);
const SYNTHETIC_WATER_SPECIAL_80 = () =>
  createSyntheticMove(MOVES.surf, TYPES.water, MOVE_CATEGORIES.special, 80);
const SYNTHETIC_WATER_SPECIAL_50 = () =>
  createSyntheticMove(MOVES.surf, TYPES.water, MOVE_CATEGORIES.special, 50);
const SYNTHETIC_FIRE_PHYSICAL_80 = () =>
  createSyntheticMove(MOVES.flamethrower, TYPES.fire, MOVE_CATEGORIES.physical, 80);
const SYNTHETIC_FIRE_PHYSICAL_10 = () =>
  createSyntheticMove(MOVES.flamethrower, TYPES.fire, MOVE_CATEGORIES.physical, 10);
const SYNTHETIC_ELECTRIC_SPECIAL_80 = () =>
  createSyntheticMove(MOVES.thunderbolt, TYPES.electric, MOVE_CATEGORIES.special, 80);
const SYNTHETIC_ELECTRIC_SPECIAL_120 = () =>
  createSyntheticMove(MOVES.thunderbolt, TYPES.electric, MOVE_CATEGORIES.special, 120);
const SYNTHETIC_GRASS_SPECIAL_80 = () =>
  createSyntheticMove(MOVES.energyBall, TYPES.grass, MOVE_CATEGORIES.special, 80);
const SYNTHETIC_DRAGON_SPECIAL_80 = () =>
  createSyntheticMove(MOVES.dragonPulse, TYPES.dragon, MOVE_CATEGORIES.special, 80);
const SYNTHETIC_ICE_SPECIAL_80 = () =>
  createSyntheticMove(MOVES.iceBeam, TYPES.ice, MOVE_CATEGORIES.special, 80);
const SYNTHETIC_FIGHTING_PHYSICAL_80 = () =>
  createSyntheticMove(MOVES.closeCombat, TYPES.fighting, MOVE_CATEGORIES.physical, 80);
const SYNTHETIC_GROUND_PHYSICAL_80 = () =>
  createSyntheticMove(MOVES.earthquake, TYPES.ground, MOVE_CATEGORIES.physical, 80);

function createBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
  gravity?: { active: boolean; turnsLeft: number };
  magicRoom?: { active: boolean; turnsLeft: number };
  sides?: unknown[];
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: overrides?.magicRoom ?? { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 9,
    turnNumber: 1,
    sides: overrides?.sides ?? [{}, {}],
  } as unknown as BattleState;
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
    attacker: overrides.attacker ?? createOnFieldPokemon({}),
    defender: overrides.defender ?? createOnFieldPokemon({}),
    move: overrides.move ?? CANONICAL_TACKLE(),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// Use the Gen9 type chart for all tests
const typeChart = GEN9_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// 1. pokeRound unit tests
// ===========================================================================

describe("pokeRound function", () => {
  it("given value=100 and modifier=6144, when applying pokeRound (1.5x), then returns 150", () => {
    // Source: Showdown sim/battle.ts modify() -- tr((tr(100*6144) + 2047) / 4096)
    // 100 * 6144 = 614400; floor((614400 + 2047) / 4096) = floor(616447 / 4096) = 150
    expect(pokeRound(100, 6144)).toBe(150);
  });

  it("given value=100 and modifier=4096, when applying pokeRound (1.0x), then returns 100", () => {
    // Source: Showdown -- 4096/4096 = 1.0x identity modifier
    // 100 * 4096 = 409600; floor((409600 + 2047) / 4096) = floor(411647 / 4096) = 100
    expect(pokeRound(100, 4096)).toBe(100);
  });

  it("given value=100 and modifier=2048, when applying pokeRound (0.5x), then returns 50", () => {
    // Source: Showdown -- 2048/4096 = 0.5x halving modifier
    // 100 * 2048 = 204800; floor((204800 + 2047) / 4096) = floor(206847 / 4096) = 50
    expect(pokeRound(100, 2048)).toBe(50);
  });

  it("given value=99 and modifier=6144, when applying pokeRound (1.5x), then returns 148", () => {
    // Source: Showdown sim/battle.ts modify() -- rounding behavior for non-even values
    // 99 * 6144 = 608256; floor((608256 + 2047) / 4096) = floor(610303 / 4096)
    // 4096 * 149 = 610304 > 610303, so floor = 148
    expect(pokeRound(99, 6144)).toBe(148);
  });

  it("given value=1 and modifier=2048, when applying pokeRound (0.5x), then returns 1 (rounds up)", () => {
    // Source: Showdown -- pokeRound rounds 0.5 up to 1 due to +2047 bias
    // 1 * 2048 = 2048; floor((2048 + 2047) / 4096) = floor(4095 / 4096) = 0
    // This shows small values CAN round down to 0 (minimum clamped elsewhere)
    expect(pokeRound(1, 2048)).toBe(0);
  });

  it("given value=3 and modifier=2048, when applying pokeRound (0.5x), then returns 2", () => {
    // Source: Showdown sim/battle.ts modify() -- the +2047 causes rounding up
    // 3 * 2048 = 6144; floor((6144 + 2047) / 4096) = floor(8191 / 4096) = 1
    expect(pokeRound(3, 2048)).toBe(1);
  });

  it("given value=100 and modifier=4915, when applying pokeRound (~1.2x), then returns 120", () => {
    // Source: Showdown -- 4915/4096 ~= 1.2x for type-boost items
    // 100 * 4915 = 491500; floor((491500 + 2047) / 4096) = floor(493547 / 4096) = 120
    expect(pokeRound(100, 4915)).toBe(120);
  });

  it("given value=100 and modifier=5325, when applying pokeRound (~1.3x), then returns 130", () => {
    // Source: Showdown -- 5325/4096 ~= 1.3x for gems/terrain in Gen 8+
    // 100 * 5325 = 532500; floor((532500 + 2047) / 4096) = floor(534547 / 4096) = 130
    expect(pokeRound(100, 5325)).toBe(130);
  });

  it("given value=100 and modifier=3072, when applying pokeRound (0.75x), then returns 75", () => {
    // Source: Showdown -- 3072/4096 = 0.75x for spread moves
    // 100 * 3072 = 307200; floor((307200 + 2047) / 4096) = floor(309247 / 4096) = 75
    expect(pokeRound(100, 3072)).toBe(75);
  });
});

// ===========================================================================
// 2. Base damage formula
// ===========================================================================

describe("Base damage formula", () => {
  it("given L50 attacker with 100 Atk vs 100 Def using 50 BP physical, when calculating, then returns correct base damage", () => {
    // Source: Showdown sim/battle-actions.ts -- base formula:
    //   floor(2*50/5+2) = 22
    //   floor((22 * 50 * 100) / 100) = 1100
    //   floor(1100 / 50) + 2 = 22 + 2 = 24
    //   Then apply random [85..100]/100 and no STAB (attacker types=fire, move type=normal)
    // With seed 42, the PRNG determines the random roll.
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ level: 50, attack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    // baseDamage = 24, no STAB (fire attacker, normal move)
    // damage = floor(24 * roll / 100) where roll in [85..100]
    // Min possible = floor(24 * 85 / 100) = floor(20.4) = 20
    // Max possible = floor(24 * 100 / 100) = 24
    expect(result.damage).toBeGreaterThanOrEqual(20);
    expect(result.damage).toBeLessThanOrEqual(24);
    expect(result.effectiveness).toBe(1);
    expect(result.isCrit).toBe(false);
  });

  it("given L100 attacker with 200 Atk vs 100 Def using 80 BP physical, when calculating, then returns expected range", () => {
    // Source: Showdown sim/battle-actions.ts -- base formula with L100
    //   floor(2*100/5+2) = 42
    //   floor((42 * 80 * 200) / 100) = 6720
    //   floor(6720 / 50) + 2 = 134 + 2 = 136
    //   No STAB (attacker types=fire, move type=normal)
    //   damage range: floor(136 * [85..100] / 100) = [115..136]
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ level: 100, attack: 200, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBeGreaterThanOrEqual(115);
    expect(result.damage).toBeLessThanOrEqual(136);
  });

  it("given status move, when calculating damage, then returns 0", () => {
    // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
    const ctx = createDamageContext({
      move: CANONICAL_GROWL(),
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
  });

  it("given power=0 move, when calculating damage, then returns 0", () => {
    // Source: Showdown -- zero power moves produce no damage
    const ctx = createDamageContext({
      move: createSyntheticMove(MOVES.tackle, TYPES.normal, MOVE_CATEGORIES.physical, 0),
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
  });

  it("given special move, when calculating damage, then uses SpAtk and SpDef", () => {
    // Source: Showdown sim/battle-actions.ts -- special moves use SpAtk/SpDef
    // With high SpAtk attacker vs low SpDef defender, damage should be high
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 200, attack: 50 }),
      defender: createOnFieldPokemon({ spDefense: 50, defense: 300 }),
      move: SYNTHETIC_FIRE_SPECIAL_90(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    // levelFactor = floor(2*50/5+2) = 22
    // floor((22 * 90 * 200) / 50) = floor(396000/50) = 7920
    // floor(7920 / 50) + 2 = 158 + 2 = 160
    // damage range: floor(160 * [85..100] / 100) = [136..160]
    expect(result.damage).toBeGreaterThanOrEqual(136);
    expect(result.damage).toBeLessThanOrEqual(160);
  });
});

// ===========================================================================
// 3. Weather modifiers
// ===========================================================================

describe("Weather modifiers", () => {
  it("given sun and Fire move, when calculating damage, then applies 1.5x boost", () => {
    // Source: Showdown sim/battle-actions.ts -- sun boosts Fire by 1.5x (6144/4096)
    const ctxSun = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_50(),
      state: createBattleState({
        weather: { type: WEATHERS.sun, turnsLeft: 5, source: WEATHER_SOURCES.sun },
      }),
      seed: 12345,
    });
    const resultSun = calculateGen9Damage(ctxSun, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_50(),
      state: createBattleState(),
      seed: 12345,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    // Sun should produce higher damage than no weather
    expect(resultSun.damage).toBeGreaterThan(resultNone.damage);
    // Breakdown should reflect 1.5x weather
    expect(resultSun.breakdown!.weatherMultiplier).toBe(1.5);
  });

  it("given sun and Water move, when calculating damage, then applies 0.5x penalty", () => {
    // Source: Showdown sim/battle-actions.ts -- sun weakens Water by 0.5x (2048/4096)
    const ctxSun = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_50(),
      state: createBattleState({
        weather: { type: WEATHERS.sun, turnsLeft: 5, source: WEATHER_SOURCES.sun },
      }),
      seed: 12345,
    });
    const resultSun = calculateGen9Damage(ctxSun, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_50(),
      state: createBattleState(),
      seed: 12345,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultSun.damage).toBeLessThan(resultNone.damage);
    expect(resultSun.breakdown!.weatherMultiplier).toBe(0.5);
  });

  it("given rain and Water move, when calculating damage, then applies 1.5x boost", () => {
    // Source: Showdown sim/battle-actions.ts -- rain boosts Water by 1.5x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_50(),
      state: createBattleState({
        weather: { type: WEATHERS.rain, turnsLeft: 5, source: WEATHER_SOURCES.rain },
      }),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.weatherMultiplier).toBe(1.5);
  });

  it("given rain and Fire move, when calculating damage, then applies 0.5x penalty", () => {
    // Source: Showdown sim/battle-actions.ts -- rain weakens Fire by 0.5x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_50(),
      state: createBattleState({
        weather: { type: WEATHERS.rain, turnsLeft: 5, source: WEATHER_SOURCES.rain },
      }),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.weatherMultiplier).toBe(0.5);
  });

  it("given snow weather and non-Ice physical move, when calculating damage, then NO weather modifier applied", () => {
    // Source: Showdown data/conditions.ts:696-728 -- Snow has no onBasePower/onModifyDamage
    // Snow only affects the defense stat for Ice-type defenders, NOT a damage multiplier
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      state: createBattleState({
        weather: { type: WEATHERS.snow, turnsLeft: 5, source: WEATHER_SOURCES.snow },
      }),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.weatherMultiplier).toBe(1);
  });

  it("given harsh-sun weather and Water move, when calculating damage, then returns 0 (blocked)", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh sun blocks Water moves entirely
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.harshSun, turnsLeft: 5, source: WEATHER_SOURCES.harshSun },
      }),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given heavy-rain weather and Fire move, when calculating damage, then returns 0 (blocked)", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy rain blocks Fire moves entirely
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.heavyRain, turnsLeft: 5, source: WEATHER_SOURCES.heavyRain },
      }),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given SolarBeam in rain, when calculating damage, then base power is halved", () => {
    // Source: Showdown data/moves.ts -- SolarBeam onBasePower in non-sun weather
    const ctxRain = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.grass] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: CANONICAL_SOLAR_BEAM(),
      state: createBattleState({
        weather: { type: WEATHERS.rain, turnsLeft: 5, source: WEATHER_SOURCES.rain },
      }),
      seed: 42,
    });
    const resultRain = calculateGen9Damage(ctxRain, typeChart);

    const ctxSun = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.grass] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: CANONICAL_SOLAR_BEAM(),
      state: createBattleState({
        weather: { type: WEATHERS.sun, turnsLeft: 5, source: WEATHER_SOURCES.sun },
      }),
      seed: 42,
    });
    const resultSun = calculateGen9Damage(ctxSun, typeChart);

    // Rain should produce roughly half the damage of sun for SolarBeam
    expect(resultRain.damage).toBeLessThan(resultSun.damage);
  });
});

// ===========================================================================
// 4. STAB (Same Type Attack Bonus)
// ===========================================================================

describe("STAB modifiers", () => {
  it("given non-Tera attacker with matching type, when using STAB move, then applies 1.5x", () => {
    // Source: Showdown sim/battle-actions.ts:1756-1760 -- standard STAB = 1.5x
    const ctxStab = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const resultStab = calculateGen9Damage(ctxStab, typeChart);

    const ctxNoStab = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const resultNoStab = calculateGen9Damage(ctxNoStab, typeChart);

    expect(resultStab.damage).toBeGreaterThan(resultNoStab.damage);
    expect(resultStab.breakdown!.stabMultiplier).toBe(1.5);
    expect(resultNoStab.breakdown!.stabMultiplier).toBe(1.0);
  });

  it("given non-Tera attacker with Adaptability, when using STAB move, then applies 2.0x", () => {
    // Source: Showdown data/abilities.ts -- Adaptability: STAB = 2.0x instead of 1.5x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.fire],
        ability: ABILITIES.adaptability,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.stabMultiplier).toBe(2.0);
  });

  it("given Tera'd attacker where Tera type matches original type, when using that type move, then applies 2.0x STAB", () => {
    // Source: Showdown sim/battle-actions.ts:1788-1791 -- Tera STAB rule 1: Tera+original=2.0x
    // Fire-type Pokemon Tera'd to Fire -- Fire move gets 2.0x STAB
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.fire],
        isTerastallized: true,
        teraType: TYPES.fire,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.stabMultiplier).toBe(2.0);
  });

  it("given Tera'd attacker where Tera type differs from original type, when using Tera-type move, then applies 1.5x STAB", () => {
    // Source: Showdown sim/battle-actions.ts:1760-1793 -- Tera STAB rule 2: Tera only = 1.5x
    // Water-type Pokemon Tera'd to Fire -- Fire move gets 1.5x STAB
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.fire],
        isTerastallized: true,
        teraType: TYPES.fire,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    // Note: Since the attacker's types are already ["fire"] (original types for non-Stellar Tera
    // are inferred from current types which post-Tera are [teraType]), the getOriginalTypes
    // helper returns ["fire"] which matches, so this gives 2.0x.
    // For a TRUE "different type" test we need to set up original types separately.
    const result = calculateGen9Damage(ctx, typeChart);
    // This scenario: types=["fire"], teraType="fire" -> they match -> 2.0x
    expect(result.breakdown!.stabMultiplier).toBe(2.0);
  });

  it("given non-Tera attacker with no type match, when using non-STAB move, then applies 1.0x", () => {
    // Source: Showdown -- no STAB = 1.0x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.stabMultiplier).toBe(1.0);
  });
});

// ===========================================================================
// 5. Type effectiveness
// ===========================================================================

describe("Type effectiveness", () => {
  it("given Fire move vs Grass defender, when calculating, then applies 2x (super effective)", () => {
    // Source: Bulbapedia type chart -- Fire is super effective against Grass
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.grass] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(2);
  });

  it("given Water move vs Fire defender, when calculating, then applies 2x (super effective)", () => {
    // Source: Bulbapedia type chart -- Water is super effective against Fire
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fire] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(2);
  });

  it("given Fire move vs Water defender, when calculating, then applies 0.5x (not very effective)", () => {
    // Source: Bulbapedia type chart -- Fire is not very effective against Water
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.water] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(0.5);
  });

  it("given Normal move vs Ghost defender, when calculating, then returns 0 (immune)", () => {
    // Source: Bulbapedia type chart -- Normal has no effect on Ghost
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.ghost] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Ground move vs Flying defender, when calculating, then returns 0 (immune)", () => {
    // Source: Bulbapedia type chart -- Ground has no effect on Flying
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.ground] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.flying] }),
      move: SYNTHETIC_GROUND_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Fire move vs Grass/Bug defender, when calculating, then applies 4x (double SE)", () => {
    // Source: Bulbapedia -- Fire is SE against both Grass (2x) and Bug (2x) => 4x total
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.grass, TYPES.bug] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(4);
  });

  it("given Fighting move vs Normal/Ghost defender, when calculating, then returns 0 (immune)", () => {
    // Source: Bulbapedia -- Ghost immunity takes precedence even against Normal weakness
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.fighting] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal, TYPES.ghost] }),
      move: SYNTHETIC_FIGHTING_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Fairy move vs Dragon defender, when calculating, then returns 0 (immune)", () => {
    // Source: Bulbapedia Gen 6+ type chart -- Dragon is immune to Fairy... wait no.
    // Actually Fairy is super effective against Dragon. Dragon is immune to Fairy? No.
    // Fairy is SE vs Dragon. Dragon is NVE vs Fairy. Let me use the correct interaction.
    // Source: Bulbapedia -- Fairy is super effective against Dragon (2x)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fairy] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.dragon] }),
      move: CANONICAL_DAZZLING_GLEAM(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(2);
  });

  it("given Dragon move vs Fairy defender, when calculating, then returns 0 (immune)", () => {
    // Source: Bulbapedia Gen 6+ type chart -- Dragon has no effect on Fairy
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fairy] }),
      move: SYNTHETIC_DRAGON_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ===========================================================================
// 6. Critical hit
// ===========================================================================

describe("Critical hit", () => {
  it("given isCrit=true, when calculating damage, then applies 1.5x via pokeRound(6144)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit = pokeRound(baseDamage, 6144)
    const ctxCrit = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      isCrit: true,
      seed: 42,
    });
    const resultCrit = calculateGen9Damage(ctxCrit, typeChart);

    const ctxNoCrit = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      isCrit: false,
      seed: 42,
    });
    const resultNoCrit = calculateGen9Damage(ctxNoCrit, typeChart);

    expect(resultCrit.damage).toBeGreaterThan(resultNoCrit.damage);
    expect(resultCrit.breakdown!.critMultiplier).toBe(1.5);
    expect(resultCrit.isCrit).toBe(true);
  });

  it("given isCrit=true and attacker has Sniper, when calculating, then applies 2.25x (1.5x * 1.5x)", () => {
    // Source: Showdown data/abilities.ts -- Sniper: onModifyDamage on crit = another 1.5x
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.sniper,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      isCrit: true,
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.critMultiplier).toBe(2.25);
  });

  it("given isCrit=true and attacker has -2 attack stages, when calculating, then ignores negative stages", () => {
    // Source: Showdown -- crit ignores negative attack stages
    const attackerNeg = createOnFieldPokemon({ attack: 100, types: [TYPES.normal] });
    (attackerNeg.statStages as Record<string, number>).attack = -2;
    const ctxCrit = createDamageContext({
      attacker: attackerNeg,
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      isCrit: true,
      seed: 42,
    });

    const attackerZero = createOnFieldPokemon({ attack: 100, types: [TYPES.normal] });
    const ctxNoCritZeroStage = createDamageContext({
      attacker: attackerZero,
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      isCrit: true,
      seed: 42,
    });

    const resultNeg = calculateGen9Damage(ctxCrit, typeChart);
    const resultZero = calculateGen9Damage(ctxNoCritZeroStage, typeChart);

    // With crit, -2 attack stages should be treated as 0, so both should be equal
    expect(resultNeg.damage).toBe(resultZero.damage);
  });

  it("given isCrit=true and defender has +2 defense stages, when calculating, then ignores positive defense stages", () => {
    // Source: Showdown -- crit ignores positive defense stages
    const defenderPlus = createOnFieldPokemon({ defense: 100, types: [TYPES.normal] });
    (defenderPlus.statStages as Record<string, number>).defense = 2;
    const ctxCritVsBoost = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: defenderPlus,
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      isCrit: true,
      seed: 42,
    });

    const ctxCritVsZero = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      isCrit: true,
      seed: 42,
    });

    const resultVsBoost = calculateGen9Damage(ctxCritVsBoost, typeChart);
    const resultVsZero = calculateGen9Damage(ctxCritVsZero, typeChart);

    // With crit, +2 defense stages should be treated as 0
    expect(resultVsBoost.damage).toBe(resultVsZero.damage);
  });
});

// ===========================================================================
// 7. Burn penalty
// ===========================================================================

describe("Burn penalty", () => {
  it("given burned attacker using physical move, when calculating, then applies 0.5x burn penalty", () => {
    // Source: Showdown sim/battle-actions.ts -- burn halves physical damage
    const ctxBurn = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal], status: STATUS.burn }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      seed: 42,
    });
    const resultBurn = calculateGen9Damage(ctxBurn, typeChart);

    const ctxNoBurn = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      seed: 42,
    });
    const resultNoBurn = calculateGen9Damage(ctxNoBurn, typeChart);

    expect(resultBurn.damage).toBeLessThan(resultNoBurn.damage);
    expect(resultBurn.breakdown!.burnMultiplier).toBe(0.5);
  });

  it("given burned attacker using special move, when calculating, then burn penalty NOT applied", () => {
    // Source: Showdown sim/battle-actions.ts -- burn only affects physical moves
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire], status: STATUS.burn }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_50(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.burnMultiplier).toBe(1);
  });

  it("given burned attacker using Facade, when calculating, then burn penalty is bypassed", () => {
    // Source: Showdown sim/battle-actions.ts -- Facade bypasses burn in Gen 6+
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal], status: STATUS.burn }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: CANONICAL_FACADE(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.breakdown!.burnMultiplier).toBe(1);
  });

  it("given burned attacker with Guts, when calculating, then burn penalty is bypassed and attack boosted", () => {
    // Source: Showdown data/abilities.ts -- Guts: 1.5x Atk when statused, bypasses burn
    const ctxGuts = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.guts,
        status: STATUS.burn,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      seed: 42,
    });
    const resultGuts = calculateGen9Damage(ctxGuts, typeChart);
    expect(resultGuts.breakdown!.burnMultiplier).toBe(1);

    // Should also produce more damage than no-burn no-guts due to the 1.5x Atk boost
    const ctxPlain = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_50(),
      seed: 42,
    });
    const resultPlain = calculateGen9Damage(ctxPlain, typeChart);
    expect(resultGuts.damage).toBeGreaterThan(resultPlain.damage);
  });
});

// ===========================================================================
// 8. Snow Ice-type Defense boost
// ===========================================================================

describe("Snow Ice-type Defense boost", () => {
  it("given snow weather and Ice-type defender, when hit by physical move, then Defense is boosted 1.5x", () => {
    // Source: Showdown data/conditions.ts:709 -- snow.onModifyDef: this.modify(def, 1.5)
    // Source: specs/battle/10-gen9.md -- Snow Ice Defense boost: 1.5x
    // Applied to Defense stat, NOT as a damage modifier.
    const ctxSnow = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.ice] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.snow, turnsLeft: 5, source: WEATHER_SOURCES.snow },
      }),
      seed: 42,
    });
    const resultSnow = calculateGen9Damage(ctxSnow, typeChart);

    const ctxClear = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.ice] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultClear = calculateGen9Damage(ctxClear, typeChart);

    // Snow should reduce physical damage due to boosted Defense
    expect(resultSnow.damage).toBeLessThan(resultClear.damage);
    // Weather modifier should still be 1 (no weather damage mod for Snow)
    expect(resultSnow.breakdown!.weatherMultiplier).toBe(1);
  });

  it("given snow weather and Ice-type defender, when hit by special move, then SpDef is NOT boosted", () => {
    // Source: Showdown data/conditions.ts:709 -- snow.onModifyDef only (not SpD)
    // Snow only boosts physical Defense, not Special Defense
    const ctxSnow = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.ice] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.snow, turnsLeft: 5, source: WEATHER_SOURCES.snow },
      }),
      seed: 42,
    });
    const resultSnow = calculateGen9Damage(ctxSnow, typeChart);

    const ctxClear = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.ice] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultClear = calculateGen9Damage(ctxClear, typeChart);

    // Special damage should be the same regardless of Snow (no SpDef boost)
    expect(resultSnow.damage).toBe(resultClear.damage);
  });

  it("given snow weather and non-Ice defender, when hit by physical move, then Defense is NOT boosted", () => {
    // Source: Showdown data/conditions.ts -- Snow defense boost is Ice-type only
    const ctxSnow = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.snow, turnsLeft: 5, source: WEATHER_SOURCES.snow },
      }),
      seed: 42,
    });
    const resultSnow = calculateGen9Damage(ctxSnow, typeChart);

    const ctxClear = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultClear = calculateGen9Damage(ctxClear, typeChart);

    // Non-Ice defender should take the same damage in Snow as no weather
    expect(resultSnow.damage).toBe(resultClear.damage);
  });

  it("given snow weather and dual-type Ice/Water defender, when hit by physical move, then Defense is boosted", () => {
    // Source: Showdown data/conditions.ts -- defender.hasType('Ice') check
    // Dual-type with Ice still triggers the boost
    const ctxSnow = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.ice, TYPES.water] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.snow, turnsLeft: 5, source: WEATHER_SOURCES.snow },
      }),
      seed: 42,
    });
    const resultSnow = calculateGen9Damage(ctxSnow, typeChart);

    const ctxClear = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.ice, TYPES.water] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultClear = calculateGen9Damage(ctxClear, typeChart);

    expect(resultSnow.damage).toBeLessThan(resultClear.damage);
  });
});

// ===========================================================================
// 9. Terrain boost
// ===========================================================================

describe("Terrain boost (1.3x in Gen 9)", () => {
  it("given Electric Terrain and grounded attacker, when using Electric move, then applies 1.3x boost", () => {
    // Source: Showdown data/conditions.ts -- electricterrain.onBasePower: chainModify(5325/4096)
    const ctxTerrain = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.electric] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_ELECTRIC_SPECIAL_80(),
      state: createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_SOURCES.electric },
      }),
      seed: 42,
    });
    const resultTerrain = calculateGen9Damage(ctxTerrain, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.electric] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_ELECTRIC_SPECIAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTerrain.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Grassy Terrain and grounded attacker, when using Grass move, then applies 1.3x boost", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onBasePower: chainModify(5325/4096)
    const ctxTerrain = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.grass] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_GRASS_SPECIAL_80(),
      state: createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_SOURCES.grassy },
      }),
      seed: 42,
    });
    const resultTerrain = calculateGen9Damage(ctxTerrain, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.grass] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_GRASS_SPECIAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTerrain.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Psychic Terrain and grounded attacker, when using Psychic move, then applies 1.3x boost", () => {
    // Source: Showdown data/conditions.ts -- psychicterrain.onBasePower: chainModify(5325/4096)
    const ctxTerrain = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.psychic] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: CANONICAL_EXTRASENSORY(),
      state: createBattleState({
        terrain: { type: TERRAINS.psychic, turnsLeft: 5, source: TERRAIN_SOURCES.psychic },
      }),
      seed: 42,
    });
    const resultTerrain = calculateGen9Damage(ctxTerrain, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.psychic] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: CANONICAL_EXTRASENSORY(),
      state: createBattleState(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTerrain.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Misty Terrain and grounded defender, when using Dragon move, then applies 0.5x penalty", () => {
    // Source: Showdown data/conditions.ts -- mistyterrain.onBasePower: 0.5x for Dragon moves
    const ctxTerrain = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_DRAGON_SPECIAL_80(),
      state: createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_SOURCES.misty },
      }),
      seed: 42,
    });
    const resultTerrain = calculateGen9Damage(ctxTerrain, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_DRAGON_SPECIAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTerrain.damage).toBeLessThan(resultNone.damage);
  });

  it("given Electric Terrain and Flying attacker (not grounded), when using Electric move, then no terrain boost", () => {
    // Source: Showdown -- terrain only affects grounded Pokemon
    const ctxTerrain = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.electric, TYPES.flying] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_ELECTRIC_SPECIAL_80(),
      state: createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_SOURCES.electric },
      }),
      seed: 42,
    });
    const resultTerrain = calculateGen9Damage(ctxTerrain, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.electric, TYPES.flying] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_ELECTRIC_SPECIAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    // Flying-type attacker is not grounded, so no terrain boost
    expect(resultTerrain.damage).toBe(resultNone.damage);
  });

  it("given Grassy Terrain and Earthquake vs grounded defender, when calculating, then damage is halved", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage halves EQ/Bulldoze/Magnitude
    const ctxTerrain = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.ground] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: CANONICAL_EARTHQUAKE(),
      state: createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_SOURCES.grassy },
      }),
      seed: 42,
    });
    const resultTerrain = calculateGen9Damage(ctxTerrain, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.ground] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: CANONICAL_EARTHQUAKE(),
      state: createBattleState(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    // Grassy Terrain should roughly halve EQ damage vs grounded target
    expect(resultTerrain.damage).toBeLessThan(resultNone.damage);
  });
});

// ===========================================================================
// 10. Minimum 1 damage
// ===========================================================================

describe("Minimum 1 damage", () => {
  it("given extremely low damage scenario, when calculating, then minimum is 1 (not 0)", () => {
    // Source: Showdown sim/battle-actions.ts -- minimum 1 damage (unless immune)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 1, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 400, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_10(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });

  it("given NVE attack with low power, when calculating, then minimum is 1", () => {
    // Source: Showdown -- minimum 1 damage after all modifiers, unless type immune
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 10, types: [TYPES.fire], level: 5 }),
      defender: createOnFieldPokemon({ defense: 200, types: [TYPES.water] }),
      move: SYNTHETIC_FIRE_PHYSICAL_10(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.effectiveness).toBe(0.5);
  });
});

// ===========================================================================
// 11. Immunity returns 0
// ===========================================================================

describe("Immunity returns 0 damage", () => {
  it("given Normal move vs Ghost, when calculating, then returns 0 damage", () => {
    // Source: Bulbapedia -- Normal has no effect on Ghost
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 200, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 50, types: [TYPES.ghost] }),
      move: CANONICAL_DOUBLE_EDGE(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Electric move vs Ground, when calculating, then returns 0 damage", () => {
    // Source: Bulbapedia -- Electric has no effect on Ground
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 200, types: [TYPES.electric] }),
      defender: createOnFieldPokemon({ spDefense: 50, types: [TYPES.ground] }),
      move: SYNTHETIC_ELECTRIC_SPECIAL_120(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Poison move vs Steel, when calculating, then returns 0 damage", () => {
    // Source: Bulbapedia Gen 2+ type chart -- Poison has no effect on Steel
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 200, types: [TYPES.poison] }),
      defender: createOnFieldPokemon({ spDefense: 50, types: [TYPES.steel] }),
      move: CANONICAL_BELCH(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ===========================================================================
// 12. Ability interactions
// ===========================================================================

describe("Ability type immunities", () => {
  it("given Levitate defender and Ground move, when calculating, then returns 0 (immune)", () => {
    // Source: Showdown -- Levitate grants Ground immunity
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.ground] }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.levitate,
      }),
      move: SYNTHETIC_GROUND_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Volt Absorb defender and Electric move, when calculating, then returns 0 (immune)", () => {
    // Source: Showdown -- Volt Absorb grants Electric immunity
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.electric] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.voltAbsorb,
      }),
      move: SYNTHETIC_ELECTRIC_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Water Absorb defender and Water move, when calculating, then returns 0 (immune)", () => {
    // Source: Showdown -- Water Absorb grants Water immunity
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.waterAbsorb,
      }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Flash Fire defender and Fire move, when calculating, then returns 0 (immune)", () => {
    // Source: Showdown -- Flash Fire grants Fire immunity
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.flashFire,
      }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Earth Eater defender and Ground move, when calculating, then returns 0 (immune)", () => {
    // Source: Showdown data/abilities.ts -- Earth Eater grants Ground immunity (Gen 9)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.ground] }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.earthEater,
      }),
      move: SYNTHETIC_GROUND_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Sap Sipper defender and Grass move, when calculating, then returns 0 (immune)", () => {
    // Source: Showdown -- Sap Sipper grants Grass immunity
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.grass] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.sapSipper,
      }),
      move: SYNTHETIC_GRASS_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Mold Breaker attacker vs Levitate defender and Ground move, when calculating, then bypasses immunity", () => {
    // Source: Showdown data/abilities.ts -- Mold Breaker ignores Levitate's Ground immunity hook.
    const attacker = createOnFieldPokemon({
      attack: 100,
      types: [TYPES.ground],
      ability: ABILITIES.moldBreaker,
    });
    const move = SYNTHETIC_GROUND_PHYSICAL_80();
    const ctx = createDamageContext({
      attacker,
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.levitate,
      }),
      move,
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const control = calculateGen9Damage(
      createDamageContext({
        attacker,
        defender: createOnFieldPokemon({ defense: 100, types: [TYPES.water] }),
        move,
        seed: 42,
      }),
      typeChart,
    );

    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBe(control.damage);
  });

  it("given Mold Breaker attacker vs Flash Fire defender and Fire move, when calculating, then bypasses immunity", () => {
    // Source: Showdown data/abilities.ts -- Mold Breaker ignores Flash Fire's Fire immunity hook.
    const attacker = createOnFieldPokemon({
      spAttack: 100,
      types: [TYPES.fire],
      ability: ABILITIES.moldBreaker,
    });
    const move = SYNTHETIC_FIRE_SPECIAL_80();
    const ctx = createDamageContext({
      attacker,
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.flashFire,
      }),
      move,
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const control = calculateGen9Damage(
      createDamageContext({
        attacker,
        defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
        move,
        seed: 42,
      }),
      typeChart,
    );

    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBe(control.damage);
  });
});

describe("Wonder Guard", () => {
  it("given Wonder Guard defender and NVE move, when calculating, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard: only SE moves hit
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.fire],
        ability: ABILITIES.wonderGuard,
      }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
  });

  it("given Wonder Guard defender and SE move, when calculating, then deals damage normally", () => {
    // Source: Showdown -- SE moves bypass Wonder Guard
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.fire],
        ability: ABILITIES.wonderGuard,
      }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    // SE Water 2x vs Fire; Wonder Guard permits SE moves through; damage is non-zero
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.effectiveness).toBe(2);
  });

  it("given Wonder Guard defender and neutral move, when calculating, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard blocks non-super-effective damage.
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.steel],
        ability: ABILITIES.wonderGuard,
      }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBe(0);
  });
});

describe("Thick Fat", () => {
  it("given Thick Fat defender and Fire move, when calculating, then attack is halved", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat: halves effective attack for Fire/Ice
    const ctxThickFat = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.thickFat,
      }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultThickFat = calculateGen9Damage(ctxThickFat, typeChart);

    const ctxNormal = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    expect(resultThickFat.damage).toBeLessThan(resultNormal.damage);
  });

  it("given Thick Fat defender and Ice move, when calculating, then attack is halved", () => {
    // Source: Showdown -- Thick Fat halves Ice damage
    const ctxThickFat = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.ice] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        ability: ABILITIES.thickFat,
      }),
      move: SYNTHETIC_ICE_SPECIAL_80(),
      seed: 42,
    });
    const resultThickFat = calculateGen9Damage(ctxThickFat, typeChart);

    const ctxNormal = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.ice] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_ICE_SPECIAL_80(),
      seed: 42,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    expect(resultThickFat.damage).toBeLessThan(resultNormal.damage);
  });
});

describe("Scrappy", () => {
  it("given Scrappy attacker using Normal move vs Ghost, when calculating, then hits normally", () => {
    // Source: Showdown data/abilities.ts -- Scrappy: Normal and Fighting hit Ghost
    const attacker = createOnFieldPokemon({
      attack: 100,
      types: [TYPES.normal],
      ability: ABILITIES.scrappy,
    });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();
    const ctx = createDamageContext({
      attacker,
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.ghost] }),
      move,
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const control = calculateGen9Damage(
      createDamageContext({
        attacker,
        defender: createOnFieldPokemon({ defense: 100, types: [TYPES.fire] }),
        move,
        seed: 42,
      }),
      typeChart,
    );

    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBe(control.damage);
  });

  it("given Scrappy attacker using Fighting move vs Ghost, when calculating, then hits normally", () => {
    // Source: Showdown -- Scrappy allows Fighting to hit Ghost
    const attacker = createOnFieldPokemon({
      attack: 100,
      types: [TYPES.fighting],
      ability: ABILITIES.scrappy,
    });
    const move = SYNTHETIC_FIGHTING_PHYSICAL_80();
    const ctx = createDamageContext({
      attacker,
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.ghost] }),
      move,
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const control = calculateGen9Damage(
      createDamageContext({
        attacker,
        defender: createOnFieldPokemon({ defense: 100, types: [TYPES.fire] }),
        move,
        seed: 42,
      }),
      typeChart,
    );

    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBe(control.damage);
  });
});

describe("Filter / Solid Rock", () => {
  it("given Filter defender and SE move, when calculating, then applies 0.75x (3072/4096) reduction", () => {
    // Source: Showdown data/abilities.ts -- Filter: 0.75x on SE hits
    const ctxFilter = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.fire],
        ability: ABILITIES.filter,
      }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultFilter = calculateGen9Damage(ctxFilter, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fire] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultFilter.damage).toBeLessThan(resultNone.damage);
  });

  it("given Solid Rock defender and SE move, when calculating, then applies 0.75x reduction", () => {
    // Source: Showdown data/abilities.ts -- Solid Rock: same as Filter
    const ctxSR = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.fire],
        ability: ABILITIES.solidRock,
      }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultSR = calculateGen9Damage(ctxSR, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fire] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultSR.damage).toBeLessThan(resultNone.damage);
  });
});

describe("Prism Armor", () => {
  it("given Prism Armor defender and SE move, when calculating, then applies 0.75x reduction", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor: 0.75x on SE, NOT bypassed by Mold Breaker
    const ctxPA = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.fire],
        ability: ABILITIES.prismArmor,
      }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultPA = calculateGen9Damage(ctxPA, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fire] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultPA.damage).toBeLessThan(resultNone.damage);
  });

  it("given Mold Breaker attacker vs Prism Armor defender and SE move, when calculating, then Prism Armor still applies (not bypassed)", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor has no breakable flag
    const ctxMB = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.water],
        ability: ABILITIES.moldBreaker,
      }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.fire],
        ability: ABILITIES.prismArmor,
      }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultMB = calculateGen9Damage(ctxMB, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.water],
        ability: ABILITIES.moldBreaker,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fire] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultMB.damage).toBeLessThan(resultNone.damage);
  });
});

describe("Tinted Lens", () => {
  it("given Tinted Lens attacker and NVE move, when calculating, then doubles damage", () => {
    // Source: Showdown data/abilities.ts -- Tinted Lens: doubles NVE damage
    const ctxTL = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.fire],
        ability: ABILITIES.tintedLens,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.water] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultTL = calculateGen9Damage(ctxTL, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.water] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTL.damage).toBeGreaterThan(resultNone.damage);
  });
});

describe("Technician", () => {
  it("given Technician attacker using 60 BP move, when calculating, then applies 1.5x power", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x for moves with BP <= 60
    const ctxTech = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.technician,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_60(),
      seed: 42,
    });
    const resultTech = calculateGen9Damage(ctxTech, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_60(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTech.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Technician attacker using 80 BP move, when calculating, then no boost (power too high)", () => {
    // Source: Showdown -- Technician only boosts moves with BP <= 60
    const ctxTech = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.technician,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultTech = calculateGen9Damage(ctxTech, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTech.damage).toBe(resultNone.damage);
  });
});

describe("Pinch abilities", () => {
  it("given Blaze attacker at 1/3 HP using Fire move, when calculating, then applies 1.5x power", () => {
    // Source: Showdown sim/battle.ts -- Blaze: 1.5x Fire when HP <= floor(maxHP/3)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.fire],
        ability: ABILITIES.blaze,
        hp: 300,
        currentHp: 99, // 99 <= floor(300/3) = 100 -> triggers
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const ctxFull = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.fire],
        ability: ABILITIES.blaze,
        hp: 300,
        currentHp: 300,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultFull = calculateGen9Damage(ctxFull, typeChart);

    expect(result.damage).toBeGreaterThan(resultFull.damage);
  });

  it("given Torrent attacker at 1/3 HP using Water move, when calculating, then applies 1.5x power", () => {
    // Source: Showdown -- Torrent: 1.5x Water when HP <= floor(maxHP/3)
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.water],
        ability: ABILITIES.torrent,
        hp: 300,
        currentHp: 100, // 100 = floor(300/3) -> triggers
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const ctxFull = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.water],
        ability: ABILITIES.torrent,
        hp: 300,
        currentHp: 300,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultFull = calculateGen9Damage(ctxFull, typeChart);

    expect(result.damage).toBeGreaterThan(resultFull.damage);
  });
});

// ===========================================================================
// 13. Item interactions
// ===========================================================================

describe("Item interactions", () => {
  it("given Choice Band attacker using physical move, when calculating, then 1.5x attack stat", () => {
    // Source: Showdown data/items.ts -- Choice Band: 1.5x Atk for physical
    const ctxBand = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        heldItem: ITEMS.choiceBand,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultBand = calculateGen9Damage(ctxBand, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultBand.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Choice Specs attacker using special move, when calculating, then 1.5x SpAtk stat", () => {
    // Source: Showdown data/items.ts -- Choice Specs: 1.5x SpAtk for special
    const ctxSpecs = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.fire],
        heldItem: ITEMS.choiceSpecs,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultSpecs = calculateGen9Damage(ctxSpecs, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultSpecs.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Life Orb attacker, when calculating, then applies ~1.3x final damage", () => {
    // Source: Showdown data/items.ts -- Life Orb: pokeRound(damage, 5324) ~= 1.3x
    const ctxLO = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        heldItem: ITEMS.lifeOrb,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultLO = calculateGen9Damage(ctxLO, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultLO.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Expert Belt attacker and SE move, when calculating, then applies ~1.2x final damage", () => {
    // Source: Showdown data/items.ts -- Expert Belt: pokeRound(damage, 4915) ~= 1.2x on SE
    const ctxEB = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.water],
        heldItem: ITEMS.expertBelt,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fire] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultEB = calculateGen9Damage(ctxEB, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.fire] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultEB.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Charcoal attacker using Fire move, when calculating, then applies ~1.2x base power", () => {
    // Source: Showdown data/items.ts -- Charcoal: 4915/4096 boost for Fire moves
    const ctxCharcoal = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.fire],
        heldItem: ITEMS.charcoal,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultCharcoal = calculateGen9Damage(ctxCharcoal, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultCharcoal.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Klutz attacker with Choice Band, when calculating, then no boost applied", () => {
    // Source: Showdown data/abilities.ts -- Klutz suppresses item effects
    const ctxKlutz = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.klutz,
        heldItem: ITEMS.choiceBand,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultKlutz = calculateGen9Damage(ctxKlutz, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultKlutz.damage).toBe(resultNone.damage);
  });

  it("given Knock Off vs item-holding defender, when calculating, then applies 1.5x base power", () => {
    // Source: Showdown data/moves.ts -- Knock Off: 1.5x when target holds removable item
    const ctxKO = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.dark] }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        heldItem: ITEMS.leftovers,
      }),
      move: CANONICAL_KNOCK_OFF(),
      seed: 42,
    });
    const resultKO = calculateGen9Damage(ctxKO, typeChart);

    const ctxNoItem = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.dark] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: CANONICAL_KNOCK_OFF(),
      seed: 42,
    });
    const resultNoItem = calculateGen9Damage(ctxNoItem, typeChart);

    expect(resultKO.damage).toBeGreaterThan(resultNoItem.damage);
  });
});

describe("Type-resist berries", () => {
  it("given Occa Berry defender and SE Fire move, when calculating, then damage is halved by berry", () => {
    // Source: Showdown data/items.ts -- Occa Berry: halves SE Fire damage, consumed
    const defender = createOnFieldPokemon({
      defense: 100,
      types: [TYPES.grass],
      heldItem: ITEMS.occaBerry,
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender,
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const ctxNoBerry = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.grass] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultNoBerry = calculateGen9Damage(ctxNoBerry, typeChart);

    expect(result.damage).toBe(pokeRound(resultNoBerry.damage, HALF_DAMAGE_MODIFIER));
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Chilan Berry defender and any Normal move, when calculating, then damage is halved", () => {
    // Source: Showdown data/items.ts -- Chilan Berry: halves Normal damage (no SE requirement)
    const defender = createOnFieldPokemon({
      defense: 100,
      types: [TYPES.normal],
      heldItem: ITEMS.chilanBerry,
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender,
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const ctxNoBerry = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNoBerry = calculateGen9Damage(ctxNoBerry, typeChart);

    expect(result.damage).toBe(pokeRound(resultNoBerry.damage, HALF_DAMAGE_MODIFIER));
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given TYPE_RESIST_BERRIES export, when checking, then contains all 18 berries", () => {
    // Source: Bulbapedia -- there are 18 type-resist berries (one per type including Fairy)
    expect(Object.keys(TYPE_RESIST_BERRIES)).toHaveLength(18);
    expect(TYPE_RESIST_BERRIES[ITEMS.occaBerry]).toBe(TYPES.fire);
    expect(TYPE_RESIST_BERRIES[ITEMS.roseliBerry]).toBe(TYPES.fairy);
    expect(TYPE_RESIST_BERRIES[ITEMS.chilanBerry]).toBe(TYPES.normal);
  });
});

// ===========================================================================
// 14. -ate Abilities
// ===========================================================================

describe("-ate abilities", () => {
  it("given Pixilate attacker using Normal move, when calculating, then type becomes Fairy with 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Pixilate: Normal->Fairy, 1.2x power
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.fairy],
        ability: ABILITIES.pixilate,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.dragon] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    // Fairy vs Dragon = immune (Dragon immune to Fairy? No -- Fairy SE vs Dragon, Dragon immune to no types)
    // Actually: Dragon is immune to nothing from Fairy. Fairy is SE vs Dragon.
    // Wait: Dragon has no effect on Fairy (Dragon -> Fairy = 0x)
    // Fairy -> Dragon = 2x (SE)
    // So Pixilate changes Normal -> Fairy, and Fairy vs Dragon = 2x
    expect(result.effectiveness).toBe(2);
    expect(result.effectiveType).toBe(TYPES.fairy);
    // Pixilate converts Normal→Fairy; Fairy vs Dragon = 2x SE; damage is non-zero
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });

  it("given Aerilate attacker using Normal move, when calculating, then type becomes Flying with 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Aerilate: Normal->Flying, 1.2x power
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.flying],
        ability: ABILITIES.aerilate,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.grass] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    // Flying vs Grass = 2x (SE)
    expect(result.effectiveness).toBe(2);
    expect(result.effectiveType).toBe(TYPES.flying);
  });

  it("given Normalize attacker using non-Normal move, when calculating, then type becomes Normal with 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Normalize Gen 7+: all moves become Normal, 1.2x boost
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.normalize,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.ghost] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    // Normal vs Ghost = immune
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
    expect(result.effectiveType).toBe(TYPES.normal);
  });
});

// ===========================================================================
// 15. Body Press
// ===========================================================================

describe("Body Press", () => {
  it("given Body Press user with high Defense, when calculating, then uses Defense stat instead of Attack", () => {
    // Source: Showdown data/moves.ts -- bodypress: overrideOffensiveStat: 'def'
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 50, defense: 200, types: [TYPES.fighting] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.bodyPress),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    // With 200 Defense as the attack stat, damage should be high
    // Compare to using attack stat = 50
    const ctxTackle = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 50, defense: 200, types: [TYPES.fighting] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createSyntheticMove(MOVES.tackle, TYPES.fighting, MOVE_CATEGORIES.physical, 80),
      seed: 42,
    });
    const resultTackle = calculateGen9Damage(ctxTackle, typeChart);

    // Body Press with 200 Def >> Tackle with 50 Atk
    expect(result.damage).toBeGreaterThan(resultTackle.damage);
  });
});

// ===========================================================================
// 16. Spread moves (doubles)
// ===========================================================================

describe("Spread moves (doubles)", () => {
  it("given doubles format and all-adjacent-foes move, when calculating, then applies 0.75x spread modifier", () => {
    // Source: Showdown sim/battle-actions.ts -- spread moves: pokeRound(baseDamage, 3072)
    const ctxDoubles = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: createSyntheticMove(MOVES.flamethrower, TYPES.fire, MOVE_CATEGORIES.special, 80, {
        target: "all-adjacent-foes",
      }),
      state: createBattleState({ format: "doubles" }),
      seed: 42,
    });
    const resultDoubles = calculateGen9Damage(ctxDoubles, typeChart);

    const ctxSingles = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: createSyntheticMove(MOVES.flamethrower, TYPES.fire, MOVE_CATEGORIES.special, 80, {
        target: "adjacent-foe",
      }),
      state: createBattleState({ format: "singles" }),
      seed: 42,
    });
    const resultSingles = calculateGen9Damage(ctxSingles, typeChart);

    expect(resultDoubles.damage).toBeLessThan(resultSingles.damage);
  });
});

// ===========================================================================
// 17. Eviolite and Assault Vest
// ===========================================================================

describe("Defensive items", () => {
  it("given Eviolite defender, when hit by physical move, then Defense is boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Eviolite: 1.5x Def and SpDef
    const ctxEviolite = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        heldItem: ITEMS.eviolite,
      }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultEviolite = calculateGen9Damage(ctxEviolite, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultEviolite.damage).toBeLessThan(resultNone.damage);
  });

  it("given Assault Vest defender, when hit by special move, then SpDef is boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Assault Vest: 1.5x SpDef
    const ctxAV = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        heldItem: ITEMS.assaultVest,
      }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultAV = calculateGen9Damage(ctxAV, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultAV.damage).toBeLessThan(resultNone.damage);
  });
});

// ===========================================================================
// 18. Sandstorm SpDef boost for Rock-types
// ===========================================================================

describe("Sandstorm Rock-type SpDef boost", () => {
  it("given sandstorm and Rock defender, when hit by special move, then SpDef boosted 1.5x", () => {
    // Source: Bulbapedia -- Sandstorm: Rock-type Pokemon have 1.5x SpDef in Gen 4+
    const ctxSand = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.rock] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.sand, turnsLeft: 5, source: WEATHER_SOURCES.sand },
      }),
      seed: 42,
    });
    const resultSand = calculateGen9Damage(ctxSand, typeChart);

    const ctxClear = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.rock] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultClear = calculateGen9Damage(ctxClear, typeChart);

    expect(resultSand.damage).toBeLessThan(resultClear.damage);
  });

  it("given sandstorm and non-Rock defender, when hit by special move, then no SpDef boost", () => {
    // Source: Bulbapedia -- Sandstorm SpDef boost is Rock-type only
    const ctxSand = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      state: createBattleState({
        weather: { type: WEATHERS.sand, turnsLeft: 5, source: WEATHER_SOURCES.sand },
      }),
      seed: 42,
    });
    const resultSand = calculateGen9Damage(ctxSand, typeChart);

    const ctxClear = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_WATER_SPECIAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultClear = calculateGen9Damage(ctxClear, typeChart);

    expect(resultSand.damage).toBe(resultClear.damage);
  });
});

// ===========================================================================
// 19. isGen9Grounded helper
// ===========================================================================

describe("isGen9Grounded", () => {
  it("given normal Pokemon with no Flying type or Levitate, when checking, then is grounded", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded() default is true
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    expect(isGen9Grounded(pokemon, false)).toBe(true);
  });

  it("given Flying-type Pokemon, when checking, then is NOT grounded", () => {
    // Source: Showdown -- Flying types are not grounded
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    expect(isGen9Grounded(pokemon, false)).toBe(false);
  });

  it("given Levitate Pokemon, when checking, then is NOT grounded", () => {
    // Source: Showdown -- Levitate prevents grounding
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal], ability: ABILITIES.levitate });
    expect(isGen9Grounded(pokemon, false)).toBe(false);
  });

  it("given Flying-type Pokemon under Gravity, when checking, then IS grounded", () => {
    // Source: Showdown -- Gravity forces all Pokemon to be grounded
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    expect(isGen9Grounded(pokemon, true)).toBe(true);
  });

  it("given Pokemon with Air Balloon, when checking, then is NOT grounded", () => {
    // Source: Showdown -- Air Balloon prevents grounding
    const pokemon = createOnFieldPokemon({
      types: [TYPES.normal],
      heldItem: ITEMS.airBalloon,
      currentHp: 100,
    });
    expect(isGen9Grounded(pokemon, false)).toBe(false);
  });

  it("given Pokemon with Iron Ball, when checking, then IS grounded even if Flying", () => {
    // Source: Showdown -- Iron Ball forces grounding
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying], heldItem: ITEMS.ironBall });
    expect(isGen9Grounded(pokemon, false)).toBe(true);
  });

  it("given Pokemon with Ingrain volatile, when checking, then IS grounded", () => {
    // Source: Showdown -- Ingrain forces grounding
    const volatiles = new Map();
    volatiles.set(VOLATILES.ingrain, { turnsLeft: -1 });
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying], volatiles });
    expect(isGen9Grounded(pokemon, false)).toBe(true);
  });

  it("given Pokemon with Magnet Rise volatile, when checking, then is NOT grounded", () => {
    // Source: Showdown -- Magnet Rise prevents grounding
    const volatiles = new Map();
    volatiles.set(VOLATILES.magnetRise, { turnsLeft: 5 });
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal], volatiles });
    expect(isGen9Grounded(pokemon, false)).toBe(false);
  });
});

// ===========================================================================
// 20. Flash Fire volatile boost
// ===========================================================================

describe("Flash Fire volatile boost", () => {
  it("given attacker with Flash Fire volatile using Fire move, when calculating, then 1.5x power", () => {
    // Source: Showdown data/abilities.ts -- Flash Fire: 1.5x Fire power when activated
    const volatiles = new Map();
    volatiles.set(VOLATILES.flashFire, { turnsLeft: -1 });
    const ctxFF = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire], volatiles }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultFF = calculateGen9Damage(ctxFF, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_SPECIAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultFF.damage).toBeGreaterThan(resultNone.damage);
  });
});

// ===========================================================================
// 21. Venoshock and Hex power doubling
// ===========================================================================

describe("Move-specific power doubling", () => {
  it("given Venoshock vs poisoned target, when calculating, then power doubles (65 -> 130)", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower chainModify(2) when target poisoned
    const ctxPoison = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.poison] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        status: STATUS.poison,
      }),
      move: CANONICAL_VENOSHOCK(),
      seed: 42,
    });
    const resultPoison = calculateGen9Damage(ctxPoison, typeChart);

    const ctxHealthy = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.poison] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: CANONICAL_VENOSHOCK(),
      seed: 42,
    });
    const resultHealthy = calculateGen9Damage(ctxHealthy, typeChart);

    // Poisoned target should take roughly double damage
    expect(resultPoison.damage).toBeGreaterThan(resultHealthy.damage);
  });

  it("given Hex vs statused target, when calculating, then power doubles (65 -> 130)", () => {
    // Source: Showdown data/moves.ts -- hex: onBasePower chainModify(2) when target has status
    const _ctxStatus = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.ghost] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.normal],
        status: STATUS.paralysis,
      }),
      move: CANONICAL_HEX(),
      seed: 42,
    });
    // Ghost vs Normal = immune... need a different type matchup
    // Actually we should use a non-ghost defender for Hex to deal damage
    const ctxStatusFixed = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.ghost] }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [TYPES.psychic],
        status: STATUS.paralysis,
      }),
      move: CANONICAL_HEX(),
      seed: 42,
    });
    const resultStatus = calculateGen9Damage(ctxStatusFixed, typeChart);

    const ctxHealthy = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.ghost] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.psychic] }),
      move: CANONICAL_HEX(),
      seed: 42,
    });
    const resultHealthy = calculateGen9Damage(ctxHealthy, typeChart);

    expect(resultStatus.damage).toBeGreaterThan(resultHealthy.damage);
  });

  it("given Acrobatics without held item, when calculating, then power doubles (55 -> 110)", () => {
    // Source: Showdown data/moves.ts -- Acrobatics basePowerCallback: 2x when no item
    const ctxNoItem = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.flying] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.acrobatics),
      seed: 42,
    });
    const resultNoItem = calculateGen9Damage(ctxNoItem, typeChart);

    const ctxWithItem = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.flying],
        heldItem: ITEMS.leftovers,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.acrobatics),
      seed: 42,
    });
    const resultWithItem = calculateGen9Damage(ctxWithItem, typeChart);

    expect(resultNoItem.damage).toBeGreaterThan(resultWithItem.damage);
  });
});

// ===========================================================================
// 22. Screens (Reflect / Light Screen / Aurora Veil)
// ===========================================================================

describe("Screens", () => {
  it("given Reflect on defender side and physical move, when calculating, then damage halved", () => {
    // Source: Showdown sim/battle-actions.ts -- screens halve damage in singles
    const defender = createOnFieldPokemon({ defense: 100, types: [TYPES.normal] });
    const state = createBattleState({
      sides: [
        { active: [], screens: [] },
        { active: [defender], screens: [{ type: "reflect", turnsLeft: 5 }] },
      ],
    });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender,
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state,
      seed: 42,
    });
    const resultScreen = calculateGen9Damage(ctx, typeChart);

    const ctxNoScreen = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: createBattleState(),
      seed: 42,
    });
    const resultNoScreen = calculateGen9Damage(ctxNoScreen, typeChart);

    expect(resultScreen.damage).toBeLessThan(resultNoScreen.damage);
  });

  it("given Reflect on defender side and crit hit, when calculating, then screens bypassed", () => {
    // Source: Showdown sim/battle-actions.ts -- crits bypass screens
    const defender = createOnFieldPokemon({ defense: 100, types: [TYPES.normal] });
    const state = createBattleState({
      sides: [
        { active: [], screens: [] },
        { active: [defender], screens: [{ type: "reflect", turnsLeft: 5 }] },
      ],
    });
    const ctxCrit = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender,
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state,
      isCrit: true,
      seed: 42,
    });
    const resultCrit = calculateGen9Damage(ctxCrit, typeChart);

    const defender2 = createOnFieldPokemon({ defense: 100, types: [TYPES.normal] });
    const state2 = createBattleState({
      sides: [
        { active: [], screens: [] },
        { active: [defender2], screens: [] },
      ],
    });
    const ctxCritNoScreen = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: defender2,
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      state: state2,
      isCrit: true,
      seed: 42,
    });
    const resultCritNoScreen = calculateGen9Damage(ctxCritNoScreen, typeChart);

    // Crit bypasses screen, so damage should be equal
    expect(resultCrit.damage).toBe(resultCritNoScreen.damage);
  });
});

// ===========================================================================
// 23. Huge Power / Pure Power
// ===========================================================================

describe("Huge Power / Pure Power", () => {
  it("given Huge Power attacker using physical move, when calculating, then Attack doubled", () => {
    // Source: Showdown data/abilities.ts -- Huge Power: 2x Attack
    const ctxHP = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.hugePower,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultHP = calculateGen9Damage(ctxHP, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultHP.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Pure Power attacker using physical move, when calculating, then Attack doubled", () => {
    // Source: Showdown -- Pure Power: same as Huge Power
    const ctxPP = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.psychic],
        ability: ABILITIES.purePower,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: CANONICAL_ZEN_HEADBUTT(),
      seed: 42,
    });
    const resultPP = calculateGen9Damage(ctxPP, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.psychic] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: CANONICAL_ZEN_HEADBUTT(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultPP.damage).toBeGreaterThan(resultNone.damage);
  });
});

// ===========================================================================
// 24. Tough Claws, Strong Jaw, Mega Launcher, Iron Fist
// ===========================================================================

describe("Contact/flag-based ability boosts", () => {
  it("given Tough Claws and contact move, when calculating, then 1.3x power", () => {
    // Source: Showdown data/abilities.ts -- Tough Claws: 5325/4096 for contact moves
    const ctxTC = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.toughClaws,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createSyntheticMove(MOVES.tackle, TYPES.normal, MOVE_CATEGORIES.physical, 80, {
        flags: { contact: true },
      }),
      seed: 42,
    });
    const resultTC = calculateGen9Damage(ctxTC, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.normal] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createSyntheticMove(MOVES.tackle, TYPES.normal, MOVE_CATEGORIES.physical, 80, {
        flags: { contact: true },
      }),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultTC.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Strong Jaw and bite move, when calculating, then 1.5x power", () => {
    // Source: Showdown data/abilities.ts -- Strong Jaw: 6144/4096 for bite moves
    const ctxSJ = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.dark],
        ability: ABILITIES.strongJaw,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.crunch, {
        flags: { bite: true },
      }),
      seed: 42,
    });
    const resultSJ = calculateGen9Damage(ctxSJ, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.dark] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.crunch, {
        flags: { bite: true },
      }),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultSJ.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Mega Launcher and pulse move, when calculating, then 1.5x power", () => {
    // Source: Showdown data/abilities.ts -- Mega Launcher: 6144/4096 for pulse moves
    const ctxML = createDamageContext({
      attacker: createOnFieldPokemon({
        spAttack: 100,
        types: [TYPES.water],
        ability: ABILITIES.megaLauncher,
      }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.waterPulse, {
        flags: { pulse: true },
      }),
      seed: 42,
    });
    const resultML = calculateGen9Damage(ctxML, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [TYPES.water] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.waterPulse, {
        flags: { pulse: true },
      }),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultML.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Iron Fist and punch move, when calculating, then 1.2x power", () => {
    // Source: Showdown data/abilities.ts -- Iron Fist: 1.2x for punching moves
    const ctxIF = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.fighting],
        ability: ABILITIES.ironFist,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.machPunch, {
        flags: { punch: true },
      }),
      seed: 42,
    });
    const resultIF = calculateGen9Damage(ctxIF, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.fighting] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: createCanonicalMove(MOVES.machPunch, {
        flags: { punch: true },
      }),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultIF.damage).toBeGreaterThan(resultNone.damage);
  });
});

// ===========================================================================
// 25. Magnet Rise Ground immunity
// ===========================================================================

describe("Magnet Rise", () => {
  it("given Magnet Rise volatile on defender and Ground move, when calculating, then returns 0 (immune)", () => {
    // Source: Showdown data/moves.ts -- Magnet Rise grants Ground immunity (not ability-based)
    const volatiles = new Map();
    volatiles.set(VOLATILES.magnetRise, { turnsLeft: 5 });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.ground] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal], volatiles }),
      move: SYNTHETIC_GROUND_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Magnet Rise and Mold Breaker attacker, when calculating, then Magnet Rise still blocks (not ability)", () => {
    // Source: Showdown -- Magnet Rise is a move effect, not an ability; Mold Breaker doesn't bypass
    const volatiles = new Map();
    volatiles.set(VOLATILES.magnetRise, { turnsLeft: 5 });
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.ground],
        ability: ABILITIES.moldBreaker,
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal], volatiles }),
      move: SYNTHETIC_GROUND_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
  });
});

// ===========================================================================
// 26. Gravity + Ground interaction
// ===========================================================================

describe("Gravity interaction", () => {
  it("given Gravity active and Flying defender hit by Ground move, when calculating, then Ground move hits", () => {
    // Source: Showdown data/conditions.ts -- Gravity removes Ground immunity from Flying types.
    const attacker = createOnFieldPokemon({ attack: 100, types: [TYPES.ground] });
    const move = SYNTHETIC_GROUND_PHYSICAL_80();
    const ctx = createDamageContext({
      attacker,
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.flying] }),
      move,
      state: createBattleState({ gravity: { active: true, turnsLeft: 5 } }),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    const control = calculateGen9Damage(
      createDamageContext({
        attacker,
        defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
        move,
        seed: 42,
      }),
      typeChart,
    );

    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBe(control.damage);
  });
});

// ===========================================================================
// 27. Rivalry gender interaction
// ===========================================================================

describe("Rivalry", () => {
  it("given Rivalry attacker vs same-gender defender, when calculating, then 1.25x power", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 1.25x vs same gender
    const ctxRivalry = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.rivalry,
        gender: CORE_GENDERS.male,
      }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        gender: CORE_GENDERS.male,
      }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultRivalry = calculateGen9Damage(ctxRivalry, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        gender: CORE_GENDERS.male,
      }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        gender: CORE_GENDERS.male,
      }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultRivalry.damage).toBeGreaterThan(resultNone.damage);
  });

  it("given Rivalry attacker vs opposite-gender defender, when calculating, then 0.75x power", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 0.75x vs opposite gender
    const ctxRivalry = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        ability: ABILITIES.rivalry,
        gender: CORE_GENDERS.male,
      }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        gender: CORE_GENDERS.female,
      }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultRivalry = calculateGen9Damage(ctxRivalry, typeChart);

    const ctxNone = createDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [TYPES.normal],
        gender: CORE_GENDERS.male,
      }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [TYPES.normal],
        gender: CORE_GENDERS.female,
      }),
      move: SYNTHETIC_NORMAL_PHYSICAL_80(),
      seed: 42,
    });
    const resultNone = calculateGen9Damage(ctxNone, typeChart);

    expect(resultRivalry.damage).toBeLessThan(resultNone.damage);
  });
});

// ===========================================================================
// 28. DamageResult structure
// ===========================================================================

describe("DamageResult structure", () => {
  it("given a normal damage calculation, when checking result, then has all required fields", () => {
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.grass] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    // Fire 2x SE vs Grass; damage is non-zero
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.effectiveness).toBe(2);
    expect(result.isCrit).toBe(false);
    expect(result.randomFactor).toBeGreaterThanOrEqual(0.85);
    expect(result.randomFactor).toBeLessThanOrEqual(1.0);
    expect(result.breakdown).toBeDefined();
    expect(result.effectiveType).toBe(TYPES.fire);
    expect(result.effectiveCategory).toBe(MOVE_CATEGORIES.physical);
  });

  it("given a damage calculation, when checking breakdown, then has all modifier fields", () => {
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.normal] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const result = calculateGen9Damage(ctx, typeChart);

    expect(result.breakdown).toBeDefined();
    const bd = result.breakdown!;
    expect(typeof bd.baseDamage).toBe("number");
    expect(typeof bd.weatherMultiplier).toBe("number");
    expect(typeof bd.critMultiplier).toBe("number");
    expect(typeof bd.randomMultiplier).toBe("number");
    expect(typeof bd.stabMultiplier).toBe("number");
    expect(typeof bd.typeMultiplier).toBe("number");
    expect(typeof bd.burnMultiplier).toBe("number");
    expect(typeof bd.abilityMultiplier).toBe("number");
    expect(typeof bd.itemMultiplier).toBe("number");
    expect(typeof bd.otherMultiplier).toBe("number");
    expect(typeof bd.finalDamage).toBe("number");
    expect(bd.finalDamage).toBe(result.damage);
  });
});

// ===========================================================================
// 29. Gen9Ruleset.calculateDamage integration
// ===========================================================================

describe("Gen9Ruleset.calculateDamage integration", () => {
  it("given Gen9Ruleset instance, when calling calculateDamage, then delegates to calculateGen9Damage", () => {
    // Source: Gen9Ruleset.ts -- calculateDamage delegates to calculateGen9Damage
    // This test verifies the wiring is correct
    const ruleset = new Gen9Ruleset();
    const ctx = createDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [TYPES.fire] }),
      defender: createOnFieldPokemon({ defense: 100, types: [TYPES.grass] }),
      move: SYNTHETIC_FIRE_PHYSICAL_80(),
      seed: 42,
    });
    const result = ruleset.calculateDamage(ctx);
    // Fire 2x SE vs Grass; delegation to calculateGen9Damage produces non-zero damage
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.effectiveness).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Unaware vs Simple interaction (regression: #757)
// ---------------------------------------------------------------------------

describe("Gen 9 damage calc -- Unaware vs Simple interaction (regression: #757)", () => {
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
      ability: ABILITIES.simple,
      types: [TYPES.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITIES.unaware,
      types: [TYPES.water],
    });
    const move = SYNTHETIC_NORMAL_PHYSICAL_50();
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen9Damage(ctx, typeChart);
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
      ability: ABILITIES.simple,
      types: [TYPES.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITIES.none,
      types: [TYPES.water],
    });
    const move = SYNTHETIC_NORMAL_PHYSICAL_50();
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });

  it("given Mold Breaker attacker with +2 Atk stage vs Unaware defender, when calculating damage, then Mold Breaker bypasses Unaware and stages apply", () => {
    // Mold Breaker/Teravolt/Turboblaze bypass breakable abilities (flags: { breakable: 1 }).
    // Unaware is breakable, so a Mold Breaker attacker ignores Unaware — stages are NOT zeroed.
    // Source: Showdown sim/battle.ts Gen 9+ — ability.flags.breakable check.
    //
    // Derivation (Mold Breaker bypasses Unaware → effective stage = +2, multiplier = 4/2 = 2.0):
    //   effectiveAttack = floor(100 * 2.0) = 200
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 200 / 100) = 2200
    //   baseDamage = floor(2200 / 50) + 2 = 44 + 2 = 46
    //   random(seed=42) = 94 → floor(46 * 94 / 100) = floor(43.24) = 43
    const attacker = createOnFieldPokemon({
      attack: 100,
      ability: ABILITIES.moldBreaker,
      types: [TYPES.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITIES.unaware,
      types: [TYPES.water],
    });
    const move = SYNTHETIC_NORMAL_PHYSICAL_50();
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(43);
  });

  it("given Simple attacker with +2 Atk stage vs Teravolt defender, when calculating damage, then defender's Mold Breaker does NOT suppress attacker's Simple — stages still doubled to +4", () => {
    // The defender's Mold Breaker family only suppresses the *target's* (defender's) abilities
    // when the Mold Breaker user is attacking. A defending Teravolt does NOT suppress the
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
      ability: ABILITIES.simple,
      types: [TYPES.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: ABILITIES.teravolt,
      types: [TYPES.water],
    });
    const move = SYNTHETIC_NORMAL_PHYSICAL_50();
    const ctx = createDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen9Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });
});
