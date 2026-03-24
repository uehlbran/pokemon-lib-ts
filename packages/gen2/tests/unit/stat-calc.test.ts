import type { PokemonInstance, PokemonSpeciesData, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Stats } from "../../src/Gen2StatCalc";

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

  describe("Given well-known Gen 2 Pokemon at level 100 with max DVs and max StatExp", () => {
    // At L100, DV=15, StatExp=65535:
    //   StatExp bonus = floor(ceil(sqrt(65535)) / 4) = floor(256 / 4) = 64
    //   HP  = (Base + 15) * 2 + 64 + 100 + 10 = Base * 2 + 204
    //   Stat = (Base + 15) * 2 + 64 + 5       = Base * 2 + 99
    const maxDvs = { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
    const maxStatExp = {
      hp: 65535,
      attack: 65535,
      defense: 65535,
      spAttack: 65535,
      spDefense: 65535,
      speed: 65535,
    };

    it("given Tyranitar at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
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
      expect(stats.hp).toBe(404); // 100*2+204
      expect(stats.attack).toBe(367); // 134*2+99
      expect(stats.defense).toBe(319); // 110*2+99
      expect(stats.spAttack).toBe(289); // 95*2+99
      expect(stats.spDefense).toBe(299); // 100*2+99
      expect(stats.speed).toBe(221); // 61*2+99
    });

    it("given Mewtwo at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 106,
        attack: 110,
        defense: 90,
        spAttack: 154,
        spDefense: 90,
        speed: 130,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(416); // 106*2+204
      expect(stats.attack).toBe(319); // 110*2+99
      expect(stats.defense).toBe(279); // 90*2+99
      expect(stats.spAttack).toBe(407); // 154*2+99
      expect(stats.spDefense).toBe(279); // 90*2+99
      expect(stats.speed).toBe(359); // 130*2+99
    });

    it("given Snorlax at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 160,
        attack: 110,
        defense: 65,
        spAttack: 65,
        spDefense: 110,
        speed: 30,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(524); // 160*2+204
      expect(stats.attack).toBe(319); // 110*2+99
      expect(stats.defense).toBe(229); // 65*2+99
      expect(stats.spAttack).toBe(229); // 65*2+99
      expect(stats.spDefense).toBe(319); // 110*2+99
      expect(stats.speed).toBe(159); // 30*2+99
    });

    it("given Blissey at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 255,
        attack: 10,
        defense: 10,
        spAttack: 75,
        spDefense: 135,
        speed: 55,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(714); // 255*2+204
      expect(stats.attack).toBe(119); // 10*2+99
      expect(stats.defense).toBe(119); // 10*2+99
      expect(stats.spAttack).toBe(249); // 75*2+99
      expect(stats.spDefense).toBe(369); // 135*2+99
      expect(stats.speed).toBe(209); // 55*2+99
    });

    it("given Lugia at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 106,
        attack: 90,
        defense: 130,
        spAttack: 90,
        spDefense: 154,
        speed: 110,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(416); // 106*2+204
      expect(stats.attack).toBe(279); // 90*2+99
      expect(stats.defense).toBe(359); // 130*2+99
      expect(stats.spAttack).toBe(279); // 90*2+99
      expect(stats.spDefense).toBe(407); // 154*2+99
      expect(stats.speed).toBe(319); // 110*2+99
    });

    it("given Ho-Oh at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 106,
        attack: 130,
        defense: 90,
        spAttack: 110,
        spDefense: 154,
        speed: 90,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(416); // 106*2+204
      expect(stats.attack).toBe(359); // 130*2+99
      expect(stats.defense).toBe(279); // 90*2+99
      expect(stats.spAttack).toBe(319); // 110*2+99
      expect(stats.spDefense).toBe(407); // 154*2+99
      expect(stats.speed).toBe(279); // 90*2+99
    });

    it("given Espeon at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 65,
        attack: 65,
        defense: 60,
        spAttack: 130,
        spDefense: 95,
        speed: 110,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(334); // 65*2+204
      expect(stats.attack).toBe(229); // 65*2+99
      expect(stats.defense).toBe(219); // 60*2+99
      expect(stats.spAttack).toBe(359); // 130*2+99
      expect(stats.spDefense).toBe(289); // 95*2+99
      expect(stats.speed).toBe(319); // 110*2+99
    });

    it("given Umbreon at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 95,
        attack: 65,
        defense: 110,
        spAttack: 60,
        spDefense: 130,
        speed: 65,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(394); // 95*2+204
      expect(stats.attack).toBe(229); // 65*2+99
      expect(stats.defense).toBe(319); // 110*2+99
      expect(stats.spAttack).toBe(219); // 60*2+99
      expect(stats.spDefense).toBe(359); // 130*2+99
      expect(stats.speed).toBe(229); // 65*2+99
    });

    it("given Scizor at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 70,
        attack: 130,
        defense: 100,
        spAttack: 55,
        spDefense: 80,
        speed: 65,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(344); // 70*2+204
      expect(stats.attack).toBe(359); // 130*2+99
      expect(stats.defense).toBe(299); // 100*2+99
      expect(stats.spAttack).toBe(209); // 55*2+99
      expect(stats.spDefense).toBe(259); // 80*2+99
      expect(stats.speed).toBe(229); // 65*2+99
    });

    it("given Heracross at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createTestPokemon({ level: 100, ivs: maxDvs, evs: maxStatExp });
      const species = createTestSpecies({
        hp: 80,
        attack: 125,
        defense: 75,
        spAttack: 40,
        spDefense: 95,
        speed: 85,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      expect(stats.hp).toBe(364); // 80*2+204
      expect(stats.attack).toBe(349); // 125*2+99
      expect(stats.defense).toBe(249); // 75*2+99
      expect(stats.spAttack).toBe(179); // 40*2+99
      expect(stats.spDefense).toBe(289); // 95*2+99
      expect(stats.speed).toBe(269); // 85*2+99
    });
  });

  describe("Given Pikachu at level 50 with max DVs and no StatExp", () => {
    it("given Pikachu at level 50 with max DVs and zero StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      // StatExp bonus = floor(ceil(sqrt(0)) / 4) = 0
      // Non-HP: floor(((Base + 15) * 2 + 0) * 50 / 100) + 5 = (Base + 15) + 5 = Base + 20
      // HP:     floor(((Base + 15) * 2 + 0) * 50 / 100) + 50 + 10 = (Base + 15) + 60 = Base + 75
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
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
      expect(stats.hp).toBe(110); // 35+75
      expect(stats.attack).toBe(75); // 55+20
      expect(stats.defense).toBe(50); // 30+20
      expect(stats.spAttack).toBe(70); // 50+20
      expect(stats.spDefense).toBe(60); // 40+20
      expect(stats.speed).toBe(110); // 90+20
    });
  });

  describe("Bug #487 regression: SpDef uses unified Special DV (ivs.spAttack), not ivs.spDefense", () => {
    it("given ivs.spAttack=15 and ivs.spDefense=5, when calculating SpDef, then uses DV=15 (unified Special DV)", () => {
      // Arrange
      // Source: pret/pokecrystal — Gen 2 uses a single Special DV for both SpAtk and SpDef.
      // The DV is stored in ivs.spAttack. ivs.spDefense is NOT used.
      // Bug #487: code was using ivs.spDefense, which is wrong.
      const pokemon = createTestPokemon({
        level: 100,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 5, speed: 15 },
        evs: {
          hp: 65535,
          attack: 65535,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        },
      });
      // Species with SpDef base = 100
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
      // SpDef should use DV=15 (from ivs.spAttack), NOT DV=5 (from ivs.spDefense)
      // With DV=15: SpDef = floor(((100+15)*2+64)*100/100)+5 = (230+64)+5 = 299
      // With DV=5 (bug): SpDef = floor(((100+5)*2+64)*100/100)+5 = (210+64)+5 = 279
      // Source: formula derivation — base=100, DV=15, StatExp=65535 → bonus=64, L=100
      expect(stats.spDefense).toBe(299);
    });

    it("given ivs.spAttack=0 and ivs.spDefense=15, when calculating SpDef, then uses DV=0 (unified Special DV)", () => {
      // Arrange
      // Source: pret/pokecrystal — unified Special DV is in ivs.spAttack
      // ivs.spDefense=15 should be completely ignored for SpDef calculation
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 0, spDefense: 15, speed: 15 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = createTestSpecies({
        hp: 80,
        attack: 80,
        defense: 80,
        spAttack: 80,
        spDefense: 80,
        speed: 80,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // SpDef should use DV=0 (from ivs.spAttack), NOT DV=15 (from ivs.spDefense)
      // With DV=0: SpDef = floor(((80+0)*2+0)*50/100)+5 = floor(160*50/100)+5 = 80+5 = 85
      // With DV=15 (bug): SpDef = floor(((80+15)*2+0)*50/100)+5 = floor(190*50/100)+5 = 95+5 = 100
      // Source: formula derivation — base=80, DV=0, StatExp=0, L=50
      expect(stats.spDefense).toBe(85);
      // SpAtk should also use DV=0
      expect(stats.spAttack).toBe(85);
      // Both should be equal since they share the same DV and have the same base stat
      expect(stats.spAttack).toBe(stats.spDefense);
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
      // Source: pret/pokecrystal engine/stats.asm — Gen 2 stat formula
      // HP: floor(((base+DV)*2+floor(sqrt(statExp)/4))*level/100)+level+10
      // base=5, DV=0, StatExp=0, level=1 → HP=11, all others=5
      // HP:    floor(((5+0)*2+0)*1/100)+1+10 = floor(10/100)+11 = 0+11 = 11
      // Other: floor(((5+0)*2+0)*1/100)+5    = floor(10/100)+5  = 0+5  = 5
      expect(stats.hp).toBe(11);
      expect(stats.attack).toBe(5);
      expect(stats.defense).toBe(5);
      expect(stats.spAttack).toBe(5);
      expect(stats.spDefense).toBe(5);
      expect(stats.speed).toBe(5);
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

    it("given max DVs (all 15), when calculating HP, then derives HP DV as 15 from lower bits of other DVs", () => {
      // Arrange
      // Source: pret/pokecrystal engine/pokemon/move_mon.asm:1483
      // HP_DV = ((Atk & 1) << 3) | ((Def & 1) << 2) | ((Spd & 1) << 1) | (Spc & 1)
      // All DVs=15 (odd) → HP_DV = (1<<3)|(1<<2)|(1<<1)|1 = 8+4+2+1 = 15
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 0, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      // Use a base HP of 45 (Pikachu-like)
      const species = createTestSpecies({
        hp: 45,
        attack: 55,
        defense: 30,
        spAttack: 50,
        spDefense: 40,
        speed: 90,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Derived HP DV = 15 (not the passed-in ivs.hp=0)
      // HP = floor(((45+15)*2+0)*50/100)+50+10 = floor(120*50/100)+60 = 60+60 = 120
      // Source: formula derivation — base=45, DV=15 (derived), StatExp=0, L=50
      expect(stats.hp).toBe(120);
    });

    it("given all even DVs (14), when calculating HP, then derives HP DV as 0 from lower bits", () => {
      // Arrange
      // Source: pret/pokecrystal engine/pokemon/move_mon.asm:1483
      // All DVs=14 (even) → HP_DV = (0<<3)|(0<<2)|(0<<1)|0 = 0
      const pokemon = createTestPokemon({
        level: 50,
        ivs: { hp: 15, attack: 14, defense: 14, spAttack: 14, spDefense: 14, speed: 14 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = createTestSpecies({
        hp: 45,
        attack: 55,
        defense: 30,
        spAttack: 50,
        spDefense: 40,
        speed: 90,
      });

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Derived HP DV = 0 (not the passed-in ivs.hp=15)
      // HP = floor(((45+0)*2+0)*50/100)+50+10 = floor(90*50/100)+60 = 45+60 = 105
      // Source: formula derivation — base=45, DV=0 (derived), StatExp=0, L=50
      expect(stats.hp).toBe(105);
    });

    it("given mixed DVs (atk=13, def=12, spd=9, spc=6), when calculating HP, then derives HP DV correctly", () => {
      // Arrange
      // Source: pret/pokecrystal engine/pokemon/move_mon.asm:1483
      // atkDv=13 (odd)→bit=1, defDv=12 (even)→bit=0, spdDv=9 (odd)→bit=1, spcDv=6 (even)→bit=0
      // HP_DV = (1<<3)|(0<<2)|(1<<1)|0 = 8+0+2+0 = 10
      const pokemon = createTestPokemon({
        level: 100,
        ivs: { hp: 0, attack: 13, defense: 12, spAttack: 6, spDefense: 6, speed: 9 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
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

      // Assert
      // Derived HP DV = 10
      // HP = floor(((100+10)*2+0)*100/100)+100+10 = 220+110 = 330
      // Source: formula derivation — base=100, DV=10 (derived), StatExp=0, L=100
      expect(stats.hp).toBe(330);
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
