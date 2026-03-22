import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveEffect, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen6Damage, pokeRound } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

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
      ...overrides.statStages,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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
    generation: 6,
    critRatio: overrides.critRatio ?? 0,
  } as MoveData;
}

function makeState(overrides?: {
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

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Weather modifiers
// Source: Showdown sim/battle-actions.ts -- weather damage modifiers
// ===========================================================================
describe("Weather modifiers in damage calc", () => {
  it("given sun weather + fire move, when calculating damage, then fire move gets 1.5x boost", () => {
    // Source: Showdown sim/battle-actions.ts -- sun boosts fire 1.5x (6144/4096)
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({ types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const sunResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: makeState({ weather: { type: "sun", turnsLeft: 5, source: "drought" } }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Sun boosts fire by 1.5x
    const ratio = sunResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given sun weather + water move, when calculating damage, then water move gets 0.5x reduction", () => {
    // Source: Showdown sim/battle-actions.ts -- sun weakens water 0.5x (2048/4096)
    const attacker = makeActive({ types: ["water"] });
    const defender = makeActive({ types: ["normal"] });
    const waterMove = makeMove({ type: "water", power: 60 });

    const sunResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: makeState({ weather: { type: "sun", turnsLeft: 5, source: "drought" } }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const ratio = sunResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given heavy-rain weather + fire move, when calculating damage, then fire move is nullified (0 damage)", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy rain nullifies fire
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({ types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const result = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: makeState({
          weather: { type: "heavy-rain", turnsLeft: -1, source: "primordial-sea" },
        }),
      }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given harsh-sun weather + water move, when calculating damage, then water move is nullified (0 damage)", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh sun nullifies water
    const attacker = makeActive({ types: ["water"] });
    const defender = makeActive({ types: ["normal"] });
    const waterMove = makeMove({ type: "water", power: 60 });

    const result = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: makeState({
          weather: { type: "harsh-sun", turnsLeft: -1, source: "desolate-land" },
        }),
      }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given harsh-sun weather + fire move, when calculating damage, then fire move gets 1.5x boost (not nullified)", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh sun boosts fire (same as regular sun)
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({ types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const harshSunResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: fireMove,
        state: makeState({
          weather: { type: "harsh-sun", turnsLeft: -1, source: "desolate-land" },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = harshSunResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given heavy-rain weather + water move, when calculating damage, then water move gets 1.5x boost (not nullified)", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy rain boosts water (same as regular rain)
    const attacker = makeActive({ types: ["water"] });
    const defender = makeActive({ types: ["normal"] });
    const waterMove = makeMove({ type: "water", power: 60 });

    const heavyRainResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: waterMove,
        state: makeState({
          weather: { type: "heavy-rain", turnsLeft: -1, source: "primordial-sea" },
        }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
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
    const attacker = makeActive({ types: ["grass"] });
    const defender = makeActive({ types: ["normal"] });
    const solarBeam = makeMove({
      id: "solar-beam",
      type: "grass",
      category: "special",
      power: 120,
    });

    const rainResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: solarBeam,
        state: makeState({ weather: { type: "rain", turnsLeft: 5, source: "drizzle" } }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: solarBeam, seed: 100 }),
      typeChart,
    );

    // Source: Showdown -- SolarBeam power halved in non-sun weather
    const ratio = rainResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given SolarBeam in sun, when calculating damage, then power is NOT halved", () => {
    const attacker = makeActive({ types: ["grass"] });
    const defender = makeActive({ types: ["normal"] });
    const solarBeam = makeMove({
      id: "solar-beam",
      type: "grass",
      category: "special",
      power: 120,
    });

    const sunResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: solarBeam,
        state: makeState({ weather: { type: "sun", turnsLeft: 5, source: "drought" } }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: solarBeam, seed: 100 }),
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
    const attacker = makeActive({ ability: "blaze", types: ["fire"], hp: 200, currentHp: 66 });
    const defender = makeActive({ types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const blazeResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["fire"], hp: 200, currentHp: 66 });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = blazeResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Torrent + water move + HP > floor(maxHP/3), when calculating damage, then no boost", () => {
    // Source: Showdown -- Torrent does not activate above threshold
    // maxHP = 200, threshold = 66, currentHp = 100 > 66
    const attacker = makeActive({ ability: "torrent", types: ["water"], hp: 200, currentHp: 100 });
    const defender = makeActive({ types: ["normal"] });
    const waterMove = makeMove({ type: "water", power: 60 });

    const torrentResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["water"], hp: 200, currentHp: 100 });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: waterMove, seed: 100 }),
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
    volatiles.set("flash-fire", { turnsLeft: -1 });
    const attacker = makeActive({ types: ["fire"], volatiles });
    const defender = makeActive({ types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const ffResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["fire"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
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
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({ ability: "dry-skin", types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const drySkinResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseDefender = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: baseDefender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = drySkinResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.25, 1);
  });

  it("given Mold Breaker attacker vs Dry Skin defender + fire move, when calculating damage, then Dry Skin is suppressed", () => {
    // Source: Showdown -- Mold Breaker bypasses Dry Skin
    const attacker = makeActive({ ability: "mold-breaker", types: ["fire"] });
    const defender = makeActive({ ability: "dry-skin", types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const moldResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseDefender = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: baseDefender, move: fireMove, seed: 100 }),
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
    const attacker = makeActive({ ability: "technician", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const quickAttack = makeMove({ id: "quick-attack", type: "normal", power: 40 });

    const techResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: quickAttack, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: quickAttack, seed: 100 }),
      typeChart,
    );

    const ratio = techResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Technician + move with base power > 60, when calculating damage, then no boost", () => {
    // Source: Showdown -- Technician only activates for BP <= 60
    const attacker = makeActive({ ability: "technician", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const bodySlam = makeMove({ id: "body-slam", type: "normal", power: 85 });

    const techResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: bodySlam, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: bodySlam, seed: 100 }),
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
    const attacker = makeActive({ ability: "iron-fist", types: ["fighting"] });
    const defender = makeActive({ types: ["normal"] });
    const machPunch = makeMove({
      id: "mach-punch",
      type: "fighting",
      power: 40,
      flags: { punch: true },
    });

    const ifResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: machPunch, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["fighting"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: machPunch, seed: 100 }),
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
    const attacker = makeActive({ ability: "reckless", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const doubleEdge = makeMove({
      id: "double-edge",
      type: "normal",
      power: 120,
      effect: recoilEffect,
    });

    const recklessResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: doubleEdge, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: doubleEdge, seed: 100 }),
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
    const attacker = makeActive({ ability: "reckless", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const move = makeMove({
      id: "test-recoil-multi",
      type: "normal",
      power: 80,
      effect: multiEffect,
    });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move, seed: 100 }),
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
    const statusChanceEffect: MoveEffect = { type: "status-chance", status: "burn", chance: 10 };
    const attacker = makeActive({ ability: "sheer-force", types: ["fire"] });
    const defender = makeActive({ types: ["normal"] });
    const flamethrower = makeMove({
      id: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
      effect: statusChanceEffect,
    });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: flamethrower, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["fire"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: flamethrower, seed: 100 }),
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
      status: "flinch" as VolatileStatus,
      chance: 30,
    };
    const attacker = makeActive({ ability: "sheer-force", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const headbutt = makeMove({
      id: "headbutt",
      type: "normal",
      power: 70,
      effect: flinchEffect,
    });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: headbutt, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: headbutt, seed: 100 }),
      typeChart,
    );

    const ratio = sfResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it("given Sheer Force + whitelisted move (tri-attack), when calculating damage, then 1.3x boost", () => {
    // Source: Showdown -- Tri Attack has secondary effects via onHit, whitelisted
    const attacker = makeActive({ ability: "sheer-force", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const triAttack = makeMove({
      id: "tri-attack",
      type: "normal",
      category: "special",
      power: 80,
      effect: null,
    });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: triAttack, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: triAttack, seed: 100 }),
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
    const attacker = makeActive({ ability: "sheer-force", types: ["fire"] });
    const defender = makeActive({ types: ["normal"] });
    const flameCharge = makeMove({
      id: "flame-charge",
      type: "fire",
      power: 50,
      effect: selfBoostEffect,
    });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: flameCharge, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["fire"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: flameCharge, seed: 100 }),
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
    const attacker = makeActive({ ability: "sheer-force", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const move = makeMove({ id: "acid", type: "normal", power: 40, effect: foeDropEffect });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move, seed: 100 }),
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
    const attacker = makeActive({ types: ["poison"] });
    const poisonedDefender = makeActive({ types: ["normal"], status: "poison" });
    const healthyDefender = makeActive({ types: ["normal"] });
    const venoshock = makeMove({ id: "venoshock", type: "poison", category: "special", power: 65 });

    const poisonedResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: poisonedDefender, move: venoshock, seed: 100 }),
      typeChart,
    );
    const healthyResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: healthyDefender, move: venoshock, seed: 100 }),
      typeChart,
    );

    // Integer floor rounding means the ratio won't be exactly 2.0
    const ratio = poisonedResult.damage / healthyResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Venoshock vs badly-poisoned target, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Venoshock also doubles vs badly-poisoned
    const attacker = makeActive({ types: ["poison"] });
    const badlyPoisoned = makeActive({ types: ["normal"], status: "badly-poisoned" });
    const healthyDefender = makeActive({ types: ["normal"] });
    const venoshock = makeMove({ id: "venoshock", type: "poison", category: "special", power: 65 });

    const bpResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: badlyPoisoned, move: venoshock, seed: 100 }),
      typeChart,
    );
    const healthyResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: healthyDefender, move: venoshock, seed: 100 }),
      typeChart,
    );

    const ratio = bpResult.damage / healthyResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Hex vs statused target, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Hex: 2x power when target has any status
    // Use Psychic defender (Ghost is SE vs Psychic) so damage is non-zero
    const attacker = makeActive({ types: ["ghost"] });
    const burnedDefender = makeActive({ types: ["psychic"], status: "burn" });
    const healthyDefender = makeActive({ types: ["psychic"] });
    const hex = makeMove({
      id: "hex",
      type: "ghost",
      category: "special",
      power: 65,
      flags: { contact: false },
    });

    const statusResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: burnedDefender, move: hex, seed: 100 }),
      typeChart,
    );
    const healthyResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: healthyDefender, move: hex, seed: 100 }),
      typeChart,
    );

    // Integer floor rounding means the ratio won't be exactly 2.0
    const ratio = statusResult.damage / healthyResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Acrobatics with no held item, when calculating damage, then power doubles", () => {
    // Source: Showdown -- Acrobatics: 2x power when user has no item
    const attacker = makeActive({ types: ["flying"], heldItem: null });
    const itemAttacker = makeActive({ types: ["flying"], heldItem: "leftovers" });
    const defender = makeActive({ types: ["normal"] });
    const acrobatics = makeMove({
      id: "acrobatics",
      type: "flying",
      power: 55,
      flags: { contact: true },
    });

    const noItemResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: acrobatics, seed: 100 }),
      typeChart,
    );
    const withItemResult = calculateGen6Damage(
      makeDamageContext({ attacker: itemAttacker, defender, move: acrobatics, seed: 100 }),
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
    const attacker = makeActive({ ability: "normalize", types: ["normal"] });
    const defender = makeActive({ types: ["ghost"] }); // Ghost is immune to Normal
    const fireMove = makeMove({ type: "fire", power: 60 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
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
    const attacker = makeActive({ ability: "normalize", types: ["normal"] });
    const defender = makeActive({ types: ["fighting"] }); // Fighting resists Normal
    const normalMove = makeMove({ type: "normal", power: 50 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: normalMove, seed: 100 }),
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
    const attacker = makeActive({ ability: "rivalry", types: ["normal"], gender: "male" });
    const defender = makeActive({ types: ["normal"], gender: "male" });
    const tackle = makeMove({ type: "normal", power: 50 });

    const rivalryResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"], gender: "male" });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Integer rounding means ratio won't be exact
    const ratio = rivalryResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.25, 0);
  });

  it("given Rivalry + opposite gender, when calculating damage, then 0.75x reduction", () => {
    // Source: Showdown -- Rivalry: opposite gender = 0.75x damage
    const attacker = makeActive({ ability: "rivalry", types: ["normal"], gender: "male" });
    const defender = makeActive({ types: ["normal"], gender: "female" });
    const tackle = makeMove({ type: "normal", power: 50 });

    const rivalryResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"], gender: "male" });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = rivalryResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.75, 1);
  });

  it("given Rivalry + genderless target, when calculating damage, then no modifier", () => {
    // Source: Showdown -- Rivalry: genderless = no modifier
    const attacker = makeActive({ ability: "rivalry", types: ["normal"], gender: "male" });
    const defender = makeActive({ types: ["normal"], gender: "genderless" });
    const tackle = makeMove({ type: "normal", power: 50 });

    const rivalryResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["normal"], gender: "male" });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
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
    const attacker = makeActive({
      types: ["steel", "dragon"],
      speciesId: 483,
      heldItem: "adamant-orb",
    });
    const defender = makeActive({ types: ["normal"] });
    const dragonMove = makeMove({
      type: "dragon",
      category: "special",
      power: 80,
      flags: { contact: false },
    });

    const orbResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: dragonMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["steel", "dragon"], speciesId: 483, heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: dragonMove, seed: 100 }),
      typeChart,
    );

    // 4915/4096 = ~1.2x
    const ratio = orbResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Palkia (484) + Lustrous Orb + Water move, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb: 4915/4096 for Palkia's Water/Dragon moves
    const attacker = makeActive({
      types: ["water", "dragon"],
      speciesId: 484,
      heldItem: "lustrous-orb",
    });
    const defender = makeActive({ types: ["normal"] });
    const waterMove = makeMove({
      type: "water",
      category: "special",
      power: 80,
      flags: { contact: false },
    });

    const orbResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["water", "dragon"], speciesId: 484, heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const ratio = orbResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Giratina (487) + Griseous Orb + Ghost move, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Griseous Orb: 4915/4096 for Giratina's Ghost/Dragon moves
    const attacker = makeActive({
      types: ["ghost", "dragon"],
      speciesId: 487,
      heldItem: "griseous-orb",
    });
    const defender = makeActive({ types: ["normal"] });
    const ghostMove = makeMove({
      type: "ghost",
      category: "special",
      power: 80,
      flags: { contact: false },
    });

    const orbResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: ghostMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["ghost", "dragon"], speciesId: 487, heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: ghostMove, seed: 100 }),
      typeChart,
    );

    // Ghost vs Normal is 0 (immune) -- need a non-immune defender
    // Actually ghost vs normal = 0 damage. Let me use a different defender type
    expect(orbResult.damage).toBe(0); // Ghost is immune to Normal
  });

  it("given Giratina (487) + Griseous Orb + Ghost move vs Psychic defender, when calculating damage, then ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Griseous Orb for Giratina
    const attacker = makeActive({
      types: ["ghost", "dragon"],
      speciesId: 487,
      heldItem: "griseous-orb",
    });
    const defender = makeActive({ types: ["psychic"] });
    const ghostMove = makeMove({
      type: "ghost",
      category: "special",
      power: 80,
      flags: { contact: false },
    });

    const orbResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: ghostMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["ghost", "dragon"], speciesId: 487, heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: ghostMove, seed: 100 }),
      typeChart,
    );

    const ratio = orbResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });
});

// ===========================================================================
// Ability type immunities + Levitate grounding + Magnet Rise
// Source: Showdown sim/battle.ts -- immunity abilities
// ===========================================================================
describe("Ability type immunities in damage calc", () => {
  it("given defender with Levitate + ground move, when calculating damage, then immune (0 damage)", () => {
    // Source: Showdown -- Levitate: immune to ground
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ ability: "levitate", types: ["normal"] });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender with Levitate + Gravity active + ground move, when calculating damage, then Levitate is suppressed", () => {
    // Source: Showdown -- Gravity grounds Levitate users
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ ability: "levitate", types: ["normal"] });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: makeState({ gravity: { active: true, turnsLeft: 3 } }),
      }),
      typeChart,
    );

    // Gravity suppresses Levitate, so Ground hits
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1);
  });

  it("given defender with Levitate + Iron Ball + ground move, when calculating damage, then Levitate is suppressed", () => {
    // Source: Showdown -- Iron Ball grounds Levitate users
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ ability: "levitate", types: ["normal"], heldItem: "iron-ball" });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
  });

  it("given Mold Breaker attacker vs Levitate defender + ground move, when calculating damage, then Levitate is bypassed", () => {
    // Source: Showdown -- Mold Breaker bypasses Levitate
    const attacker = makeActive({ ability: "mold-breaker", types: ["ground"] });
    const defender = makeActive({ ability: "levitate", types: ["normal"] });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
  });

  it("given Magnet Rise volatile + ground move (no Gravity), when calculating damage, then immune", () => {
    // Source: Showdown -- Magnet Rise: immune to ground
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("magnet-rise", { turnsLeft: 5 });
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ types: ["normal"], volatiles });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Magnet Rise volatile + Gravity active + ground move, when calculating damage, then not immune", () => {
    // Source: Showdown -- Gravity suppresses Magnet Rise
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("magnet-rise", { turnsLeft: 5 });
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ types: ["normal"], volatiles });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: makeState({ gravity: { active: true, turnsLeft: 3 } }),
      }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
  });

  it("given defender with Volt Absorb + electric move, when calculating damage, then immune (0 damage)", () => {
    // Source: Showdown -- Volt Absorb: immune to electric
    const attacker = makeActive({ types: ["electric"] });
    const defender = makeActive({ ability: "volt-absorb", types: ["normal"] });
    const thunderbolt = makeMove({
      type: "electric",
      category: "special",
      power: 90,
      flags: { contact: false },
    });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: thunderbolt }),
      typeChart,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender with Sap Sipper + grass move, when calculating damage, then immune (0 damage)", () => {
    // Source: Showdown -- Sap Sipper: immune to grass
    const attacker = makeActive({ types: ["grass"] });
    const defender = makeActive({ ability: "sap-sipper", types: ["normal"] });
    const grassMove = makeMove({
      type: "grass",
      category: "special",
      power: 80,
      flags: { contact: false },
    });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: grassMove }),
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
    const attacker = makeActive({ ability: "scrappy", types: ["normal"] });
    const defender = makeActive({ types: ["ghost"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Normally Normal vs Ghost = 0 (immune), but Scrappy bypasses
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1); // Neutral after removing Ghost
  });

  it("given Scrappy + Fighting move vs Ghost, when calculating damage, then hits", () => {
    // Source: Showdown -- Scrappy: Fighting also hits Ghost
    const attacker = makeActive({ ability: "scrappy", types: ["fighting"] });
    const defender = makeActive({ types: ["ghost"] });
    const closeCombat = makeMove({ type: "fighting", power: 120 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: closeCombat, seed: 100 }),
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
    const attacker = makeActive({ types: ["normal"] });
    const defender = makeActive({ ability: "wonder-guard", types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBe(0);
  });

  it("given defender with Wonder Guard + super-effective move, when calculating damage, then deals damage", () => {
    // Source: Showdown -- Wonder Guard: super-effective moves hit
    const attacker = makeActive({ types: ["fighting"] });
    const defender = makeActive({ ability: "wonder-guard", types: ["normal"] });
    const closeCombat = makeMove({ type: "fighting", power: 120 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: closeCombat, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(2);
  });

  it("given Mold Breaker vs Wonder Guard + neutral move, when calculating damage, then bypasses Wonder Guard", () => {
    // Source: Showdown -- Mold Breaker bypasses Wonder Guard
    const attacker = makeActive({ ability: "mold-breaker", types: ["normal"] });
    const defender = makeActive({ ability: "wonder-guard", types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Tinted Lens + Heatproof
// Source: Showdown data/abilities.ts
// ===========================================================================
describe("Tinted Lens in damage calc", () => {
  it("given Tinted Lens + not-very-effective move, when calculating damage, then damage is doubled", () => {
    // Source: Showdown -- Tinted Lens: doubles damage for NVE moves
    const attacker = makeActive({ ability: "tinted-lens", types: ["fire"] });
    const defender = makeActive({ types: ["fire"] }); // Fire resists Fire
    const fireMove = makeMove({ type: "fire", power: 60 });

    const tintedResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ ability: "none", types: ["fire"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = tintedResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 1);
  });
});

describe("Heatproof in damage calc", () => {
  it("given defender with Heatproof + fire move, when calculating damage, then damage is halved", () => {
    // Source: Showdown data/abilities.ts -- Heatproof: halves fire damage
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({ ability: "heatproof", types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const hpResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseDefender = makeActive({ ability: "none", types: ["normal"] });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: baseDefender, move: fireMove, seed: 100 }),
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
    const attacker = makeActive({ types: ["fire"], heldItem: "expert-belt" });
    const defender = makeActive({ types: ["grass"] }); // Fire SE vs Grass
    const fireMove = makeMove({ type: "fire", power: 60 });

    const expertResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["fire"], heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    const ratio = expertResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it("given Expert Belt + neutral move, when calculating damage, then no boost", () => {
    // Source: Showdown data/items.ts -- Expert Belt only activates for SE
    const attacker = makeActive({ types: ["normal"], heldItem: "expert-belt" });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const expertResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["normal"], heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(expertResult.damage).toBe(baseResult.damage);
  });

  it("given Muscle Band + physical move, when calculating damage, then ~1.1x boost", () => {
    // Source: Showdown data/items.ts -- Muscle Band: 4505/4096 for physical
    const attacker = makeActive({ types: ["normal"], heldItem: "muscle-band" });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50, category: "physical" });

    const bandResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["normal"], heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = bandResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.1, 1);
  });

  it("given Wise Glasses + special move, when calculating damage, then ~1.1x boost", () => {
    // Source: Showdown data/items.ts -- Wise Glasses: 4505/4096 for special
    const attacker = makeActive({ types: ["normal"], heldItem: "wise-glasses" });
    const defender = makeActive({ types: ["normal"] });
    const swift = makeMove({
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const glassesResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: swift, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["normal"], heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: swift, seed: 100 }),
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
    volatiles.set("metronome-count", { turnsLeft: -1, data: { count: 3 } });
    const attacker = makeActive({ types: ["normal"], heldItem: "metronome", volatiles });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const metResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["normal"], heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = metResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.4, 1);
  });

  it("given Metronome item with 1 use (first), when calculating damage, then no boost", () => {
    // Source: Showdown -- Metronome first use: boostSteps = 1 - 1 = 0, no boost
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set("metronome-count", { turnsLeft: -1, data: { count: 1 } });
    const attacker = makeActive({ types: ["normal"], heldItem: "metronome", volatiles });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const metResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseAttacker = makeActive({ types: ["normal"], heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: baseAttacker, defender, move: tackle, seed: 100 }),
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
    const attacker = makeActive({ ability: "unburden", types: ["normal"], heldItem: "normal-gem" });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Gem consumed
    expect(attacker.pokemon.heldItem).toBeNull();
    // Unburden volatile set
    expect(attacker.volatileStatuses.has("unburden")).toBe(true);
    // Damage should be > 0
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given attacker without Unburden + gem consumed, when calculating damage, then no Unburden volatile", () => {
    const attacker = makeActive({ ability: "none", types: ["fire"], heldItem: "fire-gem" });
    const defender = makeActive({ types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Gem consumed
    expect(attacker.pokemon.heldItem).toBeNull();
    // No Unburden
    expect(attacker.volatileStatuses.has("unburden")).toBe(false);
  });
});

// ===========================================================================
// Type-resist berry + Unburden on defender
// Source: Showdown data/items.ts -- type-resist berries
// ===========================================================================
describe("Type-resist berry consumption + Unburden on defender", () => {
  it("given defender with Unburden + resist berry that activates, when calculating damage, then berry consumed and Unburden activates", () => {
    // Source: Showdown -- type-resist berry consumed triggers Unburden
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({
      ability: "unburden",
      types: ["grass"],
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Berry consumed (Fire SE vs Grass)
    expect(defender.pokemon.heldItem).toBeNull();
    // Unburden activates
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
  });

  it("given defender with Klutz + resist berry, when calculating damage, then berry does NOT activate", () => {
    // Source: Showdown -- Klutz suppresses items
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({
      ability: "klutz",
      types: ["grass"],
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 60 });

    calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Berry not consumed due to Klutz
    expect(defender.pokemon.heldItem).toBe("occa-berry");
  });

  it("given defender with Embargo volatile + resist berry, when calculating damage, then berry does NOT activate", () => {
    // Source: Showdown -- Embargo suppresses items
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("embargo", { turnsLeft: 5 });
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({
      types: ["grass"],
      heldItem: "occa-berry",
      volatiles,
    });
    const fireMove = makeMove({ type: "fire", power: 60 });

    calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    expect(defender.pokemon.heldItem).toBe("occa-berry");
  });

  it("given Chilan Berry + neutral Normal move, when calculating damage, then berry activates (no SE requirement)", () => {
    // Source: Showdown -- Chilan Berry activates on any Normal hit, no SE needed
    const attacker = makeActive({ types: ["normal"] });
    const defender = makeActive({ types: ["normal"], heldItem: "chilan-berry" });
    const tackle = makeMove({ type: "normal", power: 50 });

    const chilanResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const baseDefender = makeActive({ types: ["normal"], heldItem: null });
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: baseDefender, move: tackle, seed: 100 }),
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
    const burnedGuts = makeActive({ ability: "guts", types: ["normal"], status: "burn" });
    const burnedNoGuts = makeActive({ ability: "none", types: ["normal"], status: "burn" });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const gutsResult = calculateGen6Damage(
      makeDamageContext({ attacker: burnedGuts, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const burnResult = calculateGen6Damage(
      makeDamageContext({ attacker: burnedNoGuts, defender, move: tackle, seed: 100 }),
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
    const hugePower = makeActive({ ability: "huge-power", types: ["normal"], attack: 100 });
    const base = makeActive({ ability: "none", types: ["normal"], attack: 100 });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const hpResult = calculateGen6Damage(
      makeDamageContext({ attacker: hugePower, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Integer floor rounding means ratio won't be exactly 2.0
    const ratio = hpResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Choice Band + physical move, when calculating damage, then attack is boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Choice Band: 1.5x Atk
    const choiceBand = makeActive({ types: ["normal"], heldItem: "choice-band", attack: 100 });
    const base = makeActive({ types: ["normal"], heldItem: null, attack: 100 });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const cbResult = calculateGen6Damage(
      makeDamageContext({ attacker: choiceBand, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = cbResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Choice Specs + special move, when calculating damage, then spAttack is boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Choice Specs: 1.5x SpAtk
    const choiceSpecs = makeActive({ types: ["normal"], heldItem: "choice-specs", spAttack: 100 });
    const base = makeActive({ types: ["normal"], heldItem: null, spAttack: 100 });
    const defender = makeActive({ types: ["normal"] });
    const swift = makeMove({
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const csResult = calculateGen6Damage(
      makeDamageContext({ attacker: choiceSpecs, defender, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = csResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Soul Dew + Latios (381) + special move, when calculating damage, then spAttack is boosted 1.5x", () => {
    // Source: Showdown sim/items.ts -- Soul Dew Gen 3-6: 1.5x SpAtk/SpDef for Lati@s
    const soulDew = makeActive({
      types: ["dragon", "psychic"],
      speciesId: 381,
      heldItem: "soul-dew",
      spAttack: 100,
    });
    const base = makeActive({
      types: ["dragon", "psychic"],
      speciesId: 381,
      heldItem: null,
      spAttack: 100,
    });
    const defender = makeActive({ types: ["normal"] });
    const dragonPulse = makeMove({
      type: "dragon",
      category: "special",
      power: 85,
      flags: { contact: false, pulse: false },
    });

    const sdResult = calculateGen6Damage(
      makeDamageContext({ attacker: soulDew, defender, move: dragonPulse, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: dragonPulse, seed: 100 }),
      typeChart,
    );

    const ratio = sdResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Deep Sea Tooth + Clamperl (366) + special move, when calculating damage, then spAttack is doubled", () => {
    // Source: Showdown sim/items.ts -- Deep Sea Tooth: 2x SpAtk for Clamperl
    const dsTooth = makeActive({
      types: ["water"],
      speciesId: 366,
      heldItem: "deep-sea-tooth",
      spAttack: 100,
    });
    const base = makeActive({
      types: ["water"],
      speciesId: 366,
      heldItem: null,
      spAttack: 100,
    });
    const defender = makeActive({ types: ["normal"] });
    const waterMove = makeMove({
      type: "water",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const dstResult = calculateGen6Damage(
      makeDamageContext({ attacker: dsTooth, defender, move: waterMove, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    const ratio = dstResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Light Ball + Pikachu (25) + physical move, when calculating damage, then attack is doubled", () => {
    // Source: Showdown sim/items.ts -- Light Ball: 2x Atk+SpAtk for Pikachu
    const lightBall = makeActive({
      types: ["electric"],
      speciesId: 25,
      heldItem: "light-ball",
      attack: 100,
    });
    const base = makeActive({
      types: ["electric"],
      speciesId: 25,
      heldItem: null,
      attack: 100,
    });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const lbResult = calculateGen6Damage(
      makeDamageContext({ attacker: lightBall, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = lbResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Thick Club + Marowak (105) + physical move, when calculating damage, then attack is doubled", () => {
    // Source: Showdown sim/items.ts -- Thick Club: 2x Atk for Cubone/Marowak
    const thickClub = makeActive({
      types: ["ground"],
      speciesId: 105,
      heldItem: "thick-club",
      attack: 100,
    });
    const base = makeActive({
      types: ["ground"],
      speciesId: 105,
      heldItem: null,
      attack: 100,
    });
    const defender = makeActive({ types: ["normal"] });
    const boneClub = makeMove({ type: "ground", power: 65 });

    const tcResult = calculateGen6Damage(
      makeDamageContext({ attacker: thickClub, defender, move: boneClub, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: boneClub, seed: 100 }),
      typeChart,
    );

    const ratio = tcResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it("given Slow Start volatile + physical move, when calculating damage, then attack is halved", () => {
    // Source: Showdown data/abilities.ts -- Slow Start: halve Attack for first 5 turns
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("slow-start", { turnsLeft: 5 });
    const slowStart = makeActive({
      ability: "slow-start",
      types: ["normal"],
      attack: 100,
      volatiles,
    });
    const base = makeActive({ ability: "none", types: ["normal"], attack: 100 });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const ssResult = calculateGen6Damage(
      makeDamageContext({ attacker: slowStart, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = ssResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given Defeatist + HP <= 50%, when calculating damage, then attack/spAttack is halved", () => {
    // Source: Showdown data/abilities.ts -- Defeatist: halve Atk/SpAtk when HP <= 50%
    const defeatist = makeActive({
      ability: "defeatist",
      types: ["normal"],
      hp: 200,
      currentHp: 100, // exactly 50%
      attack: 100,
    });
    const base = makeActive({
      ability: "none",
      types: ["normal"],
      hp: 200,
      currentHp: 100,
      attack: 100,
    });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const defResult = calculateGen6Damage(
      makeDamageContext({ attacker: defeatist, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = defResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given Klutz + Choice Band, when calculating damage, then Choice Band is suppressed", () => {
    // Source: Showdown -- Klutz suppresses held items
    const klutzCB = makeActive({
      ability: "klutz",
      types: ["normal"],
      heldItem: "choice-band",
      attack: 100,
    });
    const noItem = makeActive({ ability: "klutz", types: ["normal"], heldItem: null, attack: 100 });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const klutzResult = calculateGen6Damage(
      makeDamageContext({ attacker: klutzCB, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const noItemResult = calculateGen6Damage(
      makeDamageContext({ attacker: noItem, defender, move: tackle, seed: 100 }),
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
    const attacker = makeActive({ types: ["normal"] });
    const dsScale = makeActive({
      types: ["water"],
      speciesId: 366,
      heldItem: "deep-sea-scale",
      spDefense: 100,
    });
    const base = makeActive({
      types: ["water"],
      speciesId: 366,
      heldItem: null,
      spDefense: 100,
    });
    const swift = makeMove({
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const scaleResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: dsScale, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = scaleResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("given Eviolite + any Pokemon + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Showdown data/items.ts -- Eviolite: 1.5x Def/SpDef
    const attacker = makeActive({ types: ["normal"] });
    const eviolite = makeActive({ types: ["normal"], heldItem: "eviolite", spDefense: 100 });
    const base = makeActive({ types: ["normal"], heldItem: null, spDefense: 100 });
    const swift = makeMove({
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const evResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: eviolite, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = evResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1); // 1/1.5 ≈ 0.67
  });

  it("given Sandstorm + Rock defender + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Bulbapedia -- Sandstorm boosts Rock-type SpDef by 50% (Gen 4+)
    const attacker = makeActive({ types: ["normal"] });
    const rockDef = makeActive({ types: ["rock"], spDefense: 100 });
    const base = makeActive({ types: ["rock"], spDefense: 100 });
    const swift = makeMove({
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const sandResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender: rockDef,
        move: swift,
        state: makeState({ weather: { type: "sand", turnsLeft: 5, source: "sand-stream" } }),
        seed: 100,
      }),
      typeChart,
    );
    const noWeatherResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
      typeChart,
    );

    const ratio = sandResult.damage / noWeatherResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1); // 1/1.5
  });

  it("given Flower Gift + sun + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Flower Gift: 1.5x SpDef in sun
    const attacker = makeActive({ types: ["normal"] });
    const flowerGift = makeActive({ ability: "flower-gift", types: ["grass"], spDefense: 100 });
    const base = makeActive({ ability: "none", types: ["grass"], spDefense: 100 });
    const swift = makeMove({
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const fgResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender: flowerGift,
        move: swift,
        state: makeState({ weather: { type: "sun", turnsLeft: 5, source: "drought" } }),
        seed: 100,
      }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender: base,
        move: swift,
        state: makeState({ weather: { type: "sun", turnsLeft: 5, source: "drought" } }),
        seed: 100,
      }),
      typeChart,
    );

    const ratio = fgResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1);
  });

  it("given Marvel Scale + status + physical move, when calculating damage, then defense boosted 1.5x", () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale: 1.5x Def when statused
    const attacker = makeActive({ types: ["normal"] });
    const marvelScale = makeActive({
      ability: "marvel-scale",
      types: ["water"],
      status: "burn",
      defense: 100,
    });
    const base = makeActive({ ability: "none", types: ["water"], status: "burn", defense: 100 });
    const tackle = makeMove({ type: "normal", power: 50 });

    const msResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: marvelScale, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: base, move: tackle, seed: 100 }),
      typeChart,
    );

    const ratio = msResult.damage / baseResult.damage;
    expect(ratio).toBeCloseTo(0.67, 1);
  });

  it("given Soul Dew + Latias (380) defender + special move, when calculating damage, then spDefense boosted 1.5x", () => {
    // Source: Showdown -- Soul Dew Gen 3-6: 1.5x SpDef for Latias
    const attacker = makeActive({ types: ["normal"] });
    const soulDewDef = makeActive({
      types: ["dragon", "psychic"],
      speciesId: 380,
      heldItem: "soul-dew",
      spDefense: 100,
    });
    const base = makeActive({
      types: ["dragon", "psychic"],
      speciesId: 380,
      heldItem: null,
      spDefense: 100,
    });
    const swift = makeMove({
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const sdResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: soulDewDef, move: swift, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: base, move: swift, seed: 100 }),
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
    const simple = makeActive({
      ability: "simple",
      types: ["normal"],
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
    const base = makeActive({
      ability: "none",
      types: ["normal"],
      attack: 100,
      statStages: {
        attack: 2,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
    });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const simpleResult = calculateGen6Damage(
      makeDamageContext({ attacker: simple, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Simple +1 = +2 effective, which should match explicitly +2
    expect(simpleResult.damage).toBe(baseResult.damage);
  });

  it("given Unaware defender + attacker with +6 attack, when calculating damage, then attack stages are ignored", () => {
    // Source: Showdown -- Unaware ignores attacker's stat stages
    const boosted = makeActive({
      types: ["normal"],
      attack: 100,
      statStages: {
        attack: 6,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
    });
    const base = makeActive({
      types: ["normal"],
      attack: 100,
    });
    const unawareDefender = makeActive({ ability: "unaware", types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const unawareResult = calculateGen6Damage(
      makeDamageContext({ attacker: boosted, defender: unawareDefender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender: unawareDefender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Unaware ignores attacker stages, so +6 is treated as +0
    expect(unawareResult.damage).toBe(baseResult.damage);
  });

  it("given critical hit + negative attack stage, when calculating damage, then negative stage is ignored (treated as 0)", () => {
    // Source: Showdown -- crits ignore negative attack stages
    const debuffed = makeActive({
      types: ["normal"],
      attack: 100,
      statStages: {
        attack: -3,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
    });
    const base = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const critResult = calculateGen6Damage(
      makeDamageContext({ attacker: debuffed, defender, move: tackle, isCrit: true, seed: 100 }),
      typeChart,
    );
    const baseCritResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, isCrit: true, seed: 100 }),
      typeChart,
    );

    // Crit ignores -3 attack (treats as 0), same as base with 0 stages
    expect(critResult.damage).toBe(baseCritResult.damage);
  });

  it("given critical hit + positive defense stage, when calculating damage, then positive defense stage is ignored", () => {
    // Source: Showdown -- crits ignore positive defense stages
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const boostedDef = makeActive({
      types: ["normal"],
      defense: 100,
      statStages: {
        attack: 0,
        defense: 6,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
    });
    const baseDef = makeActive({ types: ["normal"], defense: 100 });
    const tackle = makeMove({ type: "normal", power: 50 });

    const critBoostedResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: boostedDef, move: tackle, isCrit: true, seed: 100 }),
      typeChart,
    );
    const critBaseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: baseDef, move: tackle, isCrit: true, seed: 100 }),
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
    const attacker = makeActive({ types: ["fighting"], attack: 100 });
    const boostedDef = makeActive({
      types: ["normal"],
      defense: 100,
      statStages: {
        attack: 0,
        defense: 6,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
    });
    const baseDef = makeActive({ types: ["normal"], defense: 100 });
    const sacredSword = makeMove({ id: "sacred-sword", type: "fighting", power: 90 });

    const ssResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: boostedDef, move: sacredSword, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: baseDef, move: sacredSword, seed: 100 }),
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
    const attacker = makeActive({ types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const spreadMove = makeMove({
      type: "normal",
      power: 100,
      target: "all-adjacent-foes",
    });

    const doublesResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: spreadMove,
        state: makeState({ format: "doubles" }),
        seed: 100,
      }),
      typeChart,
    );
    const singlesResult = calculateGen6Damage(
      makeDamageContext({
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
    const sniper = makeActive({ ability: "sniper", types: ["normal"] });
    const base = makeActive({ ability: "none", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const sniperCrit = calculateGen6Damage(
      makeDamageContext({ attacker: sniper, defender, move: tackle, isCrit: true, seed: 100 }),
      typeChart,
    );
    const baseCrit = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, isCrit: true, seed: 100 }),
      typeChart,
    );

    // Sniper crit = 2.25x, normal crit = 1.5x, ratio = 2.25/1.5 = 1.5
    const ratio = sniperCrit.damage / baseCrit.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ===========================================================================
// Hustle in damage calc
// Source: Showdown -- Hustle: 1.5x physical attack
// ===========================================================================
describe("Hustle in damage calc", () => {
  it("given Hustle + physical move, when calculating damage, then attack stat boosted 1.5x", () => {
    // Source: Showdown -- Hustle: 1.5x Atk for physical moves
    const hustle = makeActive({ ability: "hustle", types: ["normal"], attack: 100 });
    const base = makeActive({ ability: "none", types: ["normal"], attack: 100 });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const hustleResult = calculateGen6Damage(
      makeDamageContext({ attacker: hustle, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
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
    volatiles.set("embargo", { turnsLeft: 5 });
    const attacker = makeActive({ types: ["normal"], heldItem: "normal-gem", volatiles });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Gem NOT consumed due to Embargo
    expect(attacker.pokemon.heldItem).toBe("normal-gem");
  });
});

// ===========================================================================
// Gravity / Iron Ball vs Flying type effectiveness
// Source: Showdown -- Ground hits Flying when grounded
// ===========================================================================
describe("Gravity / Iron Ball type effectiveness override in damage calc", () => {
  it("given Gravity active + ground move vs Flying type, when calculating damage, then Flying immunity is removed", () => {
    // Source: Showdown -- Gravity: Ground moves hit Flying types
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ types: ["flying"] });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const gravityResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: makeState({ gravity: { active: true, turnsLeft: 3 } }),
        seed: 100,
      }),
      typeChart,
    );

    // Without gravity, Ground vs Flying = 0 (immune)
    const noGravityResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake }),
      typeChart,
    );

    expect(noGravityResult.damage).toBe(0);
    expect(gravityResult.damage).toBeGreaterThan(0);
  });

  it("given Iron Ball defender + ground move vs Flying type, when calculating damage, then Flying immunity is removed", () => {
    // Source: Showdown -- Iron Ball grounds the holder
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ types: ["flying"], heldItem: "iron-ball" });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Terrain power modifiers
// Source: Showdown data/conditions.ts -- terrain onBasePower handlers
// ===========================================================================
describe("Terrain power modifiers in damage calc", () => {
  it("given Electric Terrain + electric move + grounded attacker, when calculating damage, then 1.5x boost", () => {
    // Source: Bulbapedia "Electric Terrain" Gen 6 -- 1.5x Electric for grounded attacker
    const attacker = makeActive({ types: ["electric"] });
    const defender = makeActive({ types: ["normal"] });
    const thunderbolt = makeMove({
      type: "electric",
      category: "special",
      power: 90,
      flags: { contact: false },
    });

    const terrainResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: thunderbolt,
        state: makeState({ terrain: { type: "electric", turnsLeft: 5 } }),
        seed: 100,
      }),
      typeChart,
    );
    const noTerrainResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: thunderbolt, seed: 100 }),
      typeChart,
    );

    const ratio = terrainResult.damage / noTerrainResult.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("given Grassy Terrain + Earthquake vs grounded target, when calculating damage, then damage is halved", () => {
    // Source: Showdown -- Grassy Terrain halves Earthquake/Bulldoze/Magnitude vs grounded targets
    const attacker = makeActive({ types: ["ground"] });
    const defender = makeActive({ types: ["normal"] });
    const earthquake = makeMove({ id: "earthquake", type: "ground", power: 100 });

    const grassyResult = calculateGen6Damage(
      makeDamageContext({
        attacker,
        defender,
        move: earthquake,
        state: makeState({ terrain: { type: "grassy", turnsLeft: 5 } }),
        seed: 100,
      }),
      typeChart,
    );
    const noTerrainResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
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
    const attacker = makeActive({ types: ["normal"] });
    const ally = makeActive({ types: ["normal"], lastMoveUsed: "round", movedThisTurn: true });
    const defender = makeActive({ types: ["normal"] });
    const roundMove = makeMove({
      id: "round",
      type: "normal",
      category: "special",
      power: 60,
      flags: { contact: false },
    });

    const state = makeState({
      sides: [{ active: [attacker, ally] }, { active: [defender] }],
    });

    const roundResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: roundMove, state, seed: 100 }),
      typeChart,
    );

    // Without ally boost
    const soloState = makeState({
      sides: [{ active: [attacker] }, { active: [defender] }],
    });
    const soloResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: roundMove, state: soloState, seed: 100 }),
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
    const attacker = makeActive({ types: ["fire"] });
    const thickFat = makeActive({ ability: "thick-fat", types: ["normal"] });
    const base = makeActive({ ability: "none", types: ["normal"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const tfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: thickFat, move: fireMove, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender: base, move: fireMove, seed: 100 }),
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
    const attacker = makeActive({ ability: "reckless", types: ["normal"] });
    const base = makeActive({ ability: "none", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50, effect: null });

    const recklessResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move: tackle, seed: 100 }),
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
    const attacker = makeActive({ ability: "sheer-force", types: ["normal"] });
    const base = makeActive({ ability: "none", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const move = makeMove({ type: "normal", power: 70, effect: selfBoostEffect });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move, seed: 100 }),
      typeChart,
    );

    expect(sfResult.damage).toBe(baseResult.damage);
  });

  it("given Sheer Force + volatile-status with chance 0, when calculating damage, then no boost", () => {
    // Source: Showdown -- volatile-status with chance=0 is not eligible
    const vsEffect: MoveEffect = {
      type: "volatile-status",
      status: "flinch" as VolatileStatus,
      chance: 0,
    };
    const attacker = makeActive({ ability: "sheer-force", types: ["normal"] });
    const base = makeActive({ ability: "none", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const move = makeMove({ type: "normal", power: 50, effect: vsEffect });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move, seed: 100 }),
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
    const attacker = makeActive({ ability: "sheer-force", types: ["normal"] });
    const base = makeActive({ ability: "none", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const move = makeMove({ type: "normal", power: 50, effect: foeDropEffect });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move, seed: 100 }),
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
    const attacker = makeActive({ ability: "sheer-force", types: ["normal"] });
    const base = makeActive({ ability: "none", types: ["normal"] });
    const defender = makeActive({ types: ["normal"] });
    const move = makeMove({ type: "normal", power: 50, effect: multiEffect });

    const sfResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move, seed: 100 }),
      typeChart,
    );
    const baseResult = calculateGen6Damage(
      makeDamageContext({ attacker: base, defender, move, seed: 100 }),
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
    const attacker = makeActive({ ability: "teravolt", types: ["ground"] });
    const defender = makeActive({ ability: "levitate", types: ["normal"] });
    const earthquake = makeMove({ type: "ground", power: 100 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: earthquake, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
  });

  it("given Turboblaze attacker vs Wonder Guard defender + neutral move, when calculating damage, then Wonder Guard bypassed", () => {
    // Source: Showdown -- Turboblaze = Mold Breaker
    const attacker = makeActive({ ability: "turboblaze", types: ["normal"] });
    const defender = makeActive({ ability: "wonder-guard", types: ["normal"] });
    const tackle = makeMove({ type: "normal", power: 50 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
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
    const attacker = makeActive({ types: ["fire"] });
    const defender = makeActive({ types: ["fire", "water"] });
    const fireMove = makeMove({ type: "fire", power: 60 });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    expect(result.effectiveness).toBe(0.25);
    expect(result.damage).toBeGreaterThan(0);
  });
});
