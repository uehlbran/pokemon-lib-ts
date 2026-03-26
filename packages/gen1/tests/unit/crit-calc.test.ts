import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonSpeciesData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_TYPE_IDS,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen1DataManager,
  GEN1_MOVE_IDS,
  GEN1_NATURE_IDS,
  GEN1_SPECIES_IDS,
  GEN1_TYPES,
} from "../../src";
import { getGen1CritRate } from "../../src/Gen1CritCalc";
import { calculateGen1Damage } from "../../src/Gen1DamageCalc";

const DATA_MANAGER = createGen1DataManager();
const MOVE_IDS = GEN1_MOVE_IDS;
const NATURE_IDS = GEN1_NATURE_IDS;
const SPECIES_IDS = GEN1_SPECIES_IDS;
const TYPE_IDS = CORE_TYPE_IDS;
const CHARIZARD = DATA_MANAGER.getSpecies(SPECIES_IDS.charizard);
const SNORLAX = DATA_MANAGER.getSpecies(SPECIES_IDS.snorlax);
const TACKLE = DATA_MANAGER.getMove(MOVE_IDS.tackle);
const STRENGTH = DATA_MANAGER.getMove(MOVE_IDS.strength);
const DEFAULT_HP = 200;
const DEFAULT_SPEED = 100;
const MAX_RANDOM_ROLL = 255;
const NEUTRAL_STAT_STAGES = {
  hp: 0,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
  accuracy: 0,
  evasion: 0,
} as const;

function createNeutralTypeChart(): TypeChart {
  const chart = {} as Record<string, Record<string, number>>;
  for (const attackingType of GEN1_TYPES) {
    chart[attackingType] = {};
    for (const defendingType of GEN1_TYPES) {
      (chart[attackingType] as Record<string, number>)[defendingType] = 1;
    }
  }
  return chart as TypeChart;
}

function createMockRng(intReturnValue: number): DamageContext["rng"] {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as DamageContext["rng"];
}

function createActivePokemon(
  species: PokemonSpeciesData,
  level: number,
  attack: number,
  defense: number,
  types: readonly PokemonType[] = species.types,
): ActivePokemon {
  const pokemon = createPokemonInstance(species, level, new SeededRandom(7), {
    nature: NATURE_IDS.hardy,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    moves: [],
    heldItem: null,
    friendship: species.baseFriendship,
    metLocation: "pallet-town",
    originalTrainer: "Red",
    originalTrainerId: 12345,
  });

  pokemon.moves = [createMoveSlot(TACKLE.id, TACKLE.pp)];
  pokemon.currentHp = DEFAULT_HP;
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.calculatedStats = {
    hp: DEFAULT_HP,
    attack,
    defense,
    spAttack: attack,
    spDefense: defense,
    speed: DEFAULT_SPEED,
  };

  return {
    pokemon,
    teamSlot: 0,
    statStages: { ...NEUTRAL_STAT_STAGES },
    volatileStatuses: new Map(),
    types: [...types],
    ability: CORE_ABILITY_IDS.none,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

/**
 * Gen 1 Critical Hit Tests
 *
 * In Gen 1, crit rate is determined by the attacker's base Speed stat:
 *   critRate = floor(baseSpeed / 2)
 *   probability = critRate / 256
 *
 * Key mechanics:
 * - Base Speed 100 -> crit rate = 50/256 ~ 19.5%
 * - Base Speed 80  -> crit rate = 40/256 ~ 15.6%
 * - Base Speed 120 -> crit rate = 60/256 ~ 23.4%
 * - Focus Energy BUG: divides crit rate by 4 instead of multiplying
 * - High crit-ratio moves (like Slash, Karate Chop) multiply the rate by 8
 *   (or use baseSpeed * 4 / 256, clamped to 255)
 * - Crits ignore stat stages and use base stats
 * - Gen 1 crit damage multiplier is 2x (not 1.5x like Gen 6+)
 */
describe("Gen 1 Critical Hit", () => {
  // --- Base Crit Rate Calculation ---

  it("given base speed 100, when calculating crit rate, then returns approximately 19.5%", () => {
    // Arrange
    const baseSpeed = 100;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(100/2) / 256 = 50/256 ~ 0.1953
    expect(critChance).toBeCloseTo(50 / 256, 2);
  });

  it("given base speed 80, when calculating crit rate, then returns approximately 15.6%", () => {
    // Arrange
    const baseSpeed = 80;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(80/2) / 256 = 40/256 ~ 0.1563
    expect(critChance).toBeCloseTo(40 / 256, 2);
  });

  it("given base speed 120, when calculating crit rate, then returns approximately 23.4%", () => {
    // Arrange
    const baseSpeed = 120;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(120/2) / 256 = 60/256 ~ 0.2344
    expect(critChance).toBeCloseTo(60 / 256, 2);
  });

  it("given base speed 130 (Mewtwo), when calculating crit rate, then returns approximately 25.4%", () => {
    // Arrange
    const baseSpeed = 130;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(130/2) / 256 = 65/256 ~ 0.2539
    expect(critChance).toBeCloseTo(65 / 256, 2);
  });

  it("given base speed 20, when calculating crit rate, then returns approximately 3.9%", () => {
    // Arrange
    const baseSpeed = 20;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(20/2) / 256 = 10/256 ~ 0.0391
    expect(critChance).toBeCloseTo(10 / 256, 2);
  });

  it("given base speed 45, when calculating crit rate, then returns approximately 8.6%", () => {
    // Arrange
    const baseSpeed = 45;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(45/2) / 256 = 22/256 ~ 0.0859
    expect(critChance).toBeCloseTo(22 / 256, 2);
  });

  it("given base speed 1, when calculating crit rate, then returns very low rate", () => {
    // Arrange
    const baseSpeed = 1;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(1/2) / 256 = 0/256 = 0
    expect(critChance).toBe(0);
  });

  // --- Monotonicity ---

  it("given increasing base speed, when calculating crit rate, then rate increases monotonically", () => {
    // Arrange
    const speeds = [10, 20, 40, 60, 80, 100, 120, 140, 160];
    // Act
    const rates = speeds.map((s) => getGen1CritRate(s, false, false));
    // Assert
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1] ?? 0);
    }
  });

  // --- Crit Rate Bounds ---

  it("given any base speed, when calculating crit rate, then rate is between 0 and 1", () => {
    // Source: Gen 1 normal-move crit rate reduces to floor(baseSpeed / 2) / 256.
    // The non-Focus-Energy, non-high-crit path doubles the threshold and then halves it again.
    for (let speed = 0; speed <= 255; speed++) {
      const rate = getGen1CritRate(speed, false, false);
      expect(rate).toBe(Math.floor(speed / 2) / 256);
    }
  });

  it("given very high base speed (255), when calculating crit rate, then rate is capped at most 255/256", () => {
    // Arrange
    const baseSpeed = 255;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(255/2)=127; normal path doubles to 254 then halves back to 127 -> 127/256
    expect(critChance).toBeCloseTo(127 / 256, 3);
  });

  // --- Focus Energy Bug ---

  it("given Focus Energy active, when calculating crit rate, then rate DECREASES (Gen 1 bug)", () => {
    // Source: pret/pokered engine/battle/effect_commands.asm — Focus Energy sets a flag that causes
    // a `srl b` (>>1, divide by 2) instead of `sla b` (<<1, multiply by 2).
    // The intended effect was to quadruple crit rate, but the bug inverts it.
    // Without FE: floor(100/2)=50, *2=100, /2=50 → 50/256 ~19.5%
    // With FE:    floor(100/2)=50, /4=12,  /2=6  → 6/256 ~2.3% (lower — bugged!)
    // Arrange
    const baseSpeed = 100;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const focusEnergyRate = getGen1CritRate(baseSpeed, true, false);
    // Assert: Focus Energy reduces crit rate (bugged — should increase it)
    expect(focusEnergyRate).toBeLessThan(normalRate);
  });

  it("given base speed 100 Pokemon with Focus Energy, when calculating crit rate, then threshold is floor(floor(100/2)/2)=25 then /2=12, giving rate 12/256", () => {
    // Source: pret/pokered engine/battle/effect_commands.asm — Focus Energy executes a single
    // `srl b` (>>1, divide by 2) instead of the intended `sla b` (<<1, multiply by 2).
    // Net result is 1/4 of the normal crit rate (divide by 2 vs multiply by 2 = 1/4 ratio).
    // Algorithm: base=floor(100/2)=50; FE:>>1=floor(50/2)=25; normal:/2=floor(25/2)=12 → 12/256
    // Arrange
    const baseSpeed = 100;
    // Act
    const rate = getGen1CritRate(baseSpeed, true, false);
    // Assert: 12/256 (Focus Energy single right-shift gives 1/4 of the normal 48/256 rate)
    expect(rate).toBeCloseTo(12 / 256, 2);
  });

  it("given Focus Energy active with low speed, when calculating crit rate, then rate drops to near-zero", () => {
    // Source: pret/pokered engine/battle/effect_commands.asm — same `srl b` (>>1) applies
    // Speed 20: floor(20/2)=10; FE:>>1=floor(10/2)=5; normal:/2=floor(5/2)=2 → 2/256 ≈ 0.0078
    // Arrange
    const baseSpeed = 20;
    // Act
    const rate = getGen1CritRate(baseSpeed, true, false);
    // Assert: 2/256 — significantly lower than normal but not as extreme as the wrong /4 calculation
    expect(rate).toBeCloseTo(2 / 256, 2);
  });

  // --- High Crit-Ratio Moves ---

  it("given a high crit-ratio move, when calculating crit rate, then rate is significantly higher", () => {
    // Arrange: High crit moves (Slash, Karate Chop) use a different formula
    // In Gen 1: high crit rate = floor(baseSpeed * 8 / 2) / 256, capped at 255
    const baseSpeed = 100;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const highCritRate = getGen1CritRate(baseSpeed, false, true);
    // Assert
    expect(highCritRate).toBeGreaterThan(normalRate);
  });

  it("given a high crit-ratio move with base speed 100, when calculating crit rate, then rate is 255/256 (capped)", () => {
    // Source: pret/pokered engine/battle/core.asm — high crit-ratio formula:
    //   T = min(255, floor(BaseSpeed * 8 / 2)) = min(255, 400) = 255
    //   critRate = 255 / 256 ≈ 0.996
    // Slash, Karate Chop, etc. use Speed * 4 after the standard /2 step (effectively *8 total).
    const baseSpeed = 100;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, true);
    // Assert — with base speed 100 the raw threshold overflows 255, so it is capped at 255/256
    expect(rate).toBeCloseTo(255 / 256, 3);
  });

  it("given a high crit-ratio move with low base speed 20, when calculating crit rate, then rate is still elevated", () => {
    // Arrange
    const baseSpeed = 20;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const highCritRate = getGen1CritRate(baseSpeed, false, true);
    // Assert
    expect(highCritRate).toBeGreaterThan(normalRate);
  });

  // --- Critical Hit Damage ---

  it("given L50 attacker Atk=100 vs Def=100 BP=80, when crit hits vs non-crit at max roll, then crit damage is 69 and non-crit is 37", () => {
    // Source: pret/pokered engine/battle/core.asm — Gen 1 crits double the attacker's level
    // in the damage formula (not a 1.5x or 2x post-damage multiplier like later gens).
    //
    // Non-crit: effectiveLevel=50, levelFactor=floor(2*50/5)+2=22
    //   base = floor(floor(22*80*100)/100/50)+2 = floor(1760/50)+2 = 35+2 = 37
    //   final = floor(37*255/255) = 37
    //
    // Crit: effectiveLevel=100, levelFactor=floor(2*100/5)+2=42
    //   base = floor(floor(42*80*100)/100/50)+2 = floor(3360/50)+2 = 67+2 = 69
    //   final = floor(69*255/255) = 69
    //
    // Ratio = 69/37 ≈ 1.86x (NOT exactly 2x because of integer floors at each step)

    const neutralChart = createNeutralTypeChart();
    const move: MoveData = STRENGTH;
    const attacker = createActivePokemon(CHARIZARD, 50, 100, 100, [TYPE_IDS.fire, TYPE_IDS.flying]);
    const defender = createActivePokemon(SNORLAX, 50, 100, 100, [TYPE_IDS.normal]);
    const state = {} as DamageContext["state"];

    const ctxNonCrit: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: createMockRng(MAX_RANDOM_ROLL),
      isCrit: false,
    };
    const ctxCrit: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: createMockRng(MAX_RANDOM_ROLL),
      isCrit: true,
    };

    // Act
    const nonCritDamage = calculateGen1Damage(ctxNonCrit, neutralChart, CHARIZARD).damage;
    const critDamage = calculateGen1Damage(ctxCrit, neutralChart, CHARIZARD).damage;

    // Assert — exact values derived from pret/pokered damage formula
    expect(nonCritDamage).toBe(37);
    expect(critDamage).toBe(69);
    // Gen 1 crit is implemented via level doubling, not a 2x multiplier.
    // The ratio is ~1.86x due to integer floors, which proves the implementation
    // uses the correct cartridge-accurate formula (not a simple 2x multiplier).
    expect(critDamage).toBeGreaterThan(nonCritDamage);
    const ratio = critDamage / nonCritDamage;
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(2.1);
  });

  // --- Edge Cases ---

  it("given base speed 0, when calculating crit rate, then returns 0", () => {
    // Arrange
    const baseSpeed = 0;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, false);
    // Assert
    expect(rate).toBe(0);
  });

  it("given high crit AND Focus Energy active with base speed 100, when calculating crit rate, then rate is 100/256", () => {
    // Source: pret/pokered engine/battle/core.asm (Gen1CritCalc.ts implementation):
    //   Step 1: critChance = floor(100 / 2) = 50
    //   Step 2 (Focus Energy BUG): critChance = floor(50 / 2) = 25  (divides by 2 instead of *4)
    //   Step 3 (high-crit move): critChance = min(255, max(1, 25 * 4)) = 100
    //   critRate = 100 / 256 ≈ 0.3906
    // Despite Focus Energy's divide bug, the high-crit multiplier partially compensates.
    const baseSpeed = 100;
    // Act
    const rate = getGen1CritRate(baseSpeed, true, true);
    // Assert
    expect(rate).toBeCloseTo(100 / 256, 3);
  });
});
