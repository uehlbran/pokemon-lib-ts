import { CORE_MOVE_CATEGORIES, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN1_MOVE_IDS, GEN1_SPECIES_IDS } from "../../src";
import { createGen1DataManager } from "../../src/data";

const moveCategories = CORE_MOVE_CATEGORIES;
const typeIds = CORE_TYPE_IDS;

const GEN1_SPECIES_COUNT = 151;
const GEN1_SPECIES_FIRST_ID = 1;
const GEN1_SPECIES_LAST_ID = 151;
const GEN1_MOVE_COUNT = 165;

const GEN1_EVOLUTION_LEVELS = {
  bulbasaurToIvysaur: 16,
  ivysaurToVenusaur: 32,
} as const;

const GEN1_BULBASAUR_LEVEL_UP_MOVES = [
  { level: 1, move: GEN1_MOVE_IDS.tackle },
  { level: 1, move: GEN1_MOVE_IDS.growl },
  { level: 7, move: GEN1_MOVE_IDS.leechSeed },
  { level: 13, move: GEN1_MOVE_IDS.vineWhip },
  { level: 20, move: GEN1_MOVE_IDS.poisonPowder },
  { level: 27, move: GEN1_MOVE_IDS.razorLeaf },
  { level: 34, move: GEN1_MOVE_IDS.growth },
  { level: 41, move: GEN1_MOVE_IDS.sleepPowder },
  { level: 48, move: GEN1_MOVE_IDS.solarBeam },
] as const;

const GEN1_CHARIZARD_LEVEL_UP_MOVES = [
  GEN1_MOVE_IDS.scratch,
  GEN1_MOVE_IDS.growl,
  GEN1_MOVE_IDS.ember,
  GEN1_MOVE_IDS.leer,
  GEN1_MOVE_IDS.rage,
  GEN1_MOVE_IDS.slash,
  GEN1_MOVE_IDS.flamethrower,
  GEN1_MOVE_IDS.fireSpin,
] as const;

const GEN1_TYPE_NAMES = [
  CORE_TYPE_IDS.normal,
  CORE_TYPE_IDS.fire,
  CORE_TYPE_IDS.water,
  CORE_TYPE_IDS.electric,
  CORE_TYPE_IDS.grass,
  CORE_TYPE_IDS.ice,
  CORE_TYPE_IDS.fighting,
  CORE_TYPE_IDS.poison,
  CORE_TYPE_IDS.ground,
  CORE_TYPE_IDS.flying,
  CORE_TYPE_IDS.psychic,
  CORE_TYPE_IDS.bug,
  CORE_TYPE_IDS.rock,
  CORE_TYPE_IDS.ghost,
  CORE_TYPE_IDS.dragon,
] as const;

describe("Gen 1 Data Loading", () => {
  // --- Species Data ---

  it("given Gen 1 data, when loaded, then contains 151 species", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allSpecies = dm.getAllSpecies();
    // Assert
    expect(allSpecies.length).toBe(GEN1_SPECIES_COUNT);
  });

  it("given Gen 1 data, when loading species, then all have ids from 1 to 151", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allSpecies = dm.getAllSpecies();
    const ids = allSpecies.map((s) => s.id).sort((a, b) => a - b);
    // Assert
    expect(ids[0]).toBe(GEN1_SPECIES_FIRST_ID);
    expect(ids[ids.length - 1]).toBe(GEN1_SPECIES_LAST_ID);
    expect(ids.length).toBe(GEN1_SPECIES_COUNT);
    // Verify continuous range
    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toBe(GEN1_SPECIES_FIRST_ID + i);
    }
  });

  it("given Gen 1 data, when loading Bulbasaur, then has correct types and base stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const bulbasaur = dm.getSpecies(GEN1_SPECIES_IDS.bulbasaur);
    // Assert
    expect(bulbasaur.displayName).toBe("Bulbasaur");
    expect(bulbasaur.name).toBe("bulbasaur");
    expect(bulbasaur.types).toEqual([typeIds.grass, typeIds.poison]);
    expect(bulbasaur.baseStats).toEqual({
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    });
  });

  it("given Gen 1 data, when loading Charizard, then has correct types and base stats", () => {
    // Source: pret/pokered data/pokemon/base_stats/charizard.asm — db 78, 84, 78, 100, 85 (hp, atk, def, spd, spc=85)
    // Note: @pkmn/data returns spa=109 for Gen 1 (the Gen 2+ SpAtk value). Pret wins: Gen 1 Special=85.
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const charizard = dm.getSpecies(GEN1_SPECIES_IDS.charizard);
    // Assert
    expect(charizard.displayName).toBe("Charizard");
    expect(charizard.types).toEqual([typeIds.fire, typeIds.flying]);
    expect(charizard.baseStats).toEqual({
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 85, // Gen 1 unified Special=85 (pokered line: db 78,84,78,100,85)
      spDefense: 85, // Same as spAttack in Gen 1 (unified Special)
      speed: 100,
    });
  });

  it("given Gen 1 data, when loading Pikachu, then has correct base stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const pikachu = dm.getSpecies(GEN1_SPECIES_IDS.pikachu);
    // Assert
    expect(pikachu.displayName).toBe("Pikachu");
    expect(pikachu.types).toEqual([typeIds.electric]);
    expect(pikachu.baseStats).toEqual({
      hp: 35,
      attack: 55,
      defense: 30,
      spAttack: 50,
      spDefense: 50,
      speed: 90,
    });
  });

  it("given Gen 1 data, when loading Mewtwo, then is legendary with correct stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const mewtwo = dm.getSpecies(GEN1_SPECIES_IDS.mewtwo);
    // Assert
    expect(mewtwo.displayName).toBe("Mewtwo");
    expect(mewtwo.isLegendary).toBe(true);
    expect(mewtwo.isMythical).toBe(false);
    expect(mewtwo.types).toEqual([typeIds.psychic]);
    expect(mewtwo.baseStats).toEqual({
      hp: 106,
      attack: 110,
      defense: 90,
      spAttack: 154,
      spDefense: 154, // Unified Special
      speed: 130,
    });
  });

  it("given Gen 1 data, when loading Mew, then is mythical", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const mew = dm.getSpecies(GEN1_SPECIES_IDS.mew);
    // Assert
    expect(mew.displayName).toBe("Mew");
    expect(mew.isMythical).toBe(true);
    expect(mew.isLegendary).toBe(false);
    expect(mew.types).toEqual([typeIds.psychic]);
    // Mew has all base stats at 100
    expect(mew.baseStats).toEqual({
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    });
  });

  it("given Gen 1 data, when loaded, then has no abilities for any species", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allSpecies = dm.getAllSpecies();
    // Assert: Gen 1 had no abilities
    for (const species of allSpecies) {
      expect(species.abilities.normal).toEqual([]);
      expect(species.abilities.hidden).toBeNull();
    }
  });

  it("given Gen 1 data, when loading species, then all have generation set to 1", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allSpecies = dm.getAllSpecies();
    // Assert
    for (const species of allSpecies) {
      expect(species.generation).toBe(1);
    }
  });

  it("given Gen 1 data, when loading Gengar, then has correct dual types", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const gengar = dm.getSpecies(GEN1_SPECIES_IDS.gengar);
    // Assert
    expect(gengar.displayName).toBe("Gengar");
    expect(gengar.types).toEqual([typeIds.ghost, typeIds.poison]);
  });

  it("given Gen 1 data, when loading Snorlax, then has correct stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const snorlax = dm.getSpecies(GEN1_SPECIES_IDS.snorlax);
    // Assert
    expect(snorlax.displayName).toBe("Snorlax");
    expect(snorlax.baseStats).toEqual({
      hp: 160,
      attack: 110,
      defense: 65,
      spAttack: 65,
      spDefense: 65,
      speed: 30,
    });
  });

  it("given Gen 1 data, when loading species, then spAttack equals spDefense for all (unified Special)", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allSpecies = dm.getAllSpecies();
    // Assert: In Gen 1, Special was a single stat. The data stores it in both spAttack and spDefense.
    for (const species of allSpecies) {
      expect(species.baseStats.spAttack).toBe(species.baseStats.spDefense);
    }
  });

  // --- Species Lookup ---

  it("given Gen 1 data, when loading species by name, then finds Bulbasaur", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const bulbasaur = dm.getSpeciesByName("bulbasaur");
    // Assert
    expect(bulbasaur.id).toBe(GEN1_SPECIES_IDS.bulbasaur);
    expect(bulbasaur.displayName).toBe("Bulbasaur");
  });

  it("given Gen 1 data, when loading species by name with different case, then still finds it", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const pikachu = dm.getSpeciesByName("Pikachu");
    // Assert
    expect(pikachu.id).toBe(GEN1_SPECIES_IDS.pikachu);
  });

  it("given Gen 1 data, when loading non-existent species, then throws error", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act / Assert
    expect(() => dm.getSpecies(999)).toThrow();
  });

  // --- Evolution Data ---

  it("given Gen 1 data, when loaded, then Bulbasaur evolves to Ivysaur at level 16", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const bulbasaur = dm.getSpecies(GEN1_SPECIES_IDS.bulbasaur);
    // Assert
    expect(bulbasaur.evolution).not.toBeNull();
    expect(bulbasaur.evolution?.from).toBeNull(); // Base form
    expect(bulbasaur.evolution?.to).toHaveLength(1);
    expect(bulbasaur.evolution?.to[0]?.speciesId).toBe(GEN1_SPECIES_IDS.ivysaur); // Ivysaur
    expect(bulbasaur.evolution?.to[0]?.level).toBe(GEN1_EVOLUTION_LEVELS.bulbasaurToIvysaur);
    expect(bulbasaur.evolution?.to[0]?.method).toBe("level-up");
  });

  it("given Gen 1 data, when loaded, then Ivysaur evolves from Bulbasaur and to Venusaur", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const ivysaur = dm.getSpecies(GEN1_SPECIES_IDS.ivysaur);
    // Assert
    expect(ivysaur.evolution).not.toBeNull();
    expect(ivysaur.evolution?.from).not.toBeNull();
    expect(ivysaur.evolution?.from?.speciesId).toBe(GEN1_SPECIES_IDS.bulbasaur); // From Bulbasaur
    expect(ivysaur.evolution?.to[0]?.speciesId).toBe(GEN1_SPECIES_IDS.venusaur); // To Venusaur
    expect(ivysaur.evolution?.to[0]?.level).toBe(GEN1_EVOLUTION_LEVELS.ivysaurToVenusaur);
  });

  it("given Gen 1 data, when loaded, then Eevee has multiple evolution paths", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const eevee = dm.getSpecies(GEN1_SPECIES_IDS.eevee);
    // Assert
    expect(eevee.evolution).not.toBeNull();
    // Gen 1 Eevee can evolve into Vaporeon (134), Jolteon (135), Flareon (136)
    const targetIds = eevee.evolution?.to.map((e) => e.speciesId);
    expect(targetIds).toEqual([
      GEN1_SPECIES_IDS.vaporeon,
      GEN1_SPECIES_IDS.jolteon,
      GEN1_SPECIES_IDS.flareon,
    ]);
  });

  // --- Moves Data ---

  it("given Gen 1 data, when loaded, then contains 165 moves", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allMoves = dm.getAllMoves();
    // Assert — Gen 1 has 165 moves (Sharpen was added in bug fix #105)
    expect(allMoves.length).toBe(GEN1_MOVE_COUNT);
  });

  it("given Gen 1 data, when loading Flamethrower, then is special category fire type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const flamethrower = dm.getMove(GEN1_MOVE_IDS.flamethrower);
    // Assert: In Gen 1, Fire-type moves are Special
    expect(flamethrower.type).toBe(typeIds.fire);
    expect(flamethrower.category).toBe(moveCategories.special);
    // Source: committed Gen 1 move data bundle (pret/pokered-aligned) lists Flamethrower at 95 BP / 100 accuracy.
    expect(flamethrower.power).toBe(95);
    expect(flamethrower.accuracy).toBe(100);
  });

  it("given Gen 1 data, when loading Tackle, then is physical category normal type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const tackle = dm.getMove(GEN1_MOVE_IDS.tackle);
    // Assert: In Gen 1, Normal-type moves are Physical
    expect(tackle.type).toBe(typeIds.normal);
    expect(tackle.category).toBe(moveCategories.physical);
    // Source: committed Gen 1 move data bundle lists Tackle at 35 base power.
    expect(tackle.power).toBe(35);
  });

  it("given Gen 1 data, when loading Earthquake, then is physical ground type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const earthquake = dm.getMove(GEN1_MOVE_IDS.earthquake);
    // Assert
    expect(earthquake.type).toBe(typeIds.ground);
    expect(earthquake.category).toBe(moveCategories.physical);
    expect(earthquake.power).toBe(100);
    expect(earthquake.accuracy).toBe(100);
  });

  it("given Gen 1 data, when loading Thunderbolt, then is special electric type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const thunderbolt = dm.getMove(GEN1_MOVE_IDS.thunderbolt);
    // Assert
    expect(thunderbolt.type).toBe(typeIds.electric);
    expect(thunderbolt.category).toBe(moveCategories.special);
    // Source: committed Gen 1 move data bundle lists Thunderbolt at 95 base power.
    expect(thunderbolt.power).toBe(95);
  });

  it("given Gen 1 data, when loading Psychic, then is special psychic type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const psychic = dm.getMove(GEN1_MOVE_IDS.psychic);
    // Assert
    expect(psychic.type).toBe(typeIds.psychic);
    expect(psychic.category).toBe(moveCategories.special);
    // Source: committed Gen 1 move data bundle lists Psychic at 90 base power.
    expect(psychic.power).toBe(90);
  });

  it("given Gen 1 data, when loading Swift, then has null accuracy (never misses)", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const swift = dm.getMove(GEN1_MOVE_IDS.swift);
    // Assert
    expect(swift.type).toBe(typeIds.normal);
    expect(swift.category).toBe(moveCategories.physical);
    // Source: committed Gen 1 move data bundle lists Swift at 60 BP / 20 PP with null accuracy.
    expect(swift.power).toBe(60);
    expect(swift.accuracy).toBeNull();
    expect(swift.pp).toBe(20);
    expect(swift.target).toBe("all-adjacent-foes");
    expect(swift.flags.recharge).toBe(false);
    expect(swift.description).toContain("never misses");
  });

  it("given Gen 1 data, when loading Quick Attack, then has priority 1", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const quickAttack = dm.getMove(GEN1_MOVE_IDS.quickAttack);
    // Assert
    expect(quickAttack.priority).toBe(1);
    expect(quickAttack.type).toBe(typeIds.normal);
    expect(quickAttack.category).toBe(moveCategories.physical);
    // Source: committed Gen 1 move data bundle lists Quick Attack at 40 base power.
    expect(quickAttack.power).toBe(40);
  });

  it("given Gen 1 data, when loading Counter, then has negative priority", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const counter = dm.getMove(GEN1_MOVE_IDS.counter);
    // Assert
    expect(counter.priority).toBeLessThan(0);
  });

  it("given gen1 move data, when Counter priority is read, then it should be -1", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const counter = dm.getMove(GEN1_MOVE_IDS.counter);
    // Assert
    // Source: pret/pokered engine/battle/core.asm — Counter turn-order check (hardcoded move ID comparison, acts last)
    expect(counter.priority).toBe(-1);
  });

  it("given gen1 move data, when Bide priority is read, then it should be 0", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const bide = dm.getMove(GEN1_MOVE_IDS.bide);
    // Assert
    // Source: pret/pokered data/moves/moves.asm — BIDE_EFFECT macro has no priority field (normal order)
    expect(bide.priority).toBe(0);
  });

  it("given gen1 move data, when Roar priority is read, then it should be 0", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const roar = dm.getMove(GEN1_MOVE_IDS.roar);
    // Assert
    // Source: pret/pokered data/moves/moves.asm — SWITCH_AND_TELEPORT_EFFECT macro has no priority field (normal order)
    expect(roar.priority).toBe(0);
  });

  it("given gen1 move data, when Whirlwind priority is read, then it should be 0", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const whirlwind = dm.getMove(GEN1_MOVE_IDS.whirlwind);
    // Assert
    // Source: pret/pokered data/moves/moves.asm — SWITCH_AND_TELEPORT_EFFECT macro has no priority field (normal order)
    expect(whirlwind.priority).toBe(0);
  });

  it("given Gen 1 data, when loading Hyper Beam, then has recharge flag", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const hyperBeam = dm.getMove(GEN1_MOVE_IDS.hyperBeam);
    // Assert
    expect(hyperBeam.flags.recharge).toBe(true);
    // Source: committed Gen 1 move data bundle lists Hyper Beam at 150 base power.
    expect(hyperBeam.power).toBe(150);
    expect(hyperBeam.type).toBe(typeIds.normal);
  });

  it("given Gen 1 data, when loading non-existent move, then throws error", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act / Assert
    expect(() => dm.getMove("fake-move-that-doesnt-exist")).toThrow();
  });

  it("given Gen 1 data, when loading all moves, then all have generation 1", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allMoves = dm.getAllMoves();
    // Assert
    for (const move of allMoves) {
      expect(move.generation).toBe(1);
    }
  });

  // --- Type Chart Data ---

  it("given Gen 1 data, when loading type chart, then has 15 types (no dark, steel, fairy)", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const chart = dm.getTypeChart();
    const types = Object.keys(chart);
    // Assert: Gen 1 has 15 types
    expect(types).toEqual(GEN1_TYPE_NAMES);
  });

  // --- Items and Natures ---

  it("given Gen 1 data, when loaded, then items list is empty (no held items in Gen 1)", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allItems = dm.getAllItems();
    // Assert
    expect(allItems.length).toBe(0);
  });

  it("given Gen 1 data, when loaded, then natures list is empty (no natures in Gen 1)", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allNatures = dm.getAllNatures();
    // Assert
    expect(allNatures.length).toBe(0);
  });

  // --- Learnset Data ---

  it("given Gen 1 data, when loading Bulbasaur learnset, then has level-up moves", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const bulbasaur = dm.getSpecies(GEN1_SPECIES_IDS.bulbasaur);
    // Assert
    expect(bulbasaur.learnset.levelUp).toEqual(GEN1_BULBASAUR_LEVEL_UP_MOVES);
  });

  it("given Gen 1 data, when loading Charizard, then learns Fire-type moves", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const charizard = dm.getSpecies(GEN1_SPECIES_IDS.charizard);
    const moveIds = charizard.learnset.levelUp.map((m) => m.move);
    // Assert: exact Gen 1 level-up learnset order for Charizard from the fixture data
    expect(moveIds).toEqual(GEN1_CHARIZARD_LEVEL_UP_MOVES);
  });

  // --- Pret cartridge-accurate move data (Gen 1) ---

  it("given Gen 1 move data, when loading Gust, then type is normal (not flying)", () => {
    // In Gen 1, Gust is a Normal-type move. The Flying typing was introduced in Gen 2.
    // Source: pret/pokered data/moves/moves.asm line 29 — move GUST, type NORMAL
    const dm = createGen1DataManager();
    const gust = dm.getMove(GEN1_MOVE_IDS.gust);
    expect(gust.type).toBe(typeIds.normal);
  });

  it("given Gen 1 move data, when loading Sand Attack, then type is normal (not ground)", () => {
    // In Gen 1, Sand Attack is a Normal-type move. The Ground typing was introduced in Gen 2.
    // Source: pret/pokered data/moves/moves.asm line 41 — move SAND_ATTACK, type NORMAL
    const dm = createGen1DataManager();
    const sandAttack = dm.getMove(GEN1_MOVE_IDS.sandAttack);
    expect(sandAttack.type).toBe(typeIds.normal);
  });

  it("given Gen 1 move data, when loading Absorb, then PP is 20", () => {
    // Source: pret/pokered data/moves/moves.asm line 84 — move ABSORB, pp 20
    const dm = createGen1DataManager();
    const absorb = dm.getMove(GEN1_MOVE_IDS.absorb);
    expect(absorb.pp).toBe(20);
  });

  it("given Gen 1 move data, when loading Mega Drain, then PP is 10", () => {
    // Source: pret/pokered data/moves/moves.asm line 85 — move MEGA_DRAIN, pp 10
    const dm = createGen1DataManager();
    const megaDrain = dm.getMove(GEN1_MOVE_IDS.megaDrain);
    expect(megaDrain.pp).toBe(10);
  });

  it("given Gen 1 move data, when loading Razor Wind, then accuracy is 75", () => {
    // Source: pret/pokered data/moves/moves.asm line 26 — move RAZOR_WIND, accuracy 75
    const dm = createGen1DataManager();
    const razorWind = dm.getMove(GEN1_MOVE_IDS.razorWind);
    expect(razorWind.accuracy).toBe(75);
  });

  it("given Gen 1 move data, when loading Whirlwind, then accuracy is 85", () => {
    // In Gen 1, Whirlwind has 85% accuracy and can miss.
    // Source: pret/pokered data/moves/moves.asm line 31 — move WHIRLWIND, accuracy 85
    const dm = createGen1DataManager();
    const whirlwind = dm.getMove(GEN1_MOVE_IDS.whirlwind);
    expect(whirlwind.accuracy).toBe(85);
  });

  it("given Gen 1 move data, when loading Struggle, then PP is 10", () => {
    // Source: pret/pokered data/moves/moves.asm line 178 — move STRUGGLE, pp 10
    const dm = createGen1DataManager();
    const struggle = dm.getMove(GEN1_MOVE_IDS.struggle);
    expect(struggle.pp).toBe(10);
  });

  it("given Gen 1 move data, when loading Struggle, then accuracy is 100", () => {
    // Source: pret/pokered data/moves/moves.asm line 178 — move STRUGGLE, accuracy 100
    const dm = createGen1DataManager();
    const struggle = dm.getMove(GEN1_MOVE_IDS.struggle);
    expect(struggle.accuracy).toBe(100);
  });

  // --- Data Manager State ---

  it("given Gen 1 data manager, when created, then reports as loaded", () => {
    // Arrange / Act
    const dm = createGen1DataManager();
    // Assert
    expect(dm.isLoaded()).toBe(true);
  });
});
