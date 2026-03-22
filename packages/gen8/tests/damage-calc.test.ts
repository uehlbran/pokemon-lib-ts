import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
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
  gender?: "male" | "female" | "genderless";
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isDynamaxed?: boolean;
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
      gender: (overrides.gender ?? "male") as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
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
    isDynamaxed: overrides.isDynamaxed ?? false,
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
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  target?: string;
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
    target: overrides.target ?? "adjacent-foe",
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
      ...overrides.flags,
    },
    effect: overrides.effect ?? null,
    description: "",
    generation: 8,
    critRatio: overrides.critRatio ?? 0,
  } as MoveData;
}

function makeState(overrides?: {
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
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["water"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "normal" }),
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
    const ctx = makeDamageContext({
      attacker: makeActive({ level: 100, attack: 200, types: ["water"] }),
      defender: makeActive({ defense: 150 }),
      move: makeMove({ power: 80, type: "normal" }),
      seed: 42,
    });

    const result = calculateGen8Damage(ctx, typeChart);
    expect(result.damage).toBeGreaterThanOrEqual(77);
    expect(result.damage).toBeLessThanOrEqual(91);
    expect(result.effectiveness).toBe(1);
  });

  it("given a status move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
    const ctx = makeDamageContext({
      move: makeMove({ category: "status", power: null }),
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
    const noStabCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["water"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "fire" }),
      seed: 12345,
    });
    const stabCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fire"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "fire" }),
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
    const normalStabCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fire"], ability: "none" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "fire" }),
      seed: 12345,
    });
    const adaptCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fire"], ability: "adaptability" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "fire" }),
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
    const noTerrainCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["electric"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "electric" }),
      seed: 99999,
    });
    const terrainCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["electric"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "electric" }),
      state: makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
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
    const noTerrainCtx = makeDamageContext({
      attacker: makeActive({ attack: 150, types: ["grass"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 80, type: "grass" }),
      seed: 77777,
    });
    const terrainCtx = makeDamageContext({
      attacker: makeActive({ attack: 150, types: ["grass"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 80, type: "grass" }),
      state: makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
    const noTerrainCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 120, types: ["psychic"] }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 90, type: "psychic", category: "special" }),
      seed: 55555,
    });
    const terrainCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 120, types: ["psychic"] }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 90, type: "psychic", category: "special" }),
      state: makeState({
        terrain: { type: "psychic", turnsLeft: 5, source: "test" },
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
    const groundedCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["electric"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "electric" }),
      state: makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
      }),
      seed: 42,
    });
    const flyingCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["flying"] }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "electric" }),
      state: makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
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
    const noTerrainCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["dragon"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 60, type: "dragon", category: "special" }),
      seed: 42,
    });
    const mistyCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, types: ["dragon"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 60, type: "dragon", category: "special" }),
      state: makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
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
    const noWeatherCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      seed: 42,
    });
    const sunCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      state: makeState({ weather: { type: "sun", turnsLeft: 5, source: "test" } }),
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
    const noWeatherCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "water", category: "special" }),
      seed: 42,
    });
    const rainCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "water", category: "special" }),
      state: makeState({ weather: { type: "rain", turnsLeft: 5, source: "test" } }),
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
    const noWeatherCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "water", category: "special" }),
      seed: 42,
    });
    const sunCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "water", category: "special" }),
      state: makeState({ weather: { type: "sun", turnsLeft: 5, source: "test" } }),
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
    const noWeatherCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      seed: 42,
    });
    const rainCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      state: makeState({ weather: { type: "rain", turnsLeft: 5, source: "test" } }),
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
    const noCritCtx = makeDamageContext({
      attacker: makeActive({ attack: 100 }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "normal" }),
      isCrit: false,
      seed: 42,
    });
    const critCtx = makeDamageContext({
      attacker: makeActive({ attack: 100 }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "normal" }),
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
    const normalCritCtx = makeDamageContext({
      attacker: makeActive({ attack: 100 }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "normal" }),
      isCrit: true,
      seed: 42,
    });
    const sniperCritCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, ability: "sniper" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "normal" }),
      isCrit: true,
      seed: 42,
    });

    const normalCrit = calculateGen8Damage(normalCritCtx, typeChart);
    const sniperCrit = calculateGen8Damage(sniperCritCtx, typeChart);

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
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 50, defense: 131, types: ["grass", "steel"] }),
      defender: makeActive({ defense: 100, types: ["water"] }),
      move: makeMove({
        id: "body-press",
        type: "fighting",
        category: "physical",
        power: 80,
        flags: { contact: true },
      }),
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
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 200, defense: 60, types: ["water"] }),
      defender: makeActive({ defense: 100, types: ["water"] }),
      move: makeMove({
        id: "body-press",
        type: "fighting",
        category: "physical",
        power: 80,
        flags: { contact: true },
      }),
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
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 150, types: ["steel"] }),
      defender: makeActive({ defense: 100, types: ["normal"], isDynamaxed: false }),
      move: makeMove({
        id: "behemoth-blade",
        type: "steel",
        category: "physical",
        power: 100,
        flags: { contact: true },
      }),
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
    const normalCtx = makeDamageContext({
      attacker: makeActive({ attack: 150, types: ["steel"] }),
      defender: makeActive({ defense: 100, types: ["normal"], isDynamaxed: false }),
      move: makeMove({
        id: "behemoth-blade",
        type: "steel",
        category: "physical",
        power: 100,
        flags: { contact: true },
      }),
      seed: 42,
    });
    const dynamaxCtx = makeDamageContext({
      attacker: makeActive({ attack: 150, types: ["steel"] }),
      defender: makeActive({ defense: 100, types: ["normal"], isDynamaxed: true }),
      move: makeMove({
        id: "behemoth-blade",
        type: "steel",
        category: "physical",
        power: 100,
        flags: { contact: true },
      }),
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
    const normalCtx = makeDamageContext({
      attacker: makeActive({ attack: 130, types: ["steel"] }),
      defender: makeActive({ defense: 100, types: ["normal"], isDynamaxed: false }),
      move: makeMove({
        id: "behemoth-bash",
        type: "steel",
        category: "physical",
        power: 100,
        flags: { contact: true },
      }),
      seed: 42,
    });
    const dynamaxCtx = makeDamageContext({
      attacker: makeActive({ attack: 130, types: ["steel"] }),
      defender: makeActive({ defense: 100, types: ["normal"], isDynamaxed: true }),
      move: makeMove({
        id: "behemoth-bash",
        type: "steel",
        category: "physical",
        power: 100,
        flags: { contact: true },
      }),
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
    const normalCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 120, types: ["dragon"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"], isDynamaxed: false }),
      move: makeMove({
        id: "dynamax-cannon",
        type: "dragon",
        category: "special",
        power: 100,
      }),
      seed: 42,
    });
    const dynamaxCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 120, types: ["dragon"] }),
      defender: makeActive({ spDefense: 100, types: ["normal"], isDynamaxed: true }),
      move: makeMove({
        id: "dynamax-cannon",
        type: "dragon",
        category: "special",
        power: 100,
      }),
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
    const neutralCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      seed: 42,
    });
    const seCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100, types: ["grass"] }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
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
    const neutralCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100, types: ["normal"] }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      seed: 42,
    });
    const nveCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100, types: ["water"] }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
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
    const ctx = makeDamageContext({
      attacker: makeActive({ attack: 100 }),
      defender: makeActive({ defense: 100, types: ["ghost"] }),
      move: makeMove({ power: 50, type: "normal" }),
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
    const noBurnCtx = makeDamageContext({
      attacker: makeActive({ attack: 100 }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "normal" }),
      seed: 42,
    });
    const burnCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, status: "burn" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "normal" }),
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
    const noBurnCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      seed: 42,
    });
    const burnCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100, status: "burn" }),
      defender: makeActive({ spDefense: 100 }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      seed: 42,
    });

    const noBurn = calculateGen8Damage(noBurnCtx, typeChart);
    const burn = calculateGen8Damage(burnCtx, typeChart);

    // Special moves unaffected by burn
    expect(burn.damage).toBe(noBurn.damage);
  });

  it("given a burned attacker using Facade (physical), when calculating, then burn penalty is bypassed", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+: Facade bypasses burn
    const burnNormalCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, status: "burn" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ id: "tackle", power: 70, type: "normal" }),
      seed: 42,
    });
    const burnFacadeCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, status: "burn" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ id: "facade", power: 70, type: "normal" }),
      seed: 42,
    });

    const normal = calculateGen8Damage(burnNormalCtx, typeChart);
    const facade = calculateGen8Damage(burnFacadeCtx, typeChart);

    // Facade should do more damage than a normal move when burned (no burn penalty)
    expect(facade.damage).toBeGreaterThan(normal.damage);
  });
});

// ---------------------------------------------------------------------------
// Type resist berries tests
// ---------------------------------------------------------------------------

describe("Gen 8 type resist berries", () => {
  it("given defender with Occa Berry taking super-effective Fire hit, when calculating, then berry halves damage", () => {
    // Source: Showdown data/items.ts -- type-resist berries: onSourceModifyDamage 0.5x
    const noBerrySECtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100, types: ["grass"] }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
      seed: 42,
    });
    const berryCtx = makeDamageContext({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ spDefense: 100, types: ["grass"], heldItem: "occa-berry" }),
      move: makeMove({ power: 50, type: "fire", category: "special" }),
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
    const noBerryCtx = makeDamageContext({
      attacker: makeActive({ attack: 100 }),
      defender: makeActive({ defense: 100, types: ["normal"] }),
      move: makeMove({ power: 50, type: "normal" }),
      seed: 42,
    });
    const berryCtx = makeDamageContext({
      attacker: makeActive({ attack: 100 }),
      defender: makeActive({ defense: 100, types: ["normal"], heldItem: "chilan-berry" }),
      move: makeMove({ power: 50, type: "normal" }),
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
    expect(TYPE_RESIST_BERRIES["occa-berry"]).toBe("fire");
    expect(TYPE_RESIST_BERRIES["passho-berry"]).toBe("water");
    expect(TYPE_RESIST_BERRIES["chilan-berry"]).toBe("normal");
    expect(TYPE_RESIST_BERRIES["roseli-berry"]).toBe("fairy");
    expect(Object.keys(TYPE_RESIST_BERRIES)).toHaveLength(18);
  });
});

// ---------------------------------------------------------------------------
// isGen8Grounded export check
// ---------------------------------------------------------------------------

describe("isGen8Grounded function", () => {
  it("given a Normal-type Pokemon with no modifiers, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- non-Flying, no Levitate, no Air Balloon = grounded
    const pokemon = makeActive({ types: ["normal"] });
    expect(isGen8Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Flying type is not grounded
    const pokemon = makeActive({ types: ["flying"] });
    expect(isGen8Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type Pokemon under Gravity, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity grounds everyone
    const pokemon = makeActive({ types: ["flying"] });
    expect(isGen8Grounded(pokemon, true)).toBe(true);
  });

  it("given a Pokemon with Levitate, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate = not grounded
    const pokemon = makeActive({ types: ["normal"], ability: "levitate" });
    expect(isGen8Grounded(pokemon, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gorilla Tactics ability test
// ---------------------------------------------------------------------------

describe("Gen 8 Gorilla Tactics", () => {
  it("given attacker with Gorilla Tactics using a physical move, when calculating damage, then attack is boosted by 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Gorilla Tactics: onModifyAtk 1.5x
    const noAbilityCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"], ability: "none" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 80, type: "fighting" }),
      seed: 42,
    });
    const gorillaCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["fighting"], ability: "gorilla-tactics" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 80, type: "fighting" }),
      seed: 42,
    });

    const noAbility = calculateGen8Damage(noAbilityCtx, typeChart);
    const gorilla = calculateGen8Damage(gorillaCtx, typeChart);

    // Gorilla Tactics gives 1.5x attack boost
    expect(gorilla.damage).toBeGreaterThan(noAbility.damage);
    const ratio = gorilla.damage / noAbility.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
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
    const liberoCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["ice"], ability: "libero" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "ice" }),
      seed: 42,
    });
    const noStabCtx = makeDamageContext({
      attacker: makeActive({ attack: 100, types: ["normal"], ability: "none" }),
      defender: makeActive({ defense: 100 }),
      move: makeMove({ power: 50, type: "ice" }),
      seed: 42,
    });

    const libero = calculateGen8Damage(liberoCtx, typeChart);
    const noStab = calculateGen8Damage(noStabCtx, typeChart);

    // STAB should apply since types already include ice
    expect(libero.damage).toBeGreaterThan(noStab.damage);
  });
});
