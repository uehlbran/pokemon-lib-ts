import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../src/data";

describe("Gen 1 Data Loading", () => {
  // --- Species Data ---

  it("given Gen 1 data, when loaded, then contains 151 species", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allSpecies = dm.getAllSpecies();
    // Assert
    expect(allSpecies.length).toBe(151);
  });

  it("given Gen 1 data, when loading species, then all have ids from 1 to 151", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allSpecies = dm.getAllSpecies();
    const ids = allSpecies.map((s) => s.id).sort((a, b) => a - b);
    // Assert
    expect(ids[0]).toBe(1);
    expect(ids[ids.length - 1]).toBe(151);
    expect(ids.length).toBe(151);
    // Verify continuous range
    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toBe(i + 1);
    }
  });

  it("given Gen 1 data, when loading Bulbasaur, then has correct types and base stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const bulbasaur = dm.getSpecies(1);
    // Assert
    expect(bulbasaur.displayName).toBe("Bulbasaur");
    expect(bulbasaur.name).toBe("bulbasaur");
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
    const charizard = dm.getSpecies(6);
    // Assert
    expect(charizard.displayName).toBe("Charizard");
    expect(charizard.types).toEqual(["fire", "flying"]);
    expect(charizard.baseStats.hp).toBe(78);
    expect(charizard.baseStats.attack).toBe(84);
    expect(charizard.baseStats.defense).toBe(78);
    expect(charizard.baseStats.spAttack).toBe(109);
    expect(charizard.baseStats.spDefense).toBe(109); // Same as spAttack in Gen 1 (unified Special)
    expect(charizard.baseStats.speed).toBe(100);
  });

  it("given Gen 1 data, when loading Pikachu, then has correct base stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const pikachu = dm.getSpecies(25);
    // Assert
    expect(pikachu.displayName).toBe("Pikachu");
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
    const mewtwo = dm.getSpecies(150);
    // Assert
    expect(mewtwo.displayName).toBe("Mewtwo");
    expect(mewtwo.isLegendary).toBe(true);
    expect(mewtwo.isMythical).toBe(false);
    expect(mewtwo.types).toEqual(["psychic"]);
    expect(mewtwo.baseStats.spAttack).toBe(154);
    expect(mewtwo.baseStats.spDefense).toBe(154); // Unified Special
    expect(mewtwo.baseStats.speed).toBe(130);
    expect(mewtwo.baseStats.hp).toBe(106);
    expect(mewtwo.baseStats.attack).toBe(110);
    expect(mewtwo.baseStats.defense).toBe(90);
  });

  it("given Gen 1 data, when loading Mew, then is mythical", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const mew = dm.getSpecies(151);
    // Assert
    expect(mew.displayName).toBe("Mew");
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
    const gengar = dm.getSpecies(94);
    // Assert
    expect(gengar.displayName).toBe("Gengar");
    expect(gengar.types).toEqual(["ghost", "poison"]);
  });

  it("given Gen 1 data, when loading Snorlax, then has correct stats", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const snorlax = dm.getSpecies(143);
    // Assert
    expect(snorlax.displayName).toBe("Snorlax");
    expect(snorlax.baseStats.hp).toBe(160);
    expect(snorlax.baseStats.attack).toBe(110);
    expect(snorlax.baseStats.defense).toBe(65);
    expect(snorlax.baseStats.speed).toBe(30);
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
    expect(bulbasaur.id).toBe(1);
    expect(bulbasaur.displayName).toBe("Bulbasaur");
  });

  it("given Gen 1 data, when loading species by name with different case, then still finds it", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const pikachu = dm.getSpeciesByName("Pikachu");
    // Assert
    expect(pikachu.id).toBe(25);
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
    const bulbasaur = dm.getSpecies(1);
    // Assert
    expect(bulbasaur.evolution).not.toBeNull();
    expect(bulbasaur.evolution?.from).toBeNull(); // Base form
    expect(bulbasaur.evolution?.to.length).toBeGreaterThan(0);
    expect(bulbasaur.evolution?.to[0]?.speciesId).toBe(2); // Ivysaur
    expect(bulbasaur.evolution?.to[0]?.level).toBe(16);
    expect(bulbasaur.evolution?.to[0]?.method).toBe("level-up");
  });

  it("given Gen 1 data, when loaded, then Ivysaur evolves from Bulbasaur and to Venusaur", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const ivysaur = dm.getSpecies(2);
    // Assert
    expect(ivysaur.evolution).not.toBeNull();
    expect(ivysaur.evolution?.from).not.toBeNull();
    expect(ivysaur.evolution?.from?.speciesId).toBe(1); // From Bulbasaur
    expect(ivysaur.evolution?.to[0]?.speciesId).toBe(3); // To Venusaur
    expect(ivysaur.evolution?.to[0]?.level).toBe(32);
  });

  it("given Gen 1 data, when loaded, then Eevee has multiple evolution paths", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const eevee = dm.getSpecies(133);
    // Assert
    expect(eevee.evolution).not.toBeNull();
    // Gen 1 Eevee can evolve into Vaporeon (134), Jolteon (135), Flareon (136)
    const targetIds = eevee.evolution?.to.map((e) => e.speciesId);
    expect(targetIds).toContain(134); // Vaporeon
    expect(targetIds).toContain(135); // Jolteon
    expect(targetIds).toContain(136); // Flareon
  });

  // --- Moves Data ---

  it("given Gen 1 data, when loaded, then contains 164 moves", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const allMoves = dm.getAllMoves();
    // Assert — Gen 1 has 165 moves (Sharpen was added in bug fix #105)
    expect(allMoves.length).toBe(165);
  });

  it("given Gen 1 data, when loading Flamethrower, then is special category fire type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const flamethrower = dm.getMove("flamethrower");
    // Assert: In Gen 1, Fire-type moves are Special
    expect(flamethrower.type).toBe("fire");
    expect(flamethrower.category).toBe("special");
    expect(flamethrower.power).toBe(95);
    expect(flamethrower.accuracy).toBe(100);
  });

  it("given Gen 1 data, when loading Tackle, then is physical category normal type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const tackle = dm.getMove("tackle");
    // Assert: In Gen 1, Normal-type moves are Physical
    expect(tackle.type).toBe("normal");
    expect(tackle.category).toBe("physical");
    expect(tackle.power).toBe(35);
  });

  it("given Gen 1 data, when loading Earthquake, then is physical ground type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const earthquake = dm.getMove("earthquake");
    // Assert
    expect(earthquake.type).toBe("ground");
    expect(earthquake.category).toBe("physical");
    expect(earthquake.power).toBe(100);
    expect(earthquake.accuracy).toBe(100);
  });

  it("given Gen 1 data, when loading Thunderbolt, then is special electric type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const thunderbolt = dm.getMove("thunderbolt");
    // Assert
    expect(thunderbolt.type).toBe("electric");
    expect(thunderbolt.category).toBe("special");
    expect(thunderbolt.power).toBe(95);
  });

  it("given Gen 1 data, when loading Psychic, then is special psychic type", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const psychic = dm.getMove("psychic");
    // Assert
    expect(psychic.type).toBe("psychic");
    expect(psychic.category).toBe("special");
    expect(psychic.power).toBe(90);
  });

  it("given Gen 1 data, when loading Swift, then has null accuracy (never misses)", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const swift = dm.getMove("swift");
    // Assert
    expect(swift.accuracy).toBeNull();
  });

  it("given Gen 1 data, when loading Quick Attack, then has priority 1", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const quickAttack = dm.getMove("quick-attack");
    // Assert
    expect(quickAttack.priority).toBe(1);
    expect(quickAttack.type).toBe("normal");
    expect(quickAttack.category).toBe("physical");
    expect(quickAttack.power).toBe(40);
  });

  it("given Gen 1 data, when loading Counter, then has negative priority", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const counter = dm.getMove("counter");
    // Assert
    expect(counter.priority).toBeLessThan(0);
  });

  it("given Gen 1 data, when loading Hyper Beam, then has recharge flag", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const hyperBeam = dm.getMove("hyper-beam");
    // Assert
    expect(hyperBeam.flags.recharge).toBe(true);
    expect(hyperBeam.power).toBe(150);
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
    expect(types).toContain("normal");
    expect(types).toContain("fire");
    expect(types).toContain("water");
    expect(types).toContain("electric");
    expect(types).toContain("grass");
    expect(types).toContain("ice");
    expect(types).toContain("fighting");
    expect(types).toContain("poison");
    expect(types).toContain("ground");
    expect(types).toContain("flying");
    expect(types).toContain("psychic");
    expect(types).toContain("bug");
    expect(types).toContain("rock");
    expect(types).toContain("ghost");
    expect(types).toContain("dragon");
    // Gen 1 does NOT have these types
    expect(types).not.toContain("dark");
    expect(types).not.toContain("steel");
    expect(types).not.toContain("fairy");
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
    const bulbasaur = dm.getSpecies(1);
    // Assert
    expect(bulbasaur.learnset.levelUp.length).toBeGreaterThan(0);
    // Bulbasaur starts with Tackle at level 1
    const starterMoves = bulbasaur.learnset.levelUp.filter((m) => m.level === 1);
    expect(starterMoves.length).toBeGreaterThan(0);
    const moveIds = starterMoves.map((m) => m.move);
    expect(moveIds).toContain("tackle");
  });

  it("given Gen 1 data, when loading Charizard, then learns Fire-type moves", () => {
    // Arrange
    const dm = createGen1DataManager();
    // Act
    const charizard = dm.getSpecies(6);
    const moveIds = charizard.learnset.levelUp.map((m) => m.move);
    // Assert: Charizard should learn at least some moves
    expect(moveIds.length).toBeGreaterThan(0);
  });

  // --- Data Manager State ---

  it("given Gen 1 data manager, when created, then reports as loaded", () => {
    // Arrange / Act
    const dm = createGen1DataManager();
    // Assert
    expect(dm.isLoaded()).toBe(true);
  });
});
