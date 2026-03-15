import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2StatusDamage, canInflictGen2Status } from "../src/Gen2Status";

/**
 * Helper to create a minimal ActivePokemon for status tests.
 */
function createMockActivePokemon(
  overrides: {
    types?: PokemonType[];
    currentHp?: number;
    maxHp?: number;
    status?: PrimaryStatus | null;
    volatileStatuses?: Map<string, unknown>;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      uid: "test-pokemon",
      speciesId: 1,
      nickname: null,
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
      status: overrides.status ?? null,
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
    volatileStatuses: (overrides.volatileStatuses ?? new Map()) as Map<never, never>,
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
 * Helper to create a minimal BattleState for status tests.
 */
function createMockBattleState(): BattleState {
  return {
    phase: "TURN_END",
    generation: 2,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1,
        trainer: null,
        team: [],
        active: [],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ] as [never, never],
    weather: null,
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
 * Gen 2 Status Tests
 *
 * Status mechanics:
 * - Burn: 1/8 max HP per turn, halves physical Attack stat
 * - Poison: 1/8 max HP per turn
 * - Badly-poisoned (Toxic): starts at 1/16, increments by 1/16. Counter resets on switch.
 * - Sleep: 1-7 turns, CANNOT attack on waking turn
 * - Freeze: ~9.8% (25/256) thaw chance per turn
 * - Paralysis: 25% full paralysis, Speed to 25%
 * - Confusion: 2-5 turns, 50% self-hit, 40 base power typeless physical
 *
 * Type immunities (Gen 2):
 * - Fire: immune to burn
 * - Ice: immune to freeze
 * - Electric: immune to paralysis (NEW in Gen 2!)
 * - Poison/Steel: immune to poison
 */
describe("Gen2Status", () => {
  describe("Given burn status", () => {
    it("should deal 1/8 max HP per turn", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 200, status: "burn" });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "burn", state);

      // Assert — 1/8 of 200 = 25
      expect(damage).toBe(25);
    });

    it("should floor the damage for non-divisible HP", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 100, status: "burn" });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "burn", state);

      // Assert — floor(100/8) = 12
      expect(damage).toBe(12);
    });

    it("should deal at least 1 damage", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 1, status: "burn" });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "burn", state);

      // Assert
      expect(damage).toBe(1);
    });

    it("should not affect Fire types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["fire"] });

      // Act
      const canInflict = canInflictGen2Status("burn", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should affect non-Fire types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["normal"] });

      // Act
      const canInflict = canInflictGen2Status("burn", target);

      // Assert
      expect(canInflict).toBe(true);
    });
  });

  describe("Given poison status", () => {
    it("should deal 1/8 max HP per turn", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 200, status: "poison" });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "poison", state);

      // Assert — 1/8 of 200 = 25
      expect(damage).toBe(25);
    });

    it("should not affect Poison types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["poison"] });

      // Act
      const canInflict = canInflictGen2Status("poison", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should not affect Steel types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["steel"] });

      // Act
      const canInflict = canInflictGen2Status("poison", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should not affect dual-type Poison/Flying", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["poison", "flying"] });

      // Act
      const canInflict = canInflictGen2Status("poison", target);

      // Assert
      expect(canInflict).toBe(false);
    });
  });

  describe("Given badly-poisoned (toxic)", () => {
    it("should start at 1/16 max HP", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 160, status: "badly-poisoned" });
      const state = createMockBattleState();

      // Act — first turn (toxicCounter = 1)
      const damage = calculateGen2StatusDamage(pokemon, "badly-poisoned", state);

      // Assert — 1/16 of 160 = 10
      expect(damage).toBe(10);
    });

    it("should increment by 1/16 each turn", () => {
      // Arrange
      const toxicCounter = new Map();
      toxicCounter.set("toxic-counter", { turnsLeft: -1, data: { counter: 3 } });
      const pokemon = createMockActivePokemon({
        maxHp: 160,
        status: "badly-poisoned",
        volatileStatuses: toxicCounter,
      });
      const state = createMockBattleState();

      // Act — counter at 3 = 3/16 damage
      const damage = calculateGen2StatusDamage(pokemon, "badly-poisoned", state);

      // Assert — 3/16 of 160 = 30
      expect(damage).toBe(30);
    });

    it("should floor the damage", () => {
      // Arrange
      const toxicCounter = new Map();
      toxicCounter.set("toxic-counter", { turnsLeft: -1, data: { counter: 2 } });
      const pokemon = createMockActivePokemon({
        maxHp: 100,
        status: "badly-poisoned",
        volatileStatuses: toxicCounter,
      });
      const state = createMockBattleState();

      // Act — 2/16 of 100 = 12.5, floored = 12
      const damage = calculateGen2StatusDamage(pokemon, "badly-poisoned", state);

      // Assert
      expect(damage).toBe(12);
    });

    it("should deal at least 1 damage", () => {
      // Arrange
      const pokemon = createMockActivePokemon({
        maxHp: 1,
        status: "badly-poisoned",
      });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "badly-poisoned", state);

      // Assert
      expect(damage).toBe(1);
    });

    it("should not affect Poison types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["poison"] });

      // Act
      const canInflict = canInflictGen2Status("badly-poisoned", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should not affect Steel types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["steel"] });

      // Act
      const canInflict = canInflictGen2Status("badly-poisoned", target);

      // Assert
      expect(canInflict).toBe(false);
    });
  });

  describe("Given paralysis", () => {
    it("should not affect Electric types (Gen 2 immunity)", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["electric"] });

      // Act
      const canInflict = canInflictGen2Status("paralysis", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should affect non-Electric types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["normal"] });

      // Act
      const canInflict = canInflictGen2Status("paralysis", target);

      // Assert
      expect(canInflict).toBe(true);
    });

    it("should not deal residual damage", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 200, status: "paralysis" });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "paralysis", state);

      // Assert — Paralysis doesn't deal residual damage
      expect(damage).toBe(0);
    });
  });

  describe("Given freeze status", () => {
    it("should not affect Ice types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["ice"] });

      // Act
      const canInflict = canInflictGen2Status("freeze", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should affect non-Ice types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["water"] });

      // Act
      const canInflict = canInflictGen2Status("freeze", target);

      // Assert
      expect(canInflict).toBe(true);
    });

    it("should not deal residual damage", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 200, status: "freeze" });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "freeze", state);

      // Assert — Freeze doesn't deal damage
      expect(damage).toBe(0);
    });
  });

  describe("Given sleep status", () => {
    it("should affect all types", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["normal"] });

      // Act
      const canInflict = canInflictGen2Status("sleep", target);

      // Assert
      expect(canInflict).toBe(true);
    });

    it("should not deal residual damage", () => {
      // Arrange
      const pokemon = createMockActivePokemon({ maxHp: 200, status: "sleep" });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, "sleep", state);

      // Assert — Sleep doesn't deal damage
      expect(damage).toBe(0);
    });
  });

  describe("Given a Pokemon that already has a status", () => {
    it("should not allow inflicting a status on an already-statused Pokemon", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["normal"], status: "burn" });

      // Act
      const canInflict = canInflictGen2Status("poison", target);

      // Assert — Can only have one primary status
      expect(canInflict).toBe(false);
    });
  });

  describe("Given dual-type immunities", () => {
    it("should prevent burn on Fire/Flying", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["fire", "flying"] });

      // Act
      const canInflict = canInflictGen2Status("burn", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should prevent paralysis on Electric/Steel", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["electric", "steel"] });

      // Act
      const canInflict = canInflictGen2Status("paralysis", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should prevent poison on Poison/Ground", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["poison", "ground"] });

      // Act
      const canInflict = canInflictGen2Status("poison", target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should prevent freeze on Ice/Water", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["ice", "water"] });

      // Act
      const canInflict = canInflictGen2Status("freeze", target);

      // Assert
      expect(canInflict).toBe(false);
    });
  });
});
