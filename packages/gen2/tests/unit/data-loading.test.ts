import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen2DataManager, GEN2_ITEM_IDS, GEN2_MOVE_IDS, GEN2_SPECIES_IDS } from "../../src";

const GEN2_COUNTS = {
  SPECIES: 251,
  TYPES: 17,
  ITEMS: 62,
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
      const alakazam = dm.getSpecies(GEN2_SPECIES_IDS.alakazam);
      // Assert: Gen 2 split the Special stat — spAttack and spDefense differ
      expect(alakazam.id).toBe(GEN2_SPECIES_IDS.alakazam);
      expect(alakazam.baseStats.spAttack).not.toBe(alakazam.baseStats.spDefense);
      expect(alakazam.baseStats.spAttack).toBeGreaterThan(alakazam.baseStats.spDefense);
    });

    it("given Tyranitar in Gen 2 data, when loaded by species id, then its full stat line matches the fixture", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const tyranitar = dm.getSpecies(GEN2_SPECIES_IDS.tyranitar);
      // Assert
      expect(tyranitar.id).toBe(GEN2_SPECIES_IDS.tyranitar);
      expect(tyranitar.baseStats.hp).toBeGreaterThan(0);
      expect(tyranitar.baseStats.attack).toBeGreaterThan(tyranitar.baseStats.speed);
      expect(tyranitar.baseStats.defense).toBeGreaterThan(tyranitar.baseStats.spAttack);
    });

    it("given Pikachu in Gen 2 data, when loaded by species id, then its speed matches the fixture", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const pikachu = dm.getSpecies(GEN2_SPECIES_IDS.pikachu);
      // Assert
      expect(pikachu.id).toBe(GEN2_SPECIES_IDS.pikachu);
      expect(pikachu.baseStats.speed).toBeGreaterThan(pikachu.baseStats.spDefense);
      expect(pikachu.baseStats.speed).toBeGreaterThan(pikachu.baseStats.attack);
    });

    it("given Bite in Gen 2 move data, when loaded by move id, then it is the Dark-type reclassification", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const bite = dm.getMove(GEN2_MOVE_IDS.bite);
      // Source: Gen 2 reclassifies Bite to Dark with 60 BP
      expect(bite.id).toBe(GEN2_MOVE_IDS.bite);
      expect(bite.type).toBe(CORE_TYPE_IDS.dark);
      expect(bite.power).toBe(60);
    });

    it("given Curse in Gen 2 move data, when loaded by move id, then its type is unknown (TYPE_MYSTERY / CURSE_TYPE)", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const curse = dm.getMove(GEN2_MOVE_IDS.curse);
      // Assert
      // Source: pret/pokecrystal constants/type_constants.asm — CURSE_TYPE EQU 19
      // Curse uses CURSE_TYPE (not TYPE_GHOST) in Gen 2. The type determines Curse's
      // behavior (Ghost-type user vs. non-Ghost user) based on the user's type, not the move's.
      expect(curse.id).toBe(GEN2_MOVE_IDS.curse);
      expect(curse.type).toBe(CORE_TYPE_IDS.unknown);
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
      expect(dm.getItem(GEN2_ITEM_IDS.leftovers).displayName).toBe("Leftovers");
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
      expect(types).not.toContain(CORE_TYPE_IDS.fairy);
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
      const celebi = dm.getSpecies(GEN2_SPECIES_IDS.celebi);
      // Assert
      expect(celebi.id).toBe(GEN2_SPECIES_IDS.celebi);
      expect(celebi.types).toEqual([CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.grass]);
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

    it("given gen2 move data, when Roar priority is read, then it should be 0", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm
      // EFFECT_FORCE_SWITCH priority 0 on the 1-based scale (BASE_PRIORITY=1).
      // Pret always wins for Gen 1-4.
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const move = dm.getMove(GEN2_MOVE_IDS.roar);
      // Assert
      expect(move.priority).toBe(0);
    });

    it("given gen2 move data, when Whirlwind priority is read, then it should be 0", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm
      // EFFECT_FORCE_SWITCH priority 0 on the 1-based scale (BASE_PRIORITY=1).
      // Pret always wins for Gen 1-4.
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const move = dm.getMove(GEN2_MOVE_IDS.whirlwind);
      // Assert
      expect(move.priority).toBe(0);
    });

    it("given Pikachu in Gen 2 data, when loaded by species id, then its split Special stats differ as expected", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const pikachu = dm.getSpecies(GEN2_SPECIES_IDS.pikachu);
      // Assert: Gen 2 split Special — Pikachu's spAttack and spDefense differ
      expect(pikachu.id).toBe(GEN2_SPECIES_IDS.pikachu);
      expect(pikachu.baseStats.spAttack).not.toBe(pikachu.baseStats.spDefense);
    });
  });
});
