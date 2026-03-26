import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src";
import {
  calculateGen8Damage,
  isGen8Grounded,
  pokeRound,
  TYPE_RESIST_BERRIES,
} from "../src/Gen8DamageCalc";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const data = createGen8DataManager();
const moves = { ...CORE_MOVE_IDS, ...GEN8_MOVE_IDS } as const;
const items = { ...CORE_ITEM_IDS, ...GEN8_ITEM_IDS } as const;
const abilities = { none: CORE_ABILITY_IDS.none, ...GEN8_ABILITY_IDS } as const;
const species = GEN8_SPECIES_IDS;
const natures = GEN8_NATURE_IDS;
const moveCategories = CORE_MOVE_CATEGORIES;
const statuses = CORE_STATUS_IDS;
const terrains = CORE_TERRAIN_IDS;
const types = CORE_TYPE_IDS;
const weathers = CORE_WEATHER_IDS;
const tackle = data.getMove(moves.tackle);
const growl = data.getMove(moves.growl);
const flamethrower = data.getMove(moves.flamethrower);
const bodyPress = data.getMove(moves.bodyPress);
const behemothBlade = data.getMove(moves.behemothBlade);
const behemothBash = data.getMove(moves.behemothBash);
const dynamaxCannon = data.getMove(moves.dynamaxCannon);
const facade = data.getMove(moves.facade);
const defaultSpecies = data.getSpecies(species.bulbasaur);
const defaultCalculatedStats = {
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;
const neutralStatStages = {
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
  accuracy: 0,
  evasion: 0,
} as const;

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData>): MoveData {
  return {
    ...baseMove,
    ...overrides,
  };
}

function createSyntheticMove(
  type: PokemonType,
  power: number | null,
  category: MoveData["category"] = moveCategories.physical,
  opts?: {
    baseMove?: MoveData;
    flags?: Partial<MoveData["flags"]>;
    effect?: MoveData["effect"];
    critRatio?: number;
    target?: string;
    id?: string;
  },
): MoveData {
  const baseMove =
    opts?.baseMove ??
    (category === moveCategories.special
      ? flamethrower
      : category === moveCategories.status
        ? growl
        : tackle);

  return createSyntheticMoveFrom(baseMove, {
    id: opts?.id ?? baseMove.id,
    type,
    power,
    category,
    target: opts?.target ?? baseMove.target,
    effect: opts?.effect ?? baseMove.effect ?? null,
    critRatio: opts?.critRatio ?? baseMove.critRatio ?? 0,
    flags: {
      ...baseMove.flags,
      ...opts?.flags,
    },
    generation: 8,
  });
}

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
  gender?: (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isDynamaxed?: boolean;
}): ActivePokemon {
  const hp = overrides.hp ?? defaultCalculatedStats.hp;
  const attack = overrides.attack ?? defaultCalculatedStats.attack;
  const defense = overrides.defense ?? defaultCalculatedStats.defense;
  const spAttack = overrides.spAttack ?? defaultCalculatedStats.spAttack;
  const spDefense = overrides.spDefense ?? defaultCalculatedStats.spDefense;
  const speed = overrides.speed ?? defaultCalculatedStats.speed;
  const pokemon = createPokemonInstance(
    defaultSpecies,
    overrides.level ?? 50,
    new SeededRandom(7),
    {
      nature: natures.hardy,
      gender: overrides.gender ?? CORE_GENDERS.male,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      moves: [],
      isShiny: false,
      metLocation: "test-location",
      originalTrainer: "Test",
      originalTrainerId: 12345,
      pokeball: items.pokeBall,
    },
  );
  pokemon.moves = [createMoveSlot(tackle.id, tackle.pp)];
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = overrides.ability ?? abilities.none;
  pokemon.status = (overrides.status ?? null) as typeof pokemon.status;
  pokemon.calculatedStats = { hp, attack, defense, spAttack, spDefense, speed };

  return {
    pokemon,
    teamSlot: 0,
    statStages: { ...neutralStatStages },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [types.normal],
    ability: overrides.ability ?? abilities.none,
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
    isDynamaxed: overrides.isDynamaxed ?? false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createSyntheticBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
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
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
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
    attacker: overrides.attacker ?? createOnFieldPokemon({}),
    defender: overrides.defender ?? createOnFieldPokemon({}),
    move:
      overrides.move ??
      createSyntheticMoveFrom(tackle, {
        type: types.normal,
        power: 50,
        category: moveCategories.physical,
      }),
    state: overrides.state ?? createSyntheticBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

// Use the Gen8 type chart for all tests
const typeChart = GEN8_TYPE_CHART as Record<string, Record<string, number>>;

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
    // Source: Showdown sim/battle.ts modify()
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

  it("given value=100 and modifier=5325 (1.3x terrain boost), when applying pokeRound, then returns 130", () => {
    // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x = 5325/4096
    // 100 * 5325 = 532500; floor((532500 + 2047) / 4096) = floor(534547 / 4096) = 130
    expect(pokeRound(100, 5325)).toBe(130);
  });
});

// ---------------------------------------------------------------------------
// Base damage formula tests
// ---------------------------------------------------------------------------

describe("Gen 8 base damage formula", () => {
  it("given L50 attacker with 100 ATK vs 100 DEF using 50 BP physical move, when calculating, then returns correct base damage within random roll range", () => {
    // Source: Bulbapedia damage formula derivation
    // levelFactor = floor(2 * 50 / 5) + 2 = 22
    // baseDamage = floor(floor(22 * 50 * 100 / 100) / 50) + 2
    //   = floor(floor(110000 / 100) / 50) + 2
    //   = floor(1100 / 50) + 2
    //   = 22 + 2 = 24
    // No STAB (attacker Water, move Normal)
    // roll [85..100]:
    //   min = floor(24 * 85 / 100) = floor(2040/100) = 20
    //   max = floor(24 * 100 / 100) = 24
    const ctx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.water] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      seed: 42,
    });

    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBeGreaterThanOrEqual(20);
    expect(result.damage).toBeLessThanOrEqual(24);
    expect(result.effectiveness).toBe(1);
  });

  it("given L100 attacker with 200 ATK vs 150 DEF using 80 BP physical move, when calculating, then returns correct base damage range", () => {
    // Source: Bulbapedia damage formula derivation
    // levelFactor = floor(2 * 100 / 5) + 2 = 42
    // baseDamage = floor(floor(42 * 80 * 200 / 150) / 50) + 2
    //   = floor(floor(672000 / 150) / 50) + 2
    //   = floor(4480 / 50) + 2
    //   = 89 + 2 = 91
    // No STAB (attacker Water, move Normal)
    // roll [85..100]:
    //   min = floor(91 * 85 / 100) = floor(7735/100) = 77
    //   max = floor(91 * 100 / 100) = 91
    const ctx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ level: 100, attack: 200, types: [types.water] }),
      defender: createOnFieldPokemon({ defense: 150 }),
      move: createSyntheticMove(types.normal, 80, moveCategories.physical),
      seed: 42,
    });

    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBeGreaterThanOrEqual(77);
    expect(result.damage).toBeLessThanOrEqual(91);
    expect(result.effectiveness).toBe(1);
  });

  it("given a status move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
    const ctx = createSyntheticDamageContext({
      move: createSyntheticMove(types.normal, null, moveCategories.status),
    });
    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// STAB tests
// ---------------------------------------------------------------------------

describe("Gen 8 STAB", () => {
  it("given a Fire-type attacker using a Fire move, when calculating with STAB, then damage is 1.5x base", () => {
    // Source: Showdown sim/battle-actions.ts -- STAB = 1.5x (6144/4096)
    // Use same seed for both to get same random roll
    const noStabCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.water] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.physical),
      seed: 12345,
    });
    const stabCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.fire] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.physical),
      seed: 12345,
    });

    const noStab = calculateGen8Damage(noStabCtx, typeChart);
    const stab = calculateGen8Damage(stabCtx, typeChart);

    // STAB damage / non-STAB should be approximately 1.5x (may differ by rounding)
    // baseDamage = 24. If roll = R:
    //   noStab = floor(24 * R / 100)
    //   stab = pokeRound(floor(24 * R / 100), 6144)
    expect(stab.damage).toBeGreaterThan(noStab.damage);
    // The ratio should be ~1.5
    const ratio = stab.damage / noStab.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  it("given an Adaptability attacker using a STAB move, when calculating, then STAB is 2.0x", () => {
    // Source: Showdown data/abilities.ts -- Adaptability: STAB becomes 2.0x (8192/4096)
    const normalStabCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.fire], ability: abilities.none }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.physical),
      seed: 12345,
    });
    const adaptCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [types.fire],
        ability: abilities.adaptability,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.physical),
      seed: 12345,
    });

    const normalStab = calculateGen8Damage(normalStabCtx, typeChart);
    const adaptStab = calculateGen8Damage(adaptCtx, typeChart);

    // Adaptability STAB should be greater than normal STAB
    expect(adaptStab.damage).toBeGreaterThan(normalStab.damage);
  });
});

// ---------------------------------------------------------------------------
// Terrain boost tests -- KEY Gen 8 change: 1.3x (not 1.5x)
// ---------------------------------------------------------------------------

describe("Gen 8 terrain boost (1.3x, nerfed from Gen 7 1.5x)", () => {
  it("given a grounded attacker using an Electric move in Electric Terrain, when calculating, then terrain applies 1.3x boost (5325/4096)", () => {
    // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost nerfed to 1.3x in Gen 8
    // baseDamage = 24 (L50, 100 ATK, 100 DEF, 50 BP)
    // With 1.3x terrain: power = pokeRound(50, 5325) = floor((50*5325 + 2047)/4096) = floor(268297/4096) = 65
    // After terrain power adjustment:
    //   baseDamage = floor(floor(22 * 65 * 100 / 100) / 50) + 2 = floor(1430/50) + 2 = 28+2 = 30
    // Note: terrain boost applied to power before the base damage formula
    const noTerrainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.electric] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.electric, 50, moveCategories.physical),
      seed: 99999,
    });
    const terrainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.electric] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.electric, 50, moveCategories.physical),
      state: createSyntheticBattleState({
        terrain: { type: terrains.electric, turnsLeft: 5, source: moves.electricTerrain },
      }),
      seed: 99999,
    });

    const noTerrain = calculateGen8Damage(noTerrainCtx, typeChart);
    const withTerrain = calculateGen8Damage(terrainCtx, typeChart);

    // Terrain boost should increase damage
    expect(withTerrain.damage).toBeGreaterThan(noTerrain.damage);

    // The ratio should be approximately 1.3x (terrain boost is on power, not final damage,
    // so the ratio may not be exactly 1.3 due to floor rounding in the base formula)
    // But it must NOT be 1.5x (Gen 7 value)
    const ratio = withTerrain.damage / noTerrain.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.2);
    expect(ratio).toBeLessThanOrEqual(1.4); // must be ~1.3, not 1.5
  });

  it("given a grounded attacker using a Grass move in Grassy Terrain, when calculating, then terrain applies 1.3x boost", () => {
    // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost nerfed to 1.3x in Gen 8
    const noTerrainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 150, types: [types.grass] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.grass, 80, moveCategories.physical),
      seed: 77777,
    });
    const terrainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 150, types: [types.grass] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.grass, 80, moveCategories.physical),
      state: createSyntheticBattleState({
        terrain: { type: terrains.grassy, turnsLeft: 5, source: moves.grassyTerrain },
      }),
      seed: 77777,
    });

    const noTerrain = calculateGen8Damage(noTerrainCtx, typeChart);
    const withTerrain = calculateGen8Damage(terrainCtx, typeChart);

    expect(withTerrain.damage).toBeGreaterThan(noTerrain.damage);
    const ratio = withTerrain.damage / noTerrain.damage;
    // Must be ~1.3x, NOT 1.5x
    expect(ratio).toBeGreaterThanOrEqual(1.2);
    expect(ratio).toBeLessThanOrEqual(1.4);
  });

  it("given a grounded attacker using a Psychic move in Psychic Terrain, when calculating, then terrain applies 1.3x boost", () => {
    // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost nerfed to 1.3x in Gen 8
    const noTerrainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 120, types: [types.psychic] }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.psychic, 90, moveCategories.special),
      seed: 55555,
    });
    const terrainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 120, types: [types.psychic] }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.psychic, 90, moveCategories.special),
      state: createSyntheticBattleState({
        terrain: { type: terrains.psychic, turnsLeft: 5, source: moves.psychicTerrain },
      }),
      seed: 55555,
    });

    const noTerrain = calculateGen8Damage(noTerrainCtx, typeChart);
    const withTerrain = calculateGen8Damage(terrainCtx, typeChart);

    expect(withTerrain.damage).toBeGreaterThan(noTerrain.damage);
    const ratio = withTerrain.damage / noTerrain.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.2);
    expect(ratio).toBeLessThanOrEqual(1.4);
  });

  it("given a Flying-type (non-grounded) attacker using an Electric move in Electric Terrain, when calculating, then terrain does NOT apply", () => {
    // Source: Showdown data/conditions.ts -- terrain only boosts grounded Pokemon
    const groundedCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.electric] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.electric, 50, moveCategories.physical),
      state: createSyntheticBattleState({
        terrain: { type: terrains.electric, turnsLeft: 5, source: moves.electricTerrain },
      }),
      seed: 42,
    });
    const flyingCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, types: [types.flying] }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.electric, 50, moveCategories.physical),
      state: createSyntheticBattleState({
        terrain: { type: terrains.electric, turnsLeft: 5, source: moves.electricTerrain },
      }),
      seed: 42,
    });

    const grounded = calculateGen8Damage(groundedCtx, typeChart);
    const flying = calculateGen8Damage(flyingCtx, typeChart);

    // Flying attacker not grounded: no terrain boost, damage should be lower
    expect(grounded.damage).toBeGreaterThan(flying.damage);
  });

  it("given Misty Terrain and a Dragon move vs grounded defender, when calculating, then Dragon move is halved (0.5x)", () => {
    // Source: Showdown data/conditions.ts -- mistyterrain: onBasePower 0.5x for Dragon vs grounded
    const noTerrainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [types.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.normal] }),
      move: createSyntheticMove(types.dragon, 60, moveCategories.special),
      seed: 42,
    });
    const mistyCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, types: [types.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.normal] }),
      move: createSyntheticMove(types.dragon, 60, moveCategories.special),
      state: createSyntheticBattleState({
        terrain: { type: terrains.misty, turnsLeft: 5, source: moves.mistyTerrain },
      }),
      seed: 42,
    });

    const noTerrain = calculateGen8Damage(noTerrainCtx, typeChart);
    const misty = calculateGen8Damage(mistyCtx, typeChart);

    // Misty Terrain halves Dragon damage vs grounded defender
    const ratio = misty.damage / noTerrain.damage;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });
});

// ---------------------------------------------------------------------------
// Weather tests
// ---------------------------------------------------------------------------

describe("Gen 8 weather modifiers", () => {
  it("given Sun weather and a Fire-type move, when calculating, then damage is 1.5x", () => {
    // Source: Showdown sim/battle-actions.ts -- Sun: Fire 1.5x (6144/4096)
    const noWeatherCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });
    const sunCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      state: createSyntheticBattleState({
        weather: { type: weathers.sun, turnsLeft: 5, source: moves.sunnyDay },
      }),
      seed: 42,
    });

    const noWeather = calculateGen8Damage(noWeatherCtx, typeChart);
    const sun = calculateGen8Damage(sunCtx, typeChart);
    expect(sun.damage).toBeGreaterThan(noWeather.damage);
    // Should be ~1.5x
    const ratio = sun.damage / noWeather.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  it("given Rain weather and a Water-type move, when calculating, then damage is 1.5x", () => {
    // Source: Showdown sim/battle-actions.ts -- Rain: Water 1.5x (6144/4096)
    const noWeatherCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.water, 50, moveCategories.special),
      seed: 42,
    });
    const rainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.water, 50, moveCategories.special),
      state: createSyntheticBattleState({
        weather: { type: weathers.rain, turnsLeft: 5, source: moves.rainDance },
      }),
      seed: 42,
    });

    const noWeather = calculateGen8Damage(noWeatherCtx, typeChart);
    const rain = calculateGen8Damage(rainCtx, typeChart);
    expect(rain.damage).toBeGreaterThan(noWeather.damage);
    const ratio = rain.damage / noWeather.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  it("given Sun weather and a Water-type move, when calculating, then damage is 0.5x", () => {
    // Source: Showdown sim/battle-actions.ts -- Sun: Water 0.5x (2048/4096)
    const noWeatherCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.water, 50, moveCategories.special),
      seed: 42,
    });
    const sunCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.water, 50, moveCategories.special),
      state: createSyntheticBattleState({
        weather: { type: weathers.sun, turnsLeft: 5, source: moves.sunnyDay },
      }),
      seed: 42,
    });

    const noWeather = calculateGen8Damage(noWeatherCtx, typeChart);
    const sun = calculateGen8Damage(sunCtx, typeChart);
    expect(sun.damage).toBeLessThan(noWeather.damage);
    const ratio = sun.damage / noWeather.damage;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });

  it("given Rain weather and a Fire-type move, when calculating, then damage is 0.5x", () => {
    // Source: Showdown sim/battle-actions.ts -- Rain: Fire 0.5x (2048/4096)
    const noWeatherCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });
    const rainCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      state: createSyntheticBattleState({
        weather: { type: weathers.rain, turnsLeft: 5, source: moves.rainDance },
      }),
      seed: 42,
    });

    const noWeather = calculateGen8Damage(noWeatherCtx, typeChart);
    const rain = calculateGen8Damage(rainCtx, typeChart);
    expect(rain.damage).toBeLessThan(noWeather.damage);
    const ratio = rain.damage / noWeather.damage;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });
});

// ---------------------------------------------------------------------------
// Critical hit tests
// ---------------------------------------------------------------------------

describe("Gen 8 critical hit", () => {
  it("given a critical hit, when calculating damage, then damage is 1.5x", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit: pokeRound(baseDamage, 6144)
    const noCritCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      isCrit: false,
      seed: 42,
    });
    const critCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      isCrit: true,
      seed: 42,
    });

    const noCrit = calculateGen8Damage(noCritCtx, typeChart);
    const crit = calculateGen8Damage(critCtx, typeChart);

    expect(crit.damage).toBeGreaterThan(noCrit.damage);
    expect(crit.isCrit).toBe(true);
    // Crit is 1.5x modifier
    const ratio = crit.damage / noCrit.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  it("given a critical hit with Sniper ability, when calculating damage, then crit damage is higher than normal crit", () => {
    // Source: Showdown data/abilities.ts -- Sniper: 1.5x on top of 1.5x crit = 2.25x total
    const normalCritCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      isCrit: true,
      seed: 42,
    });
    const sniperCritCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, ability: abilities.sniper }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      isCrit: true,
      seed: 42,
    });

    const normalCrit = calculateGen8Damage(normalCritCtx, typeChart);
    const sniperCrit = calculateGen8Damage(sniperCritCtx, typeChart);

    expect(normalCrit.breakdown?.critMultiplier).toBe(1.5);
    expect(sniperCrit.breakdown?.critMultiplier).toBe(2.25);
    expect(sniperCrit.damage).toBeGreaterThan(normalCrit.damage);
  });
});

// ---------------------------------------------------------------------------
// Body Press tests -- uses Defense for damage
// ---------------------------------------------------------------------------

describe("Gen 8 Body Press", () => {
  it("given Body Press with high Defense attacker, when calculating damage, then uses user Defense as attack stat", () => {
    // Source: Showdown data/moves.ts -- Body Press uses user's Defense instead of Attack
    // Body Press: Fighting, Physical, 80 BP
    // With 131 Defense as "attack" vs 100 defense:
    //   levelFactor = 22 (L50)
    //   baseDamage = floor(floor(22 * 80 * 131 / 100) / 50) + 2
    //     = floor(floor(230560 / 100) / 50) + 2
    //     = floor(2305 / 50) + 2 = 46 + 2 = 48
    const ctx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({
        attack: 50,
        defense: 131,
        types: [types.grass, types.steel],
      }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.water] }),
      move: bodyPress,
      seed: 42,
    });

    const result = calculateGen8Damage(ctx, typeChart);
    // baseDamage = 48 (neutral vs Water), min roll = floor(48*85/100) = 40, max = 48
    // If it used Attack (50) instead, baseDamage would be much lower:
    //   floor(floor(22*80*50/100)/50)+2 = floor(880/50)+2 = 17+2 = 19
    expect(result.damage).toBeGreaterThanOrEqual(40);
    expect(result.damage).toBeLessThanOrEqual(48);
  });

  it("given Body Press with low Defense attacker but high Attack, when calculating damage, then still uses Defense (not Attack)", () => {
    // Source: Showdown data/moves.ts -- Body Press always uses Defense, ignores Attack
    // Defense = 60, Attack = 200 (should use 60)
    const ctx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 200, defense: 60, types: [types.water] }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.water] }),
      move: bodyPress,
      seed: 42,
    });

    const result = calculateGen8Damage(ctx, typeChart);
    // If used Defense (60): baseDamage = floor(floor(22*80*60/100)/50)+2 = floor(1056/50)+2 = 21+2 = 23
    // If used Attack (200): baseDamage would be floor(floor(22*80*200/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
    // No STAB (attacker Water, move Fighting), neutral effectiveness (Fighting vs Water = 1x)
    // min roll for 23 = floor(23*85/100) = 19
    expect(result.damage).toBeLessThanOrEqual(23); // cannot exceed baseDamage of 23
    expect(result.damage).toBeGreaterThanOrEqual(19);
  });
});

// ---------------------------------------------------------------------------
// Behemoth Blade/Bash/Dynamax Cannon -- 2x vs Dynamaxed
// ---------------------------------------------------------------------------

describe("Gen 8 anti-Dynamax moves", () => {
  it("given Behemoth Blade vs non-Dynamaxed target, when calculating, then damage is normal", () => {
    // Source: Showdown data/conditions.ts:785 -- Behemoth Blade 2x only vs Dynamaxed
    const ctx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 150, types: [types.steel] }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.normal], isDynamaxed: false }),
      move: behemothBlade,
      seed: 42,
    });

    const result = calculateGen8Damage(ctx, typeChart);
    // With STAB: baseDamage = floor(floor(22*100*150/100)/50)+2 = floor(3300/50)+2 = 66+2 = 68
    // After random and STAB: moderate damage
    expect(result.damage).toBeGreaterThan(0);
    // Store for comparison below
    expect(result.effectiveness).toBe(1);
  });

  it("given Behemoth Blade vs Dynamaxed target, when calculating, then damage is 2x compared to non-Dynamaxed", () => {
    // Source: Showdown data/conditions.ts:785-786 -- Behemoth series + Dynamax Cannon deal 2x vs Dynamaxed
    const normalCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 150, types: [types.steel] }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.normal], isDynamaxed: false }),
      move: behemothBlade,
      seed: 42,
    });
    const dynamaxCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 150, types: [types.steel] }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.normal], isDynamaxed: true }),
      move: behemothBlade,
      seed: 42,
    });

    const normal = calculateGen8Damage(normalCtx, typeChart);
    const dynamax = calculateGen8Damage(dynamaxCtx, typeChart);

    // 2x damage vs Dynamaxed
    const ratio = dynamax.damage / normal.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.9);
    expect(ratio).toBeLessThanOrEqual(2.1);
  });

  it("given Behemoth Bash vs Dynamaxed target, when calculating, then damage is 2x", () => {
    // Source: Showdown data/conditions.ts:785-786 -- Behemoth Bash: 2x vs Dynamaxed
    const normalCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 130, types: [types.steel] }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.normal], isDynamaxed: false }),
      move: behemothBash,
      seed: 42,
    });
    const dynamaxCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 130, types: [types.steel] }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.normal], isDynamaxed: true }),
      move: behemothBash,
      seed: 42,
    });

    const normal = calculateGen8Damage(normalCtx, typeChart);
    const dynamax = calculateGen8Damage(dynamaxCtx, typeChart);

    const ratio = dynamax.damage / normal.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.9);
    expect(ratio).toBeLessThanOrEqual(2.1);
  });

  it("given Dynamax Cannon vs Dynamaxed target, when calculating, then damage is 2x", () => {
    // Source: Showdown data/conditions.ts:785-786 -- Dynamax Cannon: 2x vs Dynamaxed
    const normalCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 120, types: [types.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.normal], isDynamaxed: false }),
      move: dynamaxCannon,
      seed: 42,
    });
    const dynamaxCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 120, types: [types.dragon] }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.normal], isDynamaxed: true }),
      move: dynamaxCannon,
      seed: 42,
    });

    const normal = calculateGen8Damage(normalCtx, typeChart);
    const dynamax = calculateGen8Damage(dynamaxCtx, typeChart);

    const ratio = dynamax.damage / normal.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.9);
    expect(ratio).toBeLessThanOrEqual(2.1);
  });
});

// ---------------------------------------------------------------------------
// Type effectiveness tests
// ---------------------------------------------------------------------------

describe("Gen 8 type effectiveness", () => {
  it("given a super-effective Fire move vs Grass defender, when calculating, then damage is 2x", () => {
    // Source: Showdown data/typechart.ts -- Fire > Grass = 2x
    const neutralCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.normal] }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });
    const seCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.grass] }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });

    const neutral = calculateGen8Damage(neutralCtx, typeChart);
    const se = calculateGen8Damage(seCtx, typeChart);

    expect(se.effectiveness).toBe(2);
    expect(neutral.effectiveness).toBe(1);
    // SE damage should be ~2x neutral
    const ratio = se.damage / neutral.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.9);
    expect(ratio).toBeLessThanOrEqual(2.1);
  });

  it("given a not-very-effective Fire move vs Water defender, when calculating, then damage is 0.5x", () => {
    // Source: Showdown data/typechart.ts -- Fire > Water = 0.5x
    const neutralCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.normal] }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });
    const nveCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.water] }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });

    const neutral = calculateGen8Damage(neutralCtx, typeChart);
    const nve = calculateGen8Damage(nveCtx, typeChart);

    expect(nve.effectiveness).toBe(0.5);
    const ratio = nve.damage / neutral.damage;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });

  it("given a Normal move vs Ghost defender, when calculating, then damage is 0 (immune)", () => {
    // Source: Showdown data/typechart.ts -- Normal > Ghost = 0x
    const ctx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.ghost] }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      seed: 42,
    });

    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Burn debuff tests
// ---------------------------------------------------------------------------

describe("Gen 8 burn debuff", () => {
  it("given a burned attacker using a physical move, when calculating, then damage is halved", () => {
    // Source: Showdown sim/battle-actions.ts -- burn: pokeRound(baseDamage, 2048) = 0.5x
    const noBurnCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      seed: 42,
    });
    const burnCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, status: statuses.burn }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      seed: 42,
    });

    const noBurn = calculateGen8Damage(noBurnCtx, typeChart);
    const burn = calculateGen8Damage(burnCtx, typeChart);

    expect(burn.damage).toBeLessThan(noBurn.damage);
    const ratio = burn.damage / noBurn.damage;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });

  it("given a burned attacker using a special move, when calculating, then burn does NOT apply", () => {
    // Source: Showdown sim/battle-actions.ts -- burn penalty only on physical moves
    const noBurnCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });
    const burnCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100, status: statuses.burn }),
      defender: createOnFieldPokemon({ spDefense: 100 }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });

    const noBurn = calculateGen8Damage(noBurnCtx, typeChart);
    const burn = calculateGen8Damage(burnCtx, typeChart);

    // Special moves unaffected by burn
    expect(burn.damage).toBe(noBurn.damage);
  });

  it("given a burned attacker using Facade (physical), when calculating, then burn penalty is bypassed", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+: Facade bypasses burn
    const burnNormalCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, status: statuses.burn }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.normal, 70, moveCategories.physical),
      seed: 42,
    });
    const burnFacadeCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100, status: statuses.burn }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: facade,
      seed: 42,
    });

    const normal = calculateGen8Damage(burnNormalCtx, typeChart);
    const facadeResult = calculateGen8Damage(burnFacadeCtx, typeChart);

    // Facade bypasses burn penalty even when rounded damage ties the baseline.
    expect(normal.breakdown?.burnMultiplier).toBe(0.5);
    expect(facadeResult.breakdown?.burnMultiplier).toBe(1);
    expect(facadeResult.damage).toBeGreaterThanOrEqual(normal.damage);
  });
});

// ---------------------------------------------------------------------------
// Type resist berries tests
// ---------------------------------------------------------------------------

describe("Gen 8 type resist berries", () => {
  it("given defender with Occa Berry taking super-effective Fire hit, when calculating, then berry halves damage", () => {
    // Source: Showdown data/items.ts -- type-resist berries: onSourceModifyDamage 0.5x
    const noBerrySECtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ spDefense: 100, types: [types.grass] }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });
    const berryCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({
        spDefense: 100,
        types: [types.grass],
        heldItem: items.occaBerry,
      }),
      move: createSyntheticMove(types.fire, 50, moveCategories.special),
      seed: 42,
    });

    const noBerry = calculateGen8Damage(noBerrySECtx, typeChart);
    const berry = calculateGen8Damage(berryCtx, typeChart);

    expect(berry.damage).toBeLessThan(noBerry.damage);
    const ratio = berry.damage / noBerry.damage;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });

  it("given defender with Chilan Berry taking normal-effectiveness Normal hit, when calculating, then berry halves damage", () => {
    // Source: Showdown data/items.ts -- Chilan Berry activates on any Normal-type hit (no SE requirement)
    const noBerryCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({ defense: 100, types: [types.normal] }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      seed: 42,
    });
    const berryCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({ attack: 100 }),
      defender: createOnFieldPokemon({
        defense: 100,
        types: [types.normal],
        heldItem: items.chilanBerry,
      }),
      move: createSyntheticMove(types.normal, 50, moveCategories.physical),
      seed: 42,
    });

    const noBerry = calculateGen8Damage(noBerryCtx, typeChart);
    const berry = calculateGen8Damage(berryCtx, typeChart);

    expect(berry.damage).toBeLessThan(noBerry.damage);
    const ratio = berry.damage / noBerry.damage;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });
});

// ---------------------------------------------------------------------------
// TYPE_RESIST_BERRIES export check
// ---------------------------------------------------------------------------

describe("TYPE_RESIST_BERRIES map", () => {
  it("given the berry map, when checking known entries, then all 18 type resist berries are present", () => {
    // Source: Showdown data/items.ts -- 18 type-resist berries (including Chilan and Roseli)
    expect(TYPE_RESIST_BERRIES[items.occaBerry]).toBe(types.fire);
    expect(TYPE_RESIST_BERRIES[items.passhoBerry]).toBe(types.water);
    expect(TYPE_RESIST_BERRIES[items.chilanBerry]).toBe(types.normal);
    expect(TYPE_RESIST_BERRIES[items.roseliBerry]).toBe(types.fairy);
    expect(Object.keys(TYPE_RESIST_BERRIES)).toHaveLength(18);
  });
});

// ---------------------------------------------------------------------------
// isGen8Grounded export check
// ---------------------------------------------------------------------------

describe("isGen8Grounded function", () => {
  it("given a Normal-type Pokemon with no modifiers, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- non-Flying, no Levitate, no Air Balloon = grounded
    const pokemon = createOnFieldPokemon({ types: [types.normal] });
    expect(isGen8Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Flying type is not grounded
    const pokemon = createOnFieldPokemon({ types: [types.flying] });
    expect(isGen8Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type Pokemon under Gravity, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity grounds everyone
    const pokemon = createOnFieldPokemon({ types: [types.flying] });
    expect(isGen8Grounded(pokemon, true)).toBe(true);
  });

  it("given a Pokemon with Levitate, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate = not grounded
    const pokemon = createOnFieldPokemon({ types: [types.normal], ability: abilities.levitate });
    expect(isGen8Grounded(pokemon, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gorilla Tactics ability test
// ---------------------------------------------------------------------------

describe("Gen 8 Gorilla Tactics", () => {
  it("given attacker with Gorilla Tactics using a physical move, when calculating damage, then attack is boosted by 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Gorilla Tactics: onModifyAtk 1.5x
    const noAbilityCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [types.fighting],
        ability: abilities.none,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.fighting, 80, moveCategories.physical),
      seed: 42,
    });
    const gorillaCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [types.fighting],
        ability: abilities.gorillaTactics,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.fighting, 80, moveCategories.physical),
      seed: 42,
    });

    const noAbility = calculateGen8Damage(noAbilityCtx, typeChart);
    const gorilla = calculateGen8Damage(gorillaCtx, typeChart);

    expect(gorilla.damage).toBeGreaterThan(noAbility.damage);
  });
});

// ---------------------------------------------------------------------------
// Libero / Protean (Gen 8 pre-nerf: every move use)
// ---------------------------------------------------------------------------

describe("Gen 8 Libero/Protean type-changing", () => {
  it("given attacker with Libero using an Ice move, when calculating, then the move gets STAB", () => {
    // Source: Showdown data/abilities.ts -- Libero changes type before damage calc
    // In Gen 8, Libero/Protean fire on every move use (no once-per-switchin limit)
    // Note: The actual type-change is handled by the engine, but the damage calc
    // should correctly use the attacker's current types for STAB.
    // If the engine has already set the attacker's type to match the move, STAB applies.
    const liberoCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [types.ice],
        ability: abilities.libero,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.ice, 50, moveCategories.physical),
      seed: 42,
    });
    const noStabCtx = createSyntheticDamageContext({
      attacker: createOnFieldPokemon({
        attack: 100,
        types: [types.normal],
        ability: abilities.none,
      }),
      defender: createOnFieldPokemon({ defense: 100 }),
      move: createSyntheticMove(types.ice, 50, moveCategories.physical),
      seed: 42,
    });

    const libero = calculateGen8Damage(liberoCtx, typeChart);
    const noStab = calculateGen8Damage(noStabCtx, typeChart);

    // STAB should apply since types already include ice
    expect(libero.damage).toBeGreaterThan(noStab.damage);
  });
});

// ---------------------------------------------------------------------------
// Unaware vs Simple interaction (regression: #757)
// ---------------------------------------------------------------------------

describe("Gen 8 damage calc -- Unaware vs Simple interaction (regression: #757)", () => {
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
      ability: abilities.simple,
      types: [types.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: abilities.unaware,
      types: [types.water],
    });
    const move = createSyntheticMove(types.normal, 50, moveCategories.physical);
    const ctx = createSyntheticDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen8Damage(ctx, typeChart);
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
      ability: abilities.simple,
      types: [types.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: abilities.none,
      types: [types.water],
    });
    const move = createSyntheticMove(types.normal, 50, moveCategories.physical);
    const ctx = createSyntheticDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });

  it("given Teravolt attacker with +2 Atk stage vs Unaware defender, when calculating damage, then Mold Breaker bypasses Unaware and stages apply", () => {
    // Mold Breaker/Teravolt/Turboblaze bypass breakable abilities (flags: { breakable: 1 }).
    // Unaware is breakable, so a Teravolt attacker ignores Unaware — stages are NOT zeroed.
    // Source: Showdown sim/battle.ts Gen 8+ — ability.flags.breakable check.
    //
    // Derivation (Teravolt bypasses Unaware → effective stage = +2, multiplier = 4/2 = 2.0):
    //   effectiveAttack = floor(100 * 2.0) = 200
    //   L50, defense=100, power=50, normal-type physical, water vs water (neutral, no STAB)
    //   step1 = floor(22 * 50 * 200 / 100) = 2200
    //   baseDamage = floor(2200 / 50) + 2 = 44 + 2 = 46
    //   random(seed=42) = 94 → floor(46 * 94 / 100) = floor(43.24) = 43
    const attacker = createOnFieldPokemon({
      attack: 100,
      ability: abilities.teravolt,
      types: [types.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: abilities.unaware,
      types: [types.water],
    });
    const move = createSyntheticMove(types.normal, 50, moveCategories.physical);
    const ctx = createSyntheticDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBe(43);
  });

  it("given Simple attacker with +2 Atk stage vs Turboblaze defender, when calculating damage, then defender's Mold Breaker does NOT suppress attacker's Simple — stages still doubled to +4", () => {
    // The defender's Mold Breaker family only suppresses the *target's* (defender's) abilities
    // when the Mold Breaker user is attacking. A defending Turboblaze does NOT suppress the
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
      ability: abilities.simple,
      types: [types.water],
    });
    attacker.statStages.attack = 2;
    const defender = createOnFieldPokemon({
      defense: 100,
      ability: abilities.turboblaze,
      types: [types.water],
    });
    const move = createSyntheticMove(types.normal, 50, moveCategories.physical);
    const ctx = createSyntheticDamageContext({ attacker, defender, move, seed: 42 });
    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBe(63);
  });
});
