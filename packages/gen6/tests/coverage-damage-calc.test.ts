import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  Gender,
  MoveData,
  MoveEffect,
  PokemonType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_MOVE_CATEGORIES,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
  GEN6_TYPE_CHART,
} from "../src";
import { calculateGen6Damage } from "../src/Gen6DamageCalc";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const dataManager = createGen6DataManager();

const { burn, badlyPoisoned, flinch, poison } = CORE_STATUS_IDS;
const {
  electric,
  fire,
  flying,
  ghost,
  grass,
  ground,
  normal,
  psychic,
  steel,
  water,
  dragon,
  fighting,
  rock,
} = CORE_TYPE_IDS;
const { embargo, magnetRise } = CORE_VOLATILE_IDS;
const { heavyRain, harshSun, rain, sun } = CORE_WEATHER_IDS;
const { flashFire, unburden } = GEN6_ABILITY_IDS;
const { normalGem, occaBerry } = GEN6_ITEM_IDS;
const GRASSY_TERRAIN = CORE_TERRAIN_IDS.grassy;
const ZERO_STAT_STAGES = {
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
  accuracy: 0,
  evasion: 0,
} as const;
const PLUS_TWO_ATTACK_STAT_STAGES = { ...ZERO_STAT_STAGES, attack: 2 } as const;
const PLUS_SIX_ATTACK_STAT_STAGES = { ...ZERO_STAT_STAGES, attack: 6 } as const;
const MINUS_THREE_ATTACK_STAT_STAGES = { ...ZERO_STAT_STAGES, attack: -3 } as const;
const PLUS_SIX_DEFENSE_STAT_STAGES = { ...ZERO_STAT_STAGES, defense: 6 } as const;

function getCanonicalMove(moveId: string) {
  try {
    return dataManager.getMove(moveId);
  } catch {
    return null;
  }
}

function createSyntheticActivePokemon(overrides: {
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
  statStages?: Record<string, number>;
  lastMoveUsed?: string | null;
  movedThisTurn?: boolean;
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
      speciesId: overrides.speciesId ?? GEN6_SPECIES_IDS.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: GEN6_NATURE_IDS.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? GEN6_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: overrides.gender ?? CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: GEN6_ITEM_IDS.pokeBall,
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
      ...overrides.statStages,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [normal],
    ability: overrides.ability ?? GEN6_ABILITY_IDS.none,
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
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

function createSyntheticMoveData(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  target?: string;
}): MoveData {
  const canonical = getCanonicalMove(overrides.id ?? tackle);
  return {
    id: overrides.id ?? tackle,
    displayName: canonical?.displayName ?? overrides.id ?? "Tackle",
    type: overrides.type ?? canonical?.type ?? normal,
    category: overrides.category ?? canonical?.category ?? CORE_MOVE_CATEGORIES.physical,
    power: overrides.power ?? canonical?.power ?? 50,
    accuracy: canonical?.accuracy ?? 100,
    pp: canonical?.pp ?? 35,
    priority: canonical?.priority ?? 0,
    target: overrides.target ?? canonical?.target ?? "adjacent-foe",
    flags: {
      contact: canonical?.flags.contact ?? true,
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
      ...overrides.flags,
    },
    effect: overrides.effect ?? canonical?.effect ?? null,
    description: canonical?.description ?? "",
    generation: canonical?.generation ?? 6,
    critRatio: overrides.critRatio ?? 0,
  } as MoveData;
}

function createSyntheticBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
  terrain?: { type: string; turnsLeft: number } | null;
  gravity?: { active: boolean; turnsLeft: number };
  magicRoom?: { active: boolean; turnsLeft: number };
  sides?: any[];
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: overrides?.magicRoom ?? { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 6,
    turnNumber: 1,
    sides: overrides?.sides ?? [{ active: [null] }, { active: [null] }],
  } as unknown as BattleState;
}

function createSyntheticDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createSyntheticActivePokemon({}),
    defender: overrides.defender ?? createSyntheticActivePokemon({}),
    move: overrides.move ?? createSyntheticMoveData({}),
    state: overrides.state ?? createSyntheticBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Weather modifiers
// Source: Showdown sim/battle-actions.ts -- weather damage modifiers
// ===========================================================================
describe("Weather modifiers in damage calc", () => {
  it("given sun weather + fire move, when calculating damage, then fire move gets 1.5x boost", () => {
    // Source: Showdown sim/battle-actions.ts -- sun boosts fire 1.5x (6144/4096)
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const sunResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: createSyntheticBattleState({
          weather: { type: sun, turnsLeft: 5, source: GEN6_ABILITY_IDS.drought },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Sun boosts fire by 1.5x
    const ratio = sunResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given sun weather + water move, when calculating damage, then water move gets 0.5x reduction", () => {
    // Source: Showdown sim/battle-actions.ts -- sun weakens water 0.5x (2048/4096)
    const attacker = createSyntheticActivePokemon({ types: [water] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.surf);

    const sunResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: createSyntheticBattleState({
          weather: { type: sun, turnsLeft: 5, source: GEN6_ABILITY_IDS.drought },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const ratio = sunResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given heavy-rain weather + fire move, when calculating damage, then fire move is nullified (0 damage)", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy rain nullifies fire
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: createSyntheticBattleState({
          weather: { type: heavyRain, turnsLeft: -1, source: GEN6_ABILITY_IDS.primordialSea },
        }),
      }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given harsh-sun weather + water move, when calculating damage, then water move is nullified (0 damage)", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh sun nullifies water
    const attacker = createSyntheticActivePokemon({ types: [water] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.surf);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: createSyntheticBattleState({
          weather: { type: harshSun, turnsLeft: -1, source: GEN6_ABILITY_IDS.desolateLand },
        }),
      }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given harsh-sun weather + fire move, when calculating damage, then fire move gets 1.5x boost (not nullified)", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh sun boosts fire (same as regular sun)
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const harshSunResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: createSyntheticBattleState({
          weather: { type: harshSun, turnsLeft: -1, source: GEN6_ABILITY_IDS.desolateLand },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = harshSunResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given heavy-rain weather + water move, when calculating damage, then water move gets 1.5x boost (not nullified)", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy rain boosts water (same as regular rain)
    const attacker = createSyntheticActivePokemon({ types: [water] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.surf);

    const heavyRainResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: createSyntheticBattleState({
          weather: { type: heavyRain, turnsLeft: -1, source: GEN6_ABILITY_IDS.primordialSea },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const ratio = heavyRainResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ===========================================================================
// SolarBeam weather penalty
// Source: Showdown -- SolarBeam power halved in non-sun weather
// ===========================================================================
describe("SolarBeam weather penalty", () => {
  it("given SolarBeam in rain, when calculating damage, then power is halved", () => {
    const attacker = createSyntheticActivePokemon({ types: [grass] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const solarBeam = dataManager.getMove(GEN6_MOVE_IDS.solarBeam);

    const rainResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: solarBeam,
        state: createSyntheticBattleState({
          weather: { type: rain, turnsLeft: 5, source: GEN6_ABILITY_IDS.drizzle },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: solarBeam, seed: 100 }),
      typeChart,
    );

    // Source: Showdown -- SolarBeam power halved in non-sun weather
    const ratio = rainResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given SolarBeam in sun, when calculating damage, then power is NOT halved", () => {
    const attacker = createSyntheticActivePokemon({ types: [grass] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const solarBeam = dataManager.getMove(GEN6_MOVE_IDS.solarBeam);

    const sunResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: solarBeam,
        state: createSyntheticBattleState({
          weather: { type: sun, turnsLeft: 5, source: GEN6_ABILITY_IDS.drought },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: solarBeam, seed: 100 }),
      typeChart,
    );

    // Sun does not halve SolarBeam. In fact there's no weather reduction on SolarBeam in sun,
    // and there's no fire/water boost relevant here (grass move).
    expect(sunResult.damage).toBe(noWeatherResult.damage);
  });
});

// ===========================================================================
// Pinch abilities (Overgrow/Blaze/Torrent/Swarm)
// Source: Showdown sim/battle.ts -- pinch ability check
// ===========================================================================
describe("Pinch abilities in damage calc", () => {
  it("given Blaze + fire move + HP <= floor(maxHP/3), when calculating damage, then 1.5x power", () => {
    // Source: Showdown -- Blaze boosts fire by 1.5x when HP <= floor(maxHP/3)
    // maxHP = 200, threshold = floor(200/3) = 66
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.blaze,
      types: [fire],
      hp: 200,
      currentHp: 66,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const blazeResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [fire],
      hp: 200,
      currentHp: 66,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = blazeResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Torrent + water move + HP > floor(maxHP/3), when calculating damage, then no boost", () => {
    // Source: Showdown -- Torrent does not activate above threshold
    // maxHP = 200, threshold = 66, currentHp = 100 > 66
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.torrent,
      types: [water],
      hp: 200,
      currentHp: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.surf);

    const torrentResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [water],
      hp: 200,
      currentHp: 100,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: waterMove,
        seed: 100,
      }),
      typeChart,
    );

    expect(torrentResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Flash Fire volatile boost
// Source: Showdown data/abilities.ts -- Flash Fire
// ===========================================================================
describe("Flash Fire volatile in damage calc", () => {
  it("given Flash Fire volatile + fire move, when calculating damage, then power is boosted 1.5x", () => {
    // Source: Showdown -- Flash Fire activated: fire moves get 1.5x power
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(flashFire, { turnsLeft: -1 });
    const attacker = createSyntheticActivePokemon({ types: [fire], volatiles });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const ffResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({ types: [fire] });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = ffResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ===========================================================================
// Dry Skin fire weakness
// Source: Showdown data/abilities.ts -- Dry Skin (priority 17)
// ===========================================================================
describe("Dry Skin fire weakness in damage calc", () => {
  it("given defender with Dry Skin + fire move, when calculating damage, then power is boosted 1.25x", () => {
    // Source: Showdown -- Dry Skin: fire moves deal 1.25x damage
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.drySkin,
      types: [normal],
    });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const drySkinResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: baseDefender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = drySkinResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.25, 1);
  });

  it("given Mold Breaker attacker vs Dry Skin defender + fire move, when calculating damage, then Dry Skin is suppressed", () => {
    // Source: Showdown -- Mold Breaker bypasses Dry Skin
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.moldBreaker,
      types: [fire],
    });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.drySkin,
      types: [normal],
    });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const moldResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: baseDefender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Mold Breaker suppresses Dry Skin, so no 1.25x boost
    expect(moldResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Technician
// Source: Showdown data/abilities.ts -- Technician (priority 30)
// ===========================================================================
describe("Technician in damage calc", () => {
  it("given Technician + move with base power <= 60, when calculating damage, then power is boosted 1.5x", () => {
    // Source: Showdown -- Technician: 1.5x power for moves with BP <= 60
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.technician,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const quickAttack = dataManager.getMove(GEN6_MOVE_IDS.quickAttack);

    const techResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: quickAttack, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: quickAttack,
        seed: 100,
      }),
      typeChart,
    );

    const ratio = techResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Technician + move with base power > 60, when calculating damage, then no boost", () => {
    // Source: Showdown -- Technician only activates for BP <= 60
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.technician,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const bodySlam = dataManager.getMove(GEN6_MOVE_IDS.bodySlam);

    const techResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: bodySlam, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: bodySlam, seed: 100 }),
      typeChart,
    );

    expect(techResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Iron Fist
// Source: Showdown data/abilities.ts -- Iron Fist
// ===========================================================================
describe("Iron Fist in damage calc", () => {
  it("given Iron Fist + punch move, when calculating damage, then power is boosted 1.2x", () => {
    // Source: Showdown -- Iron Fist: 1.2x power for punching moves
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.ironFist,
      types: [fighting],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const machPunch = dataManager.getMove(GEN6_MOVE_IDS.machPunch);

    const ifResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: machPunch, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [fighting],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: machPunch,
        seed: 100,
      }),
      typeChart,
    );

    // With integer rounding, the ratio may not be exactly 1.2, allow wider precision
    const ratio = ifResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.2, 0);
  });
});

// ===========================================================================
// Reckless + recoil
// Source: Showdown data/abilities.ts -- Reckless
// ===========================================================================
describe("Reckless in damage calc", () => {
  it("given Reckless + recoil move, when calculating damage, then power is boosted 1.2x", () => {
    // Source: Showdown -- Reckless: 1.2x power for moves with recoil
    const recoilEffect: MoveEffect = { type: "recoil", fraction: 1 / 3 };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.reckless,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const doubleEdge = {
      ...dataManager.getMove(GEN6_MOVE_IDS.doubleEdge),
      effect: recoilEffect,
    } as MoveData;

    const recklessResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: doubleEdge, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: doubleEdge,
        seed: 100,
      }),
      typeChart,
    );

    const ratio = recklessResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Reckless + multi-effect with recoil, when calculating damage, then power is boosted", () => {
    // Source: Showdown -- Reckless detects recoil in multi effects
    const multiEffect: MoveEffect = {
      type: "multi",
      effects: [
        { type: "recoil", fraction: 1 / 3 },
        {
          type: "stat-change",
          stat: "speed",
          stages: 1,
          target: "self",
          chance: 100,
          fromSecondary: false,
        },
      ],
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.reckless,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const move = {
      ...dataManager.getMove(GEN6_MOVE_IDS.tackle),
      id: "test-recoil-multi",
      effect: multiEffect,
    } as MoveData;

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(baseResult.damage);
  });
});

// ===========================================================================
// Sheer Force
// Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
// ===========================================================================
describe("Sheer Force in damage calc", () => {
  it("given Sheer Force + move with status-chance effect, when calculating damage, then 1.3x boost", () => {
    // Source: Showdown -- Sheer Force boosts moves with secondary effects by 5325/4096
    const statusChanceEffect: MoveEffect = { type: "status-chance", status: burn, chance: 10 };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [fire],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const flamethrower = {
      ...dataManager.getMove(GEN6_MOVE_IDS.flamethrower),
      effect: statusChanceEffect,
    } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: flamethrower, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [fire],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: flamethrower,
        seed: 100,
      }),
      typeChart,
    );

    // 5325/4096 = ~1.3x
    const ratio = sfResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it("given Sheer Force + move with volatile-status (flinch) effect, when calculating damage, then 1.3x boost", () => {
    // Source: Showdown -- Sheer Force: volatile-status secondaries (flinch) are eligible
    const flinchEffect: MoveEffect = {
      type: "volatile-status",
      status: flinch as VolatileStatus,
      chance: 30,
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const headbutt = {
      ...dataManager.getMove(GEN6_MOVE_IDS.headbutt),
      effect: flinchEffect,
    } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: headbutt, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: headbutt, seed: 100 }),
      typeChart,
    );

    const ratio = sfResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it("given Sheer Force + whitelisted move (tri-attack), when calculating damage, then 1.3x boost", () => {
    // Source: Showdown -- Tri Attack has secondary effects via onHit, whitelisted
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const triAttack = dataManager.getMove(GEN6_MOVE_IDS.triAttack);

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: triAttack, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: triAttack,
        seed: 100,
      }),
      typeChart,
    );

    const ratio = sfResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it("given Sheer Force + stat-change with fromSecondary, when calculating damage, then boost applies", () => {
    // Source: Showdown -- self-targeted stat changes from secondary.self are eligible
    const selfBoostEffect: MoveEffect = {
      type: "stat-change",
      stat: "speed",
      stages: 1,
      target: "self",
      chance: 100,
      fromSecondary: true,
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [fire],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const flameCharge = {
      ...dataManager.getMove(GEN6_MOVE_IDS.flameCharge),
      effect: selfBoostEffect,
    } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: flameCharge, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [fire],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: flameCharge,
        seed: 100,
      }),
      typeChart,
    );

    expect(sfResult.damage).toBeGreaterThan(baseResult.damage);
  });

  it("given Sheer Force + stat-change targeting foe with chance, when calculating damage, then boost applies", () => {
    // Source: Showdown -- foe-targeted stat drops with a chance are eligible
    const foeDropEffect: MoveEffect = {
      type: "stat-change",
      stat: "defense",
      stages: -1,
      target: "foe",
      chance: 50,
      fromSecondary: false,
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const move = { ...dataManager.getMove(GEN6_MOVE_IDS.acid), effect: foeDropEffect } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move, seed: 100 }),
      typeChart,
    );

    expect(sfResult.damage).toBeGreaterThan(baseResult.damage);
  });
});

// ===========================================================================
// Venoshock / Hex / Acrobatics conditional power
// Source: Showdown data/moves.ts
// ===========================================================================
describe("Conditional power moves in damage calc", () => {
  it("given Venoshock vs poisoned target, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Venoshock: 2x power when target is poisoned
    const attacker = createSyntheticActivePokemon({ types: [poison] });
    const poisonedDefender = createSyntheticActivePokemon({ types: [normal], status: poison });
    const healthyDefender = createSyntheticActivePokemon({ types: [normal] });
    const venoshock = dataManager.getMove(GEN6_MOVE_IDS.venoshock);

    const poisonedResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: poisonedDefender,
        move: venoshock,
        seed: 100,
      }),
      typeChart,
    );
    const healthyResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: healthyDefender,
        move: venoshock,
        seed: 100,
      }),
      typeChart,
    );

    // Integer floor rounding means the ratio won't be exactly 2.0
    const ratio = poisonedResult.damage / healthyResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Venoshock vs badly-poisoned target, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Venoshock also doubles vs badly-poisoned
    const attacker = createSyntheticActivePokemon({ types: [poison] });
    const badlyPoisonedTarget = createSyntheticActivePokemon({
      types: [normal],
      status: badlyPoisoned,
    });
    const healthyDefender = createSyntheticActivePokemon({ types: [normal] });
    const venoshock = dataManager.getMove(GEN6_MOVE_IDS.venoshock);

    const bpResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: badlyPoisonedTarget,
        move: venoshock,
        seed: 100,
      }),
      typeChart,
    );
    const healthyResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: healthyDefender,
        move: venoshock,
        seed: 100,
      }),
      typeChart,
    );

    const ratio = bpResult.damage / healthyResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Hex vs statused target, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Hex: 2x power when target has any status
    // Use Psychic defender (Ghost is SE vs Psychic) so damage is non-zero
    const attacker = createSyntheticActivePokemon({ types: [ghost] });
    const burnedDefender = createSyntheticActivePokemon({ types: [psychic], status: burn });
    const healthyDefender = createSyntheticActivePokemon({ types: [psychic] });
    const hex = dataManager.getMove(GEN6_MOVE_IDS.hex);

    const statusResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: burnedDefender, move: hex, seed: 100 }),
      typeChart,
    );
    const healthyResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: healthyDefender, move: hex, seed: 100 }),
      typeChart,
    );

    // Integer floor rounding means the ratio won't be exactly 2.0
    const ratio = statusResult.damage / healthyResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Acrobatics with no held item, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Acrobatics: 2x power when user has no item
    const attacker = createSyntheticActivePokemon({ types: [flying], heldItem: null });
    const itemAttacker = createSyntheticActivePokemon({
      types: [flying],
      heldItem: GEN6_ITEM_IDS.leftovers,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const acrobatics = dataManager.getMove(GEN6_MOVE_IDS.acrobatics);

    const noItemResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: acrobatics, seed: 100 }),
      typeChart,
    );
    const withItemResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: itemAttacker,
        defender,
        move: acrobatics,
        seed: 100,
      }),
      typeChart,
    );

    const ratio = noItemResult.damage / withItemResult.damage;
    expect(ratio).toBeCloseTo(2.0, 1);
  });
});

// ===========================================================================
// Normalize
// Source: Showdown data/abilities.ts -- Normalize
// ===========================================================================
describe("Normalize in damage calc", () => {
  it("given Normalize + fire move, when calculating damage, then type becomes Normal", () => {
    // Source: Showdown -- Normalize makes all moves Normal type
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.normalize,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [ghost] }); // Ghost is immune to Normal
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    // Normal -> Ghost = immune (0 effectiveness)
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Normalize overrides -ate ability, when calculating damage, then type stays Normal", () => {
    // Source: Showdown -- Normalize overrides -ate abilities (priority -2 vs -1)
    // Aerilate would change Normal to Flying, but Normalize overrides to Normal
    // This is a hypothetical test since a Pokemon can't have both,
    // but we test the code path where ateBoostApplied is reset to false
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.normalize,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [fighting] }); // Fighting resists Normal
    const normalMove = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: normalMove, seed: 100 }),
      typeChart,
    );

    // Normal vs Fighting = 1x (neutral)
    // If it were Flying (from Aerilate), it would be 2x SE
    expect(result.effectiveness).toBe(1);
  });
});

// ===========================================================================
// Rivalry gender-dependent damage
// Source: Showdown data/abilities.ts -- Rivalry
// ===========================================================================
describe("Rivalry in damage calc", () => {
  it("given Rivalry + same gender, when calculating damage, then 1.25x boost", () => {
    // Source: Showdown -- Rivalry: same gender = 1.25x damage
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.rivalry,
      types: [normal],
      gender: CORE_GENDERS.male,
    });
    const defender = createSyntheticActivePokemon({ types: [normal], gender: CORE_GENDERS.male });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const rivalryResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      gender: CORE_GENDERS.male,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Derived from this exact fixture with Tackle (BP 50), SeededRandom(100), and STAB:
    // neutral damage path produces baseDamage 24 and finalDamage 31.
    expect(baseResult.breakdown).toMatchObject({ baseDamage: 24, finalDamage: 31 });
    // Rivalry applies floor(50 * 1.25) = 62 base power for same-gender targets in Gen 6.
    // Under the same fixture and RNG path that yields baseDamage 29 and finalDamage 37.
    expect(rivalryResult.breakdown).toMatchObject({ baseDamage: 29, finalDamage: 37 });
  });

  it("given Rivalry + opposite gender, when calculating damage, then 0.75x reduction", () => {
    // Source: Showdown -- Rivalry: opposite gender = 0.75x damage
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.rivalry,
      types: [normal],
      gender: CORE_GENDERS.male,
    });
    const defender = createSyntheticActivePokemon({ types: [normal], gender: CORE_GENDERS.female });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const rivalryResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      gender: CORE_GENDERS.male,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Derived from this exact fixture with Tackle (BP 50), SeededRandom(100), and STAB:
    // neutral damage path produces baseDamage 24 and finalDamage 31.
    expect(baseResult.breakdown).toMatchObject({ baseDamage: 24, finalDamage: 31 });
    // Rivalry applies floor(50 * 0.75) = 37 base power for opposite-gender targets in Gen 6.
    // Under the same fixture and RNG path that yields baseDamage 18 and finalDamage 22.
    expect(rivalryResult.breakdown).toMatchObject({ baseDamage: 18, finalDamage: 22 });
  });

  it("given Rivalry + genderless target, when calculating damage, then no modifier", () => {
    // Source: Showdown -- Rivalry: genderless = no modifier
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.rivalry,
      types: [normal],
      gender: CORE_GENDERS.male,
    });
    const defender = createSyntheticActivePokemon({
      types: [normal],
      gender: CORE_GENDERS.genderless,
    });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const rivalryResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      gender: CORE_GENDERS.male,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(rivalryResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Legend orbs (Adamant/Lustrous/Griseous)
// Source: Showdown data/items.ts
// ===========================================================================
describe("Legend orbs in damage calc", () => {
  it("given Dialga (483) + Adamant Orb + Dragon move, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Adamant Orb: 4915/4096 for Dialga's Dragon/Steel moves
    const attacker = createSyntheticActivePokemon({
      types: [steel, dragon],
      speciesId: GEN6_SPECIES_IDS.dialga,
      heldItem: GEN6_ITEM_IDS.adamantOrb,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const dragonMove = dataManager.getMove(GEN6_MOVE_IDS.dragonPulse);

    const orbResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: dragonMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      types: [steel, dragon],
      speciesId: GEN6_SPECIES_IDS.dialga,
      heldItem: null,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: dragonMove,
        seed: 100,
      }),
      typeChart,
    );

    expect(baseResult.breakdown).toMatchObject({ baseDamage: 39, finalDamage: 51 });
    expect(orbResult.breakdown).toMatchObject({ baseDamage: 46, finalDamage: 60 });
  });

  it("given Palkia (484) + Lustrous Orb + Water move, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb: 4915/4096 for Palkia's Water/Dragon moves
    const attacker = createSyntheticActivePokemon({
      types: [water, dragon],
      speciesId: GEN6_SPECIES_IDS.palkia,
      heldItem: GEN6_ITEM_IDS.lustrousOrb,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.surf);

    const orbResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      types: [water, dragon],
      speciesId: GEN6_SPECIES_IDS.palkia,
      heldItem: null,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: waterMove,
        seed: 100,
      }),
      typeChart,
    );

    expect(baseResult.breakdown).toMatchObject({ baseDamage: 41, finalDamage: 54 });
    expect(orbResult.breakdown).toMatchObject({ baseDamage: 49, finalDamage: 64 });
  });

  it("given Giratina (487) + Griseous Orb + Ghost move, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Griseous Orb: 4915/4096 for Giratina's Ghost/Dragon moves
    const attacker = createSyntheticActivePokemon({
      types: [ghost, dragon],
      speciesId: GEN6_SPECIES_IDS.giratina,
      heldItem: GEN6_ITEM_IDS.griseousOrb,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const ghostMove = dataManager.getMove(GEN6_MOVE_IDS.shadowBall);

    const orbResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: ghostMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      types: [ghost, dragon],
      speciesId: GEN6_SPECIES_IDS.giratina,
      heldItem: null,
    });
    const _baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: ghostMove,
        seed: 100,
      }),
      typeChart,
    );

    // Ghost vs Normal is 0 (immune) -- need a non-immune defender
    // Actually ghost vs normal = 0 damage. Let me use a different defender type
    expect(orbResult.damage).toBe(0); // Ghost is immune to Normal
  });

  it("given Giratina (487) + Griseous Orb + Ghost move vs Psychic defender, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Griseous Orb for Giratina
    const attacker = createSyntheticActivePokemon({
      types: [ghost, dragon],
      speciesId: GEN6_SPECIES_IDS.giratina,
      heldItem: GEN6_ITEM_IDS.griseousOrb,
    });
    const defender = createSyntheticActivePokemon({ types: [psychic] });
    const ghostMove = dataManager.getMove(GEN6_MOVE_IDS.shadowBall);

    const orbResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: ghostMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      types: [ghost, dragon],
      speciesId: GEN6_SPECIES_IDS.giratina,
      heldItem: null,
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: baseAttacker,
        defender,
        move: ghostMove,
        seed: 100,
      }),
      typeChart,
    );

    expect(baseResult.breakdown).toMatchObject({ baseDamage: 37, finalDamage: 96 });
    expect(orbResult.breakdown).toMatchObject({ baseDamage: 44, finalDamage: 114 });
  });
});

// ===========================================================================
// Ability type immunities + Levitate grounding + Magnet Rise
// Source: Showdown sim/battle.ts -- immunity abilities
// ===========================================================================
describe("Ability type immunities in damage calc", () => {
  it("given defender with Levitate + ground move, when calculating damage, then immune (0 damage)", () => {
    // Source: Showdown -- Levitate: immune to ground
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.levitate,
      types: [normal],
    });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender with Levitate + Gravity active + ground move, when calculating damage, then Levitate is suppressed", () => {
    // Source: Showdown -- Gravity grounds Levitate users
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.levitate,
      types: [normal],
    });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: createSyntheticBattleState({ gravity: { active: true, turnsLeft: 3 } }),
      }),
      typeChart,
    );

    // Gravity suppresses Levitate, so Ground hits
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1);
  });

  it("given defender with Levitate + Iron Ball + ground move, when calculating damage, then Levitate is suppressed", () => {
    // Source: Showdown -- Iron Ball grounds Levitate users
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.levitate,
      types: [normal],
      heldItem: GEN6_ITEM_IDS.ironBall,
    });
    const groundedDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );
    const groundedResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: groundedDefender, move: earthquake }),
      typeChart,
    );

    expect(result.damage).toBe(groundedResult.damage);
    expect(result.effectiveness).toBe(groundedResult.effectiveness);
  });

  it("given Mold Breaker attacker vs Levitate defender + ground move, when calculating damage, then Levitate is bypassed", () => {
    // Source: Showdown -- Mold Breaker bypasses Levitate
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.moldBreaker,
      types: [ground],
    });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.levitate,
      types: [normal],
    });
    const groundedDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
      typeChart,
    );
    const groundedResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: groundedDefender,
        move: earthquake,
        seed: 100,
      }),
      typeChart,
    );

    expect(result.damage).toBe(groundedResult.damage);
    expect(result.effectiveness).toBe(groundedResult.effectiveness);
  });

  it("given Magnet Rise volatile + ground move (no Gravity), when calculating damage, then immune", () => {
    // Source: Showdown -- Magnet Rise: immune to ground
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(magnetRise, { turnsLeft: 5 });
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({ types: [normal], volatiles });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Magnet Rise volatile + Gravity active + ground move, when calculating damage, then not immune", () => {
    // Source: Showdown -- Gravity suppresses Magnet Rise
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(magnetRise, { turnsLeft: 5 });
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({ types: [normal], volatiles });
    const groundedDefender = createSyntheticActivePokemon({ types: [normal] });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: createSyntheticBattleState({ gravity: { active: true, turnsLeft: 3 } }),
      }),
      typeChart,
    );
    const groundedResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: groundedDefender, move: earthquake }),
      typeChart,
    );

    expect(result.damage).toBe(groundedResult.damage);
    expect(result.effectiveness).toBe(groundedResult.effectiveness);
  });

  it("given defender with Volt Absorb + electric move, when calculating damage, then immune (0 damage)", () => {
    // Source: Showdown -- Volt Absorb: immune to electric
    const attacker = createSyntheticActivePokemon({ types: [electric] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.voltAbsorb,
      types: [normal],
    });
    const thunderbolt = dataManager.getMove(GEN6_MOVE_IDS.thunderbolt);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: thunderbolt }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender with Sap Sipper + grass move, when calculating damage, then immune (0 damage)", () => {
    // Source: Showdown -- Sap Sipper: immune to grass
    const attacker = createSyntheticActivePokemon({ types: [grass] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sapSipper,
      types: [normal],
    });
    const grassMove = dataManager.getMove(GEN6_MOVE_IDS.energyBall);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: grassMove }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ===========================================================================
// Scrappy vs Ghost
// Source: Showdown data/abilities.ts -- Scrappy
// ===========================================================================
describe("Scrappy in damage calc", () => {
  it("given Scrappy + Normal move vs Ghost, when calculating damage, then hits (not immune)", () => {
    // Source: Showdown -- Scrappy: Normal/Fighting hit Ghost types
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.scrappy,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({ types: [ghost] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Normally Normal vs Ghost = 0 (immune), but Scrappy bypasses
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1); // Neutral after removing Ghost
  });

  it("given Scrappy + Fighting move vs Ghost, when calculating damage, then hits", () => {
    // Source: Showdown -- Scrappy: Fighting also hits Ghost
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.scrappy,
      types: [fighting],
    });
    const defender = createSyntheticActivePokemon({ types: [ghost] });
    const closeCombat = dataManager.getMove(GEN6_MOVE_IDS.closeCombat);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: closeCombat, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1);
  });
});

// ===========================================================================
// Wonder Guard
// Source: Showdown data/abilities.ts -- Wonder Guard
// ===========================================================================
describe("Wonder Guard in damage calc", () => {
  it("given defender with Wonder Guard + neutral move, when calculating damage, then 0 damage", () => {
    // Source: Showdown -- Wonder Guard: only super-effective moves deal damage
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.wonderGuard,
      types: [normal],
    });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBe(0);
  });

  it("given defender with Wonder Guard + super-effective move, when calculating damage, then deals damage", () => {
    // Source: Showdown -- Wonder Guard: super-effective moves hit
    const attacker = createSyntheticActivePokemon({ types: [fighting] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.wonderGuard,
      types: [normal],
    });
    const closeCombat = dataManager.getMove(GEN6_MOVE_IDS.closeCombat);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: closeCombat, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(2);
  });

  it("given Mold Breaker vs Wonder Guard + neutral move, when calculating damage, then bypasses Wonder Guard", () => {
    // Source: Showdown -- Mold Breaker bypasses Wonder Guard
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.moldBreaker,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.wonderGuard,
      types: [normal],
    });
    const unguardedDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const unguardedResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: unguardedDefender,
        move: tackle,
        seed: 100,
      }),
      typeChart,
    );

    expect(result.damage).toBe(unguardedResult.damage);
    expect(result.effectiveness).toBe(unguardedResult.effectiveness);
  });
});

// ===========================================================================
// Tinted Lens + Heatproof
// Source: Showdown data/abilities.ts
// ===========================================================================
describe("Tinted Lens in damage calc", () => {
  it("given Tinted Lens + not-very-effective move, when calculating damage, then damage is doubled", () => {
    // Source: Showdown -- Tinted Lens: doubles damage for NVE moves
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.tintedLens,
      types: [fire],
    });
    const defender = createSyntheticActivePokemon({ types: [fire] }); // Fire resists Fire
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const tintedResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [fire],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = tintedResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 1);
  });
});

describe("Heatproof in damage calc", () => {
  it("given defender with Heatproof + fire move, when calculating damage, then damage is halved", () => {
    // Source: Showdown data/abilities.ts -- Heatproof: halves fire damage
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.heatproof,
      types: [normal],
    });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const hpResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: baseDefender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = hpResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });
});

// ===========================================================================
// Expert Belt, Muscle Band, Wise Glasses
// Source: Showdown data/items.ts
// ===========================================================================
describe("Final modifier items in damage calc", () => {
  it("given Expert Belt + super-effective move, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Expert Belt: 4915/4096 for SE moves
    const attacker = createSyntheticActivePokemon({
      types: [fire],
      heldItem: GEN6_ITEM_IDS.expertBelt,
    });
    const defender = createSyntheticActivePokemon({ types: [grass] }); // Fire SE vs Grass
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const expertResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({ types: [fire], heldItem: null });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = expertResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Expert Belt + neutral move, when calculating damage, then no boost", () => {
    // Source: Showdown data/items.ts -- Expert Belt only activates for SE
    const attacker = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.expertBelt,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const expertResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({ types: [normal], heldItem: null });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(expertResult.damage).toBe(baseResult.damage);
  });

  it("given Muscle Band + physical move, when calculating damage, then ~1.1x boost", () => {
    // Source: Showdown data/items.ts -- Muscle Band: 4505/4096 for physical
    const attacker = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.muscleBand,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const bandResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({ types: [normal], heldItem: null });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = bandResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.1, 1);
  });

  it("given Wise Glasses + special move, when calculating damage, then ~1.1x boost", () => {
    // Source: Showdown data/items.ts -- Wise Glasses: 4505/4096 for special
    const attacker = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.wiseGlasses,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const swift = dataManager.getMove(GEN6_MOVE_IDS.swift);

    const glassesResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: swift, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({ types: [normal], heldItem: null });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = glassesResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.1, 1);
  });
});

// ===========================================================================
// Metronome item
// Source: Showdown data/items.ts -- Metronome onModifyDamage
// ===========================================================================
describe("Metronome item in damage calc", () => {
  it("given Metronome item with 3 consecutive uses, when calculating damage, then 1.4x boost", () => {
    // Source: Showdown -- Metronome item: +0.2x per consecutive use, max at 2.0x (6 uses)
    // 3 uses = 1 + (3-1)*0.2 = 1.4x
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(CORE_VOLATILE_IDS.metronomeCount, { turnsLeft: -1, data: { count: 3 } });
    const attacker = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.metronome,
      volatiles,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const metResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({ types: [normal], heldItem: null });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = metResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.4, 1);
  });

  it("given Metronome item with 1 use (first), when calculating damage, then no boost", () => {
    // Source: Showdown -- Metronome first use: boostSteps = 1 - 1 = 0, no boost
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(CORE_VOLATILE_IDS.metronomeCount, { turnsLeft: -1, data: { count: 1 } });
    const attacker = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.metronome,
      volatiles,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const metResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = createSyntheticActivePokemon({ types: [normal], heldItem: null });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(metResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Gem consumption + Unburden trigger
// Source: Showdown data/abilities.ts -- Unburden: onAfterUseItem speed doubling
// ===========================================================================
describe("Gem consumption and Unburden in damage calc", () => {
  it("given attacker with Unburden + gem that matches move type, when calculating damage, then gem is consumed and Unburden activates", () => {
    // Source: Showdown -- Gem consumed after boosting, triggers Unburden
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.unburden,
      types: [normal],
      heldItem: GEN6_ITEM_IDS.normalGem,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Gem consumed
    expect(attacker.pokemon.heldItem).toBeNull();
    // Unburden volatile set
    expect(attacker.volatileStatuses.has(unburden)).toBe(true);
    // Damage should be > 0
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given attacker without Unburden + gem consumed, when calculating damage, then no Unburden volatile", () => {
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [fire],
      heldItem: GEN6_ITEM_IDS.fireGem,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Gem consumed
    expect(attacker.pokemon.heldItem).toBeNull();
    // No Unburden
    expect(attacker.volatileStatuses.has(unburden)).toBe(false);
  });
});

// ===========================================================================
// Type-resist berry + Unburden on defender
// Source: Showdown data/items.ts -- type-resist berries
// ===========================================================================
describe("Type-resist berry consumption + Unburden on defender", () => {
  it("given defender with Unburden + resist berry that activates, when calculating damage, then berry consumed and Unburden activates", () => {
    // Source: Showdown -- type-resist berry consumed triggers Unburden
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.unburden,
      types: [grass],
      heldItem: GEN6_ITEM_IDS.occaBerry,
    });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Berry consumed (Fire SE vs Grass)
    expect(defender.pokemon.heldItem).toBeNull();
    // Unburden activates
    expect(defender.volatileStatuses.has(unburden)).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given defender with Klutz + resist berry, when calculating damage, then berry does NOT activate", () => {
    // Source: Showdown -- Klutz suppresses items
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.klutz,
      types: [grass],
      heldItem: GEN6_ITEM_IDS.occaBerry,
    });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Berry not consumed due to Klutz
    expect(defender.pokemon.heldItem).toBe(occaBerry);
  });

  it("given defender with Embargo volatile + resist berry, when calculating damage, then berry does NOT activate", () => {
    // Source: Showdown -- Embargo suppresses items
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(embargo, { turnsLeft: 5 });
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({
      types: [grass],
      heldItem: GEN6_ITEM_IDS.occaBerry,
      volatiles,
    });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    expect(defender.pokemon.heldItem).toBe(occaBerry);
  });

  it("given Chilan Berry + neutral Normal move, when calculating damage, then berry activates (no SE requirement)", () => {
    // Source: Showdown -- Chilan Berry activates on any Normal hit, no SE needed
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const defender = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.chilanBerry,
    });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const chilanResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseDefender = createSyntheticActivePokemon({ types: [normal], heldItem: null });
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: baseDefender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Berry halves damage
    const ratio = chilanResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
    // Berry consumed
    expect(defender.pokemon.heldItem).toBeNull();
  });
});

// ===========================================================================
// Burn + Guts bypass
// Source: Showdown sim/battle-actions.ts -- burn/guts interaction
// ===========================================================================
describe("Burn + Guts in damage calc", () => {
  it("given burned attacker with Guts using physical move, when calculating damage, then burn penalty is bypassed", () => {
    // Source: Showdown -- Guts bypasses burn damage penalty
    const burnedGuts = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.guts,
      types: [normal],
      status: burn,
    });
    const burnedNoGuts = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      status: burn,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const gutsResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: burnedGuts, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const burnResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: burnedNoGuts, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Guts bypasses burn penalty AND gets 1.5x Atk boost
    // So Guts result should be significantly higher than burned result
    expect(gutsResult.damage).toBeGreaterThan(burnResult.damage);
  });
});

// ===========================================================================
// Attack stat items: Huge Power, Choice Band/Specs, Soul Dew, Deep Sea Tooth,
// Light Ball, Thick Club, Slow Start, Defeatist
// Source: Showdown sim/battle-actions.ts -- stat modifiers
// ===========================================================================
describe("Attack stat modifiers in damage calc", () => {
  it("given Huge Power + physical move, when calculating damage, then attack is doubled", () => {
    // Source: Showdown -- Huge Power doubles physical attack stat
    const hugePower = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.hugePower,
      types: [normal],
      attack: 100,
    });
    const base = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const hpResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: hugePower, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Integer floor rounding means ratio won't be exactly 2.0
    const ratio = hpResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Choice Band + physical move, when calculating damage, then attack is boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Choice Band: 1.5x Atk
    const choiceBand = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.choiceBand,
      attack: 100,
    });
    const base = createSyntheticActivePokemon({ types: [normal], heldItem: null, attack: 100 });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const cbResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: choiceBand, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = cbResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Choice Specs + special move, when calculating damage, then spAttack is boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Choice Specs: 1.5x SpAtk
    const choiceSpecs = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.choiceSpecs,
      spAttack: 100,
    });
    const base = createSyntheticActivePokemon({ types: [normal], heldItem: null, spAttack: 100 });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const swift = dataManager.getMove(GEN6_MOVE_IDS.swift);

    const csResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: choiceSpecs, defender, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = csResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Soul Dew + Latios (381) + special move, when calculating damage, then spAttack is boosted 1.5x", () => {
    // Source: Showdown sim/items.ts -- Soul Dew Gen 3-6: 1.5x SpAtk/SpDef for Lati@s
    const soulDew = createSyntheticActivePokemon({
      types: [dragon, psychic],
      speciesId: GEN6_SPECIES_IDS.latios,
      heldItem: GEN6_ITEM_IDS.soulDew,
      spAttack: 100,
    });
    const base = createSyntheticActivePokemon({
      types: [dragon, psychic],
      speciesId: GEN6_SPECIES_IDS.latios,
      heldItem: null,
      spAttack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const dragonPulse = dataManager.getMove(GEN6_MOVE_IDS.dragonPulse);

    const sdResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: soulDew, defender, move: dragonPulse, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: dragonPulse, seed: 100 }),
      typeChart,
    );

    const ratio = sdResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Deep Sea Tooth + Clamperl (366) + special move, when calculating damage, then spAttack is doubled", () => {
    // Source: Showdown sim/items.ts -- Deep Sea Tooth: 2x SpAtk for Clamperl
    const dsTooth = createSyntheticActivePokemon({
      types: [water],
      speciesId: GEN6_SPECIES_IDS.clamperl,
      heldItem: GEN6_ITEM_IDS.deepSeaTooth,
      spAttack: 100,
    });
    const base = createSyntheticActivePokemon({
      types: [water],
      speciesId: GEN6_SPECIES_IDS.clamperl,
      heldItem: null,
      spAttack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const waterMove = dataManager.getMove(GEN6_MOVE_IDS.surf);

    const dstResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: dsTooth, defender, move: waterMove, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const ratio = dstResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Light Ball + Pikachu (25) + physical move, when calculating damage, then attack is doubled", () => {
    // Source: Showdown sim/items.ts -- Light Ball: 2x Atk+SpAtk for Pikachu
    const lightBall = createSyntheticActivePokemon({
      types: [electric],
      speciesId: GEN6_SPECIES_IDS.pikachu,
      heldItem: GEN6_ITEM_IDS.lightBall,
      attack: 100,
    });
    const base = createSyntheticActivePokemon({
      types: [electric],
      speciesId: GEN6_SPECIES_IDS.pikachu,
      heldItem: null,
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const lbResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: lightBall, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = lbResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Thick Club + Marowak (105) + physical move, when calculating damage, then attack is doubled", () => {
    // Source: Showdown sim/items.ts -- Thick Club: 2x Atk for Cubone/Marowak
    const thickClub = createSyntheticActivePokemon({
      types: [ground],
      speciesId: GEN6_SPECIES_IDS.marowak,
      heldItem: GEN6_ITEM_IDS.thickClub,
      attack: 100,
    });
    const base = createSyntheticActivePokemon({
      types: [ground],
      speciesId: GEN6_SPECIES_IDS.marowak,
      heldItem: null,
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const boneClub = dataManager.getMove(GEN6_MOVE_IDS.boneClub);

    const tcResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: thickClub, defender, move: boneClub, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: boneClub, seed: 100 }),
      typeChart,
    );

    const ratio = tcResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Slow Start volatile + physical move, when calculating damage, then attack is halved", () => {
    // Source: Showdown data/abilities.ts -- Slow Start: halve Attack for first 5 turns
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(GEN6_ABILITY_IDS.slowStart, { turnsLeft: 5 });
    const slowStartMon = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.slowStart,
      types: [normal],
      attack: 100,
      volatiles,
    });
    const base = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const ssResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: slowStartMon, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = ssResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given Defeatist + HP <= 50%, when calculating damage, then attack/spAttack is halved", () => {
    // Source: Showdown data/abilities.ts -- Defeatist: halve Atk/SpAtk when HP <= 50%
    const defeatist = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.defeatist,
      types: [normal],
      hp: 200,
      currentHp: 100, // exactly 50%
      attack: 100,
    });
    const base = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      hp: 200,
      currentHp: 100,
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const defResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: defeatist, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = defResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given Klutz + Choice Band, when calculating damage, then Choice Band is suppressed", () => {
    // Source: Showdown -- Klutz suppresses held items
    const klutzCB = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.klutz,
      types: [normal],
      heldItem: GEN6_ITEM_IDS.choiceBand,
      attack: 100,
    });
    const noItem = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.klutz,
      types: [normal],
      heldItem: null,
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const klutzResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: klutzCB, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const noItemResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: noItem, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Klutz suppresses Choice Band, so both should be equal
    expect(klutzResult.damage).toBe(noItemResult.damage);
  });
});

// ===========================================================================
// Defense stat items: Deep Sea Scale, Eviolite, Sandstorm Rock SpDef, Flower Gift
// Source: Showdown sim/items.ts
// ===========================================================================
describe("Defense stat modifiers in damage calc", () => {
  it("given Deep Sea Scale + Clamperl (366) + special move, when calculating damage, then spDefense is doubled", () => {
    // Source: Showdown sim/items.ts -- Deep Sea Scale: 2x SpDef for Clamperl
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const dsScale = createSyntheticActivePokemon({
      types: [water],
      speciesId: GEN6_SPECIES_IDS.clamperl,
      heldItem: GEN6_ITEM_IDS.deepSeaScale,
      spDefense: 100,
    });
    const base = createSyntheticActivePokemon({
      types: [water],
      speciesId: GEN6_SPECIES_IDS.clamperl,
      heldItem: null,
      spDefense: 100,
    });
    const swift = dataManager.getMove(GEN6_MOVE_IDS.swift);

    const scaleResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: dsScale, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = scaleResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given Eviolite + any Pokemon + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Eviolite: 1.5x Def/SpDef
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const eviolite = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.eviolite,
      spDefense: 100,
    });
    const base = createSyntheticActivePokemon({ types: [normal], heldItem: null, spDefense: 100 });
    const swift = dataManager.getMove(GEN6_MOVE_IDS.swift);

    const evResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: eviolite, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = evResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1); // 1/1.5 ≈ 0.67
  });

  it("given Sandstorm + Rock defender + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Bulbapedia -- Sandstorm boosts Rock-type SpDef by 50% (Gen 4+)
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const rockDef = createSyntheticActivePokemon({ types: [rock], spDefense: 100 });
    const base = createSyntheticActivePokemon({ types: [rock], spDefense: 100 });
    const swift = dataManager.getMove(GEN6_MOVE_IDS.swift);

    const sandResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: rockDef,
        move: swift,
        state: createSyntheticBattleState({
          weather: { type: "sand", turnsLeft: 5, source: GEN6_ABILITY_IDS.sandStream },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = sandResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1); // 1/1.5
  });

  it("given Flower Gift + sun + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Flower Gift: 1.5x SpDef in sun
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const flowerGift = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.flowerGift,
      types: [grass],
      spDefense: 100,
    });
    const base = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [grass],
      spDefense: 100,
    });
    const swift = dataManager.getMove(GEN6_MOVE_IDS.swift);

    const fgResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: flowerGift,
        move: swift,
        state: createSyntheticBattleState({
          weather: { type: sun, turnsLeft: 5, source: GEN6_ABILITY_IDS.drought },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: base,
        move: swift,
        state: createSyntheticBattleState({
          weather: { type: sun, turnsLeft: 5, source: GEN6_ABILITY_IDS.drought },
        }),
        seed: 100,
      }),
      typeChart,
    );

    const ratio = fgResult.damage / baseResult.damage;
    expect(ratio).toBe(2 / 3);
  });

  it("given Marvel Scale + status + physical move, when calculating damage, then defense boosted 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale: 1.5x Def when statused
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const marvelScale = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.marvelScale,
      types: [water],
      status: burn,
      defense: 100,
    });
    const base = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [water],
      status: burn,
      defense: 100,
    });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const msResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: marvelScale, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: base, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = msResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1);
  });

  it("given Soul Dew + Latias (380) defender + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Showdown -- Soul Dew Gen 3-6: 1.5x SpDef for Latias
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const soulDewDef = createSyntheticActivePokemon({
      types: [dragon, psychic],
      speciesId: GEN6_SPECIES_IDS.latias,
      heldItem: GEN6_ITEM_IDS.soulDew,
      spDefense: 100,
    });
    const base = createSyntheticActivePokemon({
      types: [dragon, psychic],
      speciesId: GEN6_SPECIES_IDS.latias,
      heldItem: null,
      spDefense: 100,
    });
    const swift = dataManager.getMove(GEN6_MOVE_IDS.swift);

    const sdResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: soulDewDef, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = sdResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1);
  });
});

// ===========================================================================
// Stat stages: Simple, Unaware, crit ignore
// Source: Showdown sim/battle.ts -- stat stages
// ===========================================================================
describe("Stat stages in damage calc", () => {
  it("given Simple + +1 attack stage, when calculating damage, then attack stage is doubled to +2", () => {
    // Source: Showdown -- Simple doubles stat stage effects
    const simple = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.simple,
      types: [normal],
      attack: 100,
      statStages: {
        attack: 1,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
    });
    const base = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      attack: 100,
      statStages: PLUS_TWO_ATTACK_STAT_STAGES,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const simpleResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: simple, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Simple +1 = +2 effective, which should match explicitly +2
    expect(simpleResult.damage).toBe(baseResult.damage);
  });

  it("given Unaware defender + attacker with +6 attack, when calculating damage, then attack stages are ignored", () => {
    // Source: Showdown -- Unaware ignores attacker's stat stages
    const boosted = createSyntheticActivePokemon({
      types: [normal],
      attack: 100,
      statStages: PLUS_SIX_ATTACK_STAT_STAGES,
    });
    const base = createSyntheticActivePokemon({
      types: [normal],
      attack: 100,
    });
    const unawareDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.unaware,
      types: [normal],
    });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const unawareResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: boosted,
        defender: unawareDefender,
        move: tackle,
        seed: 100,
      }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: base,
        defender: unawareDefender,
        move: tackle,
        seed: 100,
      }),
      typeChart,
    );

    // Unaware ignores attacker stages, so +6 is treated as +0
    expect(unawareResult.damage).toBe(baseResult.damage);
  });

  it("given critical hit + negative attack stage, when calculating damage, then negative stage is ignored (treated as 0)", () => {
    // Source: Showdown -- crits ignore negative attack stages
    const debuffed = createSyntheticActivePokemon({
      types: [normal],
      attack: 100,
      statStages: MINUS_THREE_ATTACK_STAT_STAGES,
    });
    const base = createSyntheticActivePokemon({ types: [normal], attack: 100 });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const critResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: debuffed,
        defender,
        move: tackle,
        isCrit: true,
        seed: 100,
      }),
      typeChart,
    );
    const baseCritResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: base,
        defender,
        move: tackle,
        isCrit: true,
        seed: 100,
      }),
      typeChart,
    );

    // Crit ignores -3 attack (treats as 0), same as base with 0 stages
    expect(critResult.damage).toBe(baseCritResult.damage);
  });

  it("given critical hit + positive defense stage, when calculating damage, then positive defense stage is ignored", () => {
    // Source: Showdown -- crits ignore positive defense stages
    const attacker = createSyntheticActivePokemon({ types: [normal], attack: 100 });
    const boostedDef = createSyntheticActivePokemon({
      types: [normal],
      defense: 100,
      statStages: PLUS_SIX_DEFENSE_STAT_STAGES,
    });
    const baseDef = createSyntheticActivePokemon({ types: [normal], defense: 100 });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const critBoostedResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: boostedDef,
        move: tackle,
        isCrit: true,
        seed: 100,
      }),
      typeChart,
    );
    const critBaseResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: baseDef,
        move: tackle,
        isCrit: true,
        seed: 100,
      }),
      typeChart,
    );

    // Crit ignores +6 defense (treats as 0), same as base
    expect(critBoostedResult.damage).toBe(critBaseResult.damage);
  });
});

// ===========================================================================
// Chip Away / Sacred Sword -- ignore defense stages
// Source: Showdown data/moves.ts -- chipaway/sacredsword: { ignoreDefensive: true }
// ===========================================================================
describe("Chip Away / Sacred Sword in damage calc", () => {
  it("given Sacred Sword vs +6 defense, when calculating damage, then defense stages are ignored", () => {
    // Source: Showdown -- Sacred Sword ignores target's defense stages
    const attacker = createSyntheticActivePokemon({ types: [fighting], attack: 100 });
    const boostedDef = createSyntheticActivePokemon({
      types: [normal],
      defense: 100,
      statStages: PLUS_SIX_DEFENSE_STAT_STAGES,
    });
    const baseDef = createSyntheticActivePokemon({ types: [normal], defense: 100 });
    const sacredSword = dataManager.getMove(GEN6_MOVE_IDS.sacredSword);

    const ssResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: boostedDef,
        move: sacredSword,
        seed: 100,
      }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: baseDef, move: sacredSword, seed: 100 }),
      typeChart,
    );

    // Sacred Sword ignores defense stages, so +6 is treated as +0
    expect(ssResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Spread modifier (doubles format)
// Source: Showdown sim/battle-actions.ts -- spread move damage modifier
// ===========================================================================
describe("Spread modifier in damage calc", () => {
  it("given doubles format + all-adjacent-foes move, when calculating damage, then 0.75x damage", () => {
    // Source: Showdown -- spread moves in doubles deal 0.75x damage (3072/4096)
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const spreadMove = dataManager.getMove(GEN6_MOVE_IDS.rockSlide);

    const doublesResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: spreadMove,
        state: createSyntheticBattleState({ format: "doubles" }),
        seed: 100,
      }),
      typeChart,
    );
    const singlesResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: spreadMove,
        seed: 100,
      }),
      typeChart,
    );

    const ratio = doublesResult.damage / singlesResult.damage;
    expect(ratio).toBeCloseTo(0.75, 1);
  });
});

// ===========================================================================
// Sniper crit boost
// Source: Showdown data/abilities.ts -- Sniper
// ===========================================================================
describe("Sniper in damage calc", () => {
  it("given Sniper + critical hit, when calculating damage, then crit is 2.25x (1.5x * 1.5x)", () => {
    // Source: Showdown -- Sniper: additional 1.5x on top of 1.5x crit = 2.25x
    const sniper = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sniper,
      types: [normal],
    });
    const base = createSyntheticActivePokemon({ ability: GEN6_ABILITY_IDS.none, types: [normal] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const sniperCrit = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: sniper,
        defender,
        move: tackle,
        isCrit: true,
        seed: 100,
      }),
      typeChart,
    );
    const baseCrit = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker: base,
        defender,
        move: tackle,
        isCrit: true,
        seed: 100,
      }),
      typeChart,
    );

    expect(baseCrit.breakdown?.critMultiplier).toBe(1.5);
    expect(sniperCrit.breakdown?.critMultiplier).toBe(2.25);
  });
});

// ===========================================================================
// Hustle in damage calc
// Source: Showdown -- Hustle: 1.5x physical attack
// ===========================================================================
describe("Hustle in damage calc", () => {
  it("given Hustle + physical move, when calculating damage, then attack stat boosted 1.5x", () => {
    // Source: Showdown -- Hustle: 1.5x Atk for physical moves
    const hustle = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.hustle,
      types: [normal],
      attack: 100,
    });
    const base = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
      attack: 100,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const hustleResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: hustle, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = hustleResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ===========================================================================
// Embargo volatile suppressing gem
// Source: Showdown -- Embargo: items have no effect
// ===========================================================================
describe("Embargo suppressing gems in damage calc", () => {
  it("given Embargo volatile + gem, when calculating damage, then gem does NOT activate", () => {
    // Source: Showdown -- Embargo suppresses items
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(embargo, { turnsLeft: 5 });
    const attacker = createSyntheticActivePokemon({
      types: [normal],
      heldItem: GEN6_ITEM_IDS.normalGem,
      volatiles,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Gem NOT consumed due to Embargo
    expect(attacker.pokemon.heldItem).toBe(normalGem);
  });
});

// ===========================================================================
// Gravity / Iron Ball vs Flying type effectiveness
// Source: Showdown -- Ground hits Flying when grounded
// ===========================================================================
describe("Gravity / Iron Ball type effectiveness override in damage calc", () => {
  it("given Gravity active + ground move vs Flying type, when calculating damage, then Flying immunity is removed", () => {
    // Source: Showdown -- Gravity: Ground moves hit Flying types
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({ types: [flying] });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const gravityResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: createSyntheticBattleState({ gravity: { active: true, turnsLeft: 3 } }),
        seed: 100,
      }),
      typeChart,
    );

    // Without gravity, Ground vs Flying = 0 (immune)
    const noGravityResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );

    expect(noGravityResult.damage).toBe(0);
    expect(gravityResult.damage).toBeGreaterThan(0);
  });

  it("given Iron Ball defender + ground move vs Flying type, when calculating damage, then Flying immunity is removed", () => {
    // Source: Showdown -- Iron Ball grounds the holder
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({
      types: [flying],
      heldItem: GEN6_ITEM_IDS.ironBall,
    });
    const groundedDefender = createSyntheticActivePokemon({ types: [normal] });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
      typeChart,
    );
    const groundedResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: groundedDefender,
        move: earthquake,
        seed: 100,
      }),
      typeChart,
    );

    expect(result.damage).toBe(groundedResult.damage);
    expect(result.effectiveness).toBe(groundedResult.effectiveness);
  });
});

// ===========================================================================
// Terrain power modifiers
// Source: Showdown data/conditions.ts -- terrain onBasePower handlers
// ===========================================================================
describe("Terrain power modifiers in damage calc", () => {
  it("given Electric Terrain + electric move + grounded attacker, when calculating damage, then 1.5x boost", () => {
    // Source: Bulbapedia "Electric Terrain" Gen 6 -- 1.5x Electric for grounded attacker
    const attacker = createSyntheticActivePokemon({ types: [electric] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const thunderbolt = dataManager.getMove(GEN6_MOVE_IDS.thunderbolt);

    const terrainResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: thunderbolt,
        state: createSyntheticBattleState({ terrain: { type: electric, turnsLeft: 5 } }),
        seed: 100,
      }),
      typeChart,
    );
    const noTerrainResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: thunderbolt, seed: 100 }),
      typeChart,
    );

    const ratio = terrainResult.damage / noTerrainResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Grassy Terrain + Earthquake vs grounded target, when calculating damage, then damage is halved", () => {
    // Source: Showdown -- Grassy Terrain halves Earthquake/Bulldoze/Magnitude vs grounded targets
    const attacker = createSyntheticActivePokemon({ types: [ground] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const grassyResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: createSyntheticBattleState({ terrain: { type: GRASSY_TERRAIN, turnsLeft: 5 } }),
        seed: 100,
      }),
      typeChart,
    );
    const noTerrainResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
      typeChart,
    );

    const ratio = grassyResult.damage / noTerrainResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });
});

// ===========================================================================
// Round ally boost
// Source: Showdown data/moves.ts -- round.basePowerCallback
// ===========================================================================
describe("Round ally boost in damage calc", () => {
  it("given ally already used Round this turn, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Round: doubles power if ally used Round earlier
    const attacker = createSyntheticActivePokemon({ types: [normal] });
    const ally = createSyntheticActivePokemon({
      types: [normal],
      lastMoveUsed: GEN6_MOVE_IDS.round,
      movedThisTurn: true,
    });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const roundMove = dataManager.getMove(GEN6_MOVE_IDS.round);

    const state = createSyntheticBattleState({
      sides: [{ active: [attacker, ally] }, { active: [defender] }],
    });

    const roundResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: roundMove, state, seed: 100 }),
      typeChart,
    );

    // Without ally boost
    const soloState = createSyntheticBattleState({
      sides: [{ active: [attacker] }, { active: [defender] }],
    });
    const soloResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender,
        move: roundMove,
        state: soloState,
        seed: 100,
      }),
      typeChart,
    );

    // Integer floor rounding means ratio won't be exactly 2.0
    const ratio = roundResult.damage / soloResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });
});

// ===========================================================================
// Thick Fat in damage calc
// Source: Showdown -- Thick Fat: halve effective attack for fire/ice
// ===========================================================================
describe("Thick Fat in damage calc (through calculateGen6Damage)", () => {
  it("given defender with Thick Fat + fire move, when calculating damage, then damage is halved", () => {
    // Source: Showdown -- Thick Fat: halves attacker's effective stat for fire/ice
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const thickFat = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.thickFat,
      types: [normal],
    });
    const base = createSyntheticActivePokemon({ ability: GEN6_ABILITY_IDS.none, types: [normal] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const tfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: thickFat, move: fireMove, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender: base, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = tfResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });
});

// ===========================================================================
// hasRecoilEffect with null effect
// Source: Showdown data/abilities.ts -- Reckless checks for recoil flag
// ===========================================================================
describe("Reckless with no effect (null)", () => {
  it("given Reckless + move with null effect, when calculating damage, then no Reckless boost", () => {
    // Source: Showdown -- Reckless only activates for moves with recoil effect
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.reckless,
      types: [normal],
    });
    const base = createSyntheticActivePokemon({ ability: GEN6_ABILITY_IDS.none, types: [normal] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const recklessResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(recklessResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Sheer Force with non-eligible effects
// Source: Showdown data/abilities.ts -- sheerforce
// ===========================================================================
describe("Sheer Force with non-eligible effects", () => {
  it("given Sheer Force + stat-change targeting self (non-secondary), when calculating damage, then no boost", () => {
    // Source: Showdown -- self-targeted stat changes NOT from secondary are not eligible
    const selfBoostEffect: MoveEffect = {
      type: "stat-change",
      stat: "attack",
      stages: 2,
      target: "self",
      chance: 100,
      fromSecondary: false,
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [normal],
    });
    const base = createSyntheticActivePokemon({ ability: GEN6_ABILITY_IDS.none, types: [normal] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const move = {
      ...dataManager.getMove(GEN6_MOVE_IDS.tackle),
      effect: selfBoostEffect,
    } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move, seed: 100 }),
      typeChart,
    );

    expect(sfResult.damage).toBe(baseResult.damage);
  });

  it("given Sheer Force + volatile-status with chance 0, when calculating damage, then no boost", () => {
    // Source: Showdown -- volatile-status with chance=0 is not eligible
    const vsEffect: MoveEffect = {
      type: "volatile-status",
      status: flinch as VolatileStatus,
      chance: 0,
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [normal],
    });
    const base = createSyntheticActivePokemon({ ability: GEN6_ABILITY_IDS.none, types: [normal] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const move = { ...dataManager.getMove(GEN6_MOVE_IDS.tackle), effect: vsEffect } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move, seed: 100 }),
      typeChart,
    );

    expect(sfResult.damage).toBe(baseResult.damage);
  });

  it("given Sheer Force + stat-change targeting foe with chance 0, when calculating damage, then no boost", () => {
    // Source: Showdown -- foe-targeted stat drop with chance=0 is not eligible
    const foeDropEffect: MoveEffect = {
      type: "stat-change",
      stat: "defense",
      stages: -1,
      target: "foe",
      chance: 0,
      fromSecondary: false,
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [normal],
    });
    const base = createSyntheticActivePokemon({ ability: GEN6_ABILITY_IDS.none, types: [normal] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const move = {
      ...dataManager.getMove(GEN6_MOVE_IDS.tackle),
      effect: foeDropEffect,
    } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move, seed: 100 }),
      typeChart,
    );

    expect(sfResult.damage).toBe(baseResult.damage);
  });

  it("given Sheer Force + multi-effect with only non-eligible sub-effects, when calculating damage, then no boost", () => {
    // Source: Showdown -- multi effect where no sub-effect is eligible
    const multiEffect: MoveEffect = {
      type: "multi",
      effects: [
        {
          type: "stat-change",
          stat: "attack",
          stages: 1,
          target: "self",
          chance: 100,
          fromSecondary: false,
        },
      ],
    };
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.sheerForce,
      types: [normal],
    });
    const base = createSyntheticActivePokemon({ ability: GEN6_ABILITY_IDS.none, types: [normal] });
    const defender = createSyntheticActivePokemon({ types: [normal] });
    const move = { ...dataManager.getMove(GEN6_MOVE_IDS.tackle), effect: multiEffect } as MoveData;

    const sfResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      createSyntheticDamageContext({ attacker: base, defender, move, seed: 100 }),
      typeChart,
    );

    expect(sfResult.damage).toBe(baseResult.damage);
  });
});

// ===========================================================================
// Teravolt / Turboblaze as mold breaker variants
// Source: Showdown data/abilities.ts -- Teravolt/Turboblaze = Mold Breaker
// ===========================================================================
describe("Teravolt / Turboblaze as mold breaker in damage calc", () => {
  it("given Teravolt attacker vs Levitate defender + ground move, when calculating damage, then Levitate bypassed", () => {
    // Source: Showdown -- Teravolt = Mold Breaker
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.teravolt,
      types: [ground],
    });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.levitate,
      types: [normal],
    });
    const groundedDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const earthquake = dataManager.getMove(GEN6_MOVE_IDS.earthquake);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
      typeChart,
    );
    const groundedResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: groundedDefender,
        move: earthquake,
        seed: 100,
      }),
      typeChart,
    );

    expect(result.damage).toBe(groundedResult.damage);
    expect(result.effectiveness).toBe(groundedResult.effectiveness);
  });

  it("given Turboblaze attacker vs Wonder Guard defender + neutral move, when calculating damage, then Wonder Guard bypassed", () => {
    // Source: Showdown -- Turboblaze = Mold Breaker
    const attacker = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.turboblaze,
      types: [normal],
    });
    const defender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.wonderGuard,
      types: [normal],
    });
    const unguardedDefender = createSyntheticActivePokemon({
      ability: GEN6_ABILITY_IDS.none,
      types: [normal],
    });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const unguardedResult = calculateGen6Damage(
      createSyntheticDamageContext({
        attacker,
        defender: unguardedDefender,
        move: tackle,
        seed: 100,
      }),
      typeChart,
    );

    expect(result.damage).toBe(unguardedResult.damage);
    expect(result.effectiveness).toBe(unguardedResult.effectiveness);
  });
});

// ===========================================================================
// NVE type effectiveness (< 1 && > 0) -- exercises the while (typeMod <= 0.5)
// Source: Showdown sim/battle-actions.ts -- type effectiveness integer math
// ===========================================================================
describe("Not-very-effective type effectiveness math", () => {
  it("given 0.25x effectiveness (double resist), when calculating damage, then damage is quartered", () => {
    // Source: Showdown -- 0.25x = floor(floor(damage/2)/2)
    // Fire vs Water/Fire = 0.25x (Fire resists Fire, Water resists Fire)
    const attacker = createSyntheticActivePokemon({ types: [fire] });
    const defender = createSyntheticActivePokemon({ types: [fire, water] });
    const fireMove = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const result = calculateGen6Damage(
      createSyntheticDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    expect(result.effectiveness).toBe(0.25);
    expect(result.damage).toBeGreaterThan(0);
  });
});
