import type { PokemonInstance, PokemonSpeciesData } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen1Stats, calculateStatExpContribution } from "../src/Gen1StatCalc";

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

function makeSpecies(baseStats: {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}): PokemonSpeciesData {
  return {
    id: 0,
    name: "mock",
    displayName: "Mock",
    types: ["normal"],
    baseStats,
    abilities: { normal: [], hidden: null },
    genderRatio: 50,
    catchRate: 45,
    baseExp: 64,
    expGroup: "medium-slow",
    evYield: {},
    eggGroups: [],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 0.7, weight: 6.9 },
    spriteKey: "mock",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  } as unknown as PokemonSpeciesData;
}

function makeInstance(opts: {
  level: number;
  ivs: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
  evs: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}): PokemonInstance {
  return {
    uid: "test-uid",
    speciesId: 0,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: "hardy",
    ivs: opts.ivs,
    evs: opts.evs,
    currentHp: 1,
    moves: [],
    ability: "",
    abilitySlot: "normal1",
    heldItem: null,
    status: null,
    friendship: 70,
    gender: "male",
    isShiny: false,
    metLocation: "pallet-town",
    metLevel: opts.level,
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: "poke-ball",
  } as unknown as PokemonInstance;
}

function zeroDvs() {
  return { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };
}

function maxDvs() {
  return { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
}

function zeroStatExp() {
  return { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };
}

function maxStatExp() {
  return {
    hp: 65535,
    attack: 65535,
    defense: 65535,
    spAttack: 65535,
    spDefense: 65535,
    speed: 65535,
  };
}

// ---------------------------------------------------------------------------
// calculateStatExpContribution
// ---------------------------------------------------------------------------

describe("calculateStatExpContribution", () => {
  it("given statExp=0, when calculating contribution, then returns 0", () => {
    // Arrange
    const statExp = 0;
    // Act
    const result = calculateStatExpContribution(statExp);
    // Assert
    expect(result).toBe(0);
  });

  it("given statExp=1, when calculating contribution, then returns 0 (floor(ceil(1)/4)=0)", () => {
    // Arrange
    const statExp = 1;
    // Act
    const result = calculateStatExpContribution(statExp);
    // Assert — ceil(sqrt(1))=1, floor(1/4)=0
    expect(result).toBe(0);
  });

  it("given statExp=4, when calculating contribution, then returns 0 (sqrt=2, ceil=2, floor(2/4)=0)", () => {
    // Arrange
    const statExp = 4;
    // Act
    const result = calculateStatExpContribution(statExp);
    // Assert — sqrt(4)=2 exactly, ceil(2)=2, floor(2/4)=0
    expect(result).toBe(0);
  });

  it("given statExp=16, when calculating contribution, then returns 1 (sqrt=4, ceil=4, floor(4/4)=1)", () => {
    // Arrange
    const statExp = 16;
    // Act
    const result = calculateStatExpContribution(statExp);
    // Assert — sqrt(16)=4 exactly, ceil(4)=4, floor(4/4)=1
    expect(result).toBe(1);
  });

  it("given statExp=65535 (Gen 1 max), when calculating contribution, then returns 64", () => {
    // Arrange
    const statExp = 65535;
    // Act
    const result = calculateStatExpContribution(statExp);
    // Assert — sqrt(65535)≈255.998, ceil=256, floor(256/4)=64
    expect(result).toBe(64);
  });

  it("given statExp values, when calculated, then result is always a non-negative integer", () => {
    // Arrange
    const samples = [0, 1, 4, 16, 100, 1000, 10000, 65535];
    for (const statExp of samples) {
      // Act
      const result = calculateStatExpContribution(statExp);
      // Assert
      expect(result).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it("given negative statExp, when calculating contribution, then returns 0 (clamped to 0, not NaN)", () => {
    // Arrange — negative values are out-of-spec; must not yield NaN
    const result = calculateStatExpContribution(-1);
    // Assert
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("given statExp > 65535, when calculating contribution, then result equals statExp=65535 (clamped to max)", () => {
    // Arrange
    const atMax = calculateStatExpContribution(65535);
    const overMax = calculateStatExpContribution(65536);
    // Assert — out-of-range values must not produce super-spec contributions
    expect(overMax).toBe(atMax);
  });
});

// ---------------------------------------------------------------------------
// HP formula — known Gen 1 values
// ---------------------------------------------------------------------------

describe("calculateGen1Stats — HP formula", () => {
  it("given Mewtwo (base HP 106, DV 15, StatExp 65535) at level 100, when calculating HP, then returns 416", () => {
    // Arrange — (106+15)*2 + 64 = 306; floor(306*100/100)+100+10 = 306+110 = 416
    const species = makeSpecies({
      hp: 106,
      attack: 110,
      defense: 90,
      spAttack: 154,
      spDefense: 90,
      speed: 130,
    });
    const pokemon = makeInstance({ level: 100, ivs: maxDvs(), evs: maxStatExp() });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(416);
  });

  it("given Bulbasaur (base HP 45, DV 0, StatExp 0) at level 50, when calculating HP, then returns 105", () => {
    // Arrange — floor(((45+0)*2+0)*50/100)+50+10 = floor(45)+60 = 105
    const species = makeSpecies({
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    });
    const pokemon = makeInstance({ level: 50, ivs: zeroDvs(), evs: zeroStatExp() });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(105);
  });

  it("given any base/DV/StatExp, when calculating HP at level 100 vs same non-HP stat, then HP is strictly greater", () => {
    // Arrange — HP adds Level+10 vs +5 for non-HP, so diff = Level+10-5 = level+5 > 0
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const pokemon = makeInstance({
      level: 100,
      ivs: { hp: 8, attack: 8, defense: 8, spAttack: 8, spDefense: 8, speed: 8 },
      evs: { hp: 1000, attack: 1000, defense: 1000, spAttack: 1000, spDefense: 1000, speed: 1000 },
    });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBeGreaterThan(stats.attack);
  });

  it("given HP formula, when result involves non-integer division, then result is a floored integer", () => {
    // Arrange
    const species = makeSpecies({
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    });
    const pokemon = makeInstance({
      level: 37,
      ivs: { hp: 7, attack: 7, defense: 7, spAttack: 7, spDefense: 7, speed: 7 },
      evs: { hp: 127, attack: 127, defense: 127, spAttack: 127, spDefense: 127, speed: 127 },
    });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(Number.isInteger(stats.hp)).toBe(true);
  });

  it("given increasing level, when calculating HP, then HP increases monotonically", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const base = makeInstance({ level: 1, ivs: maxDvs(), evs: zeroStatExp() });
    // Act
    const hp10 = calculateGen1Stats({ ...base, level: 10 } as PokemonInstance, species).hp;
    const hp50 = calculateGen1Stats({ ...base, level: 50 } as PokemonInstance, species).hp;
    const hp100 = calculateGen1Stats({ ...base, level: 100 } as PokemonInstance, species).hp;
    // Assert
    expect(hp50).toBeGreaterThan(hp10);
    expect(hp100).toBeGreaterThan(hp50);
  });
});

// ---------------------------------------------------------------------------
// Non-HP stat formula — known Gen 1 values
// ---------------------------------------------------------------------------

describe("calculateGen1Stats — non-HP stat formula", () => {
  it("given Mewtwo (base Attack 110, DV 15, StatExp 65535) at level 100, when calculating Attack, then returns 319", () => {
    // Arrange — (110+15)*2+64=314; floor(314*100/100)+5 = 314+5 = 319
    const species = makeSpecies({
      hp: 106,
      attack: 110,
      defense: 90,
      spAttack: 154,
      spDefense: 90,
      speed: 130,
    });
    const pokemon = makeInstance({ level: 100, ivs: maxDvs(), evs: maxStatExp() });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.attack).toBe(319);
  });

  it("given Charizard (base Speed 100, DV 0, StatExp 0) at level 50, when calculating Speed, then returns 105", () => {
    // Arrange — floor(((100+0)*2+0)*50/100)+5 = floor(100)+5 = 105
    const species = makeSpecies({
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 85,
      spDefense: 85,
      speed: 100,
    });
    const pokemon = makeInstance({ level: 50, ivs: zeroDvs(), evs: zeroStatExp() });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.speed).toBe(105);
  });

  it("given stat formula, when result involves non-integer division, then result is a floored integer", () => {
    // Arrange
    const species = makeSpecies({
      hp: 45,
      attack: 45,
      defense: 45,
      spAttack: 45,
      spDefense: 45,
      speed: 45,
    });
    const pokemon = makeInstance({
      level: 37,
      ivs: { hp: 7, attack: 7, defense: 7, spAttack: 7, spDefense: 7, speed: 7 },
      evs: { hp: 127, attack: 127, defense: 127, spAttack: 127, spDefense: 127, speed: 127 },
    });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(Number.isInteger(stats.attack)).toBe(true);
    expect(Number.isInteger(stats.defense)).toBe(true);
    expect(Number.isInteger(stats.speed)).toBe(true);
  });

  it("given increasing level, when calculating non-HP stat, then stat increases monotonically", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const base = makeInstance({ level: 1, ivs: maxDvs(), evs: zeroStatExp() });
    // Act
    const atk10 = calculateGen1Stats({ ...base, level: 10 } as PokemonInstance, species).attack;
    const atk50 = calculateGen1Stats({ ...base, level: 50 } as PokemonInstance, species).attack;
    const atk100 = calculateGen1Stats({ ...base, level: 100 } as PokemonInstance, species).attack;
    // Assert
    expect(atk50).toBeGreaterThan(atk10);
    expect(atk100).toBeGreaterThan(atk50);
  });
});

// ---------------------------------------------------------------------------
// Gen 1 Unified Special stat
// ---------------------------------------------------------------------------

describe("calculateGen1Stats — Gen 1 unified Special stat", () => {
  it("given same base spAttack and spDefense (Charizard Special=85), when calculating stats, then spAttack equals spDefense", () => {
    // Arrange — In Gen 1 Special is unified; both fields use base=85
    const species = makeSpecies({
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 85,
      spDefense: 85,
      speed: 100,
    });
    const pokemon = makeInstance({
      level: 50,
      ivs: { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 10 },
      evs: { hp: 1000, attack: 1000, defense: 1000, spAttack: 1000, spDefense: 1000, speed: 1000 },
    });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.spAttack).toBe(stats.spDefense);
  });

  it("given same base/DV/StatExp for all special inputs, when calculating spAttack and spDefense independently, then they are equal", () => {
    // Arrange
    const base = 100;
    const dv = 12;
    const statExp = 30000;
    const level = 75;
    const species = makeSpecies({
      hp: base,
      attack: base,
      defense: base,
      spAttack: base,
      spDefense: base,
      speed: base,
    });
    const pokemon = makeInstance({
      level,
      ivs: { hp: dv, attack: dv, defense: dv, spAttack: dv, spDefense: dv, speed: dv },
      evs: {
        hp: statExp,
        attack: statExp,
        defense: statExp,
        spAttack: statExp,
        spDefense: statExp,
        speed: statExp,
      },
    });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.spAttack).toBe(stats.spDefense);
  });

  it("given DIFFERENT species spAttack (85) vs spDefense (100) base stats, when calculating stats, then spAttack still equals spDefense (spAttack inputs used for both)", () => {
    // Arrange — if the old independent calculation were used, different base stats would produce
    // different values; this test only passes after Fix 2 forces a unified Special
    const species = makeSpecies({
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 85,
      spDefense: 100,
      speed: 100,
    });
    const pokemon = makeInstance({
      level: 50,
      ivs: { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 10 },
      evs: { hp: 1000, attack: 1000, defense: 1000, spAttack: 1000, spDefense: 1000, speed: 1000 },
    });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert — Gen 1 has a single Special stat; spDefense must mirror spAttack regardless of base stat differences
    expect(stats.spAttack).toBe(stats.spDefense);
  });
});

// ---------------------------------------------------------------------------
// Monotonicity — DV range
// ---------------------------------------------------------------------------

describe("calculateGen1Stats — DV monotonicity", () => {
  it("given increasing DV from 0 to 15, when calculating non-HP stat, then stat is non-decreasing", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const results: number[] = [];
    // Act
    for (let dv = 0; dv <= 15; dv++) {
      const pokemon = makeInstance({
        level: 100,
        ivs: { hp: dv, attack: dv, defense: dv, spAttack: dv, spDefense: dv, speed: dv },
        evs: zeroStatExp(),
      });
      results.push(calculateGen1Stats(pokemon, species).attack);
    }
    // Assert — each step must be >= previous
    for (let i = 1; i < results.length; i++) {
      const current = results[i] ?? 0;
      const previous = results[i - 1] ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });

  it("given increasing DV from 0 to 15, when calculating HP, then HP is non-decreasing", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const results: number[] = [];
    // Act
    for (let dv = 0; dv <= 15; dv++) {
      const pokemon = makeInstance({
        level: 100,
        ivs: { hp: dv, attack: dv, defense: dv, spAttack: dv, spDefense: dv, speed: dv },
        evs: zeroStatExp(),
      });
      results.push(calculateGen1Stats(pokemon, species).hp);
    }
    // Assert
    for (let i = 1; i < results.length; i++) {
      const current = results[i] ?? 0;
      const previous = results[i - 1] ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });

  it("given DV < 0 (dv=-1), when calculating stats, then result equals DV=0 (clamped to minimum)", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const pokemonDv0 = makeInstance({
      level: 100,
      ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      evs: zeroStatExp(),
    });
    const pokemonDvNeg = makeInstance({
      level: 100,
      ivs: { hp: -1, attack: -1, defense: -1, spAttack: -1, spDefense: -1, speed: -1 },
      evs: zeroStatExp(),
    });
    // Act
    const statsDv0 = calculateGen1Stats(pokemonDv0, species);
    const statsDvNeg = calculateGen1Stats(pokemonDvNeg, species);
    // Assert — negative DV must be clamped to 0
    expect(statsDvNeg.hp).toBe(statsDv0.hp);
    expect(statsDvNeg.attack).toBe(statsDv0.attack);
    expect(statsDvNeg.defense).toBe(statsDv0.defense);
    expect(statsDvNeg.spAttack).toBe(statsDv0.spAttack);
    expect(statsDvNeg.spDefense).toBe(statsDv0.spDefense);
    expect(statsDvNeg.speed).toBe(statsDv0.speed);
  });

  it("given DV > 15 (dv=16), when calculating stats, then result equals DV=15", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const pokemonDv15 = makeInstance({
      level: 100,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: zeroStatExp(),
    });
    const pokemonDv16 = makeInstance({
      level: 100,
      ivs: { hp: 16, attack: 16, defense: 16, spAttack: 16, spDefense: 16, speed: 16 },
      evs: zeroStatExp(),
    });
    // Act
    const statsDv15 = calculateGen1Stats(pokemonDv15, species);
    const statsDv16 = calculateGen1Stats(pokemonDv16, species);
    // Assert — DV 16 must be clamped to 15 at the formula level
    expect(statsDv16.hp).toBe(statsDv15.hp);
    expect(statsDv16.attack).toBe(statsDv15.attack);
    expect(statsDv16.defense).toBe(statsDv15.defense);
    expect(statsDv16.spAttack).toBe(statsDv15.spAttack);
    expect(statsDv16.spDefense).toBe(statsDv15.spDefense);
    expect(statsDv16.speed).toBe(statsDv15.speed);
  });
});

// ---------------------------------------------------------------------------
// Monotonicity — StatExp range
// ---------------------------------------------------------------------------

describe("calculateGen1Stats — StatExp monotonicity", () => {
  it("given increasing StatExp values, when calculating non-HP stat, then stat is non-decreasing", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const statExpValues = [0, 1, 100, 1000, 10000, 65535];
    const results: number[] = [];
    // Act
    for (const se of statExpValues) {
      const pokemon = makeInstance({
        level: 100,
        ivs: maxDvs(),
        evs: { hp: se, attack: se, defense: se, spAttack: se, spDefense: se, speed: se },
      });
      results.push(calculateGen1Stats(pokemon, species).attack);
    }
    // Assert
    for (let i = 1; i < results.length; i++) {
      const current = results[i] ?? 0;
      const previous = results[i - 1] ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });

  it("given increasing StatExp values, when calculating HP, then HP is non-decreasing", () => {
    // Arrange
    const species = makeSpecies({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
    const statExpValues = [0, 1, 100, 1000, 10000, 65535];
    const results: number[] = [];
    // Act
    for (const se of statExpValues) {
      const pokemon = makeInstance({
        level: 100,
        ivs: maxDvs(),
        evs: { hp: se, attack: se, defense: se, spAttack: se, spDefense: se, speed: se },
      });
      results.push(calculateGen1Stats(pokemon, species).hp);
    }
    // Assert
    for (let i = 1; i < results.length; i++) {
      const current = results[i] ?? 0;
      const previous = results[i - 1] ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });
});

// ---------------------------------------------------------------------------
// HP always greater than corresponding non-HP stat (same base)
// ---------------------------------------------------------------------------

describe("calculateGen1Stats — HP vs non-HP offset", () => {
  it("given same base/DV/StatExp/level, when comparing HP to any non-HP stat, then HP is always strictly greater", () => {
    // Arrange — HP adds Level+10 instead of +5, so diff = Level+5, always > 0
    const cases = [
      { level: 1, dv: 0, statExp: 0 },
      { level: 50, dv: 8, statExp: 10000 },
      { level: 100, dv: 15, statExp: 65535 },
    ];
    for (const { level, dv, statExp } of cases) {
      const species = makeSpecies({
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      });
      const pokemon = makeInstance({
        level,
        ivs: { hp: dv, attack: dv, defense: dv, spAttack: dv, spDefense: dv, speed: dv },
        evs: {
          hp: statExp,
          attack: statExp,
          defense: statExp,
          spAttack: statExp,
          spDefense: statExp,
          speed: statExp,
        },
      });
      // Act
      const stats = calculateGen1Stats(pokemon, species);
      // Assert
      expect(stats.hp).toBeGreaterThan(stats.attack);
      expect(stats.hp).toBeGreaterThan(stats.defense);
      expect(stats.hp).toBeGreaterThan(stats.speed);
    }
  });
});

// ---------------------------------------------------------------------------
// All stats are always positive integers
// ---------------------------------------------------------------------------

describe("calculateGen1Stats — output validity", () => {
  it("given any valid Gen 1 inputs, when calculating stats, then all six stats are positive integers", () => {
    // Arrange
    const species = makeSpecies({
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    });
    const pokemon = makeInstance({ level: 50, ivs: zeroDvs(), evs: zeroStatExp() });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    for (const key of ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const) {
      expect(stats[key]).toBeGreaterThan(0);
      expect(Number.isInteger(stats[key])).toBe(true);
    }
  });

  it("given minimum possible inputs (base 5, DV 0, StatExp 0, level 1), when calculating stats, then all stats are positive integers", () => {
    // Arrange
    const species = makeSpecies({
      hp: 5,
      attack: 5,
      defense: 5,
      spAttack: 5,
      spDefense: 5,
      speed: 5,
    });
    const pokemon = makeInstance({ level: 1, ivs: zeroDvs(), evs: zeroStatExp() });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    for (const key of ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const) {
      expect(stats[key]).toBeGreaterThan(0);
      expect(Number.isInteger(stats[key])).toBe(true);
    }
  });
});
