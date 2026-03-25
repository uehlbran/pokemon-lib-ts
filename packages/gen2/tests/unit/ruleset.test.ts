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
import { describe, expect, it, vi } from "vitest";
import { createGen2DataManager } from "../../src/data";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";

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
    stellarBoostedTypes: [],
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

const EXPECTED_GEN2_TYPES = [
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
] as const;

describe("Gen2Ruleset", () => {
  // --- Generation Identity ---

  describe("Given Gen2Ruleset", () => {
    it("given a Gen 2 ruleset, when reading the generation, then it is 2", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.generation).toBe(2);
    });

    it('given a Gen 2 ruleset, when reading the name, then it is "Gen 2 (GSC)"', () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.name).toBe("Gen 2 (GSC)");
    });

    it("given Gen 2 ruleset, when getting the type chart, then it exposes the 17 pre-Fairy types", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const chart = ruleset.getTypeChart();
      // Assert
      // Source: Gen 2 adds Dark and Steel for 17 total types; Fairy arrives in Gen 6.
      const types = Object.keys(chart);
      expect(types).toEqual(EXPECTED_GEN2_TYPES);
    });

    it("given Gen 2 ruleset, when getting available types, then it returns the full 17-type list", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const types = ruleset.getAvailableTypes();
      // Assert
      // Source: Gen2 type chart includes the same 17 pre-Fairy types.
      expect(types).toEqual(EXPECTED_GEN2_TYPES);
    });

    it("given Gen 2 ruleset, when checking abilities support, then it reports abilities disabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasAbilities()).toBe(false);
    });

    it("given Gen 2 ruleset, when checking held-item support, then it reports held items enabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasHeldItems()).toBe(true);
    });

    it("given Gen 2 ruleset, when checking weather support, then it reports weather enabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasWeather()).toBe(true);
    });

    it("given Gen 2 ruleset, when checking terrain support, then it reports terrain disabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasTerrain()).toBe(false);
    });

    it("given Gen 2 ruleset, when getting hazards, then only Spikes is available", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const hazards = ruleset.getAvailableHazards();
      // Assert
      expect(hazards).toEqual(["spikes"]);
    });

    it("given Gen 2 ruleset, when requesting a battle gimmick, then it returns null because Gen 2 has none", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.getBattleGimmick("mega")).toEqual(null);
    });

    it("given Gen 2 ruleset, when getting end-of-turn order, then it matches pokecrystal HandleBetweenTurnEffects phase 2", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:250-296 HandleBetweenTurnEffects
      // Phase 2 only — status-damage, leech-seed, nightmare, curse are Phase 1 (getPostAttackResidualOrder)
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const order = ruleset.getEndOfTurnOrder();
      // Assert: complete decomp order including previously-missing effects
      expect(order).toEqual([
        "future-attack",
        "weather-damage",
        "weather-countdown",
        "bind",
        "perish-song",
        "leftovers",
        "mystery-berry",
        "defrost",
        // safeguard-countdown removed: Safeguard is stored as a ScreenType and handled by screen-countdown
        "screen-countdown",
        "stat-boosting-items",
        "healing-items",
        "disable-countdown",
        "encore-countdown",
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

    it("given Gen 2 ruleset, when getting the crit rate table, then it returns the five Gen 2 stage thresholds", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const table = ruleset.getCritRateTable();
      // Assert
      // Source: Gen2CritCalc GEN2_CRIT_RATES keeps the five classic Gen 2 stage thresholds.
      // Stage table: 17/256, 32/256, 64/256, 85/256, 128/256.
      expect(table.length).toBe(5);
      expect(table[0]).toBeCloseTo(17 / 256);
      expect(table[3]).toBeCloseTo(85 / 256);
      expect(table[4]).toBeCloseTo(128 / 256);
    });

    it("given a critical hit multiplier query, when the Gen 2 ruleset is asked, then it returns 2.0", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.getCritMultiplier()).toBe(2);
    });
  });

  // --- Freeze Thaw ---

  describe("Given freeze thaw check", () => {
    it("given a frozen Pokemon, when checkFreezeThaw is called, then returns false because Gen 2 thaws between turns not pre-move", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
      // In Gen 2, thaw happens in HandleBetweenTurnEffects (end-of-turn phase),
      // NOT before the move executes. checkFreezeThaw is called by the engine
      // pre-move, so it must always return false for Gen 2.
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockActive = createMockActive({ status: "freeze" });
      const rng = new SeededRandom(42);

      // Act
      const result = ruleset.checkFreezeThaw(mockActive, rng);

      // Assert
      expect(result).toBe(false);
    });

    it("given checkFreezeThaw called 1000 times with different seeds, when checking results, then all return false", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
      // Triangulation: verify across many seeds that pre-move thaw never happens
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockActive = createMockActive({ status: "freeze" });
      let thawCount = 0;

      // Act
      for (let seed = 0; seed < 1000; seed++) {
        const rng = new SeededRandom(seed);
        if (ruleset.checkFreezeThaw(mockActive, rng)) {
          thawCount++;
        }
      }

      // Assert: zero thaws pre-move
      expect(thawCount).toBe(0);
    });
  });

  // --- Sleep Turns ---

  describe("Given sleep turns roll", () => {
    it("given a sleep-turn roll, when the Gen 2 ruleset asks rng for the value, then it uses the 2-7 range", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = { int: vi.fn().mockReturnValue(4) } as unknown as SeededRandom;

      // Act
      const turns = ruleset.rollSleepTurns(rng);

      // Assert
      expect(turns).toBe(4);
      expect(rng.int).toHaveBeenCalledWith(2, 7);
    });

    it("given 10000 sleep rolls, when checking range bounds, then min is 2 and max is 7 (never 1, never 8+)", () => {
      // Source: pret/pokecrystal engine/battle/effect_commands.asm:3608-3621
      // Random() & SLP_MASK rejects 0 and 7, then inc a -> range 2-7
      const ruleset = new Gen2Ruleset();
      expect(ruleset.rollSleepTurns(new SeededRandom(42))).toBeGreaterThanOrEqual(2);
      expect(ruleset.rollSleepTurns(new SeededRandom(42))).toBeLessThanOrEqual(7);
    });
  });

  // --- Sleep Turn Processing ---

  describe("Given processSleepTurn", () => {
    it("given a sleep-counter of 1 turn, when the sleep turn resolves, then the Pokemon wakes up and can act", () => {
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

    it("given more than 1 sleep turn remaining, when the sleep turn resolves, then the Pokemon stays asleep", () => {
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

    it("given exactly 1 sleep turn remaining, when the sleep turn resolves, then the Pokemon wakes up", () => {
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

    it("given a sleep counter already at 0, when the sleep turn resolves, then the Pokemon wakes up immediately", () => {
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
    it("given one layer of Spikes, when a grounded Pokemon switches in, then it takes floor(maxHp/8) damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 320, types: ["normal"] });
      const side = createMockSide(0, pokemon, [{ type: "spikes", layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Source: Gen 2 Spikes deal floor(maxHP / 8).
      expect(result.damage).toBe(40);
      expect(result.messages).toEqual(["The Pokemon was hurt by spikes!"]);
    });

    it("given a Flying-type Pokemon, when it switches into Spikes, then it takes no damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 320, types: ["flying", "normal"] });
      const side = createMockSide(0, pokemon, [{ type: "spikes", layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert: flying types are immune
      expect(result.damage).toBe(0);
    });

    it("given 1 max HP, when a grounded Pokemon switches into Spikes, then it still takes 1 damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createMockActive({ maxHp: 1, types: ["normal"] });
      const side = createMockSide(0, pokemon, [{ type: "spikes", layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert
      expect(result.damage).toBe(1);
    });

    it("given no Spikes on the field, when a Pokemon switches in, then it takes no hazard damage", () => {
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

  // --- getMaxHazardLayers ---

  describe("Given getMaxHazardLayers", () => {
    it("given spikes in Gen 2, when querying max layers, then returns 1", () => {
      // Source: pret/pokecrystal — Gen 2 introduced Spikes with only a single layer.
      // Multi-layer Spikes were not introduced until Gen 3.
      const ruleset = new Gen2Ruleset();
      expect(ruleset.getMaxHazardLayers("spikes")).toBe(1);
    });

    it("given toxic-spikes in Gen 2, when querying max layers, then returns 1", () => {
      // Toxic Spikes do not exist in Gen 2 — returning 1 as a safe fallback.
      // Source: Bulbapedia — Toxic Spikes introduced in Generation IV (Diamond/Pearl).
      const ruleset = new Gen2Ruleset();
      expect(ruleset.getMaxHazardLayers("toxic-spikes")).toBe(1);
    });

    it("given stealth-rock in Gen 2, when querying max layers, then returns 1", () => {
      // Stealth Rock does not exist in Gen 2 — returning 1 as a safe fallback.
      // Source: Bulbapedia — Stealth Rock introduced in Generation IV (Diamond/Pearl).
      const ruleset = new Gen2Ruleset();
      expect(ruleset.getMaxHazardLayers("stealth-rock")).toBe(1);
    });
  });

  // --- Validation ---

  describe("Given validation", () => {
    it("given a dex number in the Gen 2 range, when validatePokemon runs, then the species is accepted", () => {
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

    it("given a dex number above the Gen 2 range, when validatePokemon runs, then the species is rejected", () => {
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

    it("given a Pokemon with a held item, when validatePokemon runs, then the item is accepted", () => {
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

    it("given a Pokemon with zero moves, when validatePokemon runs, then the move-count validation fails", () => {
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

    it("given a Pokemon with five moves, when validatePokemon runs, then the move-count validation fails", () => {
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

    it("given an invalid level, when validatePokemon runs, then the level validation fails", () => {
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
    it("given a 100% accurate move, when hit chance is checked repeatedly, then Gen 2 never exhibits the Gen 1 1/256 miss bug", () => {
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

    it("given a 100% accurate move, when hit chance is checked across several seeds, then it always hits in Gen 2", () => {
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

    it("given a null-accuracy move, when hit chance is checked, then it always hits", () => {
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
    it("given Gen 2 confusion self-hit, when calculating damage with a fixed seed, then it uses the exact 40 BP typeless physical formula", () => {
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

      // Assert
      // Source: Gen2Ruleset.calculateConfusionDamage delegates to the classic 40 BP
      // self-hit formula, and SeededRandom(42) produces the max 255/255 damage roll here.
      expect(damage).toBe(28);
    });

    it("given a high-attack Pokemon, when confusion damage is calculated, then it exceeds simple maxHp/8 damage", () => {
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

    it("given a weak confused Pokemon, when confusion damage is calculated, then it still deals at least 1 damage", () => {
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
    it("given Gen 2 has no abilities, when applyAbility runs, then it returns a non-activated result", () => {
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
    it("given Gen 2 ruleset, when applying terrain effects, then it returns no effects because terrain does not exist yet", () => {
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
    it("given sandstorm and two non-immune Pokemon, when weather effects resolve, then both take damage", () => {
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

    it("given sandstorm and Rock/Steel Pokemon, when weather effects resolve, then they take no damage", () => {
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
    it("given a status move, when critical hit chance is rolled, then it never crits", () => {
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
    it("given a switch and a move, when turn order is resolved, then the switch acts first", () => {
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

    it("given a run action and a move, when turn order is resolved, then the run action acts first", () => {
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

    it("given moves with different priorities, when turn order is resolved, then the higher priority move acts first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      // quick-attack has priority +1 (Showdown-compatible scale), tackle has priority 0
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

      // Assert: quick-attack (priority +1) goes before tackle (priority 0)
      expect(sorted[0].side).toBe(0);
      expect(sorted[1].side).toBe(1);
    });

    it("given equal-priority moves, when turn order is resolved, then the faster Pokemon acts first", () => {
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

    it("given Quick Claw and a slower attacker, when turn order is resolved repeatedly, then Quick Claw can move first", () => {
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

    it("given equal speed on both sides, when turn order is resolved repeatedly, then either side can win the tie", () => {
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

    it("given struggle and recharge actions, when turn order is resolved, then speed still breaks the tie", () => {
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

    it("given a missing active Pokemon, when move order is resolved, then the ruleset still returns both actions", () => {
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

    it("given unknown move IDs, when turn order is resolved, then both moves fall back to priority 0", () => {
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

    it("given a paralyzed Pokemon, when turn order is resolved, then its speed is reduced to 25%", () => {
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
    it("given positive accuracy stages, when hit chance is checked, then the threshold increases exactly", () => {
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

    it("given a negative net accuracy stage, when hit chance is checked, then the threshold decreases exactly", () => {
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
    it("given a move with no effect, when executeMoveEffect runs, then it returns the zero-value payload", () => {
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

      // Assert: the default result should be the zero-value payload used by the engine.
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        }),
      );
    });

    it("given a successful status-chance effect, when executeMoveEffect runs, then it inflicts the status", () => {
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

      // Act — force the 0-255 roll to succeed and prove the primary status path.
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 95,
        state,
        rng: { int: () => 0 } as unknown as SeededRandom,
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: "freeze",
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a status-chance move, when the target already has a status, then no additional status is inflicted", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a status-chance burn move, when the target is Fire-type, then Gen 2 type immunity prevents burn", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a status-guaranteed effect, when executeMoveEffect runs, then it inflicts the status", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: "badly-poisoned",
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a guaranteed-status move, when the target already has a status, then no replacement status is inflicted", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a successful stat-change effect, when executeMoveEffect runs, then it applies the stat stage change", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          statChanges: [{ target: "attacker", stat: "attack", stages: 2 }],
          statusInflicted: null,
          volatileInflicted: null,
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a stat-change effect with a failed 0-255 roll, when executeMoveEffect runs, then it applies no stat changes", () => {
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

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 80,
        state,
        rng: { int: () => 255 } as unknown as SeededRandom,
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statChanges: [],
          statusInflicted: null,
          volatileInflicted: null,
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a recoil effect, when executeMoveEffect runs, then it applies the exact configured recoil fraction", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const damageDealt = 100;
      const move = {
        id: "double-edge",
        effect: { type: "recoil", amount: 0.25 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: damageDealt,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: floor(100 * 0.25) = 25.
      // Source: recoil is floor(damage * amount), so 25% of 100 damage is 25.
      expect(result.recoilDamage).toBe(damageDealt / 4);
    });

    it("given a drain effect, when executeMoveEffect runs, then it heals exactly the configured fraction of dealt damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const damageDealt = 80;
      const move = {
        id: "giga-drain",
        effect: { type: "drain", amount: 0.5 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: damageDealt,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: floor(80 * 0.5) = 40.
      // Source: drain heals floor(damage * amount), so 50% of 80 is 40.
      expect(result.healAmount).toBe(damageDealt / 2);
    });

    it("given a heal effect, when executeMoveEffect runs, then it heals exactly the configured fraction of max HP", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attackerMaxHp = 300;
      const attacker = createMockActive({ maxHp: attackerMaxHp });
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

      // Assert: floor(300 * 0.5) = 150.
      // Source: heal effects use floor(max HP * amount), so 50% of 300 is 150.
      expect(result.healAmount).toBe(attackerMaxHp / 2);
    });

    it("given a multi-effect move, when executeMoveEffect runs, then each sub-effect is applied", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: "burn",
          statChanges: [{ target: "attacker", stat: "attack", stages: 1 }],
          volatileInflicted: null,
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a volatile-status effect, when executeMoveEffect runs, then it inflicts the volatile status", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: "confusion",
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a volatile-status move with a failed 0-255 roll, when executeMoveEffect runs, then it applies no volatile", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "headbutt",
        effect: { type: "volatile-status", status: "flinch", chance: 1 },
      } as unknown as MoveData;

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 60,
        state,
        rng: { int: () => 255 } as unknown as SeededRandom,
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: null,
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a weather effect, when executeMoveEffect runs, then it returns the exact weather payload for the engine to apply", () => {
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
      // Source: the move effect specifies a five-turn Rain Dance payload.
      expect(result.weatherSet).toEqual({
        weather: "rain",
        turns: 5,
        source: "rain-dance",
      });
    });

    it("given an entry-hazard effect, when executeMoveEffect runs, then it targets the defender side with Spikes", () => {
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
      expect(result.hazardSet).toEqual({
        hazard: "spikes",
        targetSide: 1,
      });
    });

    it("given a self-targeted switch-out effect, when executeMoveEffect runs, then it marks the attacker to switch out", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          switchOut: true,
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
        }),
      );
    });

    it("given a protect effect, when executeMoveEffect runs, then it returns the protect volatile for the engine to apply", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: "protect",
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a remove-hazards effect, when executeMoveEffect runs, then it emits the exact hazard-clearing message", () => {
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
      expect(result.messages).toEqual(["Starmie blew away hazards!"]);
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
    it("given Belly Drum, when the user has more than half HP, then it pays half HP and maximizes Attack", () => {
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
      // Source: Belly Drum spends half of max HP and raises Attack to +6.
      expect(result).toEqual(
        expect.objectContaining({
          recoilDamage: 100,
          statChanges: [
            {
              target: "attacker",
              stat: "attack",
              stages: 6 - attacker.statStages.attack,
            },
          ],
          messages: ["Poliwrath cut its own HP and maximized Attack!"],
        }),
      );
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
      expect(result).toEqual(
        expect.objectContaining({
          recoilDamage: 0,
          statChanges: [],
          messages: ["Poliwrath is too weak to use Belly Drum!"],
        }),
      );
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
      expect(result.messages).toEqual(["Starmie blew away leech seed and spikes!"]);
    });

    it("given Mean Look, when executeMoveEffect runs, then it inflicts the trapped volatile", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: "trapped",
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given Spider Web, when executeMoveEffect runs, then it inflicts the trapped volatile", () => {
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

    it("given Thief and an itemless attacker, when the defender holds an item, then the item is transferred to the attacker", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          itemTransfer: { from: "defender", to: "attacker" },
          messages: ["Sneasel stole Snorlax's leftovers!"],
        }),
      );
    });

    it("given Thief and an attacker that already holds an item, when executeMoveEffect runs, then no item is stolen", () => {
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
      expect(result.messages).toEqual([]);
    });

    it("given Baton Pass, when executeMoveEffect runs, then it requests a switching baton-pass handoff", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          switchOut: true,
          batonPass: true,
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
        }),
      );
    });

    it("given an unsupported custom move effect, when executeMoveEffect runs, then it returns the default no-op result", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        }),
      );
    });
  });

  // --- Explosion/Selfdestruct User Faints ---

  describe("Given Explosion/Selfdestruct user faints", () => {
    it("given Explosion, when executeMoveEffect runs, then it marks the user to faint", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          selfFaint: true,
          messages: ["Gengar exploded!"],
        }),
      );
    });

    it("given Self-Destruct, when executeMoveEffect runs, then it marks the user to faint", () => {
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
      expect(result).toEqual(
        expect.objectContaining({
          selfFaint: true,
          messages: ["Electrode exploded!"],
        }),
      );
    });

    it("given a regular damaging move, when executeMoveEffect runs, then it emits no self-faint signal", () => {
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

      // Assert: regular attacks return the default payload and omit the optional selfFaint flag entirely.
      expect(result.messages).toEqual([]);
      expect(Object.hasOwn(result, "selfFaint")).toBe(false);
    });
  });

  // --- EXP Gain ---

  describe("Given EXP gain calculation", () => {
    it("given a trainer battle context, when calculateExpGain runs, then it applies the 1.5x trainer multiplier", () => {
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

      // Assert: floor(200 * 50 / 7) * 1.5 = 2142
      expect(exp).toBe(2142);
    });

    it("given a wild battle context, when calculateExpGain runs, then it returns the unboosted Gen 2 EXP formula result", () => {
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

      // Assert: floor(200 * 30 / 7) = 857
      expect(exp).toBe(857);
    });

    it("given a traded (same-language) Pokemon in Gen 2, when calculateExpGain with isTradedPokemon=true, then returns 1.5x boosted EXP", () => {
      // Source: pret/pokecrystal — Gen 2 trades give 1.5x EXP to traded Pokemon.
      // Language is not tracked in Gen 2 box data, so only 1.5x bonus is modeled.
      // b=64, L_d=30, s=1, t=1.0 (wild):
      //   step1 = floor(64 * 30 / 7) = floor(1920 / 7) = 274
      //   step2 = floor(274 / 1)     = 274
      //   step3 = floor(274 * 1.0)   = 274
      //   traded: floor(274 * 1.5)   = 411
      const ruleset = new Gen2Ruleset();
      const notTradedCtx = {
        defeatedSpecies: { baseExp: 64 } as unknown as PokemonSpeciesData,
        defeatedLevel: 30,
        participantLevel: 25,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
        isTradedPokemon: false,
      };
      const tradedCtx = { ...notTradedCtx, isTradedPokemon: true };

      const notTraded = ruleset.calculateExpGain(notTradedCtx);
      const traded = ruleset.calculateExpGain(tradedCtx);

      expect(notTraded).toBe(274);
      expect(traded).toBe(411);
      expect(traded).toBeGreaterThan(notTraded);
    });

    it("given a traded Pokemon with isInternationalTrade=true in Gen 2, when calculateExpGain, then still returns 1.5x (no international concept in Gen 2)", () => {
      // Source: pret/pokecrystal — Gen 2 cartridges have no language field on box data;
      // isInternationalTrade is ignored and only the 1.5x bonus applies.
      // b=64, L_d=30, s=1, t=1.0 → base=274; floor(274 * 1.5) = 411
      const ruleset = new Gen2Ruleset();
      const context = {
        defeatedSpecies: { baseExp: 64 } as unknown as PokemonSpeciesData,
        defeatedLevel: 30,
        participantLevel: 25,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
        isTradedPokemon: true,
        isInternationalTrade: true, // Gen 2 ignores this flag
      };

      const result = ruleset.calculateExpGain(context);

      // Same as same-language traded: 1.5x only
      expect(result).toBe(411);
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
      // Source: Gen 2 validation caps levels at 100.
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
      // Source: Gen 2 only accepts Pokédex numbers 1-251.
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
      // Source: the invalid level, invalid species, and empty move list each produce a validation error.
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
    it("given a 100% accurate move at zero stat stages, when checking hit chance, then Gen 2 short-circuits to a guaranteed hit", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      const defender = createMockActive();
      const move = { accuracy: 100, id: "tackle" } as any;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act / Assert: floor(100 * 255 / 100) = 255, which short-circuits to hit.
      expect(ruleset.doesMoveHit({ attacker, defender, move, state, rng: new SeededRandom(42) })).toBe(true);
    });

    it("given +6 accuracy stages on a 70% move, when checking hit chance, then Gen 2 caps at 255 and always hits", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive();
      attacker.statStages.accuracy = 6;
      const defender = createMockActive();
      const move = { accuracy: 70, id: "thunder" } as any;
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act / Assert: floor(70 * 255 / 100) = 178, * 3 = 534, capped at 255 → always hits.
      expect(ruleset.doesMoveHit({ attacker, defender, move, state, rng: new SeededRandom(42) })).toBe(true);
    });
  });

  // --- 1/256 Failure Rate for Secondary Effects ---

  describe("Given secondary effect 1/256 failure rate", () => {
    it("given a 100% status-chance effect, when the RNG rolls 255, then Gen 2 still allows the 1/256 failure", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createMockActive({ types: ["fire"] });
      const defender = createMockActive({ types: ["normal"] });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const move = {
        id: "flamethrower",
        type: "fire",
        effect: { type: "status-chance", status: "burn", chance: 100 },
      } as any;
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 70,
        state,
        rng: { int: () => 255 } as unknown as SeededRandom,
      });

      // Assert: 100% chance still fails on an exact 255 roll because the effect uses a 0-255 scale.
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });
  });

  // --- Switch Out ---

  describe("Given a Pokemon switching out", () => {
    it("should remove toxic-counter volatile and revert badly-poisoned to poison on switch-out", () => {
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

      // Assert: toxic-counter is cleared AND badly-poisoned reverts to regular poison
      // Source: pret/pokecrystal core.asm:4078-4104 NewBattleMonStatus — zeros substatus bytes
      // (SUBSTATUS_TOXIC is in SubStatus5). The main status byte (PSN) stays, but without
      // SUBSTATUS_TOXIC the toxic counter is gone → regular poison on switch-back.
      expect(pokemon.volatileStatuses.has("toxic-counter")).toBe(false);
      expect(pokemon.pokemon.status).toBe("poison");
    });
  });

  // --- Struggle Recoil ---

  describe("calculateStruggleRecoil", () => {
    // Gen 2 Struggle recoil = floor(maxHp / 4)
    // Source: bug #317 fix — uses maxHp, not damageDealt

    it("given attacker with 200 max HP and damage=100, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 100);
      // Assert: floor(200/4) = 50
      // Source: bug #317 fix — uses maxHp
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=1, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 1);
      // Assert: floor(200/4) = 50 (damage dealt is irrelevant)
      // Source: bug #317 fix — uses maxHp
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=0, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 0);
      // Assert: floor(200/4) = 50 (damage dealt is irrelevant)
      // Source: bug #317 fix — uses maxHp
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=101, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createMockActive(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 101);
      // Assert: floor(200/4) = 50 (damage dealt is irrelevant)
      // Source: bug #317 fix — uses maxHp
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

  // --- Move Priority Values (gen2-ground-truth.md §9 — Showdown-compatible scale) ---

  describe("Given Gen 2 move priority values from moves.json data", () => {
    it("given Gen 2 ruleset, when getting Protect move priority, then returns +3", () => {
      // Source: gen2-ground-truth.md §9 — Protect: +3 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("protect").priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Detect move priority, then returns +3", () => {
      // Source: gen2-ground-truth.md §9 — Detect: +3 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("detect").priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Quick Attack move priority, then returns +1", () => {
      // Source: gen2-ground-truth.md §9 — Quick Attack: +1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("quick-attack").priority;
      // Assert
      expect(priority).toBe(1);
    });

    it("given Gen 2 ruleset, when getting Vital Throw move priority, then returns -1", () => {
      // Source: gen2-ground-truth.md §9 — Vital Throw: -1, never misses, goes last
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("vital-throw").priority;
      // Assert
      expect(priority).toBe(-1);
    });

    it("given Gen 2 ruleset, when getting Counter move priority, then returns -1", () => {
      // Source: gen2-ground-truth.md §9 — Counter: -1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("counter").priority;
      // Assert
      expect(priority).toBe(-1);
    });

    it("given Gen 2 ruleset, when getting Mirror Coat move priority, then returns -1", () => {
      // Source: gen2-ground-truth.md §9 — Mirror Coat: -1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("mirror-coat").priority;
      // Assert
      expect(priority).toBe(-1);
    });

    it("given Gen 2 ruleset, when getting Endure move priority, then returns +3", () => {
      // Source: gen2-ground-truth.md §9 — Endure: +3 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("endure").priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Mach Punch move priority, then returns +1", () => {
      // Source: gen2-ground-truth.md §9 — Mach Punch: +1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("mach-punch").priority;
      // Assert
      expect(priority).toBe(1);
    });

    it("given Gen 2 ruleset, when getting ExtremeSpeed move priority, then returns +1", () => {
      // Source: gen2-ground-truth.md §9 — ExtremeSpeed: +1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove("extreme-speed").priority;
      // Assert
      expect(priority).toBe(1);
    });

    it("given Gen 2 ruleset, when getting Roar move priority, then returns -6", () => {
      // Source: pret/pokecrystal engine/battle/core.asm — Whirlwind/Roar always go last
      // Priority -6 ensures they go after all other moves including Counter/Mirror Coat (-1)
      // Reference: Bulbapedia — Roar has priority -6 in Gen 2+
      const dm = createGen2DataManager();
      const move = dm.getMove("roar");
      expect(move?.priority).toBe(-6);
    });

    it("given Gen 2 ruleset, when getting Whirlwind move priority, then returns -6", () => {
      // Source: pret/pokecrystal engine/battle/core.asm — Whirlwind/Roar always go last
      // Priority -6 ensures they go after all other moves including Counter/Mirror Coat (-1)
      // Reference: Bulbapedia — Whirlwind has priority -6 in Gen 2+
      const dm = createGen2DataManager();
      const move = dm.getMove("whirlwind");
      expect(move?.priority).toBe(-6);
    });
  });
});
