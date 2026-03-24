import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Damage, isGen2PhysicalType } from "../../src/Gen2DamageCalc";

/**
 * Gen 2 Damage Formula Tests
 *
 * The Gen 2 damage formula:
 *   damage = floor(floor(floor((2*Level/5+2) * Power * A/D) / 50) + 2) * Modifier
 *
 * Modifier chain (each step floors):
 *   1. Critical hit (2x)
 *   2. Item modifier (type-boosting items: 1.1x)
 *   3. Clamp [1, 997]
 *   4. +2 constant
 *   5. Weather (rain/sun: 1.5x or 0.5x)
 *   6. STAB (1.5x)
 *   7. Type effectiveness
 *   8. Random factor (217-255)/255
 *
 * Key differences from Gen 1:
 *   - Weather modifier is new
 *   - Item modifier is new (type-boosting items give 1.1x)
 *   - Burn halves physical Attack stat (same as Gen 1)
 *   - Physical/Special by type (steel = physical, dark = special)
 */

// ---------------------------------------------------------------------------
// Test helpers
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

/** Minimal ActivePokemon mock. */
function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: "burn" | null;
  heldItem?: string | null;
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
    heldItem: opts.heldItem ?? null,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

/** Create a move mock with the given type and power. */
function createMove(
  type: PokemonType,
  power: number,
  category: "physical" | "special" | "status" = "physical",
): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type,
    category,
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
    generation: 2,
  } as MoveData;
}

/** Minimal species data mock. */
function createSpecies(types: PokemonType[] = ["normal"]): PokemonSpeciesData {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types,
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
    generation: 2,
    isLegendary: false,
    isMythical: false,
  } as PokemonSpeciesData;
}

/** All-neutral type chart for 17 Gen 2 types. */
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
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

/** Create a BattleState mock with optional weather. */
function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Damage Calculation", () => {
  // --- Physical vs Special Type Detection ---

  describe("isGen2PhysicalType", () => {
    it("given steel type, when checking if physical, then returns true", () => {
      expect(isGen2PhysicalType("steel")).toBe(true);
    });

    it("given dark type, when checking if physical, then returns false (dark is special)", () => {
      expect(isGen2PhysicalType("dark")).toBe(false);
    });

    it("given normal type, when checking if physical, then returns true", () => {
      expect(isGen2PhysicalType("normal")).toBe(true);
    });

    it("given fighting type, when checking if physical, then returns true", () => {
      expect(isGen2PhysicalType("fighting")).toBe(true);
    });

    it("given fire type, when checking if physical, then returns false (fire is special)", () => {
      expect(isGen2PhysicalType("fire")).toBe(false);
    });

    it("given water type, when checking if physical, then returns false (water is special)", () => {
      expect(isGen2PhysicalType("water")).toBe(false);
    });

    it("given ghost type, when checking if physical, then returns true", () => {
      expect(isGen2PhysicalType("ghost")).toBe(true);
    });

    it("given poison type, when checking if physical, then returns true", () => {
      expect(isGen2PhysicalType("poison")).toBe(true);
    });
  });

  // --- Base Damage Calculation ---

  it("given known attacker/defender stats and a physical move, when calculating damage at max roll, then produces correct result", () => {
    // Arrange
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
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const result = calculateGen2Damage(context, chart, species);

    // Assert
    // Source: pret/pokecrystal engine/battle/damage_calc.asm — Gen 2 damage formula
    // floor((floor(2*L/5+2)*BP*Atk/Def)/50)+2, then floor(base*roll/255)
    // L50, BP=80, Atk=100, Def=100, max roll (255/255):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   base = floor((22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    //   damage = floor(37*255/255) = 37
    expect(result.damage).toBe(37);
  });

  // --- Critical Hit ---
  // Source: pret/pokecrystal engine/battle/damage_calc.asm — critical hit multiplier is 2x in Gen 2

  it("given a critical hit, when calculating damage, then applies 2x multiplier", () => {
    // Arrange
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
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    const normalCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const critCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const normalResult = calculateGen2Damage(normalCtx, chart, species);
    const critResult = calculateGen2Damage(critCtx, chart, species);

    // Assert
    expect(critResult.damage).toBeGreaterThan(normalResult.damage);
    expect(critResult.isCrit).toBe(true);
    if (normalResult.damage > 0) {
      const ratio = critResult.damage / normalResult.damage;
      expect(ratio).toBeGreaterThanOrEqual(1.8);
      expect(ratio).toBeLessThanOrEqual(2.2);
    }
  });

  it("given a critical hit with stat stage boosts on defender, when calculating damage, then ignores positive defender stages", () => {
    // Arrange: Defender has +2 defense stages. Crit should ignore them.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const defenderBoosted = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { defense: 2 },
    });
    const defenderNormal = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    const critBoosted: DamageContext = {
      attacker,
      defender: defenderBoosted,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };
    const critNormal: DamageContext = {
      attacker,
      defender: defenderNormal,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const boostedDmg = calculateGen2Damage(critBoosted, chart, species);
    const normalDmg = calculateGen2Damage(critNormal, chart, species);

    // Assert: Crit ignores defender's positive stages, so both should be the same
    expect(boostedDmg.damage).toBe(normalDmg.damage);
  });

  // --- Weather Modifier ---
  // Source: pret/pokecrystal engine/battle/effect_commands.asm — weather boosts: rain/sun 1.5x for boosted type, 0.5x for opposing

  it("given rain weather and a water move, when calculating damage, then applies 1.5x weather boost", () => {
    // Arrange
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("water", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const noWeatherCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const rainCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState({ type: "rain", turnsLeft: 5, source: "rain-dance" }),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const noWeatherDmg = calculateGen2Damage(noWeatherCtx, chart, species);
    const rainDmg = calculateGen2Damage(rainCtx, chart, species);

    // Assert
    expect(rainDmg.damage).toBeGreaterThan(noWeatherDmg.damage);
    if (noWeatherDmg.damage > 0) {
      const ratio = rainDmg.damage / noWeatherDmg.damage;
      expect(ratio).toBeGreaterThanOrEqual(1.4);
      expect(ratio).toBeLessThanOrEqual(1.6);
    }
  });

  // --- STAB ---
  // Source: pret/pokecrystal engine/battle/damage_calc.asm — STAB adds 50% damage bonus when move type matches user type

  it("given attacker type matches move type, when calculating damage, then applies 1.5x STAB", () => {
    // Arrange: Attacker is fire type using a fire move
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const attackerNoStab = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("fire", 80);
    const chart = createNeutralTypeChart();

    const stabCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const noStabCtx: DamageContext = {
      attacker: attackerNoStab,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const stabDmg = calculateGen2Damage(stabCtx, chart, createSpecies(["fire"]));
    const noStabDmg = calculateGen2Damage(noStabCtx, chart, createSpecies(["normal"]));

    // Assert
    expect(stabDmg.damage).toBeGreaterThan(noStabDmg.damage);
    if (noStabDmg.damage > 0) {
      const ratio = stabDmg.damage / noStabDmg.damage;
      expect(ratio).toBeGreaterThanOrEqual(1.4);
      expect(ratio).toBeLessThanOrEqual(1.6);
    }
  });

  // --- Type Effectiveness ---
  // Source: pret/pokecrystal data/type_effectiveness.asm — type multipliers: 2x super effective, 0.5x not very effective, 0x immune

  it("given a super effective move, when calculating damage, then approximately doubles damage", () => {
    // Arrange
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    // Set normal -> water to 2x for super effective test
    const seChart = createNeutralTypeChart();
    ((seChart as Record<string, Record<string, number>>).normal as Record<string, number>).water =
      2;
    const defenderWater = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
    });
    const species = createSpecies(["normal"]);

    const neutralCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const seCtx: DamageContext = {
      attacker,
      defender: defenderWater,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const neutralDmg = calculateGen2Damage(neutralCtx, chart, species);
    const seDmg = calculateGen2Damage(seCtx, seChart, species);

    // Assert
    expect(seDmg.damage).toBeGreaterThan(neutralDmg.damage);
    if (neutralDmg.damage > 0) {
      const ratio = seDmg.damage / neutralDmg.damage;
      expect(ratio).toBeGreaterThanOrEqual(1.8);
      expect(ratio).toBeLessThanOrEqual(2.2);
    }
  });

  it("given an immune matchup, when calculating damage, then deals 0 damage", () => {
    // Arrange
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["ghost"],
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    ((chart as Record<string, Record<string, number>>).normal as Record<string, number>).ghost = 0;
    const species = createSpecies(["normal"]);

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const result = calculateGen2Damage(context, chart, species);

    // Assert
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  // --- Item Modifier ---
  // Source: pret/pokecrystal engine/battle/damage_calc.asm — type-boosting held items give 1.1x (110%) damage boost

  it("given attacker holds a type-boosting item matching move type, when calculating damage, then applies 1.1x", () => {
    // Arrange
    const attackerWithItem = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: "charcoal",
    });
    const attackerNoItem = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: null,
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("fire", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const itemCtx: DamageContext = {
      attacker: attackerWithItem,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const noItemCtx: DamageContext = {
      attacker: attackerNoItem,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const itemDmg = calculateGen2Damage(itemCtx, chart, species);
    const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

    // Assert
    expect(itemDmg.damage).toBeGreaterThan(noItemDmg.damage);
    if (noItemDmg.damage > 0) {
      const ratio = itemDmg.damage / noItemDmg.damage;
      expect(ratio).toBeGreaterThanOrEqual(1.05);
      expect(ratio).toBeLessThanOrEqual(1.15);
    }
  });

  it("given attacker holds a type-boosting item NOT matching move type, when calculating damage, then no bonus", () => {
    // Arrange: Charcoal boosts fire, but using a water move
    const attackerWithItem = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: "charcoal",
    });
    const attackerNoItem = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      heldItem: null,
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("water", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const itemCtx: DamageContext = {
      attacker: attackerWithItem,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const noItemCtx: DamageContext = {
      attacker: attackerNoItem,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const itemDmg = calculateGen2Damage(itemCtx, chart, species);
    const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

    // Assert: Same damage since charcoal doesn't boost water
    expect(itemDmg.damage).toBe(noItemDmg.damage);
  });

  // --- Burn ---
  // Source: pret/pokecrystal engine/battle/damage_calc.asm — burn halves physical Attack stat before damage calculation

  it("given a burned attacker using a physical move, when calculating damage, then attack is halved", () => {
    // Arrange
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
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    const normalCtx: DamageContext = {
      attacker: attackerNormal,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const burnCtx: DamageContext = {
      attacker: attackerBurned,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const normalDmg = calculateGen2Damage(normalCtx, chart, species);
    const burnDmg = calculateGen2Damage(burnCtx, chart, species);

    // Assert
    expect(burnDmg.damage).toBeLessThan(normalDmg.damage);
  });

  // --- Minimum Damage ---

  it("given very low power move against high defense, when calculating damage (not immune), then deals at least 1", () => {
    // Arrange
    const attacker = createActivePokemon({
      level: 5,
      attack: 10,
      defense: 100,
      spAttack: 10,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 200,
      spAttack: 100,
      spDefense: 200,
      types: ["normal"],
    });
    const move = createMove("normal", 10);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(217) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const result = calculateGen2Damage(context, chart, species);

    // Assert
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });

  // --- Status Move ---

  it("given a status move, when calculating damage, then returns 0 damage", () => {
    // Arrange
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("normal", 0, "status");
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const result = calculateGen2Damage(context, chart, species);

    // Assert
    expect(result.damage).toBe(0);
  });

  // --- Critical Hit with Stat Stages ---

  it("given a critical hit with positive attacker attack stages, when calculating damage, then uses the boosted attack", () => {
    // Arrange: Attacker has +2 attack stage. Crit should keep positive attacker stages.
    const attackerBoosted = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
      statStages: { attack: 2 },
    });
    const attackerNormal = createActivePokemon({
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
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    const critBoosted: DamageContext = {
      attacker: attackerBoosted,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };
    const critNormal: DamageContext = {
      attacker: attackerNormal,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const boostedDmg = calculateGen2Damage(critBoosted, chart, species);
    const normalDmg = calculateGen2Damage(critNormal, chart, species);

    // Assert: Crit keeps positive attacker stages, so boosted should deal more
    expect(boostedDmg.damage).toBeGreaterThan(normalDmg.damage);
  });

  it("given a burned attacker using a physical move with a critical hit (equal stages), when calculating damage, then burn is ignored on crit", () => {
    // Arrange: atkStage=0, defStage=0 → ignoreBoosts=true → burn is also ignored.
    // Showdown behavior: when atkStage <= defStage, ALL boosts (and burn) are ignored.
    const attackerBurned = createActivePokemon({
      level: 50,
      attack: 200,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
      status: "burn",
    });
    const attackerNormal = createActivePokemon({
      level: 50,
      attack: 200,
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
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    const burnCrit: DamageContext = {
      attacker: attackerBurned,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };
    const normalCrit: DamageContext = {
      attacker: attackerNormal,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const burnDmg = calculateGen2Damage(burnCrit, chart, species);
    const normalDmg = calculateGen2Damage(normalCrit, chart, species);

    // Assert: With equal stages on crit, burn is ignored — damage should be equal
    expect(burnDmg.damage).toBe(normalDmg.damage);
  });

  it("given a critical hit with negative defender defense stages, when calculating damage, then uses the lowered defense", () => {
    // Arrange: Defender has -2 defense stage. Crit should keep negative defender stages.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"],
    });
    const defenderLowered = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { defense: -2 },
    });
    const defenderNormal = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    const critLowered: DamageContext = {
      attacker,
      defender: defenderLowered,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };
    const critNormal: DamageContext = {
      attacker,
      defender: defenderNormal,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const loweredDmg = calculateGen2Damage(critLowered, chart, species);
    const normalDmg = calculateGen2Damage(critNormal, chart, species);

    // Assert: Crit keeps negative defender stages, so lowered defense = more damage
    expect(loweredDmg.damage).toBeGreaterThan(normalDmg.damage);
  });

  it("given a critical hit on a special move, when calculating damage, then uses spAttack/spDefense", () => {
    // Arrange: test with special attacker stats boosted to cover special crit path
    const attacker = createActivePokemon({
      level: 50,
      attack: 50,
      defense: 100,
      spAttack: 200,
      spDefense: 100,
      types: ["water"],
      statStages: { spAttack: 1 },
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 80,
      types: ["normal"],
      statStages: { spDefense: -1 },
    });
    const move = createMove("water", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["water"]);

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const result = calculateGen2Damage(context, chart, species);

    // Assert: should produce a valid damage value using special stats
    expect(result.damage).toBeGreaterThan(0);
    expect(result.isCrit).toBe(true);
  });

  // --- Determinism ---

  // --- Held Item Stat Modifiers ---

  describe("Held item stat modifiers", () => {
    // Thick Club — doubles Attack for Cubone (104) / Marowak (105)

    it("given Marowak holding Thick Club, when using a physical move, then attack is doubled (damage ~2x)", () => {
      // Arrange
      const marowakWithClub = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["ground"],
        heldItem: "thick-club",
      });
      // speciesId 105 = Marowak
      (marowakWithClub.pokemon as any).speciesId = 105;

      const marowakNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["ground"],
        heldItem: null,
      });
      (marowakNoItem.pokemon as any).speciesId = 105;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["ground"]);

      const withItemCtx: DamageContext = {
        attacker: marowakWithClub,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noItemCtx: DamageContext = {
        attacker: marowakNoItem,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Thick Club doubles attack, so damage should be ~2x
      expect(withItemDmg.damage).toBeGreaterThan(noItemDmg.damage);
      if (noItemDmg.damage > 0) {
        const ratio = withItemDmg.damage / noItemDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Cubone holding Thick Club, when using a physical move, then attack is doubled (damage ~2x)", () => {
      // Arrange
      const cuboneWithClub = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["ground"],
        heldItem: "thick-club",
      });
      // speciesId 104 = Cubone
      (cuboneWithClub.pokemon as any).speciesId = 104;

      const cuboneNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["ground"],
        heldItem: null,
      });
      (cuboneNoItem.pokemon as any).speciesId = 104;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["ground"]);

      const withItemCtx: DamageContext = {
        attacker: cuboneWithClub,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noItemCtx: DamageContext = {
        attacker: cuboneNoItem,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Thick Club doubles attack, so damage should be ~2x
      expect(withItemDmg.damage).toBeGreaterThan(noItemDmg.damage);
      if (noItemDmg.damage > 0) {
        const ratio = withItemDmg.damage / noItemDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Onix (not Cubone/Marowak) holding Thick Club, when using a physical move, then no attack doubling", () => {
      // Arrange: Onix speciesId = 95
      const onixWithClub = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["rock"],
        heldItem: "thick-club",
      });
      (onixWithClub.pokemon as any).speciesId = 95;

      const onixNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["rock"],
        heldItem: null,
      });
      (onixNoItem.pokemon as any).speciesId = 95;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["rock"]);

      const withItemCtx: DamageContext = {
        attacker: onixWithClub,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noItemCtx: DamageContext = {
        attacker: onixNoItem,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Onix gets no bonus from Thick Club
      expect(withItemDmg.damage).toBe(noItemDmg.damage);
    });

    // Light Ball — doubles SpAtk for Pikachu (25)

    it("given Pikachu holding Light Ball, when using a special move, then SpAtk is doubled (damage ~2x)", () => {
      // Arrange: speciesId 25 = Pikachu
      const pikachuWithBall = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 40,
        spAttack: 100,
        spDefense: 50,
        types: ["electric"],
        heldItem: "light-ball",
      });
      (pikachuWithBall.pokemon as any).speciesId = 25;

      const pikachuNoBall = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 40,
        spAttack: 100,
        spDefense: 50,
        types: ["electric"],
        heldItem: null,
      });
      (pikachuNoBall.pokemon as any).speciesId = 25;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      // Special move (fire type is special in Gen 2)
      const move = createMove("fire", 80, "special");
      const chart = createNeutralTypeChart();
      const species = createSpecies(["electric"]);

      const withItemCtx: DamageContext = {
        attacker: pikachuWithBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noItemCtx: DamageContext = {
        attacker: pikachuNoBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Light Ball doubles SpAtk → damage ~2x
      expect(withItemDmg.damage).toBeGreaterThan(noItemDmg.damage);
      if (noItemDmg.damage > 0) {
        const ratio = withItemDmg.damage / noItemDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Raichu holding Light Ball, when using a special move, then no SpAtk doubling", () => {
      // Arrange: Raichu speciesId = 26
      const raichuWithBall = createActivePokemon({
        level: 50,
        attack: 90,
        defense: 55,
        spAttack: 100,
        spDefense: 80,
        types: ["electric"],
        heldItem: "light-ball",
      });
      (raichuWithBall.pokemon as any).speciesId = 26;

      const raichuNoBall = createActivePokemon({
        level: 50,
        attack: 90,
        defense: 55,
        spAttack: 100,
        spDefense: 80,
        types: ["electric"],
        heldItem: null,
      });
      (raichuNoBall.pokemon as any).speciesId = 26;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("fire", 80, "special");
      const chart = createNeutralTypeChart();
      const species = createSpecies(["electric"]);

      const withItemCtx: DamageContext = {
        attacker: raichuWithBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noItemCtx: DamageContext = {
        attacker: raichuNoBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Raichu gets no Light Ball bonus
      expect(withItemDmg.damage).toBe(noItemDmg.damage);
    });

    it("given Pikachu holding Light Ball using a physical move, when calculating damage, then no SpAtk doubling (only physical attack used)", () => {
      // Arrange: speciesId 25 = Pikachu, physical move uses Attack not SpAtk
      const pikachuWithBall = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 40,
        spAttack: 100,
        spDefense: 50,
        types: ["electric"],
        heldItem: "light-ball",
      });
      (pikachuWithBall.pokemon as any).speciesId = 25;

      const pikachuNoBall = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 40,
        spAttack: 100,
        spDefense: 50,
        types: ["electric"],
        heldItem: null,
      });
      (pikachuNoBall.pokemon as any).speciesId = 25;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      // Physical move (normal type is physical in Gen 2)
      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["electric"]);

      const withItemCtx: DamageContext = {
        attacker: pikachuWithBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noItemCtx: DamageContext = {
        attacker: pikachuNoBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Light Ball only boosts SpAtk, not physical Attack
      expect(withItemDmg.damage).toBe(noItemDmg.damage);
    });

    // Metal Powder — doubles Defense for Ditto (132)

    it("given Ditto holding Metal Powder, when attacked with a physical move, then defense is doubled (damage ~halved)", () => {
      // Arrange: speciesId 132 = Ditto
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const dittoWithPowder = createActivePokemon({
        level: 50,
        attack: 48,
        defense: 100,
        spAttack: 48,
        spDefense: 48,
        types: ["normal"],
        heldItem: "metal-powder",
      });
      (dittoWithPowder.pokemon as any).speciesId = 132;

      const dittoNoPowder = createActivePokemon({
        level: 50,
        attack: 48,
        defense: 100,
        spAttack: 48,
        spDefense: 48,
        types: ["normal"],
        heldItem: null,
      });
      (dittoNoPowder.pokemon as any).speciesId = 132;

      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      const withPowderCtx: DamageContext = {
        attacker,
        defender: dittoWithPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noPowderCtx: DamageContext = {
        attacker,
        defender: dittoNoPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withPowderDmg = calculateGen2Damage(withPowderCtx, chart, species);
      const noPowderDmg = calculateGen2Damage(noPowderCtx, chart, species);

      // Assert: Metal Powder doubles defense → damage roughly halved
      expect(withPowderDmg.damage).toBeLessThan(noPowderDmg.damage);
      if (withPowderDmg.damage > 0) {
        const ratio = noPowderDmg.damage / withPowderDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Ditto holding Metal Powder attacked with a special move, when calculating damage, then no SpDefense doubling (Metal Powder only affects physical Defense)", () => {
      // Arrange
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const dittoWithPowder = createActivePokemon({
        level: 50,
        attack: 48,
        defense: 100,
        spAttack: 48,
        spDefense: 100,
        types: ["normal"],
        heldItem: "metal-powder",
      });
      (dittoWithPowder.pokemon as any).speciesId = 132;

      const dittoNoPowder = createActivePokemon({
        level: 50,
        attack: 48,
        defense: 100,
        spAttack: 48,
        spDefense: 100,
        types: ["normal"],
        heldItem: null,
      });
      (dittoNoPowder.pokemon as any).speciesId = 132;

      // Special move (fire type is special in Gen 2)
      const move = createMove("fire", 80, "special");
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      const withPowderCtx: DamageContext = {
        attacker,
        defender: dittoWithPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noPowderCtx: DamageContext = {
        attacker,
        defender: dittoNoPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withPowderDmg = calculateGen2Damage(withPowderCtx, chart, species);
      const noPowderDmg = calculateGen2Damage(noPowderCtx, chart, species);

      // Assert: Metal Powder does NOT double SpDefense — Ditto takes same damage as without Metal Powder
      expect(withPowderDmg.damage).toBe(noPowderDmg.damage);
    });

    it("given Pikachu holding Metal Powder, when attacked with a physical move, then no defense doubling (only Ditto gets bonus)", () => {
      // Arrange: speciesId 25 = Pikachu
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const pikachuWithPowder = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 100,
        spAttack: 50,
        spDefense: 50,
        types: ["electric"],
        heldItem: "metal-powder",
      });
      (pikachuWithPowder.pokemon as unknown as { speciesId: number }).speciesId = 25;

      const pikachuNoPowder = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 100,
        spAttack: 50,
        spDefense: 50,
        types: ["electric"],
        heldItem: null,
      });
      (pikachuNoPowder.pokemon as unknown as { speciesId: number }).speciesId = 25;

      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      const withPowderCtx: DamageContext = {
        attacker,
        defender: pikachuWithPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const noPowderCtx: DamageContext = {
        attacker,
        defender: pikachuNoPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const withPowderDmg = calculateGen2Damage(withPowderCtx, chart, species);
      const noPowderDmg = calculateGen2Damage(noPowderCtx, chart, species);

      // Assert: Pikachu gets no Metal Powder bonus
      expect(withPowderDmg.damage).toBe(noPowderDmg.damage);
    });

    // --- Critical hit branch tests for held item stat modifiers ---

    it("given Marowak holding Thick Club with isCrit: true, when using a physical move, then attack is doubled and critical hit applied (damage ~2x)", () => {
      // Arrange
      const marowakWithClub = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["ground"],
        heldItem: "thick-club",
      });
      // speciesId 105 = Marowak
      (marowakWithClub.pokemon as any).speciesId = 105;

      const marowakNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 80,
        types: ["ground"],
        heldItem: null,
      });
      (marowakNoItem.pokemon as any).speciesId = 105;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["ground"]);

      const withItemCtx: DamageContext = {
        attacker: marowakWithClub,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: true,
      };
      const noItemCtx: DamageContext = {
        attacker: marowakNoItem,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: true,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Thick Club doubles attack with critical hit, damage should be ~2x
      expect(withItemDmg.damage).toBeGreaterThan(noItemDmg.damage);
      if (noItemDmg.damage > 0) {
        const ratio = withItemDmg.damage / noItemDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Pikachu holding Light Ball with isCrit: true, when using a special move, then SpAtk is doubled and critical hit applied (damage ~2x)", () => {
      // Arrange: speciesId 25 = Pikachu
      const pikachuWithBall = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 40,
        spAttack: 100,
        spDefense: 50,
        types: ["electric"],
        heldItem: "light-ball",
      });
      (pikachuWithBall.pokemon as any).speciesId = 25;

      const pikachuNoBall = createActivePokemon({
        level: 50,
        attack: 55,
        defense: 40,
        spAttack: 100,
        spDefense: 50,
        types: ["electric"],
        heldItem: null,
      });
      (pikachuNoBall.pokemon as any).speciesId = 25;

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      // Special move (water type is special in Gen 2)
      const move = createMove("water", 80, "special");
      const chart = createNeutralTypeChart();
      const species = createSpecies(["electric"]);

      const withItemCtx: DamageContext = {
        attacker: pikachuWithBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: true,
      };
      const noItemCtx: DamageContext = {
        attacker: pikachuNoBall,
        defender,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: true,
      };

      // Act
      const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
      const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

      // Assert: Light Ball doubles SpAtk with critical hit, damage should be ~2x
      expect(withItemDmg.damage).toBeGreaterThan(noItemDmg.damage);
      if (noItemDmg.damage > 0) {
        const ratio = withItemDmg.damage / noItemDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Ditto holding Metal Powder with isCrit: true, when attacked with a physical move, then defense is doubled and critical hit applied (damage ~halved)", () => {
      // Arrange: speciesId 132 = Ditto
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const dittoWithPowder = createActivePokemon({
        level: 50,
        attack: 48,
        defense: 100,
        spAttack: 48,
        spDefense: 48,
        types: ["normal"],
        heldItem: "metal-powder",
      });
      (dittoWithPowder.pokemon as any).speciesId = 132;

      const dittoNoPowder = createActivePokemon({
        level: 50,
        attack: 48,
        defense: 100,
        spAttack: 48,
        spDefense: 48,
        types: ["normal"],
        heldItem: null,
      });
      (dittoNoPowder.pokemon as any).speciesId = 132;

      const move = createMove("normal", 80);
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      const withPowderCtx: DamageContext = {
        attacker,
        defender: dittoWithPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: true,
      };
      const noPowderCtx: DamageContext = {
        attacker,
        defender: dittoNoPowder,
        move,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: true,
      };

      // Act
      const withPowderDmg = calculateGen2Damage(withPowderCtx, chart, species);
      const noPowderDmg = calculateGen2Damage(noPowderCtx, chart, species);

      // Assert: Metal Powder doubles defense with critical hit, damage roughly halved
      expect(withPowderDmg.damage).toBeLessThan(noPowderDmg.damage);
      if (withPowderDmg.damage > 0) {
        const ratio = noPowderDmg.damage / withPowderDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });
  });

  // --- Explosion / Self-Destruct Defense Halving ---

  describe("Explosion/Selfdestruct defense halving", () => {
    it("given Explosion used against a defender with known defense, when calculating damage, then damage is ~2x a normal move of same power", () => {
      // Arrange
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      // Normal move with same power (no defense halving)
      const normalMove: MoveData = {
        ...createMove("normal", 250),
        id: "hyper-beam",
      };
      const explosionMove: MoveData = {
        ...createMove("normal", 250),
        id: "explosion",
      };

      const normalCtx: DamageContext = {
        attacker,
        defender,
        move: normalMove,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const explosionCtx: DamageContext = {
        attacker,
        defender,
        move: explosionMove,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const normalDmg = calculateGen2Damage(normalCtx, chart, species);
      const explosionDmg = calculateGen2Damage(explosionCtx, chart, species);

      // Assert: Explosion halves defense, so damage should be ~2x the normal move
      expect(explosionDmg.damage).toBeGreaterThan(normalDmg.damage);
      if (normalDmg.damage > 0) {
        const ratio = explosionDmg.damage / normalDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Self-Destruct used against a defender with known defense, when calculating damage, then damage is ~2x a normal move of same power", () => {
      // Arrange
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      const normalMove: MoveData = {
        ...createMove("normal", 200),
        id: "hyper-beam",
      };
      const selfDestructMove: MoveData = {
        ...createMove("normal", 200),
        id: "self-destruct",
      };

      const normalCtx: DamageContext = {
        attacker,
        defender,
        move: normalMove,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const selfDestructCtx: DamageContext = {
        attacker,
        defender,
        move: selfDestructMove,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const normalDmg = calculateGen2Damage(normalCtx, chart, species);
      const selfDestructDmg = calculateGen2Damage(selfDestructCtx, chart, species);

      // Assert: Self-Destruct halves defense, so damage should be ~2x the normal move
      expect(selfDestructDmg.damage).toBeGreaterThan(normalDmg.damage);
      if (normalDmg.damage > 0) {
        const ratio = selfDestructDmg.damage / normalDmg.damage;
        expect(ratio).toBeGreaterThanOrEqual(1.8);
        expect(ratio).toBeLessThanOrEqual(2.2);
      }
    });

    it("given Explosion move, when damage is calculated, then defender defense is halved before damage calc", () => {
      // Arrange: Explosion with defender defense=100 should equal a same-power non-explosion
      // move against a defender with defense=50 (half), because Explosion halves defense.
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defenderFullDef = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defenderHalfDef = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 50,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      const explosionMove: MoveData = {
        ...createMove("normal", 150),
        id: "explosion",
      };
      const regularMove: MoveData = {
        ...createMove("normal", 150),
        id: "hyper-beam",
      };

      const explosionCtx: DamageContext = {
        attacker,
        defender: defenderFullDef,
        move: explosionMove,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };
      const regularHalfDefCtx: DamageContext = {
        attacker,
        defender: defenderHalfDef,
        move: regularMove,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const explosionDmg = calculateGen2Damage(explosionCtx, chart, species);
      const regularHalfDefDmg = calculateGen2Damage(regularHalfDefCtx, chart, species);

      // Assert: Explosion halves defender defense → damage identical to same move vs half-def defender
      expect(explosionDmg.damage).toBe(regularHalfDefDmg.damage);
    });

    it("given a non-explosion move, when calculating damage, then defense is not halved", () => {
      // Arrange: verify that a regular move (same power as explosion) deals less
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const chart = createNeutralTypeChart();
      const species = createSpecies(["normal"]);

      // Same power as Explosion (250), but not explosion — should use full defense
      const regularMove: MoveData = {
        ...createMove("normal", 250),
        id: "tackle",
      };

      const ctx: DamageContext = {
        attacker,
        defender,
        move: regularMove,
        state: createMockState(),
        rng: createMockRng(255) as DamageContext["rng"],
        isCrit: false,
      };

      // Act
      const result = calculateGen2Damage(ctx, chart, species);

      // Assert: regular move with full defense produces a valid positive damage result
      expect(result.damage).toBeGreaterThan(0);
    });
  });

  // --- Formula Order: item modifier before clamp, weather after ---

  it("given type-boost item and rain weather on a water move, when calculating damage, then item modifier is applied before weather (correct order)", () => {
    // Arrange: verify item modifier is applied at step 3 (before clamp+2+weather)
    // rather than after type effectiveness (old wrong position).
    // With a water move in rain + mystic-water item, we verify the final damage value
    // matches the correct intermediate calculation order.
    const attackerWithItem = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      heldItem: "mystic-water",
    });
    const attackerNoItem = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
      heldItem: null,
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    // Water type move → special in Gen 2 → uses spAttack/spDefense = 100
    const move = createMove("water", 80, "special");
    const chart = createNeutralTypeChart();
    const species = createSpecies(["water"]);

    const rainState = createMockState({ type: "rain", turnsLeft: 5, source: "rain-dance" });

    const withItemCtx: DamageContext = {
      attacker: attackerWithItem,
      defender,
      move,
      state: rainState,
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const noItemCtx: DamageContext = {
      attacker: attackerNoItem,
      defender,
      move,
      state: rainState,
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const withItemDmg = calculateGen2Damage(withItemCtx, chart, species);
    const noItemDmg = calculateGen2Damage(noItemCtx, chart, species);

    // Assert: exact damage values prove the correct application order.
    // Hand-trace (level=50, spA=100, spD=100, power=80, rng=255):
    //   base = floor(floor((floor(2*50/5)+2) * 80 * 100) / 100 / 50) = 35
    // With mystic-water:
    //   item  = floor(35 * 1.1) = 38
    //   clamp = max(1, min(997, 38)) = 38
    //   +2    = 40
    //   rain  = floor(40 * 1.5) = 60
    //   STAB  = 60 + floor(60/2) = 90
    //   type  = 1x → 90
    //   rand  = floor(90 * 255/255) = 90
    // Without item:
    //   clamp = 35, +2 = 37
    //   rain  = floor(37 * 1.5) = 55
    //   STAB  = 55 + floor(55/2) = 82
    //   rand  = 82
    expect(withItemDmg.damage).toBe(90);
    expect(noItemDmg.damage).toBe(82);
  });

  // --- Stat Overflow (Change 2) ---

  it("given attack >= 256, when damage is calculated, then stats wrap to avoid overflow", () => {
    // Arrange: attack=300 triggers overflow; both stats get divided by 4 and taken mod 256.
    // Overflow: attack = floor(300/4) % 256 = 75; defense = floor(100/4) % 256 = 25.
    // Pre-wrapped attacker/defender use those already-wrapped values directly.
    const attackerHighAtk = createActivePokemon({
      level: 50,
      attack: 300, // Will trigger overflow
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const attackerWrapped = createActivePokemon({
      level: 50,
      attack: 75, // floor(300/4) % 256 = 75
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defenderForOverflow = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100, // Will also be wrapped: floor(100/4) % 256 = 25
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defenderWrapped = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 25, // Pre-wrapped: floor(100/4) % 256 = 25
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const overflowCtx: DamageContext = {
      attacker: attackerHighAtk,
      defender: defenderForOverflow,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const wrappedCtx: DamageContext = {
      attacker: attackerWrapped,
      defender: defenderWrapped,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const overflowDmg = calculateGen2Damage(overflowCtx, chart, species);
    const wrappedDmg = calculateGen2Damage(wrappedCtx, chart, species);

    // Assert: overflow path produces same result as pre-wrapped values (attack=75, def=25)
    expect(overflowDmg.damage).toBe(wrappedDmg.damage);
  });

  // --- Crit interaction: atkStage <= defStage (Change 3a) ---

  it("given crit with atkStage=0 and defStage=+2, when calculating damage, then all boosts on both sides are ignored", () => {
    // Arrange: atkStage(0) <= defStage(+2) → ignoreBoosts=true → treat as if no stages.
    // Defender with +2 defense boost on crit should produce same damage as defender with no boost.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { attack: 0 },
    });
    const defenderBoosted = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { defense: 2 },
    });
    const defenderNoBoosted = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { defense: 0 },
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const critBoostedDefCtx: DamageContext = {
      attacker,
      defender: defenderBoosted,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };
    const critNoBoostCtx: DamageContext = {
      attacker,
      defender: defenderNoBoosted,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const critBoostedDmg = calculateGen2Damage(critBoostedDefCtx, chart, species);
    const critNoBoostDmg = calculateGen2Damage(critNoBoostCtx, chart, species);

    // Assert: Ignoring boosts → boosted defender defense is irrelevant → same damage
    expect(critBoostedDmg.damage).toBe(critNoBoostDmg.damage);
  });

  // --- Crit interaction: atkStage > defStage (Change 3b) ---

  it("given crit with atkStage=+2 and defStage=0, when calculating damage, then all boosts are kept (higher attack = more damage)", () => {
    // Arrange: atkStage(+2) > defStage(0) → ignoreBoosts=false → keep all boosts normally.
    const attackerBoosted = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { attack: 2 },
    });
    const attackerNoBoosted = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { attack: 0 },
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      statStages: { defense: 0 },
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const critBoostedAtkCtx: DamageContext = {
      attacker: attackerBoosted,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };
    const critNoBoostedAtkCtx: DamageContext = {
      attacker: attackerNoBoosted,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };

    // Act
    const critBoostedDmg = calculateGen2Damage(critBoostedAtkCtx, chart, species);
    const critNoBoostedDmg = calculateGen2Damage(critNoBoostedAtkCtx, chart, species);

    // Assert: Keeping +2 attack boost → more damage than no boost
    expect(critBoostedDmg.damage).toBeGreaterThan(critNoBoostedDmg.damage);
  });

  // --- Stat cap at 999 (Change 4) ---

  it("given attack stat of 1000, when damage is calculated, then attack is capped at 999", () => {
    // Arrange: attack=1000 should be capped to 999; attack=999 should be identical.
    const attackerOver = createActivePokemon({
      level: 50,
      attack: 1000,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const attackerCapped = createActivePokemon({
      level: 50,
      attack: 999,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["normal"]);

    const overCtx: DamageContext = {
      attacker: attackerOver,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const cappedCtx: DamageContext = {
      attacker: attackerCapped,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const overDmg = calculateGen2Damage(overCtx, chart, species);
    const cappedDmg = calculateGen2Damage(cappedCtx, chart, species);

    // Assert: Both produce identical damage since attack is capped at 999
    expect(overDmg.damage).toBe(cappedDmg.damage);
  });

  it("given identical inputs, when calculating damage twice, then produces identical results", () => {
    // Arrange
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
    const move = createMove("fire", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    const ctx1: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(240) as DamageContext["rng"],
      isCrit: false,
    };
    const ctx2: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(240) as DamageContext["rng"],
      isCrit: false,
    };

    // Act
    const result1 = calculateGen2Damage(ctx1, chart, species);
    const result2 = calculateGen2Damage(ctx2, chart, species);

    // Assert
    expect(result1.damage).toBe(result2.damage);
  });

  // --- Integer Stat Stage Arithmetic (Gen 2 pret/pokecrystal correctness) ---

  it("given a physical attacker with base Attack 150 at stat stage -1, when computing effective attack stat, then returns damage consistent with integer math (floor(150*66/100)=99) not float math (floor(150*(2/3))=100)", () => {
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — stage -1 ratio is 66/100 (integer table)
    // Float: Math.floor(150 * (2/3)) = Math.floor(100.0) = 100
    // Integer: Math.floor(150 * 66 / 100) = Math.floor(99.0) = 99
    // These diverge because 66/100 != 2/3 exactly.
    // Arrange: fire-type attacker (no STAB with normal move), attack 150, stage -1, defense 100
    const attacker = createActivePokemon({
      level: 50,
      attack: 150,
      defense: 100,
      spAttack: 150,
      spDefense: 100,
      types: ["fire"], // fire attacker + normal move = no STAB
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
    const move = createMove("normal", 100);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    // Formula trace with effective attack = 99 (integer) vs 100 (float):
    // levelFactor = floor(2*50/5)+2 = 22
    // attack=99: floor(floor(22*100*99)/100) = floor(217800/100) = 2178; floor(2178/50)=43; clamp+2=45
    // attack=100: floor(floor(22*100*100)/100) = 2200; floor(2200/50)=44; clamp+2=46
    // No STAB, no weather. Max roll 255: finalDamage = floor(45*255/255) = 45
    const ctx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const result = calculateGen2Damage(ctx, chart, species);
    // Assert: integer math gives 45 (effective attack 99); float math gives 46 (effective attack 100)
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — Gen 2 uses integer table, not float
    expect(result.damage).toBe(45);
  });

  it("given a physical attacker with base Attack 270 at stat stage -1, when computing effective attack, then uses integer ratio 66/100 giving 178 not float (2/3) giving 180", () => {
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — stage -1 ratio is 66/100
    // base 270, stage -1: integer = floor(270*66/100) = floor(178.2) = 178
    //                      float  = floor(270*(2/3))  = floor(180.0) = 180
    // Arrange: fire-type attacker (no STAB with normal move), attack 270, stage -1, defense 100
    const attacker = createActivePokemon({
      level: 50,
      attack: 270,
      defense: 100,
      spAttack: 270,
      spDefense: 100,
      types: ["fire"], // fire attacker + normal move = no STAB
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
    const move = createMove("normal", 80);
    const chart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    // Formula trace with effective attack = 178 (integer) vs 180 (float):
    // levelFactor = floor(2*50/5)+2 = 22; power=80; defense=100
    // attack=178: floor(floor(22*80*178)/100) = floor(313280/100) = 3132; floor(3132/50)=62; clamp+2=64
    // attack=180: floor(floor(22*80*180)/100) = floor(316800/100) = 3168; floor(3168/50)=63; clamp+2=65
    // No STAB, no weather. Max roll 255: finalDamage = floor(64*255/255)=64 vs floor(65*255/255)=65
    const ctx: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const result = calculateGen2Damage(ctx, chart, species);
    // Assert: integer math gives 64; float math gives 65
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm
    expect(result.damage).toBe(64);
  });
});
