import type { PokemonInstance, PokemonSpeciesData, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Stats } from "../src/Gen2StatCalc";

/**
 * Helper to create a minimal PokemonInstance for stat calc testing.
 * Gen 2 uses DVs (0-15) stored in `ivs` and StatExp (0-65535) stored in `evs`.
 */
function createTestPokemon(overrides: {
  level?: number;
  ivs?: Partial<StatBlock>;
  evs?: Partial<StatBlock>;
}): PokemonInstance {
  const defaultIvs = { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
  const defaultEvs = {
    hp: 65535,
    attack: 65535,
    defense: 65535,
    spAttack: 65535,
    spDefense: 65535,
    speed: 65535,
  };

  return {
    uid: "test-pokemon",
    speciesId: 1,
    nickname: null,
    level: overrides.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { ...defaultIvs, ...overrides.ivs },
    evs: { ...defaultEvs, ...overrides.evs },
    currentHp: 100,
    moves: [],
    ability: "",
    abilitySlot: "normal1",
    heldItem: null,
    status: null,
    friendship: 70,
    gender: "male",
    isShiny: false,
    metLocation: "test",
    metLevel: 5,
    originalTrainer: "Test",
    originalTrainerId: 12345,
    pokeball: "poke-ball",
  } as PokemonInstance;
}

/**
 * Helper to create a minimal PokemonSpeciesData.
 */
function createTestSpecies(baseStats: StatBlock): PokemonSpeciesData {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types: ["normal"],
    baseStats,
    abilities: { normal: ["overgrow"], hidden: null },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 64,
    expGroup: "medium-slow",
    evYield: {},
    eggGroups: ["monster"],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1.7, weight: 90.5 },
    spriteKey: "test",
    baseFriendship: 70,
    generation: 2,
    isLegendary: false,
    isMythical: false,
  } as PokemonSpeciesData;
}

/**
 * Gen 2 Stat Calculation Tests
 *
 * Gen 2 uses DV/StatExp formulas (NOT the Gen 3+ IV/EV formulas in core):
 *
 * HP formula:  floor(((Base + DV) * 2 + floor(ceil(sqrt(StatExp)) / 4)) * Level / 100) + Level + 10
 * Other stats: floor(((Base + DV) * 2 + floor(ceil(sqrt(StatExp)) / 4)) * Level / 100) + 5
 *
 * DVs: 0-15 (stored in ivs field for compatibility)
 * StatExp: 0-65535 (stored in evs field for compatibility)
 * No nature modifier (Gen 2 has no natures)
 *
 * Key difference from Gen 1: spAttack and spDefense now use DIFFERENT base stats.
 */
describe("Gen2StatCalc", () => {
  describe("Given a Pokemon with known base stats", () => {
    it("should calculate HP correctly for Tyranitar at level 50", () => {
      // Arrange
      // Tyranitar: Base HP=100, DV=15, StatExp=65535
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: {
          hp: 65535,
          attack: 65535,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        },
      });
      const species = createTestSpecies({
        hp: 100,
        attack: 134,
        defense: 110,
        spAttack: 95,
        spDefense: 100,
        speed: 61,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // HP = floor(((100+15)*2 + floor(ceil(sqrt(65535))/4)) * 50/100) + 50 + 10
      // sqrt(65535) = 255.998..., ceil = 256, /4 = 64
      // ((100+15)*2 + 64) * 50/100 = (230+64)*50/100 = 294*50/100 = 147
      // 147 + 50 + 10 = 207
      expect(stats.hp).toBe(207);
    });

    it("should calculate Attack correctly for Tyranitar at level 50", () => {
      // Arrange
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: {
          hp: 65535,
          attack: 65535,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        },
      });
      const species = createTestSpecies({
        hp: 100,
        attack: 134,
        defense: 110,
        spAttack: 95,
        spDefense: 100,
        speed: 61,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Atk = floor(((134+15)*2 + 64) * 50/100) + 5
      // (149*2 + 64)*50/100 = 362*50/100 = 181
      // 181 + 5 = 186
      expect(stats.attack).toBe(186);
    });

    it("should calculate different spAttack and spDefense for Alakazam", () => {
      // Arrange
      const pokemon = createTestPokemon({
        level: 100,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: {
          hp: 65535,
          attack: 65535,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        },
      });
      // Alakazam Gen 2: SpAtk=135, SpDef=95
      const species = createTestSpecies({
        hp: 55,
        attack: 50,
        defense: 45,
        spAttack: 135,
        spDefense: 95,
        speed: 120,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // SpAtk = floor(((135+15)*2 + 64) * 100/100) + 5 = (300+64) + 5 = 364 + 5 = 369
      // SpDef = floor(((95+15)*2 + 64) * 100/100) + 5 = (220+64) + 5 = 284 + 5 = 289
      expect(stats.spAttack).toBe(369);
      expect(stats.spDefense).toBe(289);
      expect(stats.spAttack).not.toBe(stats.spDefense);
    });

    it("should handle zero DVs and zero StatExp", () => {
      // Arrange
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      // Base stats: HP=100
      const species = createTestSpecies({
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // HP = floor(((100+0)*2 + floor(ceil(sqrt(0))/4)) * 50/100) + 50 + 10
      // sqrt(0) = 0, ceil(0) = 0, 0/4 = 0
      // (200 + 0) * 50/100 = 100
      // 100 + 50 + 10 = 160
      expect(stats.hp).toBe(160);
      // Other stat = floor(((100+0)*2 + 0) * 50/100) + 5 = 100 + 5 = 105
      expect(stats.attack).toBe(105);
      expect(stats.defense).toBe(105);
      expect(stats.spAttack).toBe(105);
      expect(stats.spDefense).toBe(105);
      expect(stats.speed).toBe(105);
    });

    it("should handle Pikachu at level 100", () => {
      // Arrange
      const pokemon = createTestPokemon({
        level: 100,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: {
          hp: 65535,
          attack: 65535,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        },
      });
      // Pikachu Gen 2: Speed base=90
      const species = createTestSpecies({
        hp: 35,
        attack: 55,
        defense: 30,
        spAttack: 50,
        spDefense: 40,
        speed: 90,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Speed = floor(((90+15)*2 + 64) * 100/100) + 5 = (210+64) + 5 = 274 + 5 = 279
      expect(stats.speed).toBe(279);
    });
  });

  describe("Given stat formula properties", () => {
    it("should always return positive integer stats", () => {
      // Arrange
      const pokemon = createTestPokemon({
        level: 1,
        ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = createTestSpecies({
        hp: 5,
        attack: 5,
        defense: 5,
        spAttack: 5,
        spDefense: 5,
        speed: 5,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBeGreaterThan(0);
      expect(stats.attack).toBeGreaterThan(0);
      expect(stats.defense).toBeGreaterThan(0);
      expect(stats.spAttack).toBeGreaterThan(0);
      expect(stats.spDefense).toBeGreaterThan(0);
      expect(stats.speed).toBeGreaterThan(0);
      expect(Number.isInteger(stats.hp)).toBe(true);
      expect(Number.isInteger(stats.attack)).toBe(true);
    });

    it("should increase stats monotonically with increasing DVs", () => {
      // Arrange
      const species = createTestSpecies({
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
        const pokemon = createTestPokemon({
          level: 100,
          ivs: { hp: dv, attack: dv, defense: dv, spAttack: dv, spDefense: dv, speed: dv },
          evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        });
        const stats = calculateGen2Stats(pokemon, species);
        results.push(stats.attack);
      }

      // Assert
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThanOrEqual(results[i - 1] ?? 0);
      }
    });

    it("should increase stats monotonically with increasing StatExp", () => {
      // Arrange
      const species = createTestSpecies({
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      });
      const evValues = [0, 100, 1000, 10000, 65535];
      const results: number[] = [];

      // Act
      for (const ev of evValues) {
        const pokemon = createTestPokemon({
          level: 100,
          ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
          evs: { hp: ev, attack: ev, defense: ev, spAttack: ev, spDefense: ev, speed: ev },
        });
        const stats = calculateGen2Stats(pokemon, species);
        results.push(stats.attack);
      }

      // Assert
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThanOrEqual(results[i - 1] ?? 0);
      }
    });

    it("should produce higher HP than non-HP stat with same base/DV/StatExp", () => {
      // Arrange
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: {
          hp: 65535,
          attack: 65535,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        },
      });
      const species = createTestSpecies({
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert — HP formula adds Level+10 while others add +5
      expect(stats.hp).toBeGreaterThan(stats.attack);
    });

    it("should increase stats with increasing level", () => {
      // Arrange
      const species = createTestSpecies({
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      });

      // Act
      const stats10 = calculateGen2Stats(createTestPokemon({ level: 10 }), species);
      const stats50 = calculateGen2Stats(createTestPokemon({ level: 50 }), species);
      const stats100 = calculateGen2Stats(createTestPokemon({ level: 100 }), species);

      // Assert
      expect(stats50.attack).toBeGreaterThan(stats10.attack);
      expect(stats100.attack).toBeGreaterThan(stats50.attack);
      expect(stats50.hp).toBeGreaterThan(stats10.hp);
      expect(stats100.hp).toBeGreaterThan(stats50.hp);
    });

    it("should produce floored integer results for non-clean divisions", () => {
      // Arrange
      const pokemon = createTestPokemon({
        level: 37,
        ivs: { hp: 7, attack: 7, defense: 7, spAttack: 7, spDefense: 7, speed: 7 },
        evs: { hp: 127, attack: 127, defense: 127, spAttack: 127, spDefense: 127, speed: 127 },
      });
      const species = createTestSpecies({
        hp: 45,
        attack: 45,
        defense: 45,
        spAttack: 45,
        spDefense: 45,
        speed: 45,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(Number.isInteger(stats.hp)).toBe(true);
      expect(Number.isInteger(stats.attack)).toBe(true);
      expect(Number.isInteger(stats.defense)).toBe(true);
      expect(Number.isInteger(stats.spAttack)).toBe(true);
      expect(Number.isInteger(stats.spDefense)).toBe(true);
      expect(Number.isInteger(stats.speed)).toBe(true);
    });
  });
});
