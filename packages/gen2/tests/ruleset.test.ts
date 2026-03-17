import type {
  AbilityContext,
  ActivePokemon,
  BattleAction,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen2DataManager } from "../src/data";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

/**
 * Helper to create a minimal ActivePokemon mock for testing.
 */
function createMockActive(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    status: string | null;
    types: string[];
    heldItem: string | null;
    speciesId: number;
    nickname: string | null;
    moves: Array<{ moveId: string; pp: number; maxPp: number }>;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      speciesId: overrides.speciesId ?? 1,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      calculatedStats: {
        hp: maxHp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
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
    types: (overrides.types as unknown as PokemonType[]) ?? ["normal"],
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 0,
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
 * Helper to create a minimal BattleSide mock.
 */
function createMockSide(
  index: 0 | 1,
  active: ActivePokemon,
  hazards: Array<{ type: string; layers: number }> = [],
): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

/**
 * Helper to create a minimal BattleState mock.
 */
function createMockState(
  side0: BattleSide,
  side1: BattleSide,
  weather: { type: string; turnsLeft: number } | null = null,
): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

describe("Gen2Ruleset", () => {
  // --- Generation Identity ---

  describe("Given Gen2Ruleset", () => {
    it("should have generation 2", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.generation).toBe(2);
    });

    it('should have name "Gen 2 (GSC)"', () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.name).toBe("Gen 2 (GSC)");
    });

    it("should return 17-type chart", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const chart = ruleset.getTypeChart();
      // Assert
      const types = Object.keys(chart);
      expect(types.length).toBe(17);
      expect(types).toContain("dark");
      expect(types).toContain("steel");
      expect(types).not.toContain("fairy");
    });

    it("should return 17 valid types", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const types = ruleset.getAvailableTypes();
      // Assert
      expect(types.length).toBe(17);
      expect(types).toContain("normal");
      expect(types).toContain("fire");
      expect(types).toContain("water");
      expect(types).toContain("dark");
      expect(types).toContain("steel");
      expect(types).not.toContain("fairy");
    });

    it("should have hasAbilities() = false", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasAbilities()).toBe(false);
    });

    it("should have hasHeldItems() = true", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasHeldItems()).toBe(true);
    });

    it("should have hasWeather() = true", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasWeather()).toBe(true);
    });

    it("should have hasTerrain() = false", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasTerrain()).toBe(false);
    });

    it("should return spikes as available hazard", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const hazards = ruleset.getAvailableHazards();
      // Assert
      expect(hazards).toEqual(["spikes"]);
    });

    it("should return null for getBattleGimmick()", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.getBattleGimmick()).toBeNull();
    });

    it("should return correct end-of-turn order (Phase 2: between-turn effects)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const order = ruleset.getEndOfTurnOrder();
      // Assert: Phase 2 only — pret/pokecrystal engine/battle/core.asm HandleBetweenTurnEffects
      // Note: status-damage, leech-seed, nightmare, curse are Phase 1 (getPostAttackResidualOrder)
      expect(order).toEqual([
        "future-attack",
        "weather-damage",
        "bind",
        "perish-song",
        "leftovers",
        "screen-countdown",
        "weather-countdown",
      ]);
    });

    it("given Gen 2 ruleset, when getting post-attack residual order, then returns Phase 1 effects", () => {
      // Source: pret/pokecrystal engine/battle/core.asm — ResidualDamage runs after each attack
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const order = ruleset.getPostAttackResidualOrder();
      // Assert
      expect(order).toEqual(["status-damage", "leech-seed", "nightmare", "curse"]);
    });

    it("should return correct crit rate table (5 entries)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const table = ruleset.getCritRateTable();
      // Assert
      expect(table.length).toBe(5);
      expect(table[0]).toBeCloseTo(17 / 256);
      expect(table[3]).toBeCloseTo(85 / 256); // corrected: was 128/256
      expect(table[4]).toBeCloseTo(128 / 256); // corrected: was 255/256
    });

    it("should return crit multiplier of 2.0", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.getCritMultiplier()).toBe(2);
    });
  });

  // --- Freeze Thaw ---

  describe("Given freeze thaw check", () => {
    it("should thaw ~9.8% of the time (25/256)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockActive = createMockActive({ status: "freeze" });
      let thawCount = 0;
      const trials = 10000;

      // Act
      for (let seed = 0; seed < trials; seed++) {
        const rng = new SeededRandom(seed);
        if (ruleset.checkFreezeThaw(mockActive, rng)) {
          thawCount++;
        }
      }

      // Assert: ~9.8% thaw rate (25/256)
      const thawRate = thawCount / trials;
      expect(thawRate).toBeGreaterThan(0.06);
      expect(thawRate).toBeLessThan(0.15);
    });
  });

  // --- Sleep Turns ---

  describe("Given sleep turns roll", () => {
    it("should return 1-7 turns (Gen 2 Showdown-confirmed range)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const results = new Set<number>();

      // Act
      for (let seed = 0; seed < 1000; seed++) {
        const rng = new SeededRandom(seed);
        const turns = ruleset.rollSleepTurns(rng);
        results.add(turns);
        expect(turns).toBeGreaterThanOrEqual(1);
        expect(turns).toBeLessThanOrEqual(7);
      }

      // Assert: should produce full range including 7
      expect(results.size).toBeGreaterThan(1);
      expect(results.has(1)).toBe(true);
      expect(results.has(7)).toBe(true);
    });
  });

  // --- Sleep Turn Processing ---

  describe("Given processSleepTurn", () => {
    it("should allow acting on the wake turn (Gen 2 behavior)", () => {
      // Given a Pokemon that will wake up this turn (turnsLeft = 1)
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createMockActive({ status: "sleep" });
      mockActivePokemon.pokemon.status = "sleep";
      mockActivePokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });
      const mockState = createMockState(
        createMockSide(0, mockActivePokemon),
        createMockSide(1, createMockActive()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then the Pokemon wakes up and CAN act (Gen 2 behavior)
      expect(result).toBe(true);
      expect(mockActivePokemon.pokemon.status).toBeNull();
      expect(mockActivePokemon.volatileStatuses.has("sleep-counter")).toBe(false);
    });

    it("should still be asleep when turns remaining > 1", () => {
      // Given a Pokemon with multiple sleep turns left
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createMockActive({ status: "sleep" });
      mockActivePokemon.pokemon.status = "sleep";
      mockActivePokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 3 });
      const mockState = createMockState(
        createMockSide(0, mockActivePokemon),
        createMockSide(1, createMockActive()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then the Pokemon is still asleep and cannot act
      expect(result).toBe(false);
      expect(mockActivePokemon.pokemon.status).toBe("sleep");
      expect(mockActivePokemon.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(2);
    });

    it("should wake up after decrementing turns to 0", () => {
      // Given a Pokemon with 1 turn of sleep remaining
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createMockActive({ status: "sleep" });
      mockActivePokemon.pokemon.status = "sleep";
      mockActivePokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });
      const mockState = createMockState(
        createMockSide(0, mockActivePokemon),
        createMockSide(1, createMockActive()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then it decrements and wakes up, allowing action
      expect(result).toBe(true);
      expect(mockActivePokemon.pokemon.status).toBeNull();
    });

    it("should wake up immediately when already at 0 turns", () => {
      // Given a Pokemon with 0 turns of sleep remaining
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createMockActive({ status: "sleep" });
      mockActivePokemon.pokemon.status = "sleep";
      mockActivePokemon.volatileStatuses.set("sleep-counter", { turnsLeft: 0 });
      const mockState = createMockState(
        createMockSide(0, mockActivePokemon),
        createMockSide(1, createMockActive()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then it wakes up and can act
      expect(result).toBe(true);
      expect(mockActivePokemon.pokemon.status).toBeNull();
    });
  });

  // --- Spikes Entry Hazard ---

  describe("Given Spikes entry hazard", () => {
    it("should deal 1/8 max HP damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 320, types: ["normal"] });
      const side = createMockSide(0, pokemon, [{ type: "spikes", layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert: 320 / 8 = 40
      expect(result.damage).toBe(40);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it("should not affect Flying types", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 320, types: ["flying", "normal"] });
      const side = createMockSide(0, pokemon, [{ type: "spikes", layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert: flying types are immune
      expect(result.damage).toBe(0);
    });

    it("should deal minimum 1 damage for low HP Pokemon", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 1, types: ["normal"] });
      const side = createMockSide(0, pokemon, [{ type: "spikes", layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert
      expect(result.damage).toBe(1);
    });

    it("should deal no damage when no spikes are present", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 320, types: ["normal"] });
      const side = createMockSide(0, pokemon);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert
      expect(result.damage).toBe(0);
    });
  });

  // --- Validation ---

  describe("Given validation", () => {
    it("should accept Pokemon with dex #1-251", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 50,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      } as unknown as PokemonInstance;
      const species = { id: 251, displayName: "Celebi" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("should reject Pokemon with dex > 251", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 50,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      } as unknown as PokemonInstance;
      const species = { id: 252, displayName: "Treecko" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("not available in Gen 2"))).toBe(true);
    });

    it("should accept Pokemon with held items", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 50,
        heldItem: "leftovers",
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      } as unknown as PokemonInstance;
      const species = { id: 143, displayName: "Snorlax" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should reject Pokemon with 0 moves", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 50,
        moves: [],
      } as unknown as PokemonInstance;
      const species = { id: 25, displayName: "Pikachu" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("1-4 moves"))).toBe(true);
    });

    it("should reject Pokemon with 5+ moves", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 50,
        moves: [
          { moveId: "a", pp: 1, maxPp: 1 },
          { moveId: "b", pp: 1, maxPp: 1 },
          { moveId: "c", pp: 1, maxPp: 1 },
          { moveId: "d", pp: 1, maxPp: 1 },
          { moveId: "e", pp: 1, maxPp: 1 },
        ],
      } as unknown as PokemonInstance;
      const species = { id: 25, displayName: "Pikachu" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should reject invalid level", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 0,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      } as unknown as PokemonInstance;
      const species = { id: 25, displayName: "Pikachu" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("Level"))).toBe(true);
    });
  });

  // --- Accuracy Check ---

  describe("Given accuracy check", () => {
    it("should not have 1/256 miss bug", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // A 100% accurate move should hit every time when accuracy/evasion stages are 0.
      // In Gen 1, it would miss 1/256 of the time. In Gen 2, it always hits.
      let misses = 0;
      const trials = 10000;

      // Act
      for (let seed = 0; seed < trials; seed++) {
        const rng = new SeededRandom(seed);
        const attacker = createMockActive();
        const defender = createMockActive();
        const move = { accuracy: 100, id: "tackle" } as unknown as MoveData;
        const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

        const hit = ruleset.doesMoveHit({ attacker, defender, move, state, rng });
        if (!hit) misses++;
      }

      // Assert: Gen 2 should have 0 misses for 100% accuracy moves
      expect(misses).toBe(0);
    });

    it("should allow 100% accurate moves to always hit (unlike Gen 1)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const _rng = new SeededRandom(42);
      const attacker = createMockActive();
      const defender = createMockActive();
      const move = { accuracy: 100 } as unknown as MoveData;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act: many trials all should hit
      for (let i = 0; i < 100; i++) {
        const hit = ruleset.doesMoveHit({
          attacker,
          defender,
          move,
          state,
          rng: new SeededRandom(i),
        });
        // Assert
        expect(hit).toBe(true);
      }
    });

    it("should always hit with null accuracy moves (Swift)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const attacker = createMockActive();
      const defender = createMockActive();
      // Even with -6 evasion stage changes
      defender.statStages.evasion = 6;
      const move = { accuracy: null } as unknown as MoveData;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const hit = ruleset.doesMoveHit({ attacker, defender, move, state, rng });

      // Assert
      expect(hit).toBe(true);
    });
  });

  // --- Confusion Damage ---

  describe("Given confusion damage", () => {
    it("should use 40 base power typeless physical formula", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const pokemon = createMockActive({
        level: 50,
        attack: 150,
        defense: 100,
      });
      const state = createMockState(
        createMockSide(0, pokemon),
        createMockSide(1, createMockActive()),
      );

      // Act
      const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);

      // Assert: should be positive and based on the formula
      expect(damage).toBeGreaterThan(0);
      // At level 50 with 150 attack and 100 defense, 40 base power:
      // levelFactor = floor(100/5) + 2 = 22
      // baseDamage = floor(floor(22 * 40 * 150) / 100 / 50) + 2 = floor(2640) + 2
      // Actually: floor(floor(22*40*150)/100) = floor(132000/100) = 1320
      // floor(1320/50) + 2 = 26 + 2 = 28
      // Expected range: min 23, max 28
      expect(damage).toBeGreaterThanOrEqual(23);
      expect(damage).toBeLessThanOrEqual(28);
    });

    it("should be more than simple maxHP/8 for high-attack Pokemon", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      // High attack Pokemon
      const pokemon = createMockActive({
        level: 100,
        maxHp: 300,
        attack: 400,
        defense: 100,
      });
      const state = createMockState(
        createMockSide(0, pokemon),
        createMockSide(1, createMockActive()),
      );

      // Act
      const confusionDamage = ruleset.calculateConfusionDamage(pokemon, state, rng);
      const simpleDamage = Math.floor(300 / 8); // 37

      // Assert: formula-based confusion damage should exceed maxHP/8 for high attack
      expect(confusionDamage).toBeGreaterThan(simpleDamage);
    });

    it("should always deal at least 1 damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const pokemon = createMockActive({
        level: 1,
        attack: 1,
        defense: 999,
      });
      const state = createMockState(
        createMockSide(0, pokemon),
        createMockSide(1, createMockActive()),
      );

      // Act
      const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);

      // Assert
      expect(damage).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Ability/Terrain no-ops ---

  describe("Given ability check", () => {
    it("should return non-activated result from applyAbility", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();

      // Act
      const result = ruleset.applyAbility("on-switch-in", {} as unknown as AbilityContext);

      // Assert
      expect(result.activated).toBe(false);
      expect(result.effects).toEqual([]);
    });
  });

  describe("Given terrain check", () => {
    it("should return empty array from applyTerrainEffects", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();

      // Act
      const result = ruleset.applyTerrainEffects({} as unknown as BattleState);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // --- Weather Effects ---

  describe("Given weather effects", () => {
    it("should apply sandstorm damage to non-immune Pokemon", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 400, types: ["fire"] });
      const side0 = createMockSide(0, pokemon);
      const side1 = createMockSide(1, createMockActive({ types: ["water"] }));
      const state = createMockState(side0, side1, { type: "sand", turnsLeft: 3 });

      // Act
      const results = ruleset.applyWeatherEffects(state);

      // Assert: both fire and water Pokemon should take sandstorm damage
      expect(results.length).toBe(2);
    });

    it("should not damage rock/ground/steel types in sandstorm", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rockPokemon = createMockActive({ types: ["rock"] });
      const steelPokemon = createMockActive({ types: ["steel"] });
      const side0 = createMockSide(0, rockPokemon);
      const side1 = createMockSide(1, steelPokemon);
      const state = createMockState(side0, side1, { type: "sand", turnsLeft: 3 });

      // Act
      const results = ruleset.applyWeatherEffects(state);

      // Assert
      expect(results.length).toBe(0);
    });
  });

  // --- Critical Hits ---

  describe("Given critical hit check", () => {
    it("should never crit for status moves", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const state = createMockState(
        createMockSide(0, attacker),
        createMockSide(1, createMockActive()),
      );
      const statusMove = { category: "status", id: "toxic" } as unknown as MoveData;

      // Act
      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRandom(seed);
        const result = ruleset.rollCritical({ attacker, move: statusMove, state, rng });

        // Assert
        expect(result).toBe(false);
      }
    });
  });

  // --- Turn Order ---

  describe("Given turn order resolution", () => {
    it("should sort switches before moves", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createMockActive({
        speed: 50,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const active1 = createMockActive({
        speed: 200,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const side0 = createMockSide(0, active0);
      const side1 = createMockSide(1, active1);
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "switch", side: 1, switchTo: 1 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: switch comes first
      expect(sorted[0].type).toBe("switch");
      expect(sorted[1].type).toBe("move");
    });

    it("should sort run actions before moves", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createMockActive({ moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }] });
      const active1 = createMockActive();
      const side0 = createMockSide(0, active0);
      const side1 = createMockSide(1, active1);
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "run", side: 1 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: run comes first
      expect(sorted[0].type).toBe("run");
      expect(sorted[1].type).toBe("move");
    });

    it("should sort higher priority moves first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      // quick-attack has priority +2 (pokecrystal: EFFECT_QUICK_ATTACK = 2), tackle has priority 0
      const active0 = createMockActive({
        speed: 50,
        moves: [{ moveId: "quick-attack", pp: 30, maxPp: 30 }],
      });
      const active1 = createMockActive({
        speed: 200,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const side0 = createMockSide(0, active0);
      const side1 = createMockSide(1, active1);
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: quick-attack (priority 2) goes before tackle (priority 0)
      expect(sorted[0].side).toBe(0);
      expect(sorted[1].side).toBe(1);
    });

    it("should sort faster Pokemon first at same priority", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const slowActive = createMockActive({
        speed: 50,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const fastActive = createMockActive({
        speed: 200,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const side0 = createMockSide(0, slowActive);
      const side1 = createMockSide(1, fastActive);
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: faster Pokemon (side 1, speed 200) goes first
      expect(sorted[0].side).toBe(1);
      expect(sorted[1].side).toBe(0);
    });

    it("should handle Quick Claw activation for move-first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Need to find a seed where Quick Claw activates (rng.int(1,256) <= 60)
      // Test with many seeds to find one that activates
      const slowActive = createMockActive({
        speed: 10,
        heldItem: "quick-claw",
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const fastActive = createMockActive({
        speed: 300,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });

      let quickClawWorked = false;
      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRandom(seed);
        const side0 = createMockSide(0, slowActive);
        const side1 = createMockSide(1, fastActive);
        const state = createMockState(side0, side1);

        const actions: BattleAction[] = [
          { type: "move", side: 0, moveIndex: 0 },
          { type: "move", side: 1, moveIndex: 0 },
        ];

        // Act
        const sorted = ruleset.resolveTurnOrder(actions, state, rng);

        // If slow Pokemon moved first, Quick Claw activated
        if (sorted[0].side === 0) {
          quickClawWorked = true;
          break;
        }
      }

      // Assert: Quick Claw should activate at least once in 100 trials (~23% chance each)
      expect(quickClawWorked).toBe(true);
    });

    it("should handle speed ties with randomness", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const active0 = createMockActive({
        speed: 100,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const active1 = createMockActive({
        speed: 100,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });

      const firstMover = new Set<number>();
      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRandom(seed);
        const side0 = createMockSide(0, active0);
        const side1 = createMockSide(1, active1);
        const state = createMockState(side0, side1);

        const actions: BattleAction[] = [
          { type: "move", side: 0, moveIndex: 0 },
          { type: "move", side: 1, moveIndex: 0 },
        ];

        // Act
        const sorted = ruleset.resolveTurnOrder(actions, state, rng);
        firstMover.add(sorted[0].side);
      }

      // Assert: both sides should go first at least once (random tiebreaker)
      expect(firstMover.size).toBe(2);
    });

    it("should handle struggle/recharge actions sorted by speed", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const slowActive = createMockActive({ speed: 50 });
      const fastActive = createMockActive({ speed: 200 });
      const side0 = createMockSide(0, slowActive);
      const side1 = createMockSide(1, fastActive);
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "struggle", side: 0 },
        { type: "recharge", side: 1 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: faster side (1, speed 200) goes first
      expect(sorted[0].side).toBe(1);
    });

    it("should handle missing active Pokemon gracefully in move ordering", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createMockActive({ moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }] });
      const side0 = createMockSide(0, active0);
      // Create a side with no active Pokemon
      const side1 = {
        index: 1,
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
      } as unknown as BattleSide;
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: should not crash, returns sorted array
      expect(sorted.length).toBe(2);
    });

    it("should handle unknown move IDs gracefully with default priority 0", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createMockActive({
        speed: 100,
        moves: [{ moveId: "nonexistent-move", pp: 10, maxPp: 10 }],
      });
      const active1 = createMockActive({
        speed: 100,
        moves: [{ moveId: "another-fake-move", pp: 10, maxPp: 10 }],
      });
      const side0 = createMockSide(0, active0);
      const side1 = createMockSide(1, active1);
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: should not crash, both get default priority 0
      expect(sorted.length).toBe(2);
    });

    it("should reduce speed by 75% for paralyzed Pokemon", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      // Paralyzed Pokemon with 200 speed -> effective 50
      // Other Pokemon with 60 speed -> faster after paralysis
      const paralyzedActive = createMockActive({
        speed: 200,
        status: "paralysis",
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const healthyActive = createMockActive({
        speed: 60,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      });
      const side0 = createMockSide(0, paralyzedActive);
      const side1 = createMockSide(1, healthyActive);
      const state = createMockState(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: paralyzed Pokemon (200 * 0.25 = 50) is slower than 60
      expect(sorted[0].side).toBe(1);
      expect(sorted[1].side).toBe(0);
    });
  });

  // --- Accuracy with Evasion/Accuracy Stages ---

  describe("Given accuracy check with stat stages", () => {
    it("should increase hit chance with positive accuracy stages", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      attacker.statStages.accuracy = 2;
      const defender = createMockActive();
      const move = { accuracy: 50 } as unknown as MoveData;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      let hits = 0;
      const trials = 1000;

      // Act
      for (let seed = 0; seed < trials; seed++) {
        const rng = new SeededRandom(seed);
        if (ruleset.doesMoveHit({ attacker, defender, move, state, rng })) {
          hits++;
        }
      }

      // Assert: with +2 accuracy, effective accuracy is floor(50 * 5/3) = 83
      const hitRate = hits / trials;
      expect(hitRate).toBeGreaterThan(0.75);
    });

    it("should decrease hit chance with negative net accuracy stage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      defender.statStages.evasion = 2;
      const move = { accuracy: 100 } as unknown as MoveData;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      let hits = 0;
      const trials = 1000;

      // Act
      for (let seed = 0; seed < trials; seed++) {
        const rng = new SeededRandom(seed);
        if (ruleset.doesMoveHit({ attacker, defender, move, state, rng })) {
          hits++;
        }
      }

      // Assert: with -2 net stage, effective accuracy is floor(100 * 3/5) = 60
      const hitRate = hits / trials;
      expect(hitRate).toBeGreaterThan(0.5);
      expect(hitRate).toBeLessThan(0.7);
    });
  });

  // --- executeMoveEffect ---

  describe("Given executeMoveEffect", () => {
    it("should return empty result for move with no effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = { id: "tackle", effect: null } as unknown as MoveData;
      const rng = new SeededRandom(42);

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 50,
        state,
        rng,
      });

      // Assert
      expect(result.statusInflicted).toBeNull();
      expect(result.volatileInflicted).toBeNull();
      expect(result.statChanges).toEqual([]);
      expect(result.recoilDamage).toBe(0);
      expect(result.healAmount).toBe(0);
    });

    it("should inflict status with status-chance effect when chance succeeds", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ types: ["ice"] });
      const defender = createMockActive({ types: ["normal"] });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "ice-beam",
        type: "ice",
        effect: { type: "status-chance", status: "freeze", chance: 100 },
      } as unknown as MoveData;

      // Act — use chance: 100 so it always triggers
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 95,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.statusInflicted).toBe("freeze");
    });

    it("should not inflict status when target already has one", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive({ status: "paralysis" });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "thunder",
        effect: { type: "status-chance", status: "paralysis", chance: 100 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 80,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.statusInflicted).toBeNull();
    });

    it("should not inflict burn on Fire types via status-chance", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive({ types: ["fire"] });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "flamethrower",
        effect: { type: "status-chance", status: "burn", chance: 100 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 70,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.statusInflicted).toBeNull();
    });

    it("should inflict status with status-guaranteed effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive({ types: ["normal"] });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "toxic",
        effect: { type: "status-guaranteed", status: "badly-poisoned" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.statusInflicted).toBe("badly-poisoned");
    });

    it("should not inflict status-guaranteed when target already has status", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive({ status: "burn" });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "thunder-wave",
        effect: { type: "status-guaranteed", status: "paralysis" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.statusInflicted).toBeNull();
    });

    it("should apply stat changes from stat-change effect with 100% chance", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "swords-dance",
        effect: {
          type: "stat-change",
          target: "self",
          chance: 100,
          changes: [{ stat: "attack", stages: 2 }],
        },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.statChanges.length).toBe(1);
      expect(result.statChanges[0].target).toBe("attacker");
      expect(result.statChanges[0].stat).toBe("attack");
      expect(result.statChanges[0].stages).toBe(2);
    });

    it("should skip stat-change when chance roll fails", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "psychic",
        effect: {
          type: "stat-change",
          target: "opponent",
          chance: 1, // 1% chance — very unlikely to trigger
          changes: [{ stat: "spDefense", stages: -1 }],
        },
      } as unknown as MoveData;

      // Most seeds will fail the 1% chance
      let noChangeCount = 0;
      for (let seed = 0; seed < 20; seed++) {
        const rng = new SeededRandom(seed);
        const result = ruleset.executeMoveEffect({
          attacker,
          defender,
          move,
          damage: 80,
          state,
          rng,
        });
        if (result.statChanges.length === 0) noChangeCount++;
      }

      // Assert: most should have no stat changes
      expect(noChangeCount).toBeGreaterThan(15);
    });

    it("should calculate recoil damage from recoil effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "double-edge",
        effect: { type: "recoil", amount: 0.25 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 100,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: 25% of 100 damage = 25
      expect(result.recoilDamage).toBe(25);
    });

    it("should calculate drain healing from drain effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "giga-drain",
        effect: { type: "drain", amount: 0.5 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 80,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: 50% of 80 = 40
      expect(result.healAmount).toBe(40);
    });

    it("should calculate healing amount from heal effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ maxHp: 300 });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "recover",
        effect: { type: "heal", amount: 0.5 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: 50% of 300 max HP = 150
      expect(result.healAmount).toBe(150);
    });

    it("should process multi effects recursively", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive({ types: ["normal"] });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "fire-punch",
        effect: {
          type: "multi",
          effects: [
            { type: "status-chance", status: "burn", chance: 100 },
            {
              type: "stat-change",
              target: "self",
              chance: 100,
              changes: [{ stat: "attack", stages: 1 }],
            },
          ],
        },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 60,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: both sub-effects should be applied
      expect(result.statusInflicted).toBe("burn");
      expect(result.statChanges.length).toBe(1);
    });

    it("should inflict volatile status from volatile-status effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "confuse-ray",
        effect: { type: "volatile-status", status: "confusion", chance: 100 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.volatileInflicted).toBe("confusion");
    });

    it("should skip volatile-status when chance roll fails", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "headbutt",
        effect: { type: "volatile-status", status: "flinch", chance: 1 },
      } as unknown as MoveData;

      // Act: Most seeds should fail the 1% chance
      let noFlinchCount = 0;
      for (let seed = 0; seed < 20; seed++) {
        const rng = new SeededRandom(seed);
        const result = ruleset.executeMoveEffect({
          attacker,
          defender,
          move,
          damage: 60,
          state,
          rng,
        });
        if (result.volatileInflicted === null) noFlinchCount++;
      }

      // Assert
      expect(noFlinchCount).toBeGreaterThan(15);
    });

    it("should set weather from weather effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "rain-dance",
        effect: { type: "weather", weather: "rain", turns: 5 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.weatherSet).toBeDefined();
      expect(result.weatherSet?.weather).toBe("rain");
      expect(result.weatherSet?.turns).toBe(5);
      expect(result.weatherSet?.source).toBe("rain-dance");
    });

    it("should set entry hazard from entry-hazard effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const side0 = createMockSide(0, attacker);
      const side1 = createMockSide(1, defender);
      const state = createMockState(side0, side1);
      const move = {
        id: "spikes",
        effect: { type: "entry-hazard", hazard: "spikes" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: hazard should be placed on opponent's side (side 1)
      expect(result.hazardSet).toBeDefined();
      expect(result.hazardSet?.hazard).toBe("spikes");
      expect(result.hazardSet?.targetSide).toBe(1);
    });

    it("should set switchOut true from switch-out effect with self target", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "baton-pass",
        effect: { type: "switch-out", target: "self" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.switchOut).toBe(true);
    });

    it("should set protect volatile from protect effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "protect",
        effect: { type: "protect" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.volatileInflicted).toBe("protect");
    });

    it("should handle remove-hazards effect with message", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ nickname: "Starmie" });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "rapid-spin-generic",
        effect: { type: "remove-hazards" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 20,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]).toContain("blew away hazards");
    });

    it("should handle fixed-damage, level-damage, ohko, and damage effect types as no-ops", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const rng = new SeededRandom(42);

      for (const effectType of ["fixed-damage", "level-damage", "ohko", "damage"]) {
        const move = {
          id: "test-move",
          effect: { type: effectType },
        } as unknown as MoveData;

        // Act
        const result = ruleset.executeMoveEffect({
          attacker,
          defender,
          move,
          damage: 50,
          state,
          rng,
        });

        // Assert: these are no-ops
        expect(result.statusInflicted).toBeNull();
        expect(result.recoilDamage).toBe(0);
      }
    });

    it("should handle terrain, screen, multi-hit, two-turn effect types as no-ops", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const rng = new SeededRandom(42);

      for (const effectType of ["terrain", "screen", "multi-hit", "two-turn"]) {
        const move = {
          id: "test-move",
          effect: { type: effectType },
        } as unknown as MoveData;

        // Act
        const result = ruleset.executeMoveEffect({
          attacker,
          defender,
          move,
          damage: 50,
          state,
          rng,
        });

        // Assert: these are no-ops
        expect(result.statusInflicted).toBeNull();
        expect(result.recoilDamage).toBe(0);
      }
    });
  });

  // --- Custom Move Effects ---

  describe("Given custom move effects", () => {
    it("should maximize attack with Belly Drum when HP > 50%", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ maxHp: 200, currentHp: 200, nickname: "Poliwrath" });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "belly-drum",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.recoilDamage).toBe(100); // 50% of 200 max HP
      expect(result.statChanges.length).toBe(1);
      expect(result.statChanges[0].stat).toBe("attack");
      expect(result.statChanges[0].stages).toBe(6); // 6 - 0 = 6
      expect(result.messages[0]).toContain("maximized Attack");
    });

    it("should fail Belly Drum when HP <= 50%", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ maxHp: 200, currentHp: 99, nickname: "Poliwrath" });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "belly-drum",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.recoilDamage).toBe(0);
      expect(result.statChanges.length).toBe(0);
      expect(result.messages[0]).toContain("too weak");
    });

    it("should remove hazards with Rapid Spin custom effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ nickname: "Starmie" });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "rapid-spin",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 20,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.messages[0]).toContain("blew away leech seed and spikes");
    });

    it("should inflict trapped volatile with Mean Look", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "mean-look",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.volatileInflicted).toBe("trapped");
    });

    it("should inflict trapped volatile with Spider Web", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "spider-web",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.volatileInflicted).toBe("trapped");
    });

    it("should steal item with Thief when attacker has no item and defender does", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ heldItem: null, nickname: "Sneasel" });
      const defender = createMockActive({ heldItem: "leftovers", nickname: "Snorlax" });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "thief",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 40,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]).toContain("stole");
      expect(result.messages[0]).toContain("leftovers");
    });

    it("should not steal with Thief when attacker already has an item", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ heldItem: "charcoal" });
      const defender = createMockActive({ heldItem: "leftovers" });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "thief",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 40,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.messages.length).toBe(0);
    });

    it("should set switchOut true with Baton Pass custom effect", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "baton-pass",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.switchOut).toBe(true);
    });

    it("should handle unknown custom effect gracefully", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "some-unknown-move",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: should not crash, return default result
      expect(result.statusInflicted).toBeNull();
      expect(result.switchOut).toBe(false);
    });
  });

  // --- Explosion/Selfdestruct User Faints ---

  describe("Given Explosion/Selfdestruct user faints", () => {
    it("should set selfFaint = true when user uses Explosion", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ nickname: "Gengar" });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "explosion",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 250,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.selfFaint).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]).toContain("exploded");
    });

    it("should set selfFaint = true when user uses Self-Destruct", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ nickname: "Electrode" });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "self-destruct",
        effect: { type: "custom" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 200,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.selfFaint).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]).toContain("exploded");
    });

    it("should not set selfFaint for a regular attacking move", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "tackle",
        effect: null,
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 30,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: non-exploding moves should not set selfFaint
      expect(result.selfFaint).toBeFalsy();
    });
  });

  // --- EXP Gain ---

  describe("Given EXP gain calculation", () => {
    it("should calculate EXP for a trainer battle", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const context = {
        defeatedSpecies: { baseExp: 200 } as unknown as PokemonSpeciesData,
        defeatedLevel: 50,
        participantLevel: 50,
        isTrainerBattle: true,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
      };

      // Act
      const exp = ruleset.calculateExpGain(context);

      // Assert: should produce a positive value
      expect(exp).toBeGreaterThan(0);
    });

    it("should calculate EXP for a wild battle", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const context = {
        defeatedSpecies: { baseExp: 200 } as unknown as PokemonSpeciesData,
        defeatedLevel: 30,
        participantLevel: 50,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
      };

      // Act
      const exp = ruleset.calculateExpGain(context);

      // Assert: wild battle gives less than trainer battle
      expect(exp).toBeGreaterThan(0);
    });
  });

  // --- Validation edge case ---

  describe("Given validation edge cases", () => {
    it("should reject Pokemon with level > 100", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 101,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      } as unknown as PokemonInstance;
      const species = { id: 25, displayName: "Pikachu" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("Level"))).toBe(true);
    });

    it("should reject Pokemon with dex id 0", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 50,
        moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      } as unknown as PokemonInstance;
      const species = { id: 0, displayName: "MissingNo" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("not available in Gen 2"))).toBe(true);
    });

    it("should collect multiple errors when both level and species are invalid", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = {
        level: 0,
        moves: [],
      } as unknown as PokemonInstance;
      const species = { id: 999, displayName: "FutureMon" } as unknown as PokemonSpeciesData;

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert: should have 3 errors (level, species, moves)
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });
  });

  // --- Confusion No Variance (Showdown: noDamageVariance) ---

  describe("Given confusion self-hit damage", () => {
    it("should produce identical damage across different RNG seeds (no random component)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ level: 50, attack: 100, defense: 100 });
      const state = createMockState(
        createMockSide(0, pokemon),
        createMockSide(1, createMockActive()),
      );

      // Act: calculate damage with different seeds
      const results: number[] = [];
      for (let seed = 0; seed < 20; seed++) {
        const rng = new SeededRandom(seed);
        results.push(ruleset.calculateConfusionDamage(pokemon, state, rng));
      }

      // Assert: all results are identical (no random variance)
      // Hand-trace (level=50, attack=100, defense=100, power=40):
      //   base = floor(floor((floor(2*50/5)+2) * 40 * 100) / 100 / 50)
      //        = floor(floor(22 * 40 * 100) / 100 / 50)
      //        = floor(880 / 50) = 17
      //   +2   = 19, max(1, 19) = 19
      const first = results[0]!;
      expect(results.every((r) => r === first)).toBe(true);
      expect(first).toBe(19);
    });
  });

  // --- Accuracy 0-255 Scale ---

  describe("Given accuracy check on 0-255 scale", () => {
    it("should never miss with 100% accurate move at zero stat stages (accuracy >= 255 short-circuits)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const move = { accuracy: 100, id: "tackle" } as any;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act: floor(100 * 255 / 100) = 255, which >= 255 returns true immediately
      let misses = 0;
      for (let seed = 0; seed < 10000; seed++) {
        const rng = new SeededRandom(seed);
        if (!ruleset.doesMoveHit({ attacker, defender, move, state, rng })) {
          misses++;
        }
      }

      // Assert: 0 misses — accuracy >= 255 never misses
      expect(misses).toBe(0);
    });

    it("should cap accuracy at 255 when +6 accuracy stage boosts would exceed 255", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      attacker.statStages.accuracy = 6;
      const defender = createMockActive();
      const move = { accuracy: 70, id: "thunder" } as any;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act: floor(70 * 255 / 100) = 178, * 3 = 534, capped at 255 → always hits
      let misses = 0;
      for (let seed = 0; seed < 1000; seed++) {
        const rng = new SeededRandom(seed);
        if (!ruleset.doesMoveHit({ attacker, defender, move, state, rng })) {
          misses++;
        }
      }

      // Assert: capped at 255 → always hits
      expect(misses).toBe(0);
    });
  });

  // --- 1/256 Failure Rate for Secondary Effects ---

  describe("Given secondary effect 1/256 failure rate", () => {
    it("should use 0-255 scale for status-chance (100% chance can fail 1/256 times)", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ types: ["fire"] });
      // Run enough trials to observe the ~1/256 failure rate
      const trials = 50000;
      let failCount = 0;

      for (let seed = 0; seed < trials; seed++) {
        const defender = createMockActive({ types: ["normal"] });
        const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
        const move = {
          id: "flamethrower",
          type: "fire",
          effect: { type: "status-chance", status: "burn", chance: 100 },
        } as any;
        const rng = new SeededRandom(seed);
        const result = ruleset.executeMoveEffect({
          attacker,
          defender,
          move,
          damage: 70,
          state,
          rng,
        });
        if (result.statusInflicted === null) failCount++;
      }

      // Assert: ~1/256 failure rate (~195 failures in 50000 trials)
      // Expect between 50 and 400 failures (wide range to avoid flakiness)
      expect(failCount).toBeGreaterThan(50);
      expect(failCount).toBeLessThan(400);
    });
  });

  // --- Switch Out ---

  describe("Given a Pokemon switching out", () => {
    it("should remove toxic-counter volatile on switch-out", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ status: "badly-poisoned" });
      pokemon.volatileStatuses.set("toxic-counter", 4);
      const state = createMockState(
        createMockSide(0, pokemon),
        createMockSide(1, createMockActive()),
      );

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: toxic-counter is cleared but badly-poisoned status persists
      expect(pokemon.volatileStatuses.has("toxic-counter")).toBe(false);
      expect(pokemon.pokemon.status).toBe("badly-poisoned");
    });
  });

  // --- Struggle Recoil ---

  describe("calculateStruggleRecoil", () => {
    // Bug #100 fixed: Gen 2 Struggle recoil = floor(maxHp / 4), NOT floor(damageDealt / 2)
    // Source: gen2-ground-truth.md §9 — "Recoil: 1/4 of the user's max HP — formula: floor(maxHp / 4)"
    // Source: pret/pokecrystal — Struggle recoil uses user's max HP divided by 4, not damage dealt

    it("given attacker with 200 max HP and damage=100, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 100);
      // Assert: floor(200/4) = 50 (damage value ignored — recoil based on max HP)
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=1, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 1);
      // Assert: floor(200/4) = 50 (NOT max(1, floor(1/2)) = 1 — old buggy formula)
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=0, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 0);
      // Assert: floor(200/4) = 50 (NOT max(1, floor(0/2)) = 1 — old buggy formula)
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=101, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 101);
      // Assert: floor(200/4) = 50 (damage value ignored)
      expect(recoil).toBe(50);
    });
  });

  // --- Multi-Hit Count ---

  describe("rollMultiHitCount", () => {
    it("given seed=0, when rolling multi-hit count, then returns a value from [2,2,2,3,3,3,4,5]", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(0);
      const mockAttacker = createMockActive();
      // Act
      const count = ruleset.rollMultiHitCount(mockAttacker, rng);
      // Assert: must be one of the values in the weighted array
      expect([2, 3, 4, 5]).toContain(count);
    });

    it("given 100 rolls, when rolling multi-hit count, then all values are in {2,3,4,5}", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const mockAttacker = createMockActive();
      // Act / Assert
      for (let i = 0; i < 100; i++) {
        const count = ruleset.rollMultiHitCount(mockAttacker, rng);
        expect([2, 3, 4, 5]).toContain(count);
      }
    });

    it("given 100 rolls, when rolling multi-hit count, then at least some 2s and some 3s appear", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const mockAttacker = createMockActive();
      const counts = new Set<number>();
      // Act
      for (let i = 0; i < 100; i++) {
        counts.add(ruleset.rollMultiHitCount(mockAttacker, rng));
      }
      // Assert: weighted array has 3 twos and 3 threes out of 8, so both should appear
      expect(counts.has(2)).toBe(true);
      expect(counts.has(3)).toBe(true);
    });
  });

  // --- Move Priority Values (pokecrystal data/moves/effects_priorities.asm) ---

  describe("Given Gen 2 move priority values from moves.json data", () => {
    it("given Gen 2 ruleset, when getting Protect move priority, then returns +3", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PROTECT has priority 3
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("protect").priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Detect move priority, then returns +3", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_DETECT has priority 3
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("detect").priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Quick Attack move priority, then returns +2", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_QUICK_ATTACK has priority 2
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("quick-attack").priority;
      // Assert
      expect(priority).toBe(2);
    });

    it("given Gen 2 ruleset, when getting Vital Throw move priority, then returns 0", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm — Vital Throw not in exception table, defaults to 0
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("vital-throw").priority;
      // Assert
      expect(priority).toBe(0);
    });

    it("given Gen 2 ruleset, when getting Counter move priority, then returns -1", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_COUNTER has priority -1
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("counter").priority;
      // Assert
      expect(priority).toBe(-1);
    });

    it("given Gen 2 ruleset, when getting Mirror Coat move priority, then returns -1", () => {
      // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_MIRROR_COAT has priority -1
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("mirror-coat").priority;
      // Assert
      expect(priority).toBe(-1);
    });
  });
});
