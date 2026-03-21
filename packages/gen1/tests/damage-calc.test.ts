import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen1Damage } from "../src/Gen1DamageCalc";

/**
 * Gen 1 Damage Formula Tests
 *
 * The Gen 1 damage formula:
 *   damage = ((((2 * Level / 5 + 2) * Power * Attack / Defense) / 50) + 2)
 *            * STAB * TypeEffectiveness * Random(217..255)/255
 *
 * Key differences from later gens:
 * - No abilities, no held items
 * - Physical/Special determined by type (not per-move)
 * - Critical hits use base stats, ignore stat stages
 * - Integer division at each step
 * - Burn halves attack for physical moves
 */

// ---------------------------------------------------------------------------
// Test helpers — build minimal mocks matching the real interfaces
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** Convert a desired 0-1 random factor to the int roll the implementation expects (217-255). */
function randomFactorToRoll(factor: number): number {
  // The implementation does: roll = rng.int(217,255); randomFactor = roll / 255
  // So roll = Math.round(factor * 255), clamped to [217, 255].
  return Math.min(255, Math.max(217, Math.round(factor * 255)));
}

/** Minimal ActivePokemon mock. */
function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: "burn" | null;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: opts.status ?? null,
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
      hp: 0,
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: "",
    lastMoveUsed: null,
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

/** Minimal physical move mock. Type "normal" is physical in Gen 1. */
function createPhysicalMove(power: number): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type: "normal" as PokemonType,
    category: "physical",
    power,
    accuracy: 100,
    pp: 35,
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
    generation: 1,
  } as MoveData;
}

/** Minimal species data mock. */
function createSpecies(): PokemonSpeciesData {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types: ["normal"],
    baseStats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    abilities: { normal: [""], hidden: null },
    genderRatio: 50,
    catchRate: 45,
    baseExp: 64,
    expGroup: "medium-slow",
    evYield: {},
    eggGroups: ["monster"],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1, weight: 10 },
    spriteKey: "test",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  } as PokemonSpeciesData;
}

/**
 * A type chart where every matchup is neutral (1x).
 * Override specific entries when testing type effectiveness.
 */
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
  ];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    const row = chart[atk] as Record<string, number>;
    for (const def of types) {
      row[def] = 1;
    }
  }
  return chart as TypeChart;
}

/**
 * Build a type chart that produces the desired effectiveness for normal-type moves
 * against the defender type "water" (an arbitrary stand-in type).
 */
function createTypeChartWithEffectiveness(effectiveness: number): {
  chart: TypeChart;
  defenderTypes: PokemonType[];
} {
  const chart = createNeutralTypeChart();
  if (effectiveness === 1.0) {
    // Everything is already neutral
    return { chart, defenderTypes: ["normal"] };
  }
  // Use "water" as the defender type and set normal -> water to the desired value
  const normalRow = (chart as Record<string, Record<string, number>>).normal;
  if (normalRow) normalRow.water = effectiveness;
  return { chart, defenderTypes: ["water"] };
}

/**
 * Build a DamageContext + TypeChart from simplified test parameters.
 *
 * This bridges the old flat-param test style to the real calculateGen1Damage API.
 */
function buildContext(params: {
  level: number;
  power: number;
  attack: number;
  defense: number;
  stab: boolean;
  typeEffectiveness: number;
  isCritical: boolean;
  randomFactor: number;
}): { context: DamageContext; chart: TypeChart; species: PokemonSpeciesData } {
  const { chart, defenderTypes } = createTypeChartWithEffectiveness(params.typeEffectiveness);

  // STAB: if stab is true, attacker types include the move's type ("normal")
  const attackerTypes: PokemonType[] = params.stab ? ["normal"] : ["fire"];

  const attacker = createActivePokemon({
    level: params.level,
    attack: params.attack,
    defense: 100,
    spAttack: params.attack,
    spDefense: 100,
    types: attackerTypes,
  });

  const defender = createActivePokemon({
    level: 50,
    attack: 100,
    defense: params.defense,
    spAttack: 100,
    spDefense: params.defense,
    types: defenderTypes,
  });

  const move = createPhysicalMove(params.power);
  const roll = randomFactorToRoll(params.randomFactor);
  const rng = createMockRng(roll);
  const species = createSpecies();

  const context = {
    attacker,
    defender,
    move,
    state: {} as DamageContext["state"], // not accessed by calculateGen1Damage
    rng: rng as DamageContext["rng"],
    isCrit: params.isCritical,
  } satisfies DamageContext;

  return { context, chart, species };
}

/** Shortcut: build + calculate in one call, return the numeric damage. */
function calcDamage(params: {
  level: number;
  power: number;
  attack: number;
  defense: number;
  stab: boolean;
  typeEffectiveness: number;
  isCritical: boolean;
  randomFactor: number;
}): number {
  const { context, chart, species } = buildContext(params);
  return calculateGen1Damage(context, chart, species).damage;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 1 Damage Calculation", () => {
  // --- Basic Damage Calculation ---

  it("given known attacker/defender stats and a physical move, when calculating damage at max roll, then returns exact expected value", () => {
    // Arrange: Level 50 attacker with Attack 100, Defender with Defense 100, Power 80 move
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      typeEffectiveness: 1.0,
      isCritical: false,
      randomFactor: 1.0, // Max roll (255/255)
    };
    // Act
    const damage = calcDamage(params);
    // Assert — exact value derived from pret/pokered damage formula:
    // Source: pret/pokered src/engine/battle/core.asm — damage calculation routine
    // L50, BP=80, Atk=100, Def=100, no STAB, neutral type, max roll (255/255=1.0):
    //   levelFactor = floor(2*50/5)+2 = floor(20)+2 = 22
    //   inner = floor(22*80*100) / 100 = floor(176000)/100 = 1760
    //   baseDamage = floor(1760/50)+2 = 35+2 = 37
    //   No STAB, neutral type → 37
    //   Random: floor(37 * 255/255) = 37
    expect(damage).toBe(37);
    expect(Number.isInteger(damage)).toBe(true);
  });

  it("given known attacker/defender stats, when calculating damage at min roll (0.85), then returns exact expected value lower than max roll", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      typeEffectiveness: 1.0,
      isCritical: false,
    };
    // Act
    const maxDamage = calcDamage({ ...params, randomFactor: 1.0 });
    const minDamage = calcDamage({ ...params, randomFactor: 0.85 });
    // Assert — exact values derived from pret/pokered damage formula:
    // Source: pret/pokered src/engine/battle/core.asm — damage calculation routine
    // L50, BP=80, Atk=100, Def=100, no STAB, neutral type:
    //   baseDamage = 37 (same as max roll test above)
    //   Max roll (255/255): floor(37 * 255/255) = 37
    //   Min roll (217/255): floor(37 * 217/255) = floor(31.44) = 31
    expect(maxDamage).toBe(37);
    expect(minDamage).toBe(31);
    expect(minDamage).toBeLessThan(maxDamage);
  });

  it("given damage calculation, when random factor varies 0.85 to 1.0, then damage range spans about 15%", () => {
    // Arrange
    const params = {
      level: 100,
      power: 100,
      attack: 200,
      defense: 100,
      stab: false,
      typeEffectiveness: 1.0,
      isCritical: false,
    };
    // Act
    const maxDamage = calcDamage({ ...params, randomFactor: 1.0 });
    const minDamage = calcDamage({ ...params, randomFactor: 0.85 });
    // Assert: The ratio should be approximately 0.85
    if (maxDamage > 0) {
      const ratio = minDamage / maxDamage;
      expect(ratio).toBeGreaterThanOrEqual(0.8); // Allow some rounding tolerance
      expect(ratio).toBeLessThanOrEqual(0.9);
    }
  });

  // --- STAB (Same Type Attack Bonus) ---

  it("given a STAB move, when calculating damage, then applies 1.5x multiplier", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      typeEffectiveness: 1.0,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const withoutStab = calcDamage({ ...params, stab: false });
    const withStab = calcDamage({ ...params, stab: true });
    // Assert: STAB damage should be approximately 1.5x non-STAB
    expect(withStab).toBeGreaterThan(withoutStab);
    if (withoutStab > 0) {
      const ratio = withStab / withoutStab;
      // With integer division, the ratio may not be exactly 1.5 but should be close
      expect(ratio).toBeGreaterThanOrEqual(1.4);
      expect(ratio).toBeLessThanOrEqual(1.6);
    }
  });

  // --- Type Effectiveness ---

  it("given a super effective move (2x), when calculating damage, then approximately doubles damage", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const neutral = calcDamage({ ...params, typeEffectiveness: 1.0 });
    const superEffective = calcDamage({ ...params, typeEffectiveness: 2.0 });
    // Assert
    expect(superEffective).toBeGreaterThan(neutral);
    if (neutral > 0) {
      const ratio = superEffective / neutral;
      expect(ratio).toBeGreaterThanOrEqual(1.8);
      expect(ratio).toBeLessThanOrEqual(2.2);
    }
  });

  it("given a not very effective move (0.5x), when calculating damage, then approximately halves damage", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const neutral = calcDamage({ ...params, typeEffectiveness: 1.0 });
    const notVeryEffective = calcDamage({ ...params, typeEffectiveness: 0.5 });
    // Assert
    expect(notVeryEffective).toBeLessThan(neutral);
    if (neutral > 0) {
      const ratio = notVeryEffective / neutral;
      expect(ratio).toBeGreaterThanOrEqual(0.4);
      expect(ratio).toBeLessThanOrEqual(0.6);
    }
  });

  it("given an immune matchup (0x), when calculating damage, then deals 0 damage", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      typeEffectiveness: 0,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const damage = calcDamage(params);
    // Assert
    expect(damage).toBe(0);
  });

  it("given double super effective (4x), when calculating damage, then approximately quadruples damage", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const neutral = calcDamage({ ...params, typeEffectiveness: 1.0 });
    const doubleSE = calcDamage({ ...params, typeEffectiveness: 4.0 });
    // Assert
    expect(doubleSE).toBeGreaterThan(neutral);
    if (neutral > 0) {
      const ratio = doubleSE / neutral;
      expect(ratio).toBeGreaterThanOrEqual(3.5);
      expect(ratio).toBeLessThanOrEqual(4.5);
    }
  });

  // --- Level Scaling ---

  it("given higher level attacker, when calculating damage, then deals more damage", () => {
    // Arrange
    const params = {
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      typeEffectiveness: 1.0,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const damageLow = calcDamage({ ...params, level: 10 });
    const damageMid = calcDamage({ ...params, level: 50 });
    const damageHigh = calcDamage({ ...params, level: 100 });
    // Assert
    expect(damageMid).toBeGreaterThan(damageLow);
    expect(damageHigh).toBeGreaterThan(damageMid);
  });

  // --- High Attack vs Low Defense ---

  it("given very high attack vs very low defense, when calculating damage, then deals massive damage", () => {
    // Arrange
    const params = {
      level: 100,
      power: 150,
      attack: 400,
      defense: 50,
      stab: true,
      typeEffectiveness: 2.0,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const damage = calcDamage(params);
    // Assert
    expect(damage).toBeGreaterThan(500); // Should be very high
  });

  // --- Low Power Move ---

  it("given very low power move, when calculating damage with neutral type, then deals at least 1 damage", () => {
    // In Gen 1 there is no forced minimum-1 after the random factor; 0 damage is possible
    // for extremely weak moves. Use neutral typing (1.0x) so the base damage of 2 survives
    // the random factor (floor(2 * 217/255) = 1).
    // Arrange
    const params = {
      level: 5,
      power: 10,
      attack: 10,
      defense: 200,
      stab: false,
      typeEffectiveness: 1.0,
      isCritical: false,
      randomFactor: 0.85,
    };
    // Act
    const damage = calcDamage(params);
    // Assert
    expect(damage).toBeGreaterThanOrEqual(1);
  });

  it("given very weak move vs high defense and 0.5x resist, when damage rounds to 0 after random, then deals 1 (Gen 1 min-1 damage for non-immune moves)", () => {
    // Gen 1 cartridge behavior (pret/pokered core_battle_start.asm): non-immune moves
    // always deal at least 1 damage. Even if floor(baseDamage * randomRoll / 255) = 0,
    // the result is clamped to 1.
    // L5, P10, Atk10, Def200, 0.5x → baseDamage=1, floor(1*217/255)=0 → clamped to 1
    const params = {
      level: 5,
      power: 10,
      attack: 10,
      defense: 200,
      stab: false,
      typeEffectiveness: 0.5,
      isCritical: false,
      randomFactor: 0.85,
    };
    const damage = calcDamage(params);
    expect(damage).toBe(1);
  });

  // --- Burn Effect on Physical Moves ---

  it("given a burned attacker using a physical move, when calculating damage, then attack is halved", () => {
    // Arrange: Use the full API to set burn status on the attacker
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const move = createPhysicalMove(80);
    const rng = createMockRng(255); // max roll

    const attackerNormal = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["fire"],
    });
    const attackerBurned = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["fire"],
      status: "burn",
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });

    const ctxNormal = {
      attacker: attackerNormal,
      defender,
      move,
      state: {} as DamageContext["state"], // not accessed by calculateGen1Damage
      rng: rng as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    const ctxBurned = {
      attacker: attackerBurned,
      defender,
      move,
      state: {} as DamageContext["state"], // not accessed by calculateGen1Damage
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    // Act
    const normalDamage = calculateGen1Damage(ctxNormal, chart, species).damage;
    const burnedDamage = calculateGen1Damage(ctxBurned, chart, species).damage;
    // Assert: With halved attack, damage should be roughly halved
    if (normalDamage > 0) {
      expect(burnedDamage).toBeLessThan(normalDamage);
    }
  });

  // --- Determinism with known values ---

  it("given identical inputs, when calculating damage multiple times, then always produces the same result", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      typeEffectiveness: 1.0,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const damage1 = calcDamage(params);
    const damage2 = calcDamage(params);
    const damage3 = calcDamage(params);
    // Assert
    expect(damage1).toBe(damage2);
    expect(damage2).toBe(damage3);
  });

  // --- Power 0 Edge Case ---

  it("given a move with power 0, when calculating damage, then returns minimal or zero damage", () => {
    // Arrange
    const params = {
      level: 50,
      power: 0,
      attack: 100,
      defense: 100,
      stab: false,
      typeEffectiveness: 1.0,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const damage = calcDamage(params);
    // Assert
    expect(damage).toBeLessThanOrEqual(2); // Only the +2 constant at most
  });

  // --- Integer Division Consistency ---

  it("given damage calculation, when result is computed, then all intermediate values use floor division yielding exact integer result", () => {
    // Arrange: Use values that would produce fractional intermediates
    const params = {
      level: 37,
      power: 65,
      attack: 87,
      defense: 73,
      stab: true,
      typeEffectiveness: 2.0,
      isCritical: false,
      randomFactor: 0.93, // roll = round(0.93*255) = round(237.15) = 237
    };
    // Act
    const damage = calcDamage(params);
    // Assert — exact value verifies floor-first integer math (not float intermediates):
    // Source: pret/pokered src/engine/battle/core.asm — damage calculation routine
    // L37, BP=65, Atk=87, Def=73, STAB (normal×normal), type 2x, roll=237:
    //   levelFactor = floor(2*37/5)+2 = floor(14.8)+2 = 14+2 = 16
    //   inner = floor(16*65*87) / 73 = floor(90480)/73 = floor(1239.45) = 1239
    //   baseDamage = floor(1239/50)+2 = 24+2 = 26
    //   STAB (floor(26*1.5)) = floor(39) = 39
    //   2x type (floor(39*20/10)) = floor(78) = 78
    //   Random: floor(78 * 237 / 255) = floor(18486/255) = floor(72.49) = 72
    expect(damage).toBe(72);
    expect(Number.isInteger(damage)).toBe(true);
  });

  // --- STAB + Super Effective Stacking ---

  it("given STAB and super effective, when calculating damage, then both multipliers stack", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      isCritical: false,
      randomFactor: 1.0,
    };
    // Act
    const neutral = calcDamage({
      ...params,
      stab: false,
      typeEffectiveness: 1.0,
    });
    const stabOnly = calcDamage({
      ...params,
      stab: true,
      typeEffectiveness: 1.0,
    });
    const seOnly = calcDamage({
      ...params,
      stab: false,
      typeEffectiveness: 2.0,
    });
    const stabAndSe = calcDamage({
      ...params,
      stab: true,
      typeEffectiveness: 2.0,
    });
    // Assert: STAB+SE should be greater than either alone
    expect(stabAndSe).toBeGreaterThan(stabOnly);
    expect(stabAndSe).toBeGreaterThan(seOnly);
    // And the combined should be roughly 3x neutral (1.5 * 2.0 = 3.0)
    if (neutral > 0) {
      const ratio = stabAndSe / neutral;
      expect(ratio).toBeGreaterThanOrEqual(2.5);
      expect(ratio).toBeLessThanOrEqual(3.5);
    }
  });

  // --- Correction 24: Critical Hit Level Doubling ---

  it("given critical hit vs non-critical with same stats, when calculating damage, then crit deals more damage via level doubling (not flat 2x)", () => {
    // Arrange: Level 50 attacker. levelFactor non-crit = floor(100/5)+2 = 22, crit = floor(200/5)+2 = 42
    // levelFactor ratio = 42/22 ≈ 1.91x, but final damage ratio is ~1.86x due to the +2 additive constant — NOT exactly 2x
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      typeEffectiveness: 1.0,
      randomFactor: 1.0,
    };
    // Act
    const critDamage = calcDamage({ ...params, isCritical: true });
    const nonCritDamage = calcDamage({ ...params, isCritical: false });
    // Assert: crit is more damage
    expect(critDamage).toBeGreaterThan(nonCritDamage);
    // Ratio should be ~1.91x (level doubling), distinctly NOT exactly 2.0x
    const ratio = critDamage / nonCritDamage;
    expect(ratio).toBeGreaterThanOrEqual(1.7);
    expect(ratio).toBeLessThanOrEqual(2.1);
    // If it were a flat 2x multiplier, ratio would be exactly 2.0.
    // Level doubling gives ~1.91x at L50, so confirm it's not suspiciously exactly 2.0
    expect(ratio).not.toBeCloseTo(2.0, 5);
  });

  it("given critical hit against super effective target, when calculating damage, then type effectiveness (2x) still applies normally with exact values", () => {
    // Arrange
    const params = {
      level: 50,
      power: 80,
      attack: 100,
      defense: 100,
      stab: false,
      isCritical: true,
      randomFactor: 1.0,
    };
    // Act
    const critNeutral = calcDamage({ ...params, typeEffectiveness: 1.0 });
    const critSuperEffective = calcDamage({ ...params, typeEffectiveness: 2.0 });
    const nonCritSuperEffective = calcDamage({
      ...params,
      isCritical: false,
      typeEffectiveness: 2.0,
    });
    // Assert — exact values derived from pret/pokered damage formula:
    // Source: pret/pokered src/engine/battle/core.asm — damage calculation routine
    // Crit (effectiveLevel=100): levelFactor=floor(200/5)+2=42
    //   baseDamage = floor(floor(42*80*100)/100/50)+2 = floor(3360/50)+2 = 67+2 = 69
    //   Crit neutral (1x): floor(69*255/255) = 69
    //   Crit 2x SE: floor(69*20/10) = 138; floor(138*255/255) = 138
    // Non-crit (level=50): levelFactor=22, baseDamage=37
    //   Non-crit 2x SE: floor(37*20/10) = 74; floor(74*255/255) = 74
    expect(critNeutral).toBe(69);
    expect(critSuperEffective).toBe(138);
    expect(nonCritSuperEffective).toBe(74);
    // Super-effective crit should also beat super-effective non-crit
    expect(critSuperEffective).toBeGreaterThan(nonCritSuperEffective);
  });

  // --- Correction 4: Integer Random Factor Math ---

  it("given random roll of 217 (minimum) applied to baseDamage, when computing floor(baseDamage * roll / 255), then result is a positive integer", () => {
    // Arrange: force rng to return 217 (minimum roll)
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const move = createPhysicalMove(80);
    const rng = createMockRng(217);

    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });

    const context = {
      attacker,
      defender,
      move,
      state: {} as DamageContext["state"], // not accessed by calculateGen1Damage
      rng: rng as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    // Act
    const result = calculateGen1Damage(context, chart, species);

    // Assert — exact value derived from pret/pokered damage formula:
    // Source: pret/pokered src/engine/battle/core.asm — damage calculation routine
    // L50, BP=80, Atk=100, Def=100, no STAB (fire vs normal move), neutral type, roll=217:
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDamage = floor(floor(22*80*100)/100/50)+2 = 37
    //   Random: floor(37 * 217/255) = floor(31.44) = 31
    expect(result.damage).toBe(31);
    expect(Number.isInteger(result.damage)).toBe(true);
    // Verify randomFactor in return value is 217/255
    expect(result.randomFactor).toBeCloseTo(217 / 255, 10);
  });

  it("given baseDamage scenario, when roll is 219, then damage matches integer-first computation floor(baseDamage * roll / 255)", () => {
    // This test pins down the exact expected value to verify integer-first random math.
    // Integer-first: floor(X * roll / 255) — the correct Gen 1 implementation.
    // Float-first:   floor(X * (roll / 255)) — the incorrect alternative that can differ.
    // Params: L100, Power 100, Attack 200, Defense 100 → baseDamage = 170
    //   levelFactor = floor((2*100)/5)+2 = 42
    //   floor(floor(42*100*200)/100)/50 + 2 = floor(8400/50)+2 = 168+2 = 170
    //   (170 < 997 so cap does not apply; 200 < 256 so overflow does not apply)
    // Roll = 219 → floor(170 * 219 / 255) = floor(37230/255) = 146
    // Float-first would give: floor(170 * 0.8588...) = floor(145.99...) = 145 — different!
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const move = createPhysicalMove(100);
    const rng = createMockRng(219);

    const attacker = createActivePokemon({
      level: 100,
      attack: 200,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["fire"], // non-STAB for "normal"-type move
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });

    const context = {
      attacker,
      defender,
      move,
      state: {} as DamageContext["state"], // not accessed by calculateGen1Damage
      rng: rng as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    const result = calculateGen1Damage(context, chart, species);

    // baseDamage = 170, roll = 219 → floor(170 * 219 / 255) = 146
    expect(result.damage).toBe(146);
    expect(Number.isInteger(result.damage)).toBe(true);
  });

  // --- Stat Stage Multiplier Table (Correction 22) ---

  it("given stat stage multipliers, when getting each stage from -6 to +6, then they match the Gen 1 table", () => {
    // Gen 1 stat stage formula: max(2, 2+s) / max(2, 2-s)
    const expected: Record<number, number> = {
      [-6]: 2 / 8, // 0.25
      [-5]: 2 / 7, // ~0.2857
      [-4]: 2 / 6, // ~0.3333
      [-3]: 2 / 5, // 0.4
      [-2]: 2 / 4, // 0.5
      [-1]: 2 / 3, // ~0.6667
      0: 2 / 2, // 1.0
      1: 3 / 2, // 1.5
      2: 4 / 2, // 2.0
      3: 5 / 2, // 2.5
      4: 6 / 2, // 3.0
      5: 7 / 2, // 3.5
      6: 8 / 2, // 4.0
    };

    for (const [stageStr, expectedVal] of Object.entries(expected)) {
      const stage = Number(stageStr);
      expect(getStatStageMultiplier(stage)).toBeCloseTo(expectedVal, 4);
    }
  });

  // --- Damage Cap at 997 (Correction 5) ---

  it("given extreme attack/power that would exceed 997 before +2, when calculating damage, then intermediate is capped at 997", () => {
    // Showdown: clamp(floor(baseDamage/50), 0, 997) + 2 — cap before adding 2
    // L100, Power 150, Attack 255, Defense 1 → baseDamage / 50 > 997
    //   levelFactor = 42
    //   floor(42*150*255)/1 = 1606050
    //   floor(1606050/50) = 32121 → cap to 997 → +2 = 999
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const move = createPhysicalMove(150);
    const rng = createMockRng(255); // max roll

    const attacker = createActivePokemon({
      level: 100,
      attack: 255,
      defense: 100,
      spAttack: 255,
      spDefense: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 1,
      defense: 1,
      spAttack: 1,
      spDefense: 1,
      types: ["normal"],
    });

    const context = {
      attacker,
      defender,
      move,
      state: {} as DamageContext["state"], // not accessed by calculateGen1Damage
      rng: rng as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    const result = calculateGen1Damage(context, chart, species);
    // Capped at 997 + 2 = 999 (before STAB/type), then random 255/255 → 999
    expect(result.damage).toBe(999);
  });

  // --- Stat Overflow Bug (Correction 17) ---

  it("given attack stat of 300 (>= 256), when calculating damage, then overflow divides both by 4 mod 256", () => {
    // Gen 1 bug: if attack OR defense >= 256, both are divided by 4 and taken mod 256.
    // attack=300: floor(300/4)%256 = 75%256 = 75
    // defense=100: floor(100/4)%256 = 25%256 = 25
    // baseDamage with attack=75, defense=25 vs original attack=300, defense=100
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const move = createPhysicalMove(80);
    const rng = createMockRng(255);

    const attackerOverflow = createActivePokemon({
      level: 100,
      attack: 300, // >= 256 → triggers overflow
      defense: 100,
      spAttack: 300,
      spDefense: 100,
      types: ["fire"],
    });
    const attackerNormal = createActivePokemon({
      level: 100,
      attack: 75, // floor(300/4)%256 = 75 — the overflowed value
      defense: 100,
      spAttack: 75,
      spDefense: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100, // floor(100/4)%256 = 25 after overflow
      spAttack: 100,
      spDefense: 25, // pre-overflowed to match
      types: ["normal"],
    });
    const defenderOverflowed = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 25,
      spAttack: 100,
      spDefense: 25,
      types: ["normal"],
    });

    const ctxOverflow = {
      attacker: attackerOverflow,
      defender,
      move,
      state: {} as DamageContext["state"],
      rng: rng as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;
    const ctxNormal = {
      attacker: attackerNormal,
      defender: defenderOverflowed,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    const overflowResult = calculateGen1Damage(ctxOverflow, chart, species);
    const normalResult = calculateGen1Damage(ctxNormal, chart, species);
    // Both should produce the same damage since overflow maps 300 → 75, 100 → 25
    expect(overflowResult.damage).toBe(normalResult.damage);
  });

  // --- Explosion/Self-Destruct Defense Halving (Correction 16) ---

  it("given Explosion move, when calculating damage, then target defense is halved before damage calc", () => {
    // Gen 1: Explosion and Self-Destruct halve the target's Defense in the damage formula.
    // (Showdown scripts.ts:863) This effectively doubles damage vs normal moves.
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const explosionMove: MoveData = {
      id: "explosion",
      displayName: "Explosion",
      type: "normal" as PokemonType,
      category: "physical",
      power: 250,
      accuracy: 100,
      pp: 5,
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
        protect: false,
        mirror: true,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
      effect: { type: "custom", handler: "explosion" },
      description: "",
      generation: 1,
    };
    const normalMove = createPhysicalMove(250);
    const rng = createMockRng(255);

    const attacker = createActivePokemon({
      level: 100,
      attack: 200,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 200,
      spAttack: 100,
      spDefense: 200,
      types: ["normal"],
    });

    const ctxExplosion = {
      attacker,
      defender,
      move: explosionMove,
      state: {} as DamageContext["state"],
      rng: rng as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;
    const ctxNormal = {
      attacker,
      defender,
      move: normalMove,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    const explosionDamage = calculateGen1Damage(ctxExplosion, chart, species).damage;
    const normalDamage = calculateGen1Damage(ctxNormal, chart, species).damage;
    // Explosion should deal more damage due to halved defense
    expect(explosionDamage).toBeGreaterThan(normalDamage);
  });

  // --- Burn Does NOT Affect Critical Hits (Bug 3A Fix) ---

  it("given a burned attacker using a physical move with a critical hit, when calculating damage, then the attack stat is NOT halved (burn does not apply on crits)", () => {
    // Source: pret/pokered engine/battle/core.asm:4060-4071 GetDamageVarsForPlayerAttack
    // On critical hits, loads from wPartyMon1Attack (unmodified party data), not wBattleMonAttack
    // (which has burn halving applied). Therefore burn does NOT affect crits in Gen 1.
    //
    // Setup: L50 Charizard (Fire/Flying, Attack=104) vs L50 Blastoise (Water, Defense=105)
    // using Slash (Normal-type, 70 power, non-STAB).
    // Critical hit: effectiveLevel = 50*2 = 100, levelFactor = floor(200/5)+2 = 42
    //
    // WITHOUT burn halving on crit (correct):
    //   attack = 104 (unmodified)
    //   baseDamage = floor(floor(42 * 70 * 104) / 105 / 50) + 2
    //             = floor(floor(305760) / 105 / 50) + 2
    //             = floor(2912 / 50) + 2
    //             = floor(58.24) + 2 = 58 + 2 = 60
    //   max roll (255): floor(60 * 255 / 255) = 60
    //
    // WITH burn halving on crit (incorrect old behavior):
    //   attack = floor(104/2) = 52
    //   baseDamage = floor(floor(42 * 70 * 52) / 105 / 50) + 2
    //             = floor(floor(152880) / 105 / 50) + 2
    //             = floor(1456 / 50) + 2
    //             = floor(29.12) + 2 = 29 + 2 = 31
    //   max roll (255): floor(31 * 255 / 255) = 31
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const slashMove: MoveData = {
      id: "slash",
      displayName: "Slash",
      type: "normal" as PokemonType,
      category: "physical",
      power: 70,
      accuracy: 100,
      pp: 20,
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
      generation: 1,
    } as MoveData;
    const rng = createMockRng(255); // max roll

    // Burned Charizard (Fire/Flying) — non-STAB for Normal-type Slash
    const burnedAttacker = createActivePokemon({
      level: 50,
      attack: 104,
      defense: 78,
      spAttack: 109,
      spDefense: 85,
      types: ["fire", "flying"],
      status: "burn",
    });

    // Non-burned Charizard for comparison
    const normalAttacker = createActivePokemon({
      level: 50,
      attack: 104,
      defense: 78,
      spAttack: 109,
      spDefense: 85,
      types: ["fire", "flying"],
    });

    const blastoise = createActivePokemon({
      level: 50,
      attack: 83,
      defense: 105,
      spAttack: 85,
      spDefense: 105,
      types: ["water"],
    });

    // Critical hit with burn — should NOT halve attack
    const ctxBurnedCrit = {
      attacker: burnedAttacker,
      defender: blastoise,
      move: slashMove,
      state: {} as DamageContext["state"],
      rng: rng as DamageContext["rng"],
      isCrit: true,
    } satisfies DamageContext;

    // Critical hit without burn — should be identical to burned crit
    const ctxNormalCrit = {
      attacker: normalAttacker,
      defender: blastoise,
      move: slashMove,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    } satisfies DamageContext;

    const burnedCritDamage = calculateGen1Damage(ctxBurnedCrit, chart, species).damage;
    const normalCritDamage = calculateGen1Damage(ctxNormalCrit, chart, species).damage;

    // Key assertion: burn does NOT reduce damage on crits — both should be equal
    expect(burnedCritDamage).toBe(normalCritDamage);
    // Verify the expected value: 60 (calculated above)
    expect(burnedCritDamage).toBe(60);
  });

  it("given a burned attacker using a physical move WITHOUT a critical hit, when calculating damage, then the attack stat IS halved (burn penalty applies normally)", () => {
    // Source: pret/pokered engine/battle/core.asm — GetDamageVarsForPlayerAttack
    // On non-critical hits, loads from wBattleMonAttack which includes burn halving.
    //
    // L50 attacker, Attack=200, Defender Defense=100, Power=80 Normal-type move
    // Non-crit, max roll, no STAB:
    //   levelFactor = floor(100/5)+2 = 22
    //   With burn: attack = floor(200/2) = 100
    //     baseDamage = floor(floor(22 * 80 * 100) / 100 / 50) + 2 = floor(176000/100/50)+2 = floor(35.2)+2 = 37
    //   Without burn: attack = 200
    //     baseDamage = floor(floor(22 * 80 * 200) / 100 / 50) + 2 = floor(352000/100/50)+2 = floor(70.4)+2 = 72
    const chart = createNeutralTypeChart();
    const species = createSpecies();
    const move = createPhysicalMove(80);

    const burnedAttacker = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["fire"],
      status: "burn",
    });
    const normalAttacker = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });

    const ctxBurned = {
      attacker: burnedAttacker,
      defender,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;
    const ctxNormal = {
      attacker: normalAttacker,
      defender,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    } satisfies DamageContext;

    const burnedDamage = calculateGen1Damage(ctxBurned, chart, species).damage;
    const normalDamage = calculateGen1Damage(ctxNormal, chart, species).damage;

    // Burn DOES halve attack on non-crits
    expect(burnedDamage).toBeLessThan(normalDamage);
    // Verify exact values
    expect(burnedDamage).toBe(37);
    expect(normalDamage).toBe(72);
  });

  // --- Integer Stat Stage Arithmetic (Gen 1 pret/pokered correctness) ---

  it("given a physical attacker with base Attack 150 at stat stage -1, when computing effective attack stat, then returns 99 (integer math: floor(150*66/100)) not 100 (float math)", () => {
    // Source: pret/pokered data/battle/stat_modifiers.asm — stage -1 ratio is 66/100 (not 2/3 = 0.6667)
    // Float: Math.floor(150 * (2/3)) = Math.floor(100.0) = 100
    // Integer: Math.floor(150 * 66 / 100) = Math.floor(99.0) = 99
    // These diverge because 66/100 != 2/3 exactly.
    // Arrange: level 50, attack 150, stage -1, power 100, defense 100, max roll.
    // Use fire-type attacker with normal-type move to avoid STAB.
    const attacker = createActivePokemon({
      level: 50,
      attack: 150,
      defense: 100,
      spAttack: 150,
      spDefense: 100,
      types: ["fire"], // fire attacker with normal move = no STAB
      statStages: { attack: -1 },
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createPhysicalMove(100);
    const chart = createNeutralTypeChart();
    const species = createSpecies();

    // Formula trace with effective attack = 99 (integer math) vs 100 (float math):
    // levelFactor = floor(2*50/5)+2 = 22
    // attack=99: floor(floor(22*100*99)/100) = floor(217800/100) = 2178; floor(2178/50)+2 = 43+2 = 45
    // attack=100: floor(floor(22*100*100)/100) = floor(220000/100) = 2200; floor(2200/50)+2 = 44+2 = 46
    // No STAB (fire attacker, normal move). Max roll 255: finalDamage = floor(45*255/255) = 45
    // Source: pret/pokered data/battle/stat_modifiers.asm
    const ctx: DamageContext = {
      attacker,
      defender,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const result = calculateGen1Damage(ctx, chart, species);
    // Assert: integer math gives 45 (effective attack 99); float math gives 46 (effective attack 100)
    expect(result.damage).toBe(45);
  });

  it("given a physical attacker with base Defense 270 at stat stage -1, when computing effective defense stat, then damage matches integer math (defense=178) not float math (defense=180)", () => {
    // Source: pret/pokered data/battle/stat_modifiers.asm — stage -1 uses 66/100 (not 2/3 = 0.6667)
    // base 270 at stage -1: integer = floor(270*66/100) = floor(17820/100) = 178
    //                         float = floor(270*(2/3))  = floor(180.0)       = 180
    // These diverge: 178 vs 180.
    //
    // To produce different final damage we need attack/power large enough:
    //   levelFactor = floor(2*50/5)+2 = 22; attack=200; power=100
    //   numerator = floor(22*200*100) = 440000
    //   defense=178 (integer): floor(440000/178)=2471; floor(2471/50)=49; +2=51
    //   defense=180 (float):   floor(440000/180)=2444; floor(2444/50)=48; +2=50
    //   With max roll (255/255=1.0): floor(51*255/255)=51 vs floor(50*255/255)=50
    // So integer math yields damage=51, float math yields damage=50.
    const attacker = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"], // fire attacker with normal move = no STAB, avoids 1.5x factor
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 270,
      spAttack: 100,
      spDefense: 270,
      types: ["normal"],
      statStages: { defense: -1 },
    });
    const move = createPhysicalMove(100);
    const chart = createNeutralTypeChart();
    const species = createSpecies();

    const ctx: DamageContext = {
      attacker,
      defender,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const result = calculateGen1Damage(ctx, chart, species);
    // Integer math (66/100 table): effective defense=178 → damage=51
    // Float math (2/3≈0.6667):     effective defense=180 → damage=50
    expect(result.damage).toBe(51);
  });
});
