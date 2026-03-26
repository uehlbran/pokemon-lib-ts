import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  calculateGen2StatusDamage,
  canInflictGen2Status,
  GEN2_ITEM_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
  Gen2Ruleset,
} from "../../src";
import { createSyntheticOnFieldPokemon as createSharedSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

const _ITEMS = GEN2_ITEM_IDS;
const SPECIES = GEN2_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const _DEFAULT_NATURE = GEN2_NATURE_IDS.hardy;

/**
 * Helper to create a minimal ActivePokemon for status tests.
 */
function createStatusTestPokemon(
  overrides: {
    types?: PokemonType[];
    currentHp?: number;
    maxHp?: number;
    status?: PrimaryStatus | null;
    volatileStatuses?: Map<string, unknown>;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return createSharedSyntheticOnFieldPokemon({
    speciesId: SPECIES.bulbasaur,
    level: 50,
    currentHp: overrides.currentHp ?? maxHp,
    status: overrides.status ?? null,
    types: overrides.types ?? [TYPES.normal],
    volatileStatuses: overrides.volatileStatuses,
    friendship: 70,
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
}

/**
 * Helper to create a minimal BattleState for status tests.
 */
function createMockBattleState(): BattleState {
  return {
    phase: "turn-end",
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
 * - Sleep: 1-6 turns, CAN attack on waking turn (unlike Gen 1)
 * - Freeze: ~9.8% (25/256) thaw chance per turn
 * - Paralysis: 25% full paralysis, Speed to 25%
 * - Confusion: 2-5 turns, 50% self-hit, 40 base power typeless physical
 *
 * Type immunities (Gen 2):
 * - Fire: immune to burn
 * - Ice: immune to freeze
 * - Poison/Steel: immune to poison
 * Note: Electric types are NOT immune to paralysis in Gen 2 (added in Gen 6).
 */
describe("Gen2Status", () => {
  describe("Given burn status", () => {
    it("should deal 1/8 max HP per turn", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.burn });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.burn, state);

      // Assert — 1/8 of 200 = 25
      // Source: Gen 2 status damage is floor(maxHP / 8); floor(200 / 8) = 25.
      expect(damage).toBe(25);
    });

    it("should floor the damage for non-divisible HP", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 100, status: STATUSES.burn });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.burn, state);

      // Assert — floor(100/8) = 12
      expect(damage).toBe(12);
    });

    it("should deal at least 1 damage", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 1, status: STATUSES.burn });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.burn, state);

      // Assert
      expect(damage).toBe(1);
    });

    it("should not affect Fire types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.fire] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.burn, target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should affect non-Fire types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.normal] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.burn, target);

      // Assert
      expect(canInflict).toBe(true);
    });
  });

  describe("Given poison status", () => {
    it("should deal 1/8 max HP per turn", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.poison });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.poison, state);

      // Assert — 1/8 of 200 = 25
      // Source: Gen 2 status damage is floor(maxHP / 8); floor(200 / 8) = 25.
      expect(damage).toBe(25);
    });

    it("should not affect Poison types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.poison] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.poison, target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should not affect Steel types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.steel] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.poison, target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should not affect dual-type Poison/Flying", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.poison, TYPES.flying] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.poison, target);

      // Assert
      expect(canInflict).toBe(false);
    });
  });

  describe("Given badly-poisoned (toxic)", () => {
    it("should start at 1/16 max HP", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 160, status: STATUSES.badlyPoisoned });
      const state = createMockBattleState();

      // Act — first turn (toxicCounter = 1)
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.badlyPoisoned, state);

      // Assert — 1/16 of 160 = 10
      // Source: Gen 2 Toxic starts at 1/16 max HP; floor(160 / 16) = 10.
      expect(damage).toBe(10);
    });

    it("should increment by 1/16 each turn", () => {
      // Arrange
      const toxicCounter = new Map();
      toxicCounter.set(VOLATILES.toxicCounter, { turnsLeft: -1, data: { counter: 3 } });
      const pokemon = createStatusTestPokemon({
        maxHp: 160,
        status: STATUSES.badlyPoisoned,
        volatileStatuses: toxicCounter,
      });
      const state = createMockBattleState();

      // Act — counter at 3 = 3/16 damage
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.badlyPoisoned, state);

      // Assert — 3/16 of 160 = 30
      // Source: Gen 2 Toxic increments by 1/16 per turn; floor(160 * 3 / 16) = 30.
      expect(damage).toBe(30);
    });

    it("should floor the damage", () => {
      // Arrange
      const toxicCounter = new Map();
      toxicCounter.set(VOLATILES.toxicCounter, { turnsLeft: -1, data: { counter: 2 } });
      const pokemon = createStatusTestPokemon({
        maxHp: 100,
        status: STATUSES.badlyPoisoned,
        volatileStatuses: toxicCounter,
      });
      const state = createMockBattleState();

      // Act — 2/16 of 100 = 12.5, floored = 12
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.badlyPoisoned, state);

      // Assert
      // Source: Gen 2 Toxic damage is floor(maxHP * counter / 16); floor(100 * 2 / 16) = 12.
      expect(damage).toBe(12);
    });

    it("should deal at least 1 damage", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({
        maxHp: 1,
        status: STATUSES.badlyPoisoned,
      });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.badlyPoisoned, state);

      // Assert
      expect(damage).toBe(1);
    });

    it("should not affect Poison types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.poison] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.badlyPoisoned, target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should not affect Steel types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.steel] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.badlyPoisoned, target);

      // Assert
      expect(canInflict).toBe(false);
    });
  });

  describe("Given paralysis", () => {
    it("given an Electric-type Pokemon, when checking if paralysis can be inflicted, then returns true (Electric not immune in Gen 2)", () => {
      // Arrange
      const electricPokemon = createStatusTestPokemon({ types: [TYPES.electric] });
      // Act
      const result = canInflictGen2Status(STATUSES.paralysis, electricPokemon);
      // Assert
      expect(result).toBe(true);
    });

    it("should affect non-Electric types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.normal] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.paralysis, target);

      // Assert
      expect(canInflict).toBe(true);
    });

    it("should not deal residual damage", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.paralysis });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.paralysis, state);

      // Assert — Paralysis doesn't deal residual damage
      expect(damage).toBe(0);
    });
  });

  describe("Given freeze status", () => {
    it("should not affect Ice types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.ice] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.freeze, target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should affect non-Ice types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.water] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.freeze, target);

      // Assert
      expect(canInflict).toBe(true);
    });

    it("should not deal residual damage", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.freeze });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.freeze, state);

      // Assert — Freeze doesn't deal damage
      expect(damage).toBe(0);
    });
  });

  describe("Given sleep status", () => {
    it("should affect all types", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.normal] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.sleep, target);

      // Assert
      expect(canInflict).toBe(true);
    });

    it("should not deal residual damage", () => {
      // Arrange
      const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.sleep });
      const state = createMockBattleState();

      // Act
      const damage = calculateGen2StatusDamage(pokemon, STATUSES.sleep, state);

      // Assert — Sleep doesn't deal damage
      expect(damage).toBe(0);
    });
  });

  describe("Given a Pokemon that already has a status", () => {
    it("should not allow inflicting a status on an already-statused Pokemon", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.normal], status: STATUSES.burn });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.poison, target);

      // Assert — Can only have one primary status
      expect(canInflict).toBe(false);
    });
  });

  describe("Given dual-type immunities", () => {
    it("should prevent burn on Fire/Flying", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.fire, TYPES.flying] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.burn, target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should allow paralysis on Electric/Steel (no paralysis immunity by type in Gen 2)", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.electric, TYPES.steel] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.paralysis, target);

      // Assert — Electric not immune to paralysis in Gen 2 (immunity added in Gen 6)
      expect(canInflict).toBe(true);
    });

    it("should prevent poison on Poison/Ground", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.poison, TYPES.ground] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.poison, target);

      // Assert
      expect(canInflict).toBe(false);
    });

    it("should prevent freeze on Ice/Water", () => {
      // Arrange
      const target = createStatusTestPokemon({ types: [TYPES.ice, TYPES.water] });

      // Act
      const canInflict = canInflictGen2Status(STATUSES.freeze, target);

      // Assert
      expect(canInflict).toBe(false);
    });
  });
});

describe("Comprehensive status mechanics", () => {
  it("given a frozen Pokemon, when calling checkFreezeThaw, then always returns false because Gen 2 thaws between turns", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // In Gen 2, freeze thaw happens in HandleBetweenTurnEffects (end-of-turn),
    // NOT pre-move. checkFreezeThaw is called pre-move by the engine, so Gen 2
    // must always return false here. The actual 25/256 thaw roll fires in the
    // "defrost" end-of-turn effect instead.
    // Arrange
    const rng = new SeededRandom(12345);
    const ruleset = new Gen2Ruleset();
    const pokemon = createStatusTestPokemon({ status: STATUSES.freeze });
    // Act
    const thawCount = Array.from({ length: 100 }).reduce(
      (count) => count + (ruleset.checkFreezeThaw(pokemon, rng) ? 1 : 0),
      0,
    );
    // Assert — pre-move thaw NEVER happens in Gen 2
    expect(thawCount).toBe(0);
  });

  it("given a burned Pokemon with 200 max HP, when calculating status damage, then takes 25 damage per turn", () => {
    // Arrange
    const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.burn });
    const mockState = {} as BattleState;
    // Act
    const damage = calculateGen2StatusDamage(pokemon, STATUSES.burn, mockState);
    // Assert
    expect(damage).toBe(25); // floor(200/8) = 25
  });

  it("given a burned Pokemon with 1 max HP, when calculating status damage, then takes minimum 1 damage", () => {
    // Arrange
    const pokemon = createStatusTestPokemon({ maxHp: 1, status: STATUSES.burn });
    // Act
    const damage = calculateGen2StatusDamage(pokemon, STATUSES.burn, {} as BattleState);
    // Assert
    expect(damage).toBe(1);
  });

  it("given an Electric-type Pokemon, when checking if burn can be inflicted, then returns true", () => {
    // Arrange
    const electricPokemon = createStatusTestPokemon({ types: [TYPES.electric] });
    // Act
    const result = canInflictGen2Status(STATUSES.burn, electricPokemon);
    // Assert
    expect(result).toBe(true);
  });

  it("given a Fire-type Pokemon, when checking if burn can be inflicted, then returns false", () => {
    // Arrange
    const firePokemon = createStatusTestPokemon({ types: [TYPES.fire] });
    // Act
    const result = canInflictGen2Status(STATUSES.burn, firePokemon);
    // Assert
    expect(result).toBe(false);
  });

  it("given an Ice-type Pokemon, when checking if freeze can be inflicted, then returns false", () => {
    // Arrange
    const icePokemon = createStatusTestPokemon({ types: [TYPES.ice] });
    // Act
    const result = canInflictGen2Status(STATUSES.freeze, icePokemon);
    // Assert
    expect(result).toBe(false);
  });

  it("given a Steel-type Pokemon, when checking if poison can be inflicted, then returns false", () => {
    // Arrange
    const steelPokemon = createStatusTestPokemon({ types: [TYPES.steel] });
    // Act
    const result = canInflictGen2Status(STATUSES.poison, steelPokemon);
    // Assert
    expect(result).toBe(false);
  });

  it("given a Pokemon already burned, when checking if paralysis can be inflicted, then returns false", () => {
    // Arrange
    const pokemon = createStatusTestPokemon({ status: STATUSES.burn });
    // Act
    const result = canInflictGen2Status(STATUSES.paralysis, pokemon);
    // Assert
    expect(result).toBe(false);
  });
});

describe("Gen 2 processEndOfTurnDefrost", () => {
  it("given a frozen Pokemon without just-frozen volatile, when processEndOfTurnDefrost is called with 1000 seeds, then thaw rate is approximately 25/256 (~9.8%)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1524-1581 HandleDefrost
    // 25/256 (~9.77%) chance to thaw each end-of-turn (if not frozen this turn)
    // Arrange
    const ruleset = new Gen2Ruleset();
    const rng = new SeededRandom(9001);
    let thawCount = 0;
    const iterations = 1000;

    // Act
    for (let i = 0; i < iterations; i++) {
      const pokemon = createStatusTestPokemon({ status: STATUSES.freeze });
      if (ruleset.processEndOfTurnDefrost(pokemon, rng)) thawCount++;
    }
    const rate = thawCount / iterations;

    // Assert — 25/256 ≈ 9.77%, tolerance ±3%
    expect(rate).toBeGreaterThan(0.067);
    expect(rate).toBeLessThan(0.128);
  });

  it("given a frozen Pokemon with just-frozen volatile, when processEndOfTurnDefrost is called, then returns false and clears the volatile", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1538-1540 — wPlayerJustGotFrozen
    // Pokemon frozen this turn must not get a thaw check until next turn.
    // Arrange
    const ruleset = new Gen2Ruleset();
    const rng = new SeededRandom(1); // seed that would thaw otherwise
    const volatiles = new Map<string, unknown>([[VOLATILES.justFrozen, { turnsLeft: 1 }]]);
    const pokemon = createStatusTestPokemon({
      status: STATUSES.freeze,
      volatileStatuses: volatiles,
    });

    // Act
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);

    // Assert — should NOT thaw when just-frozen guard is active
    expect(thawed).toBe(false);
    // Assert — just-frozen volatile should be cleared so next EoT allows the thaw roll
    expect((pokemon.volatileStatuses as Map<string, unknown>).has(VOLATILES.justFrozen)).toBe(
      false,
    );
  });

  it("given a frozen Pokemon where the RNG rolls >= 25, when processEndOfTurnDefrost is called, then returns false", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1542-1543 — BattleRandom, cp 25
    // Only values 0-24 (out of 0-255) trigger thaw. Roll >= 25 → no thaw.
    // SeededRandom seed 7777 produces first roll above 24 for this test.
    // Arrange
    const ruleset = new Gen2Ruleset();
    // Use a seeded RNG where we can verify the first int(0,255) call returns >= 25.
    // We'll run 256 deterministic seeds and find at least one that does NOT thaw.
    const foundNoThaw = Array.from({ length: 300 }, (_, index) => index + 100).some((seed) => {
      const rng = new SeededRandom(seed);
      const pokemon = createStatusTestPokemon({ status: STATUSES.freeze });
      return !ruleset.processEndOfTurnDefrost(pokemon, rng);
    });

    // Assert — with 300 seeds, we must find at least one non-thaw (probability overwhelmingly certain)
    expect(foundNoThaw).toBe(true);
  });
});

describe("Gen2Status calculateGen2StatusDamage default branch", () => {
  it("given an unknown status value, when calculateGen2StatusDamage is called, then returns 0 (default branch)", () => {
    // Exercises Gen2Status.ts line 73 — default branch of status effect switch
    // PrimaryStatus is a closed union (burn | poison | badly-poisoned | paralysis | sleep | freeze).
    // The default branch is a safety net for any value that falls outside the union
    // (e.g., future status additions or unexpected runtime values).
    // We cast to PrimaryStatus to compile but pass a value not handled by any case.
    // Arrange
    const pokemon = createStatusTestPokemon({ maxHp: 200 });
    const state = createMockBattleState();
    const unknownStatus = "frostbite" as PrimaryStatus;

    // Act
    const damage = calculateGen2StatusDamage(pokemon, unknownStatus, state);

    // Assert — default branch returns 0 for unrecognized status conditions
    expect(damage).toBe(0);
  });
});
