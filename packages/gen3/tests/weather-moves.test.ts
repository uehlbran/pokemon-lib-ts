import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { calculateGen3Damage } from "../src/Gen3DamageCalc";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Gen 3 Weather Move Tests
 *
 * Tests for:
 *   - SolarBeam: halved power in Rain, Sand, Hail; full power in Sun and no weather
 *   - Weather Ball: type/power change based on active weather
 *   - Morning Sun/Synthesis/Moonlight: weather-scaled healing
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 * Source: Showdown data/moves.ts
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0.5,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_percent: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  types: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? 200,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

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
    volatileStatuses: new Map(),
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as ActivePokemon;
}

function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ];
  const chart: Record<string, Record<string, number>> = {};
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      chart[atk]![def] = 1;
    }
  }
  return chart;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: createMockState(opts.weather),
  } as DamageContext;
}

function createMove(opts: {
  id: string;
  type: PokemonType;
  power: number | null;
  category?: string;
}): MoveData {
  return {
    id: opts.id,
    displayName: opts.id,
    type: opts.type,
    category: opts.category ?? "special",
    power: opts.power,
    accuracy: 100,
    pp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
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
    generation: 3,
  } as MoveData;
}

// ---------------------------------------------------------------------------
// Tests — SolarBeam
// ---------------------------------------------------------------------------

const chart = createNeutralTypeChart();

describe("Gen 3 SolarBeam power halving in non-sun weather", () => {
  // SolarBeam: grass special, 120 power
  // In Rain/Sand/Hail: power = floor(120/2) = 60
  const solarBeam = createMove({ id: "solar-beam", type: "grass", power: 120 });

  it("given rain weather, when SolarBeam is used, then power is halved to 60", () => {
    // Source: pret/pokeemerald — SolarBeam halved in non-sun weather
    // Source: Showdown data/moves.ts — SolarBeam onBasePower: 0.5x in rain/sand/hail
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });
    const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: solarBeam,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // levelFactor = floor(2*50/5)+2 = 22
    // power = floor(120/2) = 60
    // base = floor(floor(22*60*100/100)/50) = floor(1320/50) = 26
    // +2 = 28, weather: rain boosts water not grass → 1.0, random=1.0
    // STAB: grass attacker, grass move → 1.5x → floor(28*1.5) = 42
    // Source: manual derivation from pret/pokeemerald formula
    expect(result.damage).toBe(42);
  });

  it("given sand weather, when SolarBeam is used, then power is halved to 60", () => {
    // Source: pret/pokeemerald — SolarBeam halved in sandstorm
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });
    const weather = { type: "sand", turnsLeft: 3, source: "sandstorm" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: solarBeam,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // Same as rain: 42
    expect(result.damage).toBe(42);
  });

  it("given hail weather, when SolarBeam is used, then power is halved to 60", () => {
    // Source: pret/pokeemerald — SolarBeam halved in hail
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });
    const weather = { type: "hail", turnsLeft: 3, source: "hail" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: solarBeam,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // Same as rain: 42
    expect(result.damage).toBe(42);
  });

  it("given sun weather, when SolarBeam is used, then full 120 power is used", () => {
    // Source: pret/pokeemerald — SolarBeam is NOT halved in sun
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });
    const weather = { type: "sun", turnsLeft: 3, source: "sunny-day" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: solarBeam,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // levelFactor = 22, power = 120 (full)
    // base = floor(floor(22*120*100/100)/50) = floor(2640/50) = 52
    // +2 = 54, random=1.0, STAB → floor(54*1.5) = 81
    // Source: manual derivation
    expect(result.damage).toBe(81);
  });

  it("given no weather, when SolarBeam is used, then full 120 power is used", () => {
    // Source: pret/pokeemerald — SolarBeam uses full power without weather
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });

    const ctx = createDamageContext({
      attacker,
      defender,
      move: solarBeam,
      weather: null,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // Same as sun (no weather mod): 81
    expect(result.damage).toBe(81);
  });
});

// ---------------------------------------------------------------------------
// Tests — Weather Ball
// ---------------------------------------------------------------------------

describe("Gen 3 Weather Ball type and power changes", () => {
  // Weather Ball: normal physical, 50 power (data says "physical" — in Gen 3 normal = physical)
  // In weather: power doubles to 100, type changes to match weather
  const weatherBall = createMove({
    id: "weather-ball",
    type: "normal",
    power: 50,
    category: "physical",
  });

  it("given rain weather, when Weather Ball is used, then type becomes water and power doubles to 100", () => {
    // Source: pret/pokeemerald — Weather Ball: power doubles, type becomes water in rain
    // Source: Showdown data/moves.ts — Weather Ball onModifyType/onModifyMove
    // Water is a special type in Gen 3 → uses spAttack/spDefense
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      spAttack: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: weatherBall,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // effectiveMoveType = water (special in Gen 3), power = 50*2 = 100
    // levelFactor = 22, base = floor(floor(22*100*100/100)/50) = floor(2200/50) = 44
    // weather = rain boosts water → 1.5x → floor(44*1.5) = 66, +2 = 68
    // random=1.0, no STAB (normal attacker, water move), neutral type
    // Source: manual derivation (weather applied before +2 per pokeemerald)
    expect(result.damage).toBe(68);
  });

  it("given sun weather, when Weather Ball is used, then type becomes fire and power doubles to 100", () => {
    // Source: pret/pokeemerald — Weather Ball: type becomes fire in sun
    // Fire is a special type in Gen 3 → uses spAttack/spDefense
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });
    const weather = { type: "sun", turnsLeft: 3, source: "sunny-day" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: weatherBall,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // effectiveMoveType = fire (special in Gen 3), power = 100
    // base = floor(2200/50) = 44
    // weather = sun boosts fire → 1.5x → floor(44*1.5) = 66, +2 = 68
    // Source: manual derivation (weather applied before +2 per pokeemerald)
    expect(result.damage).toBe(68);
  });

  it("given sand weather, when Weather Ball is used, then type becomes rock and power doubles to 100", () => {
    // Source: pret/pokeemerald — Weather Ball: type becomes rock in sandstorm
    // Rock is a physical type in Gen 3 → uses attack/defense
    const attacker = createActivePokemon({ level: 50, attack: 100, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, defense: 100, types: ["normal"] });
    const weather = { type: "sand", turnsLeft: 3, source: "sandstorm" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: weatherBall,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // effectiveMoveType = rock (physical in Gen 3), power = 100
    // base = floor(2200/50) = 44, +2 = 46
    // No weather mod (sand doesn't modify rock damage), random=1.0
    // No STAB (normal attacker, rock move)
    // Source: manual derivation
    expect(result.damage).toBe(46);
  });

  it("given hail weather, when Weather Ball is used, then type becomes ice and power doubles to 100", () => {
    // Source: pret/pokeemerald — Weather Ball: type becomes ice in hail
    // Ice is a special type in Gen 3 → uses spAttack/spDefense
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });
    const weather = { type: "hail", turnsLeft: 3, source: "hail" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: weatherBall,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // effectiveMoveType = ice (special in Gen 3), power = 100
    // base = floor(2200/50) = 44, +2 = 46
    // No weather mod (hail doesn't modify ice damage), random=1.0
    // Source: manual derivation
    expect(result.damage).toBe(46);
  });

  it("given no weather, when Weather Ball is used, then type stays normal and power stays 50", () => {
    // Source: pret/pokeemerald — Weather Ball: no weather → no type/power change
    // Normal is a physical type in Gen 3 → uses attack/defense
    const attacker = createActivePokemon({ level: 50, attack: 100, types: ["normal"] });
    const defender = createActivePokemon({ level: 50, defense: 100, types: ["normal"] });

    const ctx = createDamageContext({
      attacker,
      defender,
      move: weatherBall,
      weather: null,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // effectiveMoveType = normal (physical), power = 50
    // base = floor(floor(22*50*100/100)/50) = floor(1100/50) = 22
    // +2 = 24, random=1.0, STAB (normal attacker, normal move) → floor(24*1.5) = 36
    // Source: manual derivation
    expect(result.damage).toBe(36);
  });

  it("given rain weather and water-type attacker, when Weather Ball is used, then STAB applies for water type", () => {
    // Source: pret/pokeemerald — Weather Ball STAB is based on the effective type
    const attacker = createActivePokemon({ level: 50, spAttack: 100, types: ["water"] });
    const defender = createActivePokemon({ level: 50, spDefense: 100, types: ["normal"] });
    const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };

    const ctx = createDamageContext({
      attacker,
      defender,
      move: weatherBall,
      weather,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // effectiveMoveType = water (special), power = 100
    // base = floor(2200/50) = 44
    // weather = rain boosts water → 1.5x → floor(44*1.5) = 66, +2 = 68
    // random = 1.0 → 68, STAB: water attacker, water move → 1.5x → floor(68*1.5) = 102
    // Source: manual derivation (weather applied before +2 per pokeemerald)
    expect(result.damage).toBe(102);
  });
});

// ---------------------------------------------------------------------------
// Tests — Morning Sun / Synthesis / Moonlight
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weather?: { type: string; turnsLeft: number; source: string } | null,
): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createCustomMoveEffectContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  moveId: string;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): MoveEffectContext {
  const state = createMinimalBattleState(opts.attacker, opts.defender, opts.weather);
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: {
      id: opts.moveId,
      displayName: opts.moveId,
      type: "normal",
      category: "status",
      power: null,
      accuracy: null,
      pp: 5,
      priority: 0,
      target: "self",
      flags: {
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: false,
        protect: false,
        mirror: false,
        snatch: true,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
      effect: { type: "custom", handler: opts.moveId },
      description: "",
      generation: 3,
    } as MoveData,
    damage: 0,
    state,
    rng: createMockRng(0),
  } as MoveEffectContext;
}

describe("Gen 3 Morning Sun / Synthesis / Moonlight weather healing", () => {
  for (const moveId of ["morning-sun", "synthesis", "moonlight"]) {
    describe(`${moveId}`, () => {
      it(`given sun weather, when ${moveId} is used, then it heals 2/3 of max HP`, () => {
        // Source: pret/pokeemerald — weather-scaled healing: 2/3 in sun
        // Source: Showdown data/moves.ts — onHit: 2/3 in sun
        const attacker = createActivePokemon({ types: ["normal"], currentHp: 100 });
        const defender = createActivePokemon({ types: ["normal"] });
        const weather = { type: "sun", turnsLeft: 3, source: "sunny-day" };
        const ctx = createCustomMoveEffectContext({ attacker, defender, moveId, weather });

        const result = ruleset.executeMoveEffect(ctx);

        // maxHp = 200, heal = floor(200 * 2/3) = floor(133.33) = 133
        // Source: manual derivation
        expect(result.healAmount).toBe(133);
      });

      it(`given no weather, when ${moveId} is used, then it heals 1/2 of max HP`, () => {
        // Source: pret/pokeemerald — weather-scaled healing: 1/2 normally
        const attacker = createActivePokemon({ types: ["normal"], currentHp: 100 });
        const defender = createActivePokemon({ types: ["normal"] });
        const ctx = createCustomMoveEffectContext({ attacker, defender, moveId, weather: null });

        const result = ruleset.executeMoveEffect(ctx);

        // maxHp = 200, heal = floor(200 * 0.5) = 100
        expect(result.healAmount).toBe(100);
      });

      it(`given rain weather, when ${moveId} is used, then it heals 1/4 of max HP`, () => {
        // Source: pret/pokeemerald — weather-scaled healing: 1/4 in rain/sand/hail
        const attacker = createActivePokemon({ types: ["normal"], currentHp: 50 });
        const defender = createActivePokemon({ types: ["normal"] });
        const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };
        const ctx = createCustomMoveEffectContext({ attacker, defender, moveId, weather });

        const result = ruleset.executeMoveEffect(ctx);

        // maxHp = 200, heal = floor(200 * 0.25) = 50
        expect(result.healAmount).toBe(50);
      });

      it(`given sand weather, when ${moveId} is used, then it heals 1/4 of max HP`, () => {
        // Source: pret/pokeemerald — weather-scaled healing: 1/4 in sand
        const attacker = createActivePokemon({ types: ["normal"], currentHp: 50 });
        const defender = createActivePokemon({ types: ["normal"] });
        const weather = { type: "sand", turnsLeft: 3, source: "sandstorm" };
        const ctx = createCustomMoveEffectContext({ attacker, defender, moveId, weather });

        const result = ruleset.executeMoveEffect(ctx);

        // maxHp = 200, heal = floor(200 * 0.25) = 50
        expect(result.healAmount).toBe(50);
      });

      it(`given hail weather, when ${moveId} is used, then it heals 1/4 of max HP`, () => {
        // Source: pret/pokeemerald — weather-scaled healing: 1/4 in hail
        const attacker = createActivePokemon({ types: ["normal"], currentHp: 50 });
        const defender = createActivePokemon({ types: ["normal"] });
        const weather = { type: "hail", turnsLeft: 3, source: "hail" };
        const ctx = createCustomMoveEffectContext({ attacker, defender, moveId, weather });

        const result = ruleset.executeMoveEffect(ctx);

        // maxHp = 200, heal = floor(200 * 0.25) = 50
        expect(result.healAmount).toBe(50);
      });
    });
  }
});
