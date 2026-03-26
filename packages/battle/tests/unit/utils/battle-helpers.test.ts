import type { PokemonType } from "@pokemon-lib-ts/core";
import { CORE_GENDERS, CORE_MOVE_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createDefaultStatStages,
  createOnFieldPokemon,
  createPokemonSnapshot,
  createTestPokemon,
  getPokemonName,
} from "../../../src/utils";

describe("BattleHelpers", () => {
  const fireFlyingTypes: PokemonType[] = [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying];
  const fireMonotype: PokemonType[] = [CORE_TYPE_IDS.fire];

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
      // Source: Battle helper default fixture coverage uses a Charizard-style species/level pair.
      const speciesId = 6;
      const level = 50;
      const expectedCurrentHp = 200;
      const pokemon = createTestPokemon(speciesId, level);

      // Assert
      expect(pokemon.speciesId).toBe(speciesId);
      expect(pokemon.level).toBe(level);
      expect(pokemon.currentHp).toBe(expectedCurrentHp);
      expect(pokemon.moves).toHaveLength(1);
      expect(pokemon.moves[0]?.moveId).toBe(CORE_MOVE_IDS.tackle);
    });

    it("given repeated calls with the same species and level, when createTestPokemon is called, then each Pokemon has a unique uid", () => {
      // Act
      const firstPokemon = createTestPokemon(6, 50);
      const secondPokemon = createTestPokemon(6, 50);

      // Assert
      expect(firstPokemon.uid).not.toBe(secondPokemon.uid);
      expect(firstPokemon.uid).toMatch(/^test-6-50-\d+$/);
      expect(secondPokemon.uid).toMatch(/^test-6-50-\d+$/);
    });

    it("given overrides, when createTestPokemon is called, then overrides are applied", () => {
      // Act
      // Source: the override fixture intentionally uses a level-30 Pokemon to verify replacement values.
      const overriddenSpeciesId = 25;
      const overriddenLevel = 30;
      const overriddenCurrentHp = 100;
      const pokemon = createTestPokemon(overriddenSpeciesId, overriddenLevel, {
        nickname: "Sparky",
        currentHp: overriddenCurrentHp,
      });

      // Assert
      expect(pokemon.nickname).toBe("Sparky");
      expect(pokemon.currentHp).toBe(overriddenCurrentHp);
      expect(pokemon.level).toBe(overriddenLevel);
    });
  });

  describe("createOnFieldPokemon", () => {
    it("given a PokemonInstance, when createOnFieldPokemon is called, then an ActivePokemon wrapper is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);

      // Act
      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      // Assert
      expect(active.pokemon).toBe(pokemon);
      expect(active.teamSlot).toBe(0);
      expect(active.types).toEqual(fireFlyingTypes);
      expect(active.statStages.attack).toBe(0);
      expect(active.volatileStatuses.size).toBe(0);
      expect(active.turnsOnField).toBe(0);
      expect(active.isMega).toBe(false);
      expect(active.isDynamaxed).toBe(false);
      expect(active.isTerastallized).toBe(false);
      expect(active.stellarBoostedTypes).toEqual([]);
    });

    it("given a caller-owned base types array, when createOnFieldPokemon is called, then the ActivePokemon gets its own copy", () => {
      const pokemon = createTestPokemon(6, 50);
      const types: PokemonType[] = [...fireFlyingTypes];

      const active = createOnFieldPokemon(pokemon, 0, types);

      expect(active.types).toEqual(fireFlyingTypes);
      expect(active.types).not.toBe(types);

      active.types[0] = "water";

      expect(types).toEqual(fireFlyingTypes);
      expect(active.types).toEqual([CORE_TYPE_IDS.water, CORE_TYPE_IDS.flying]);
    });
  });

  describe("createPokemonSnapshot", () => {
    it("given an ActivePokemon, when createPokemonSnapshot is called, then public info is extracted", () => {
      // Arrange
      // Source: the snapshot fixture mirrors the same level-50 Charizard-style test Pokemon used elsewhere.
      const speciesId = 6;
      const level = 50;
      const currentHp = 150;
      const maxHp = 200;
      const pokemon = createTestPokemon(speciesId, level, {
        nickname: "Char",
        currentHp,
        calculatedStats: {
          hp: maxHp,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      // Act
      const snapshot = createPokemonSnapshot(active);

      // Assert
      expect(snapshot.speciesId).toBe(speciesId);
      expect(snapshot.nickname).toBe("Char");
      expect(snapshot.level).toBe(level);
      expect(snapshot.currentHp).toBe(currentHp);
      expect(snapshot.maxHp).toBe(maxHp);
      expect(snapshot.status).toBeNull();
      expect(snapshot.gender).toBe(CORE_GENDERS.male);
      expect(snapshot.isShiny).toBe(false);
    });
  });

  describe("getPokemonName", () => {
    it("given a pokemon with a nickname, when getPokemonName is called, then nickname is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { nickname: "Char" });
      const active = createOnFieldPokemon(pokemon, 0, fireMonotype);

      // Act
      const name = getPokemonName(active);

      // Assert
      expect(name).toBe("Char");
    });

    it("given a pokemon without a nickname, when getPokemonName is called, then species-based fallback is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { nickname: null });
      const active = createOnFieldPokemon(pokemon, 0, fireMonotype);

      // Act
      const name = getPokemonName(active);

      // Assert
      expect(name).toBe("Pokemon #6");
    });
  });
});
