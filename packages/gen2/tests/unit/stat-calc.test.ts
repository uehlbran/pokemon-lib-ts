import type { PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_NATURE_IDS,
  createDvs,
  createStatExp,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen2DataManager, GEN2_ITEM_IDS, GEN2_MOVE_IDS, GEN2_SPECIES_IDS } from "../../src";
import { calculateGen2Stats } from "../../src/Gen2StatCalc";

const GEN2_DATA = createGen2DataManager();
const DEFAULT_NATURE = CORE_NATURE_IDS.hardy as PokemonInstance["nature"];
const DEFAULT_POKEBALL = GEN2_ITEM_IDS.pokeBall;
const DEFAULT_ABILITY = "";

function createGen2PokemonFixture(options: {
  speciesId: number;
  level?: number;
  ivs?: Parameters<typeof createDvs>[0] & { hp?: number };
  evs?: Parameters<typeof createStatExp>[0];
}): PokemonInstance {
  const species = GEN2_DATA.getSpecies(options.speciesId);
  const level = options.level ?? 50;
  const { hp: _derivedHp, ...dvOverrides } = options.ivs ?? {};
  const ivs = createDvs(dvOverrides);
  const evs = createStatExp(options.evs ?? {});
  const tackle = GEN2_DATA.getMove(GEN2_MOVE_IDS.tackle);

  return {
    uid: `gen2-${species.id}-${level}`,
    speciesId: species.id,
    nickname: null,
    level,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs,
    evs,
    currentHp: level,
    moves: [
      {
        moveId: tackle.id,
        currentPP: tackle.pp,
        maxPP: tackle.pp,
        ppUps: 0,
      },
    ],
    ability: DEFAULT_ABILITY,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: 70,
    gender: species.genderRatio === null ? CORE_GENDERS.genderless : CORE_GENDERS.male,
    isShiny: false,
    metLocation: "test",
    metLevel: level,
    originalTrainer: "Test",
    originalTrainerId: 12345,
    pokeball: DEFAULT_POKEBALL,
  } as PokemonInstance;
}

describe("Gen2StatCalc", () => {
  describe("Given a Pokemon with known base stats", () => {
    it("should calculate HP correctly for Tyranitar at level 50", () => {
      // Arrange
      // Tyranitar: Base HP=100, DV=15, StatExp=65535
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.tyranitar,
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
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pokecrystal engine/pokemon/move_mon.asm CalcMonStatC — stat = floor(((base+DV)*2 + floor(ceil(sqrt(StatExp))/4)) * L/100) + 5; HP adds L+10 instead of +5
      // HP = floor(((100+15) * 2 + floor(ceil(sqrt(65535)) / 4)) * 50/100) + 50 + 10
      // sqrt(65535) = 255.998..., ceil = 256, /4 = 64
      // ((100+15)*2 + 64) * 50/100 = (230+64)*50/100 = 294*50/100 = 147
      // 147 + 50 + 10 = 207
      expect(stats.hp).toBe(207);
    });

    it("should calculate Attack correctly for Tyranitar at level 50", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.tyranitar,
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
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pokecrystal engine/pokemon/move_mon.asm CalcMonStatC — stat = floor(((base+DV)*2 + floor(ceil(sqrt(StatExp))/4)) * L/100) + 5; HP adds L+10 instead of +5
      // Atk = floor(((134+15)*2 + 64) * 50/100) + 5
      // (149*2 + 64)*50/100 = 362*50/100 = 181
      // 181 + 5 = 186
      expect(stats.attack).toBe(186);
    });

    it("should calculate different spAttack and spDefense for Alakazam", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.alakazam,
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
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.alakazam);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pokecrystal engine/pokemon/move_mon.asm CalcMonStatC — stat = floor(((base+DV)*2 + floor(ceil(sqrt(StatExp))/4)) * L/100) + 5; HP adds L+10 instead of +5
      // SpAtk = floor(((135+15)*2 + 64) * 100/100) + 5 = (300+64) + 5 = 364 + 5 = 369
      // SpDef = floor(((95+15)*2 + 64) * 100/100) + 5 = (220+64) + 5 = 284 + 5 = 289
      expect(stats.spAttack).toBe(369);
      expect(stats.spDefense).toBe(269);
      expect(stats.spAttack).not.toBe(stats.spDefense);
    });

    it("should handle zero DVs and zero StatExp", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.snorlax,
        level: 50,
        ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.snorlax);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pokecrystal engine/pokemon/move_mon.asm CalcMonStatC — stat = floor(((base+DV)*2 + floor(ceil(sqrt(StatExp))/4)) * L/100) + 5; HP adds L+10 instead of +5
      // HP = floor(((160+0) * 2 + floor(ceil(sqrt(0)) / 4)) * 50/100) + 50 + 10
      // sqrt(0) = 0, ceil(0) = 0, 0/4 = 0
      // (320 + 0) * 50/100 = 160
      // 160 + 50 + 10 = 220
      expect(stats.hp).toBe(220);
      // Other stat = floor(((110+0) * 2 + 0) * 50/100) + 5 = 110 + 5 = 115
      expect(stats.attack).toBe(115);
      expect(stats.defense).toBe(70);
      expect(stats.spAttack).toBe(70);
      expect(stats.spDefense).toBe(115);
      expect(stats.speed).toBe(35);
    });

    it("should handle Pikachu at level 100", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.pikachu,
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
      // Pikachu Gen 2: Speed base = 90
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.pikachu);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pokecrystal engine/pokemon/move_mon.asm CalcMonStatC — stat = floor(((base+DV)*2 + floor(ceil(sqrt(StatExp))/4)) * L/100) + 5; HP adds L+10 instead of +5
      // Speed = floor(((90+15)*2 + 64) * 100/100) + 5 = (210+64) + 5 = 274 + 5 = 279
      expect(stats.speed).toBe(279);
    });
  });

  describe("Given well-known Gen 2 Pokemon at level 100 with max DVs and max StatExp", () => {
    // Source: pokecrystal engine/pokemon/move_mon.asm CalcMonStatC — stat = floor(((base+DV)*2 + floor(ceil(sqrt(StatExp))/4)) * L/100) + 5; HP adds L+10 instead of +5
    // At L100, DV=15, StatExp=65535:
    //   StatExp bonus = floor(ceil(sqrt(65535)) / 4) = floor(256 / 4) = 64
    //   HP  = (Base + 15) * 2 + 64 + 100 + 10 = Base * 2 + 204
    //   Stat = (Base + 15) * 2 + 64 + 5       = Base * 2 + 99
    const maxDvs = createDvs();
    const maxStatExp = createStatExp({
      hp: 65535,
      attack: 65535,
      defense: 65535,
      spAttack: 65535,
      spDefense: 65535,
      speed: 65535,
    });

    it("given Tyranitar at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.tyranitar,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=100, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((100+15)*2+64)*100/100)+100+10 = 404.
      expect(stats.hp).toBe(404); // 100*2+204
      expect(stats.attack).toBe(367); // 134*2+99
      expect(stats.defense).toBe(319); // 110*2+99
      expect(stats.spAttack).toBe(289); // 95*2+99
      expect(stats.spDefense).toBe(299); // 100*2+99
      expect(stats.speed).toBe(221); // 61*2+99
    });

    it("given Mewtwo at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.mewtwo,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.mewtwo);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=106, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((106+15)*2+64)*100/100)+100+10 = 416.
      expect(stats.hp).toBe(416); // 106*2+204
      expect(stats.attack).toBe(319); // 110*2+99
      expect(stats.defense).toBe(279); // 90*2+99
      expect(stats.spAttack).toBe(407); // 154*2+99
      expect(stats.spDefense).toBe(279); // 90*2+99
      expect(stats.speed).toBe(359); // 130*2+99
    });

    it("given Snorlax at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.snorlax,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.snorlax);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=160, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((160+15)*2+64)*100/100)+100+10 = 524.
      expect(stats.hp).toBe(524); // 160*2+204
      expect(stats.attack).toBe(319); // 110*2+99
      expect(stats.defense).toBe(229); // 65*2+99
      expect(stats.spAttack).toBe(229); // 65*2+99
      expect(stats.spDefense).toBe(319); // 110*2+99
      expect(stats.speed).toBe(159); // 30*2+99
    });

    it("given Blissey at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.blissey,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.blissey);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=255, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((255+15)*2+64)*100/100)+100+10 = 714.
      expect(stats.hp).toBe(714); // 255*2+204
      expect(stats.attack).toBe(119); // 10*2+99
      expect(stats.defense).toBe(119); // 10*2+99
      expect(stats.spAttack).toBe(249); // 75*2+99
      expect(stats.spDefense).toBe(369); // 135*2+99
      expect(stats.speed).toBe(209); // 55*2+99
    });

    it("given Lugia at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.lugia,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.lugia);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=106, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((106+15)*2+64)*100/100)+100+10 = 416.
      expect(stats.hp).toBe(416); // 106*2+204
      expect(stats.attack).toBe(279); // 90*2+99
      expect(stats.defense).toBe(359); // 130*2+99
      expect(stats.spAttack).toBe(279); // 90*2+99
      expect(stats.spDefense).toBe(407); // 154*2+99
      expect(stats.speed).toBe(319); // 110*2+99
    });

    it("given Ho-Oh at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.hooh,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.hooh);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=106, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((106+15)*2+64)*100/100)+100+10 = 416.
      expect(stats.hp).toBe(416); // 106*2+204
      expect(stats.attack).toBe(359); // 130*2+99
      expect(stats.defense).toBe(279); // 90*2+99
      expect(stats.spAttack).toBe(319); // 110*2+99
      expect(stats.spDefense).toBe(407); // 154*2+99
      expect(stats.speed).toBe(279); // 90*2+99
    });

    it("given Espeon at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.espeon,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.espeon);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=65, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((65+15)*2+64)*100/100)+100+10 = 334.
      expect(stats.hp).toBe(334); // 65*2+204
      expect(stats.attack).toBe(229); // 65*2+99
      expect(stats.defense).toBe(219); // 60*2+99
      expect(stats.spAttack).toBe(359); // 130*2+99
      expect(stats.spDefense).toBe(289); // 95*2+99
      expect(stats.speed).toBe(319); // 110*2+99
    });

    it("given Umbreon at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.umbreon,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.umbreon);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=95, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((95+15)*2+64)*100/100)+100+10 = 394.
      expect(stats.hp).toBe(394); // 95*2+204
      expect(stats.attack).toBe(229); // 65*2+99
      expect(stats.defense).toBe(319); // 110*2+99
      expect(stats.spAttack).toBe(219); // 60*2+99
      expect(stats.spDefense).toBe(359); // 130*2+99
      expect(stats.speed).toBe(229); // 65*2+99
    });

    it("given Scizor at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.scizor,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.scizor);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=70, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((70+15)*2+64)*100/100)+100+10 = 344.
      expect(stats.hp).toBe(344); // 70*2+204
      expect(stats.attack).toBe(359); // 130*2+99
      expect(stats.defense).toBe(299); // 100*2+99
      expect(stats.spAttack).toBe(209); // 55*2+99
      expect(stats.spDefense).toBe(259); // 80*2+99
      expect(stats.speed).toBe(229); // 65*2+99
    });

    it("given Heracross at level 100 with max DVs and max StatExp, when calculating stats, then returns expected values", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.heracross,
        level: 100,
        ivs: maxDvs,
        evs: maxStatExp,
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.heracross);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=80, DV=15, StatExp=65535, L=100, bonus=64.
      // HP = floor(((80+15)*2+64)*100/100)+100+10 = 364.
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
      // Source: pokecrystal engine/pokemon/move_mon.asm CalcMonStatC — stat = floor(((base+DV)*2 + floor(ceil(sqrt(StatExp))/4)) * L/100) + 5; HP adds L+10 instead of +5
      // StatExp bonus = floor(ceil(sqrt(0)) / 4) = 0
      // Non-HP: floor(((Base + 15) * 2 + 0) * 50 / 100) + 5 = (Base + 15) + 5 = Base + 20
      // HP:     floor(((Base + 15) * 2 + 0) * 50 / 100) + 50 + 10 = (Base + 15) + 60 = Base + 75
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.pikachu,
        level: 50,
        ivs: createDvs(),
        evs: createStatExp(),
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.pikachu);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: Gen 2 Pikachu base stats from data bundle.
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
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.tyranitar,
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
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);

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
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.bulbasaur,
        level: 50,
        ivs: { hp: 15, attack: 15, defense: 15, spAttack: 0, spDefense: 15, speed: 15 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.bulbasaur);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // SpDef should use DV=0 (from ivs.spAttack), NOT DV=15 (from ivs.spDefense)
      // With DV=0: SpDef = floor(((65+0)*2+0)*50/100)+5 = floor(130*50/100)+5 = 65+5 = 70
      // With DV=15 (bug): SpDef = floor(((65+15)*2+0)*50/100)+5 = floor(160*50/100)+5 = 80+5 = 85
      // Source: formula derivation — base=65, DV=0, StatExp=0, L=50
      expect(stats.spDefense).toBe(70);
      // SpAtk should also use DV=0
      expect(stats.spAttack).toBe(70);
      // Both should be equal since they share the same DV and have the same base stat
      expect(stats.spAttack).toBe(stats.spDefense);
    });
  });

  describe("Given stat formula properties", () => {
    it("should always return positive integer stats", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.bulbasaur,
        level: 1,
        ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.bulbasaur);

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
      expect(stats.spAttack).toBe(6);
      expect(stats.spDefense).toBe(6);
      expect(stats.speed).toBe(5);
    });

    it("should increase stats monotonically with increasing DVs", () => {
      // Arrange
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);
      const results: number[] = [];

      // Act
      for (let dv = 0; dv <= 15; dv++) {
        const pokemon = createGen2PokemonFixture({
          speciesId: GEN2_SPECIES_IDS.tyranitar,
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
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);
      const evValues = [0, 100, 1000, 10000, 65535];
      const results: number[] = [];

      // Act
      for (const ev of evValues) {
        const pokemon = createGen2PokemonFixture({
          speciesId: GEN2_SPECIES_IDS.tyranitar,
          level: 100,
          ivs: createDvs(),
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
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.tyranitar,
        level: 50,
        ivs: createDvs(),
        evs: createStatExp({
          hp: 65535,
          attack: 65535,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        }),
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert — HP formula adds Level+10 while others add +5
      expect(stats.hp).toBeGreaterThan(stats.attack);
    });

    it("should increase stats with increasing level", () => {
      // Arrange
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);

      // Act
      const stats10 = calculateGen2Stats(
        createGen2PokemonFixture({ speciesId: GEN2_SPECIES_IDS.tyranitar, level: 10 }),
        species,
      );
      const stats50 = calculateGen2Stats(
        createGen2PokemonFixture({ speciesId: GEN2_SPECIES_IDS.tyranitar, level: 50 }),
        species,
      );
      const stats100 = calculateGen2Stats(
        createGen2PokemonFixture({ speciesId: GEN2_SPECIES_IDS.tyranitar, level: 100 }),
        species,
      );

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
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.bulbasaur,
        level: 50,
        ivs: { hp: 0, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      // Use a base HP of 45 (Pikachu-like)
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.bulbasaur);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=45, DV=15, StatExp=0, L=50, bonus=0.
      // HP = floor(((45+15)*2+0)*50/100)+50+10 = 120.
      // Derived HP DV = 15 (not the passed-in ivs.hp=0)
      // HP = floor(((45+15)*2+0)*50/100)+50+10 = floor(120*50/100)+60 = 60+60 = 120
      // Source: formula derivation — base=45, DV=15 (derived), StatExp=0, L=50
      expect(stats.hp).toBe(120);
    });

    it("given all even DVs (14), when calculating HP, then derives HP DV as 0 from lower bits", () => {
      // Arrange
      // Source: pret/pokecrystal engine/pokemon/move_mon.asm:1483
      // All DVs=14 (even) → HP_DV = (0<<3)|(0<<2)|(0<<1)|0 = 0
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.bulbasaur,
        level: 50,
        ivs: { hp: 15, attack: 14, defense: 14, spAttack: 14, spDefense: 14, speed: 14 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.bulbasaur);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=45, DV=0, StatExp=0, L=50, bonus=0.
      // HP = floor(((45+0)*2+0)*50/100)+50+10 = 105.
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
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.tyranitar,
        level: 100,
        ivs: { hp: 0, attack: 13, defense: 12, spAttack: 6, spDefense: 6, speed: 9 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.tyranitar);

      // Act
      const stats = calculateGen2Stats(pokemon, species);

      // Assert
      // Source: pret/pokecrystal engine/stats.asm -- base=100, DV=10, StatExp=0, L=100, bonus=0.
      // HP = floor(((100+10)*2+0)*100/100)+100+10 = 330.
      // Derived HP DV = 10
      // HP = floor(((100+10)*2+0)*100/100)+100+10 = 220+110 = 330
      // Source: formula derivation — base=100, DV=10 (derived), StatExp=0, L=100
      expect(stats.hp).toBe(330);
    });

    it("should produce floored integer results for non-clean divisions", () => {
      // Arrange
      const pokemon = createGen2PokemonFixture({
        speciesId: GEN2_SPECIES_IDS.pikachu,
        level: 37,
        ivs: { hp: 7, attack: 7, defense: 7, spAttack: 7, spDefense: 7, speed: 7 },
        evs: { hp: 127, attack: 127, defense: 127, spAttack: 127, spDefense: 127, speed: 127 },
      });
      const species = GEN2_DATA.getSpecies(GEN2_SPECIES_IDS.pikachu);

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
