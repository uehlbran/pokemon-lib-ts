import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen2WeatherEffects,
  getWeatherDamageModifier,
  isWeatherImmune,
} from "../src/Gen2Weather";

/**
 * Helper to create a minimal ActivePokemon for weather tests.
 */
function createMockActivePokemon(
  overrides: {
    types?: PokemonType[];
    currentHp?: number;
    maxHp?: number;
    uid?: string;
    nickname?: string | null;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      uid: overrides.uid ?? "test-pokemon",
      speciesId: 1,
      nickname: overrides.nickname ?? null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? maxHp,
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
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? ["normal"],
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as unknown as ActivePokemon;
}

/**
 * Helper to create a minimal BattleState for weather tests.
 */
function createMockBattleState(
  overrides: {
    weather?: { type: string; turnsLeft: number; source: string } | null;
    sides?: [unknown, unknown];
  } = {},
): BattleState {
  const defaultSide = (index: 0 | 1) => ({
    index,
    trainer: null,
    team: [],
    active: [createMockActivePokemon()],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  });

  return {
    phase: "TURN_END",
    generation: 2,
    format: "singles",
    turnNumber: 1,
    sides: (overrides.sides ?? [defaultSide(0), defaultSide(1)]) as [never, never],
    weather: (overrides.weather as never) ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0.5,
      int: () => 1,
      chance: () => false,
      pick: () => null,
      shuffle: () => [],
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

/**
 * Gen 2 Weather Tests
 *
 * Three weather types, all 5 turns duration:
 *
 * Rain Dance: Water 1.5x, Fire 0.5x
 * Sunny Day: Fire 1.5x, Water 0.5x
 * Sandstorm: 1/8 max HP damage per turn (not Rock/Ground/Steel)
 *   - NO SpDef boost (that's Gen 4+)
 */
describe("Gen2Weather", () => {
  describe("Given Rain weather", () => {
    it("should boost Water moves by 1.5x", () => {
      // Arrange
      const moveType: PokemonType = "water";

      // Act
      const modifier = getWeatherDamageModifier(moveType, "rain");

      // Assert
      expect(modifier).toBe(1.5);
    });

    it("should weaken Fire moves by 0.5x", () => {
      // Arrange
      const moveType: PokemonType = "fire";

      // Act
      const modifier = getWeatherDamageModifier(moveType, "rain");

      // Assert
      expect(modifier).toBe(0.5);
    });

    it("should not affect other types", () => {
      // Arrange / Act / Assert
      const otherTypes: PokemonType[] = [
        "normal",
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
        "dark",
        "steel",
      ];

      for (const type of otherTypes) {
        expect(getWeatherDamageModifier(type, "rain")).toBe(1);
      }
    });
  });

  describe("Given Sun weather", () => {
    it("should boost Fire moves by 1.5x", () => {
      // Arrange
      const moveType: PokemonType = "fire";

      // Act
      const modifier = getWeatherDamageModifier(moveType, "sun");

      // Assert
      expect(modifier).toBe(1.5);
    });

    it("should weaken Water moves by 0.5x", () => {
      // Arrange
      const moveType: PokemonType = "water";

      // Act
      const modifier = getWeatherDamageModifier(moveType, "sun");

      // Assert
      expect(modifier).toBe(0.5);
    });

    it("should not affect other types", () => {
      // Arrange / Act / Assert
      const otherTypes: PokemonType[] = [
        "normal",
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
        "dark",
        "steel",
      ];

      for (const type of otherTypes) {
        expect(getWeatherDamageModifier(type, "sun")).toBe(1);
      }
    });
  });

  describe("Given Sandstorm", () => {
    it("should deal 1/8 max HP to non-Rock/Ground/Steel", () => {
      // Arrange
      const normalPokemon = createMockActivePokemon({ types: ["normal"], maxHp: 200, uid: "p1" });
      const side0 = {
        index: 0,
        trainer: null,
        team: [],
        active: [normalPokemon],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const side1 = {
        index: 1,
        trainer: null,
        team: [],
        active: [createMockActivePokemon({ types: ["normal"], maxHp: 200, uid: "p2" })],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const state = createMockBattleState({
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert — 1/8 of 200 = 25
      expect(results.length).toBe(2);
      expect(results[0]?.damage).toBe(25);
      expect(results[1]?.damage).toBe(25);
    });

    it("should not damage Rock types", () => {
      // Arrange
      const rockPokemon = createMockActivePokemon({ types: ["rock"], maxHp: 200, uid: "rock-mon" });

      // Act
      const immune = isWeatherImmune(rockPokemon.types, "sand");

      // Assert
      expect(immune).toBe(true);
    });

    it("should not damage Ground types", () => {
      // Arrange
      const groundPokemon = createMockActivePokemon({ types: ["ground"], maxHp: 200 });

      // Act
      const immune = isWeatherImmune(groundPokemon.types, "sand");

      // Assert
      expect(immune).toBe(true);
    });

    it("should not damage Steel types", () => {
      // Arrange
      const steelPokemon = createMockActivePokemon({ types: ["steel"], maxHp: 200 });

      // Act
      const immune = isWeatherImmune(steelPokemon.types, "sand");

      // Assert
      expect(immune).toBe(true);
    });

    it("should not damage dual-type Pokemon with one immune type", () => {
      // Arrange — Rock/Fire is immune because it has Rock
      const rockFirePokemon = createMockActivePokemon({ types: ["rock", "fire"], maxHp: 200 });

      // Act
      const immune = isWeatherImmune(rockFirePokemon.types, "sand");

      // Assert
      expect(immune).toBe(true);
    });

    it("should not boost SpDef (that is Gen 4+)", () => {
      // Arrange — This test documents the behavior: sandstorm ONLY does damage in Gen 2
      const normalPokemon = createMockActivePokemon({ types: ["normal"], maxHp: 200, uid: "p1" });
      const side0 = {
        index: 0,
        trainer: null,
        team: [],
        active: [normalPokemon],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const side1 = {
        index: 1,
        trainer: null,
        team: [],
        active: [createMockActivePokemon({ types: ["rock"], maxHp: 200, uid: "p2" })],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const state = createMockBattleState({
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert — Only damage results, no SpDef boost results
      // Rock type (side 1) should not have any result
      const side1Results = results.filter((r) => r.side === 1);
      expect(side1Results).toHaveLength(0);
      // Only non-immune Pokemon get results (damage only)
      for (const result of results) {
        expect(result.damage).toBeGreaterThan(0);
      }
    });

    it("should return no results when sandstorm is active but all Pokemon are immune", () => {
      // Arrange
      const rockPokemon = createMockActivePokemon({ types: ["rock"], maxHp: 200, uid: "p1" });
      const steelPokemon = createMockActivePokemon({ types: ["steel"], maxHp: 200, uid: "p2" });
      const side0 = {
        index: 0,
        trainer: null,
        team: [],
        active: [rockPokemon],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const side1 = {
        index: 1,
        trainer: null,
        team: [],
        active: [steelPokemon],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const state = createMockBattleState({
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert
      expect(results).toHaveLength(0);
    });
  });

  describe("Given no weather", () => {
    it("should return 1 for all types", () => {
      // Arrange / Act / Assert
      const allTypes: PokemonType[] = [
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
        "dark",
        "steel",
      ];

      for (const type of allTypes) {
        // No weather type that would affect anything — use a non-existent weather
        // Actually, the function should handle the case where weather doesn't affect the type
        expect(getWeatherDamageModifier(type, "sand")).toBe(1);
      }
    });

    it("should return empty results when no weather is active", () => {
      // Arrange
      const state = createMockBattleState({ weather: null });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert
      expect(results).toHaveLength(0);
    });
  });

  describe("Given sandstorm with null active slots", () => {
    it("should skip null active Pokemon slots", () => {
      // Arrange: side with null in active array
      const side0 = {
        index: 0,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const normalPokemon = createMockActivePokemon({ types: ["normal"], maxHp: 200, uid: "p2" });
      const side1 = {
        index: 1,
        trainer: null,
        team: [],
        active: [normalPokemon],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const state = createMockBattleState({
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert: only the non-null active should get damage
      expect(results.length).toBe(1);
      expect(results[0]?.damage).toBe(25);
    });
  });

  describe("Given sandstorm with Pokemon missing calculatedStats", () => {
    it("should fall back to currentHp for damage calculation", () => {
      // Arrange: Pokemon with no calculatedStats
      const pokemonNoStats = createMockActivePokemon({ types: ["fire"], maxHp: 160, uid: "p1" });
      // Remove calculatedStats to trigger fallback
      (pokemonNoStats.pokemon as unknown as Record<string, unknown>).calculatedStats = undefined;
      (pokemonNoStats.pokemon as unknown as Record<string, unknown>).currentHp = 160;

      const side0 = {
        index: 0,
        trainer: null,
        team: [],
        active: [pokemonNoStats],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const side1 = {
        index: 1,
        trainer: null,
        team: [],
        active: [createMockActivePokemon({ types: ["rock"], maxHp: 200, uid: "p2" })],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      };
      const state = createMockBattleState({
        weather: { type: "sand", turnsLeft: 5, source: "sandstorm" },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert: should use currentHp (160) as max: floor(160/8) = 20
      expect(results.length).toBe(1);
      expect(results[0]?.damage).toBe(20);
    });
  });

  describe("Given weather immunity checks", () => {
    it("should return false for non-immune types in sandstorm", () => {
      // Arrange / Act / Assert
      expect(isWeatherImmune(["normal"], "sand")).toBe(false);
      expect(isWeatherImmune(["fire"], "sand")).toBe(false);
      expect(isWeatherImmune(["water"], "sand")).toBe(false);
      expect(isWeatherImmune(["electric"], "sand")).toBe(false);
    });

    it("should return false for all types in non-damaging weather", () => {
      // Arrange / Act / Assert
      expect(isWeatherImmune(["normal"], "rain")).toBe(false);
      expect(isWeatherImmune(["normal"], "sun")).toBe(false);
    });
  });
});
