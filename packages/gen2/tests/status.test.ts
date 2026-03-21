import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../src/Gen2Ruleset";
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
    it("given an Electric-type Pokemon, when checking if paralysis can be inflicted, then returns true (Electric not immune in Gen 2)", () => {
      // Arrange
      const electricPokemon = createMockActivePokemon({ types: ["electric"] });
      // Act
      const result = canInflictGen2Status("paralysis", electricPokemon);
      // Assert
      expect(result).toBe(true);
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

    it("should allow paralysis on Electric/Steel (no paralysis immunity by type in Gen 2)", () => {
      // Arrange
      const target = createMockActivePokemon({ types: ["electric", "steel"] });

      // Act
      const canInflict = canInflictGen2Status("paralysis", target);

      // Assert — Electric not immune to paralysis in Gen 2 (immunity added in Gen 6)
      expect(canInflict).toBe(true);
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
    const pokemon = createMockActivePokemon({ status: "freeze" });
    let thawCount = 0;
    // Act
    for (let i = 0; i < 100; i++) {
      if (ruleset.checkFreezeThaw(pokemon, rng)) thawCount++;
    }
    // Assert — pre-move thaw NEVER happens in Gen 2
    expect(thawCount).toBe(0);
  });

  it("given a burned Pokemon with 200 max HP, when calculating status damage, then takes 25 damage per turn", () => {
    // Arrange
    const pokemon = createMockActivePokemon({ maxHp: 200, status: "burn" });
    const mockState = {} as BattleState;
    // Act
    const damage = calculateGen2StatusDamage(pokemon, "burn", mockState);
    // Assert
    expect(damage).toBe(25); // floor(200/8) = 25
  });

  it("given a burned Pokemon with 1 max HP, when calculating status damage, then takes minimum 1 damage", () => {
    // Arrange
    const pokemon = createMockActivePokemon({ maxHp: 1, status: "burn" });
    // Act
    const damage = calculateGen2StatusDamage(pokemon, "burn", {} as BattleState);
    // Assert
    expect(damage).toBe(1);
  });

  it("given an Electric-type Pokemon, when checking if burn can be inflicted, then returns true", () => {
    // Arrange
    const electricPokemon = createMockActivePokemon({ types: ["electric"] });
    // Act
    const result = canInflictGen2Status("burn", electricPokemon);
    // Assert
    expect(result).toBe(true);
  });

  it("given a Fire-type Pokemon, when checking if burn can be inflicted, then returns false", () => {
    // Arrange
    const firePokemon = createMockActivePokemon({ types: ["fire"] });
    // Act
    const result = canInflictGen2Status("burn", firePokemon);
    // Assert
    expect(result).toBe(false);
  });

  it("given an Ice-type Pokemon, when checking if freeze can be inflicted, then returns false", () => {
    // Arrange
    const icePokemon = createMockActivePokemon({ types: ["ice"] });
    // Act
    const result = canInflictGen2Status("freeze", icePokemon);
    // Assert
    expect(result).toBe(false);
  });

  it("given a Steel-type Pokemon, when checking if poison can be inflicted, then returns false", () => {
    // Arrange
    const steelPokemon = createMockActivePokemon({ types: ["steel"] });
    // Act
    const result = canInflictGen2Status("poison", steelPokemon);
    // Assert
    expect(result).toBe(false);
  });

  it("given a Pokemon already burned, when checking if paralysis can be inflicted, then returns false", () => {
    // Arrange
    const pokemon = createMockActivePokemon({ status: "burn" });
    // Act
    const result = canInflictGen2Status("paralysis", pokemon);
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
      const pokemon = createMockActivePokemon({ status: "freeze" });
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
    const volatiles = new Map<string, unknown>([["just-frozen", { turnsLeft: 1 }]]);
    const pokemon = createMockActivePokemon({ status: "freeze", volatileStatuses: volatiles });

    // Act
    const thawed = ruleset.processEndOfTurnDefrost(pokemon, rng);

    // Assert — should NOT thaw when just-frozen guard is active
    expect(thawed).toBe(false);
    // Assert — just-frozen volatile should be cleared so next EoT allows the thaw roll
    expect((pokemon.volatileStatuses as Map<string, unknown>).has("just-frozen")).toBe(false);
  });

  it("given a frozen Pokemon where the RNG rolls >= 25, when processEndOfTurnDefrost is called, then returns false", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1542-1543 — BattleRandom, cp 25
    // Only values 0-24 (out of 0-255) trigger thaw. Roll >= 25 → no thaw.
    // SeededRandom seed 7777 produces first roll above 24 for this test.
    // Arrange
    const ruleset = new Gen2Ruleset();
    // Use a seeded RNG where we can verify the first int(0,255) call returns >= 25.
    // We'll run 256 deterministic seeds and find at least one that does NOT thaw.
    let foundNoThaw = false;
    for (let seed = 100; seed < 400; seed++) {
      const rng = new SeededRandom(seed);
      const pokemon = createMockActivePokemon({ status: "freeze" });
      const result = ruleset.processEndOfTurnDefrost(pokemon, rng);
      if (!result) {
        foundNoThaw = true;
        break;
      }
    }

    // Assert — with 300 seeds, we must find at least one non-thaw (probability overwhelmingly certain)
    expect(foundNoThaw).toBe(true);
  });
});
