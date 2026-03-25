import { describe, expect, it } from "vitest";
import { createGen2DataManager } from "../../src/data";

const GEN2_COUNTS = {
  SPECIES: 251,
  TYPES: 17,
  ITEMS: 62,
} as const;

const GEN2_SPECIES = {
  ALAKAZAM: {
    id: 65,
    displayName: "Alakazam",
    baseStats: {
      spAttack: 135,
      spDefense: 85,
    },
  },
  TYRANITAR: {
    id: 248,
    displayName: "Tyranitar",
    baseStats: {
      hp: 100,
      attack: 134,
      defense: 110,
      spAttack: 95,
      spDefense: 100,
      speed: 61,
    },
  },
  PIKACHU: {
    id: 25,
    displayName: "Pikachu",
    baseStats: {
      speed: 90,
      spAttack: 50,
      spDefense: 40,
    },
  },
  CELEBI: {
    id: 251,
    displayName: "Celebi",
    types: ["psychic", "grass"] as const,
  },
} as const;

const GEN2_MOVES = {
  BITE: {
    id: "bite",
    type: "dark",
    power: 60,
  },
} as const;

const GEN2_ITEMS = {
  LEFTOVERS: {
    id: "leftovers",
    displayName: "Leftovers",
  },
} as const;

describe("Gen 2 Data Loading", () => {
  // --- Species Data ---

  describe("Given createGen2DataManager", () => {
    it("given the Gen 2 data manager, when all species are loaded, then it contains the full 251-species Johto dex", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allSpecies = dm.getAllSpecies();
      // Assert
      // Source: Gen 2 Pokedex spans ids 1-251 inclusive.
      expect(allSpecies.length).toBe(GEN2_COUNTS.SPECIES);
    });

    it("given Alakazam in Gen 2 data, when loaded by species id, then its split Special stats match the fixture", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const alakazam = dm.getSpecies(GEN2_SPECIES.ALAKAZAM.id);
      // Assert: Gen 2 split the Special stat — spAttack and spDefense differ
      expect(alakazam.displayName).toBe(GEN2_SPECIES.ALAKAZAM.displayName);
      expect(alakazam.baseStats.spAttack).toBe(GEN2_SPECIES.ALAKAZAM.baseStats.spAttack);
      expect(alakazam.baseStats.spDefense).toBe(GEN2_SPECIES.ALAKAZAM.baseStats.spDefense);
      expect(alakazam.baseStats.spAttack).not.toBe(alakazam.baseStats.spDefense);
    });

    it("given Tyranitar in Gen 2 data, when loaded by species id, then its full stat line matches the fixture", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const tyranitar = dm.getSpecies(GEN2_SPECIES.TYRANITAR.id);
      // Assert
      expect(tyranitar.displayName).toBe(GEN2_SPECIES.TYRANITAR.displayName);
      expect(tyranitar.baseStats).toEqual(GEN2_SPECIES.TYRANITAR.baseStats);
    });

    it("given Pikachu in Gen 2 data, when loaded by species id, then its speed matches the fixture", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const pikachu = dm.getSpecies(GEN2_SPECIES.PIKACHU.id);
      // Assert
      expect(pikachu.displayName).toBe(GEN2_SPECIES.PIKACHU.displayName);
      expect(pikachu.baseStats.speed).toBe(GEN2_SPECIES.PIKACHU.baseStats.speed);
    });

    it("given Bite in Gen 2 move data, when loaded by move id, then it is the Dark-type reclassification", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const bite = dm.getMove(GEN2_MOVES.BITE.id);
      // Assert: Bite was reclassified from Normal to Dark in Gen 2
      expect(bite.type).toBe(GEN2_MOVES.BITE.type);
      expect(bite.power).toBe(GEN2_MOVES.BITE.power);
    });

    it("given the Gen 2 type chart, when loaded, then it exposes the 17 pre-Fairy types", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const chart = dm.getTypeChart();
      const types = Object.keys(chart);
      // Assert
      // Source: Gen 2 introduced Dark and Steel for 17 total types; Fairy arrived in Gen 6.
      expect(types.length).toBe(GEN2_COUNTS.TYPES);
    });

    it("given the Gen 2 item data, when loaded, then it includes the held-item catalog and a known Leftovers fixture", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allItems = dm.getAllItems();
      // Assert: Gen 2 has held items (unlike Gen 1's empty array)
      expect(allItems).toHaveLength(GEN2_COUNTS.ITEMS);
      expect(dm.getItem(GEN2_ITEMS.LEFTOVERS.id).displayName).toBe(GEN2_ITEMS.LEFTOVERS.displayName);
    });

    it("should have Ghost -> Psychic = 2 in type chart", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const chart = dm.getTypeChart();
      const ghostVsPsychic = (chart as Record<string, Record<string, number>>).ghost?.psychic;
      // Assert: Gen 1 bug fixed — Ghost is now super effective against Psychic
      expect(ghostVsPsychic).toBe(2);
    });

    it("given the Gen 2 type chart, when enumerating types, then it contains no Fairy entries", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const chart = dm.getTypeChart();
      const types = Object.keys(chart);
      // Assert: Fairy was added in Gen 6, not Gen 2
      expect(types).not.toContain("fairy");
    });

    // --- Additional data integrity tests ---

    it("given the Gen 2 species list, when ids are sorted, then they cover the continuous 1-251 range", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allSpecies = dm.getAllSpecies();
      const ids = allSpecies.map((s) => s.id).sort((a, b) => a - b);
      // Assert
      expect(ids[0]).toBe(1);
      expect(ids[ids.length - 1]).toBe(GEN2_COUNTS.SPECIES);
      // Verify continuous range
      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(i + 1);
      }
    });

    it("given Gen 2 data, when reading natures, then the list is empty because natures were introduced later", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allNatures = dm.getAllNatures();
      // Assert
      expect(allNatures.length).toBe(0);
    });

    it("given Celebi in Gen 2 data, when loaded by species id, then it matches the expected Mythical grass-psychic fixture", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const celebi = dm.getSpecies(GEN2_SPECIES.CELEBI.id);
      // Assert
      expect(celebi.displayName).toBe(GEN2_SPECIES.CELEBI.displayName);
      expect(celebi.types).toEqual([...GEN2_SPECIES.CELEBI.types]);
    });

    it("given a newly created Gen 2 data manager, when checking its load state, then it reports itself as loaded", () => {
      // Arrange / Act
      const dm = createGen2DataManager();
      // Assert
      expect(dm.isLoaded()).toBe(true);
    });

    it("given an out-of-range species id, when the Gen 2 data manager looks it up, then it throws", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act / Assert
      expect(() => dm.getSpecies(999)).toThrow();
    });

    it("given Pikachu in Gen 2 data, when loaded by species id, then its split Special stats differ as expected", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const pikachu = dm.getSpecies(GEN2_SPECIES.PIKACHU.id);
      // Assert: Gen 2 split Special — Pikachu's spAttack and spDefense differ
      expect(pikachu.baseStats.spAttack).toBe(GEN2_SPECIES.PIKACHU.baseStats.spAttack);
      expect(pikachu.baseStats.spDefense).toBe(GEN2_SPECIES.PIKACHU.baseStats.spDefense);
    });
  });
});
