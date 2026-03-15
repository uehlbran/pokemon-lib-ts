import { describe, expect, it } from "vitest";
import { createGen2DataManager } from "../src/data";

describe("Gen 2 Data Loading", () => {
  // --- Species Data ---

  describe("Given createGen2DataManager", () => {
    it("should load 251 Pokemon species", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allSpecies = dm.getAllSpecies();
      // Assert
      expect(allSpecies.length).toBe(251);
    });

    it("should have correct Alakazam stats (spAttack !== spDefense)", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const alakazam = dm.getSpecies(65);
      // Assert: Gen 2 split the Special stat — spAttack and spDefense differ
      expect(alakazam.displayName).toBe("Alakazam");
      expect(alakazam.baseStats.spAttack).toBe(135);
      expect(alakazam.baseStats.spDefense).toBe(85);
      expect(alakazam.baseStats.spAttack).not.toBe(alakazam.baseStats.spDefense);
    });

    it("should have correct Tyranitar stats", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const tyranitar = dm.getSpecies(248);
      // Assert
      expect(tyranitar.displayName).toBe("Tyranitar");
      expect(tyranitar.baseStats).toEqual({
        hp: 100,
        attack: 134,
        defense: 110,
        spAttack: 95,
        spDefense: 100,
        speed: 61,
      });
    });

    it("should have Pikachu with speed 90", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const pikachu = dm.getSpecies(25);
      // Assert
      expect(pikachu.displayName).toBe("Pikachu");
      expect(pikachu.baseStats.speed).toBe(90);
    });

    it("should load moves with Bite as dark type", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const bite = dm.getMove("bite");
      // Assert: Bite was reclassified from Normal to Dark in Gen 2
      expect(bite.type).toBe("dark");
      expect(bite.power).toBe(60);
    });

    it("should load 17-type chart", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const chart = dm.getTypeChart();
      const types = Object.keys(chart);
      // Assert
      expect(types.length).toBe(17);
    });

    it("should load items", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allItems = dm.getAllItems();
      // Assert: Gen 2 has held items (unlike Gen 1's empty array)
      expect(allItems.length).toBeGreaterThan(0);
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

    it("should have no Fairy type references", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const chart = dm.getTypeChart();
      const types = Object.keys(chart);
      // Assert: Fairy was added in Gen 6, not Gen 2
      expect(types).not.toContain("fairy");
    });

    // --- Additional data integrity tests ---

    it("should have all species with ids from 1 to 251", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allSpecies = dm.getAllSpecies();
      const ids = allSpecies.map((s) => s.id).sort((a, b) => a - b);
      // Assert
      expect(ids[0]).toBe(1);
      expect(ids[ids.length - 1]).toBe(251);
      // Verify continuous range
      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(i + 1);
      }
    });

    it("should have natures list empty (no natures in Gen 2)", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const allNatures = dm.getAllNatures();
      // Assert
      expect(allNatures.length).toBe(0);
    });

    it("should have Celebi as species 251", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const celebi = dm.getSpecies(251);
      // Assert
      expect(celebi.displayName).toBe("Celebi");
      expect(celebi.types).toContain("psychic");
      expect(celebi.types).toContain("grass");
    });

    it("should have data manager report as loaded", () => {
      // Arrange / Act
      const dm = createGen2DataManager();
      // Assert
      expect(dm.isLoaded()).toBe(true);
    });

    it("given moves.json data, when high-jump-kick/jump-kick are loaded, then they have crash effect with 0.125 amount", () => {
      // Arrange
      const dm = createGen2DataManager();

      // Act
      const highJumpKick = dm.getMove("high-jump-kick");
      const jumpKick = dm.getMove("jump-kick");

      // Assert
      expect(highJumpKick.effect).toBeDefined();
      expect((highJumpKick.effect as { type: string; amount: number }).type).toBe("crash");
      expect((highJumpKick.effect as { type: string; amount: number }).amount).toBe(0.125);

      expect(jumpKick.effect).toBeDefined();
      expect((jumpKick.effect as { type: string; amount: number }).type).toBe("crash");
      expect((jumpKick.effect as { type: string; amount: number }).amount).toBe(0.125);
    });

    it("should throw for non-existent species", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act / Assert
      expect(() => dm.getSpecies(999)).toThrow();
    });

    it("should have Pikachu with spDefense 40 (not same as spAttack 50)", () => {
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const pikachu = dm.getSpecies(25);
      // Assert: Gen 2 split Special — Pikachu's spAttack and spDefense differ
      expect(pikachu.baseStats.spAttack).toBe(50);
      expect(pikachu.baseStats.spDefense).toBe(40);
    });
  });
});
