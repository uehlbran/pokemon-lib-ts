import type { BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";

/**
 * Helper to create a minimal ActivePokemon for turn-order tests.
 * Only the fields read by Gen2Ruleset.resolveTurnOrder are populated.
 */
function createTurnOrderActive(
  speed: number,
  moveId = "tackle",
  overrides: Partial<{
    status: string | null;
    heldItem: string | null;
  }> = {},
) {
  return {
    pokemon: {
      speciesId: 1,
      level: 50,
      currentHp: 200,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: null,
      moves: [{ moveId, currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed,
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
    types: ["normal"],
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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
  };
}

/**
 * Tests for Gen2Ruleset.resolveTurnOrder PRNG determinism.
 *
 * Bug: rng.chance(0.5) inside .sort() comparator consumed a non-deterministic
 * number of PRNG values. Fix: pre-assign tiebreak keys before sorting.
 *
 * Source: GitHub issue #120
 */
describe("Gen2Ruleset — resolveTurnOrder RNG determinism", () => {
  it("given two same-speed actions with same seed, when resolveTurnOrder called twice, then order is identical", () => {
    // Arrange
    const ruleset = new Gen2Ruleset();

    const makeScenario = () => {
      const active0 = createTurnOrderActive(100);
      const active1 = createTurnOrderActive(100);

      const state = {
        sides: [{ active: [active0] }, { active: [active1] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions: BattleAction[] = [
        { type: "move" as const, side: 0 as 0, moveIndex: 0 },
        { type: "move" as const, side: 1 as 0, moveIndex: 0 },
      ];

      return { state, actions };
    };

    // Act
    const { state: state1, actions: actions1 } = makeScenario();
    const rng1 = new SeededRandom(42);
    const order1 = ruleset.resolveTurnOrder(actions1, state1, rng1);

    const { state: state2, actions: actions2 } = makeScenario();
    const rng2 = new SeededRandom(42);
    const order2 = ruleset.resolveTurnOrder(actions2, state2, rng2);

    // Assert: identical ordering — same seed must yield same result
    // Source: determinism requirement — PRNG contract (Mulberry32)
    expect(order1.map((a) => a.side)).toEqual(order2.map((a) => a.side));
  });

  it("given 3 same-speed actions with same seed, when resolveTurnOrder called twice, then order is identical", () => {
    // Arrange: 3-way speed tie is the scenario most susceptible to the .sort() bug
    const ruleset = new Gen2Ruleset();

    const makeScenario = () => {
      const active0 = createTurnOrderActive(100);
      const active1 = createTurnOrderActive(100);
      const active2 = createTurnOrderActive(100);

      const state = {
        sides: [{ active: [active0] }, { active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions: BattleAction[] = [
        { type: "move" as const, side: 0 as 0, moveIndex: 0 },
        { type: "move" as const, side: 1 as 0, moveIndex: 0 },
        { type: "move" as const, side: 2 as 0, moveIndex: 0 },
      ];

      return { state, actions };
    };

    // Act
    const { state: state1, actions: actions1 } = makeScenario();
    const rng1 = new SeededRandom(7777);
    const order1 = ruleset.resolveTurnOrder(actions1, state1, rng1);

    const { state: state2, actions: actions2 } = makeScenario();
    const rng2 = new SeededRandom(7777);
    const order2 = ruleset.resolveTurnOrder(actions2, state2, rng2);

    // Assert
    // Source: determinism requirement — same seed must yield same sequence
    expect(order1.map((a) => a.side)).toEqual(order2.map((a) => a.side));
  });

  it("given Quick Claw holders with same seed, when resolveTurnOrder called twice, then order is identical", () => {
    // Arrange: Quick Claw consumes rng before sorting — verify it's still deterministic
    const ruleset = new Gen2Ruleset();

    const makeScenario = () => {
      const active0 = createTurnOrderActive(100, "tackle", { heldItem: "quick-claw" });
      const active1 = createTurnOrderActive(100, "tackle", { heldItem: "quick-claw" });

      const state = {
        sides: [{ active: [active0] }, { active: [active1] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions: BattleAction[] = [
        { type: "move" as const, side: 0 as 0, moveIndex: 0 },
        { type: "move" as const, side: 1 as 0, moveIndex: 0 },
      ];

      return { state, actions };
    };

    // Act
    const { state: state1, actions: actions1 } = makeScenario();
    const rng1 = new SeededRandom(55555);
    const order1 = ruleset.resolveTurnOrder(actions1, state1, rng1);

    const { state: state2, actions: actions2 } = makeScenario();
    const rng2 = new SeededRandom(55555);
    const order2 = ruleset.resolveTurnOrder(actions2, state2, rng2);

    // Assert
    // Source: determinism requirement — Quick Claw pre-rolls + tiebreak keys must be deterministic
    expect(order1.map((a) => a.side)).toEqual(order2.map((a) => a.side));
  });
});
