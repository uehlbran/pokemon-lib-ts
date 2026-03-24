import type { PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createActivePokemon,
  createDefaultStatStages,
  createPokemonSnapshot,
  createTestPokemon,
  getPokemonName,
} from "../../src/utils";

describe("BattleHelpers", () => {
  describe("createDefaultStatStages", () => {
    it("given no arguments, when createDefaultStatStages is called, then all stages are 0", () => {
      // Act
      const stages = createDefaultStatStages();

      // Assert
      expect(stages.hp).toBe(0);
      expect(stages.attack).toBe(0);
      expect(stages.defense).toBe(0);
      expect(stages.spAttack).toBe(0);
      expect(stages.spDefense).toBe(0);
      expect(stages.speed).toBe(0);
      expect(stages.accuracy).toBe(0);
      expect(stages.evasion).toBe(0);
    });
  });

  describe("createTestPokemon", () => {
    it("given speciesId and level, when createTestPokemon is called, then a valid PokemonInstance is returned", () => {
      // Act
      const pokemon = createTestPokemon(6, 50);

      // Assert
      expect(pokemon.speciesId).toBe(6);
      expect(pokemon.level).toBe(50);
      expect(pokemon.currentHp).toBe(200);
      expect(pokemon.moves).toHaveLength(1);
      expect(pokemon.moves[0]?.moveId).toBe("tackle");
    });

    it("given overrides, when createTestPokemon is called, then overrides are applied", () => {
      // Act
      const pokemon = createTestPokemon(25, 30, {
        nickname: "Sparky",
        currentHp: 100,
      });

      // Assert
      expect(pokemon.nickname).toBe("Sparky");
      expect(pokemon.currentHp).toBe(100);
      expect(pokemon.level).toBe(30);
    });
  });

  describe("createActivePokemon", () => {
    it("given a PokemonInstance, when createActivePokemon is called, then an ActivePokemon wrapper is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);

      // Act
      const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);

      // Assert
      expect(active.pokemon).toBe(pokemon);
      expect(active.teamSlot).toBe(0);
      expect(active.types).toEqual(["fire", "flying"]);
      expect(active.statStages.attack).toBe(0);
      expect(active.volatileStatuses.size).toBe(0);
      expect(active.turnsOnField).toBe(0);
      expect(active.isMega).toBe(false);
      expect(active.isDynamaxed).toBe(false);
      expect(active.isTerastallized).toBe(false);
      expect(active.stellarBoostedTypes).toEqual([]);
    });

    it("given a caller-owned types array, when createActivePokemon is called, then the ActivePokemon gets its own copy", () => {
      const pokemon = createTestPokemon(6, 50);
      const types: PokemonType[] = ["fire", "flying"];

      const active = createActivePokemon(pokemon, 0, types);

      expect(active.types).toEqual(["fire", "flying"]);
      expect(active.types).not.toBe(types);

      active.types[0] = "water";

      expect(types).toEqual(["fire", "flying"]);
      expect(active.types).toEqual(["water", "flying"]);
    });
  });

  describe("createPokemonSnapshot", () => {
    it("given an ActivePokemon, when createPokemonSnapshot is called, then public info is extracted", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        nickname: "Char",
        currentHp: 150,
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);

      // Act
      const snapshot = createPokemonSnapshot(active);

      // Assert
      expect(snapshot.speciesId).toBe(6);
      expect(snapshot.nickname).toBe("Char");
      expect(snapshot.level).toBe(50);
      expect(snapshot.currentHp).toBe(150);
      expect(snapshot.maxHp).toBe(200);
      expect(snapshot.status).toBeNull();
      expect(snapshot.gender).toBe("male");
      expect(snapshot.isShiny).toBe(false);
    });
  });

  describe("getPokemonName", () => {
    it("given a pokemon with a nickname, when getPokemonName is called, then nickname is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { nickname: "Char" });
      const active = createActivePokemon(pokemon, 0, ["fire"]);

      // Act
      const name = getPokemonName(active);

      // Assert
      expect(name).toBe("Char");
    });

    it("given a pokemon without a nickname, when getPokemonName is called, then species-based fallback is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { nickname: null });
      const active = createActivePokemon(pokemon, 0, ["fire"]);

      // Act
      const name = getPokemonName(active);

      // Assert
      expect(name).toBe("Pokemon #6");
    });
  });
});
