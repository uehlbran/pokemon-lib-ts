import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../../src/data";

const GEN1_SPECIES_COUNT = 151;
const GEN1_SPECIES_FIRST_ID = 1;
const GEN1_SPECIES_LAST_ID = 151;
const GEN1_MOVE_COUNT = 165;

const GEN1_EVOLUTION_LEVELS = {
  bulbasaurToIvysaur: 16,
  ivysaurToVenusaur: 32,
} as const;

const GEN1_MOVE_STATS = {
  flamethrower: { power: 95, accuracy: 100 },
  tackle: { power: 35 },
  earthquake: { power: 100, accuracy: 100 },
  thunderbolt: { power: 95 },
  psychic: { power: 90 },
  swift: { power: 60, accuracy: null, pp: 20 },
  quickAttack: { power: 40 },
  hyperBeam: { power: 150 },
} as const;

const GEN1_SPECIES = {
  bulbasaur: { id: 1, name: "bulbasaur", displayName: "Bulbasaur" },
  ivysaur: { id: 2, name: "ivysaur", displayName: "Ivysaur" },
  venusaur: { id: 3, name: "venusaur", displayName: "Venusaur" },
  charizard: { id: 6, name: "charizard", displayName: "Charizard" },
  pikachu: { id: 25, name: "pikachu", displayName: "Pikachu" },
  gengar: { id: 94, name: "gengar", displayName: "Gengar" },
  snorlax: { id: 143, name: "snorlax", displayName: "Snorlax" },
  mewtwo: { id: 150, name: "mewtwo", displayName: "Mewtwo" },
  mew: { id: 151, name: "mew", displayName: "Mew" },
  eevee: { id: 133, name: "eevee", displayName: "Eevee" },
  vaporeon: { id: 134, name: "vaporeon", displayName: "Vaporeon" },
  jolteon: { id: 135, name: "jolteon", displayName: "Jolteon" },
  flareon: { id: 136, name: "flareon", displayName: "Flareon" },
} as const;

const GEN1_MOVES = {
  flamethrower: "flamethrower",
  tackle: "tackle",
  scratch: "scratch",
  growl: "growl",
  leechSeed: "leech-seed",
  vineWhip: "vine-whip",
  poisonPowder: "poison-powder",
  razorLeaf: "razor-leaf",
  growth: "growth",
  sleepPowder: "sleep-powder",
  solarBeam: "solar-beam",
  ember: "ember",
  leer: "leer",
  rage: "rage",
  slash: "slash",
  fireSpin: "fire-spin",
  earthquake: "earthquake",
  thunderbolt: "thunderbolt",
  psychic: "psychic",
  swift: "swift",
  quickAttack: "quick-attack",
  counter: "counter",
  hyperBeam: "hyper-beam",
} as const;

const GEN1_BULBASAUR_LEVEL_UP_MOVES = [
  { level: 1, move: GEN1_MOVES.tackle },
  { level: 1, move: GEN1_MOVES.growl },
  { level: 7, move: GEN1_MOVES.leechSeed },
  { level: 13, move: GEN1_MOVES.vineWhip },
  { level: 20, move: GEN1_MOVES.poisonPowder },
  { level: 27, move: GEN1_MOVES.razorLeaf },
  { level: 34, move: GEN1_MOVES.growth },
  { level: 41, move: GEN1_MOVES.sleepPowder },
  { level: 48, move: GEN1_MOVES.solarBeam },
] as const;

const GEN1_CHARIZARD_LEVEL_UP_MOVES = [
  GEN1_MOVES.scratch,
  GEN1_MOVES.growl,
  GEN1_MOVES.ember,
  GEN1_MOVES.leer,
  GEN1_MOVES.rage,
  GEN1_MOVES.slash,
  GEN1_MOVES.flamethrower,
  GEN1_MOVES.fireSpin,
] as const;

const GEN1_TYPE_NAMES = [
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
    const bulbasaur = dm.getSpecies(GEN1_SPECIES.bulbasaur.id);
    // Assert
    expect(bulbasaur.displayName).toBe(GEN1_SPECIES.bulbasaur.displayName);
    expect(bulbasaur.name).toBe(GEN1_SPECIES.bulbasaur.name);
    expect(bulbasaur.types).toEqual(["grass", "poison"]);
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
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const charizard = dm.getSpecies(GEN1_SPECIES.charizard.id);
    // Assert
    expect(charizard.displayName).toBe(GEN1_SPECIES.charizard.displayName);
    expect(charizard.types).toEqual(["fire", "flying"]);
    expect(charizard.baseStats).toEqual({
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 109,
      spDefense: 109, // Same as spAttack in Gen 1 (unified Special)
      speed: 100,
    });
  });

  it("given Gen 1 data, when loading Pikachu, then has correct base stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const pikachu = dm.getSpecies(GEN1_SPECIES.pikachu.id);
    // Assert
    expect(pikachu.displayName).toBe(GEN1_SPECIES.pikachu.displayName);
    expect(pikachu.types).toEqual(["electric"]);
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
    const mewtwo = dm.getSpecies(GEN1_SPECIES.mewtwo.id);
    // Assert
    expect(mewtwo.displayName).toBe(GEN1_SPECIES.mewtwo.displayName);
    expect(mewtwo.isLegendary).toBe(true);
    expect(mewtwo.isMythical).toBe(false);
    expect(mewtwo.types).toEqual(["psychic"]);
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
    const mew = dm.getSpecies(GEN1_SPECIES.mew.id);
    // Assert
    expect(mew.displayName).toBe(GEN1_SPECIES.mew.displayName);
    expect(mew.isMythical).toBe(true);
    expect(mew.isLegendary).toBe(false);
    expect(mew.types).toEqual(["psychic"]);
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
    const gengar = dm.getSpecies(GEN1_SPECIES.gengar.id);
    // Assert
    expect(gengar.displayName).toBe(GEN1_SPECIES.gengar.displayName);
    expect(gengar.types).toEqual(["ghost", "poison"]);
  });

  it("given Gen 1 data, when loading Snorlax, then has correct stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const snorlax = dm.getSpecies(GEN1_SPECIES.snorlax.id);
    // Assert
    expect(snorlax.displayName).toBe(GEN1_SPECIES.snorlax.displayName);
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
    const bulbasaur = dm.getSpeciesByName(GEN1_SPECIES.bulbasaur.name);
    // Assert
    expect(bulbasaur.id).toBe(GEN1_SPECIES.bulbasaur.id);
    expect(bulbasaur.displayName).toBe(GEN1_SPECIES.bulbasaur.displayName);
  });

  it("given Gen 1 data, when loading species by name with different case, then still finds it", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const pikachu = dm.getSpeciesByName(GEN1_SPECIES.pikachu.displayName);
    // Assert
    expect(pikachu.id).toBe(GEN1_SPECIES.pikachu.id);
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
    const bulbasaur = dm.getSpecies(GEN1_SPECIES.bulbasaur.id);
    // Assert
    expect(bulbasaur.evolution).not.toBeNull();
    expect(bulbasaur.evolution?.from).toBeNull(); // Base form
    expect(bulbasaur.evolution?.to).toHaveLength(1);
    expect(bulbasaur.evolution?.to[0]?.speciesId).toBe(GEN1_SPECIES.ivysaur.id); // Ivysaur
    expect(bulbasaur.evolution?.to[0]?.level).toBe(GEN1_EVOLUTION_LEVELS.bulbasaurToIvysaur);
    expect(bulbasaur.evolution?.to[0]?.method).toBe("level-up");
  });

  it("given Gen 1 data, when loaded, then Ivysaur evolves from Bulbasaur and to Venusaur", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const ivysaur = dm.getSpecies(GEN1_SPECIES.ivysaur.id);
    // Assert
    expect(ivysaur.evolution).not.toBeNull();
    expect(ivysaur.evolution?.from).not.toBeNull();
    expect(ivysaur.evolution?.from?.speciesId).toBe(GEN1_SPECIES.bulbasaur.id); // From Bulbasaur
    expect(ivysaur.evolution?.to[0]?.speciesId).toBe(GEN1_SPECIES.venusaur.id); // To Venusaur
    expect(ivysaur.evolution?.to[0]?.level).toBe(GEN1_EVOLUTION_LEVELS.ivysaurToVenusaur);
  });

  it("given Gen 1 data, when loaded, then Eevee has multiple evolution paths", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const eevee = dm.getSpecies(GEN1_SPECIES.eevee.id);
    // Assert
    expect(eevee.evolution).not.toBeNull();
    // Gen 1 Eevee can evolve into Vaporeon (134), Jolteon (135), Flareon (136)
    const targetIds = eevee.evolution?.to.map((e) => e.speciesId);
    expect(targetIds).toEqual([
      GEN1_SPECIES.vaporeon.id,
      GEN1_SPECIES.jolteon.id,
      GEN1_SPECIES.flareon.id,
    ]);
  });

  // --- Moves Data ---

  it("given Gen 1 data, when loaded, then contains 164 moves", () => {
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
    const flamethrower = dm.getMove(GEN1_MOVES.flamethrower);
    // Assert: In Gen 1, Fire-type moves are Special
    expect(flamethrower.type).toBe("fire");
    expect(flamethrower.category).toBe("special");
    expect(flamethrower.power).toBe(GEN1_MOVE_STATS.flamethrower.power);
    expect(flamethrower.accuracy).toBe(GEN1_MOVE_STATS.flamethrower.accuracy);
  });

  it("given Gen 1 data, when loading Tackle, then is physical category normal type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const tackle = dm.getMove(GEN1_MOVES.tackle);
    // Assert: In Gen 1, Normal-type moves are Physical
    expect(tackle.type).toBe("normal");
    expect(tackle.category).toBe("physical");
    expect(tackle.power).toBe(GEN1_MOVE_STATS.tackle.power);
  });

  it("given Gen 1 data, when loading Earthquake, then is physical ground type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const earthquake = dm.getMove(GEN1_MOVES.earthquake);
    // Assert
    expect(earthquake.type).toBe("ground");
    expect(earthquake.category).toBe("physical");
    expect(earthquake.power).toBe(GEN1_MOVE_STATS.earthquake.power);
    expect(earthquake.accuracy).toBe(GEN1_MOVE_STATS.earthquake.accuracy);
  });

  it("given Gen 1 data, when loading Thunderbolt, then is special electric type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const thunderbolt = dm.getMove(GEN1_MOVES.thunderbolt);
    // Assert
    expect(thunderbolt.type).toBe("electric");
    expect(thunderbolt.category).toBe("special");
    expect(thunderbolt.power).toBe(GEN1_MOVE_STATS.thunderbolt.power);
  });

  it("given Gen 1 data, when loading Psychic, then is special psychic type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const psychic = dm.getMove(GEN1_MOVES.psychic);
    // Assert
    expect(psychic.type).toBe("psychic");
    expect(psychic.category).toBe("special");
    expect(psychic.power).toBe(GEN1_MOVE_STATS.psychic.power);
  });

  it("given Gen 1 data, when loading Swift, then has null accuracy (never misses)", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const swift = dm.getMove(GEN1_MOVES.swift);
    // Assert
    expect(swift.type).toBe("normal");
    expect(swift.category).toBe("physical");
    expect(swift.power).toBe(GEN1_MOVE_STATS.swift.power);
    expect(swift.accuracy).toBeNull();
    expect(swift.pp).toBe(GEN1_MOVE_STATS.swift.pp);
    expect(swift.target).toBe("all-adjacent-foes");
    expect(swift.flags.recharge).toBe(false);
    expect(swift.description).toContain("never misses");
  });

  it("given Gen 1 data, when loading Quick Attack, then has priority 1", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const quickAttack = dm.getMove(GEN1_MOVES.quickAttack);
    // Assert
    expect(quickAttack.priority).toBe(1);
    expect(quickAttack.type).toBe("normal");
    expect(quickAttack.category).toBe("physical");
    expect(quickAttack.power).toBe(GEN1_MOVE_STATS.quickAttack.power);
  });

  it("given Gen 1 data, when loading Counter, then has negative priority", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const counter = dm.getMove(GEN1_MOVES.counter);
    // Assert
    expect(counter.priority).toBeLessThan(0);
  });

  it("given Gen 1 data, when loading Hyper Beam, then has recharge flag", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const hyperBeam = dm.getMove(GEN1_MOVES.hyperBeam);
    // Assert
    expect(hyperBeam.flags.recharge).toBe(true);
    expect(hyperBeam.power).toBe(GEN1_MOVE_STATS.hyperBeam.power);
    expect(hyperBeam.type).toBe("normal");
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
    const bulbasaur = dm.getSpecies(GEN1_SPECIES.bulbasaur.id);
    // Assert
    expect(bulbasaur.learnset.levelUp).toEqual(GEN1_BULBASAUR_LEVEL_UP_MOVES);
  });

  it("given Gen 1 data, when loading Charizard, then learns Fire-type moves", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const charizard = dm.getSpecies(GEN1_SPECIES.charizard.id);
    const moveIds = charizard.learnset.levelUp.map((m) => m.move);
    // Assert: exact Gen 1 level-up learnset order for Charizard from the fixture data
    expect(moveIds).toEqual(GEN1_CHARIZARD_LEVEL_UP_MOVES);
  });

  // --- Data Manager State ---

  it("given Gen 1 data manager, when created, then reports as loaded", () => {
    // Arrange / Act
    const dm = createGen1DataManager();
    // Assert
    expect(dm.isLoaded()).toBe(true);
  });
});
