import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  NEUTRAL_NATURES,
  type PokemonType,
  type WeatherType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen2WeatherEffects,
  GEN2_ITEM_IDS,
  GEN2_SPECIES_IDS,
  GEN2_TYPES,
  getWeatherDamageModifier,
} from "../../src";
import { isWeatherImmune } from "../../src/Gen2Weather";
import { createSyntheticOnFieldPokemon as createSharedSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

/**
 * Helper to create a minimal ActivePokemon for weather tests.
 */
function createWeatherTestPokemon(
  overrides: {
    types?: PokemonType[];
    currentHp?: number;
    maxHp?: number;
    uid?: string;
    nickname?: string | null;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const pokemon = createSharedSyntheticOnFieldPokemon({
    speciesId: GEN2_SPECIES_IDS.ditto,
    currentHp: overrides.currentHp ?? maxHp,
    nickname: overrides.nickname ?? null,
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    turnsOnField: 1,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  });
  pokemon.pokemon.uid = overrides.uid ?? "test-pokemon";
  pokemon.pokemon.nature = NEUTRAL_NATURES[0];
  pokemon.pokemon.pokeball = GEN2_ITEM_IDS.pokeBall;
  return pokemon;
}

/**
 * Helper to create a minimal BattleState for weather tests.
 */
function createMockBattleState(
  overrides: {
    weather?: { type: WeatherType; turnsLeft: number; source: string } | null;
    sides?: [unknown, unknown];
  } = {},
): BattleState {
  const defaultSide = (index: 0 | 1) => ({
    index,
    trainer: null,
    team: [],
    active: [createWeatherTestPokemon()],
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
    phase: "turn-end",
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
      const moveType: PokemonType = CORE_TYPE_IDS.water;

      // Act
      const modifier = getWeatherDamageModifier(moveType, CORE_WEATHER_IDS.rain);

      // Assert
      // Source: Gen 2 rain dance boosts Water moves to 1.5x.
      expect(modifier).toBe(1.5);
    });

    it("should weaken Fire moves by 0.5x", () => {
      // Arrange
      const moveType: PokemonType = CORE_TYPE_IDS.fire;

      // Act
      const modifier = getWeatherDamageModifier(moveType, CORE_WEATHER_IDS.rain);

      // Assert
      // Source: Gen 2 rain dance weakens Fire moves to 0.5x.
      expect(modifier).toBe(0.5);
    });

    it("should not affect other types", () => {
      // Arrange / Act / Assert
      const otherTypes: readonly PokemonType[] = GEN2_TYPES.filter(
        (type) => type !== CORE_TYPE_IDS.water && type !== CORE_TYPE_IDS.fire,
      );

      for (const type of otherTypes) {
        expect(getWeatherDamageModifier(type, CORE_WEATHER_IDS.rain)).toBe(1);
      }
    });
  });

  describe("Given Sun weather", () => {
    it("should boost Fire moves by 1.5x", () => {
      // Arrange
      const moveType: PokemonType = CORE_TYPE_IDS.fire;

      // Act
      const modifier = getWeatherDamageModifier(moveType, CORE_WEATHER_IDS.sun);

      // Assert
      // Source: Gen 2 sunny day boosts Fire moves to 1.5x.
      expect(modifier).toBe(1.5);
    });

    it("should weaken Water moves by 0.5x", () => {
      // Arrange
      const moveType: PokemonType = CORE_TYPE_IDS.water;

      // Act
      const modifier = getWeatherDamageModifier(moveType, CORE_WEATHER_IDS.sun);

      // Assert
      // Source: Gen 2 sunny day weakens Water moves to 0.5x.
      expect(modifier).toBe(0.5);
    });

    it("should not affect other types", () => {
      // Arrange / Act / Assert
      const otherTypes: readonly PokemonType[] = GEN2_TYPES.filter(
        (type) => type !== CORE_TYPE_IDS.fire && type !== CORE_TYPE_IDS.water,
      );

      for (const type of otherTypes) {
        expect(getWeatherDamageModifier(type, CORE_WEATHER_IDS.sun)).toBe(1);
      }
    });
  });

  describe("Given Sandstorm", () => {
    it("should deal 1/8 max HP to non-Rock/Ground/Steel", () => {
      // Arrange
      const normalPokemon = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        uid: "p1",
      });
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
        active: [
          createWeatherTestPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200, uid: "p2" }),
        ],
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
        weather: {
          type: CORE_WEATHER_IDS.sand,
          turnsLeft: 5,
          source: CORE_WEATHER_IDS.sand,
        },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert — 1/8 of 200 = 25
      expect(results.length).toBe(2);
      // Source: Gen 2 sandstorm damage is floor(maxHp / 8); 200 / 8 = 25.
      expect(results[0]?.damage).toBe(25);
      // Source: Gen 2 sandstorm damage is floor(maxHp / 8); 200 / 8 = 25.
      expect(results[1]?.damage).toBe(25);
    });

    it("should not damage Rock types", () => {
      // Arrange
      const rockPokemon = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.rock],
        maxHp: 200,
        uid: "rock-mon",
      });

      // Act
      const immune = isWeatherImmune(rockPokemon.types, CORE_WEATHER_IDS.sand);

      // Assert
      expect(immune).toBe(true);
    });

    it("should not damage Ground types", () => {
      // Arrange
      const groundPokemon = createWeatherTestPokemon({ types: [CORE_TYPE_IDS.ground], maxHp: 200 });

      // Act
      const immune = isWeatherImmune(groundPokemon.types, CORE_WEATHER_IDS.sand);

      // Assert
      expect(immune).toBe(true);
    });

    it("should not damage Steel types", () => {
      // Arrange
      const steelPokemon = createWeatherTestPokemon({ types: [CORE_TYPE_IDS.steel], maxHp: 200 });

      // Act
      const immune = isWeatherImmune(steelPokemon.types, CORE_WEATHER_IDS.sand);

      // Assert
      expect(immune).toBe(true);
    });

    it("should not damage dual-type Pokemon with one immune type", () => {
      // Arrange — Rock/Fire is immune because it has Rock
      const rockFirePokemon = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.rock, CORE_TYPE_IDS.fire],
        maxHp: 200,
      });

      // Act
      const immune = isWeatherImmune(rockFirePokemon.types, CORE_WEATHER_IDS.sand);

      // Assert
      expect(immune).toBe(true);
    });

    it("should not boost SpDef (that is Gen 4+)", () => {
      // Arrange — This test documents the behavior: sandstorm ONLY does damage in Gen 2
      const normalPokemon = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        uid: "p1",
      });
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
        active: [createWeatherTestPokemon({ types: [CORE_TYPE_IDS.rock], maxHp: 200, uid: "p2" })],
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
        weather: {
          type: CORE_WEATHER_IDS.sand,
          turnsLeft: 5,
          source: CORE_WEATHER_IDS.sand,
        },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert — Only damage results, no SpDef boost results
      // Rock type (side 1) should not have any result
      const side1Results = results.filter((r) => r.side === 1);
      expect(side1Results).toEqual([]);
      // Only non-immune Pokemon get results (damage only)
      // Source: Gen 2 sandstorm formula: Math.max(1, Math.floor(maxHp / 8))
      //   normalPokemon.maxHp = 200 → floor(200/8) = 25
      for (const result of results) {
        expect(result.damage).toBe(25);
      }
    });

    it("should return no results when sandstorm is active but all Pokemon are immune", () => {
      // Arrange
      const rockPokemon = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.rock],
        maxHp: 200,
        uid: "p1",
      });
      const steelPokemon = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.steel],
        maxHp: 200,
        uid: "p2",
      });
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
        weather: {
          type: CORE_WEATHER_IDS.sand,
          turnsLeft: 5,
          source: CORE_WEATHER_IDS.sand,
        },
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
      const allTypes: readonly PokemonType[] = GEN2_TYPES;

      for (const type of allTypes) {
        expect(getWeatherDamageModifier(type, CORE_WEATHER_IDS.sand)).toBe(1);
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
      const normalPokemon = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        uid: "p2",
      });
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
        weather: {
          type: CORE_WEATHER_IDS.sand,
          turnsLeft: 5,
          source: CORE_WEATHER_IDS.sand,
        },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert: only the non-null active should get damage
      expect(results.length).toBe(1);
      // Source: Gen 2 sandstorm damage is floor(maxHp / 8); 200 / 8 = 25.
      expect(results[0]?.damage).toBe(25);
    });
  });

  describe("Given sandstorm with Pokemon missing calculatedStats", () => {
    it("should fall back to currentHp for damage calculation", () => {
      // Arrange: Pokemon with no calculatedStats
      const pokemonNoStats = createWeatherTestPokemon({
        types: [CORE_TYPE_IDS.fire],
        maxHp: 160,
        uid: "p1",
      });
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
        active: [createWeatherTestPokemon({ types: [CORE_TYPE_IDS.rock], maxHp: 200, uid: "p2" })],
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
        weather: {
          type: CORE_WEATHER_IDS.sand,
          turnsLeft: 5,
          source: CORE_WEATHER_IDS.sand,
        },
        sides: [side0, side1],
      });

      // Act
      const results = applyGen2WeatherEffects(state);

      // Assert: should use currentHp (160) as max: floor(160/8) = 20
      expect(results.length).toBe(1);
      // Source: Gen 2 sandstorm damage falls back to currentHp when calculatedStats.hp is absent; 160 / 8 = 20.
      expect(results[0]?.damage).toBe(20);
    });
  });

  describe("Given weather immunity checks", () => {
    it("should return false for non-immune types in sandstorm", () => {
      // Arrange / Act / Assert
      expect(isWeatherImmune([CORE_TYPE_IDS.normal], CORE_WEATHER_IDS.sand)).toBe(false);
      expect(isWeatherImmune([CORE_TYPE_IDS.fire], CORE_WEATHER_IDS.sand)).toBe(false);
      expect(isWeatherImmune([CORE_TYPE_IDS.water], CORE_WEATHER_IDS.sand)).toBe(false);
      expect(isWeatherImmune([CORE_TYPE_IDS.electric], CORE_WEATHER_IDS.sand)).toBe(false);
    });

    it("should return false for all types in non-damaging weather", () => {
      // Arrange / Act / Assert
      expect(isWeatherImmune([CORE_TYPE_IDS.normal], CORE_WEATHER_IDS.rain)).toBe(false);
      expect(isWeatherImmune([CORE_TYPE_IDS.normal], CORE_WEATHER_IDS.sun)).toBe(false);
    });
  });
});
