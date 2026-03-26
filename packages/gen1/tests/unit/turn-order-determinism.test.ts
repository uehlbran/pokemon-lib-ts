import type { BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import { CORE_MOVE_IDS, CORE_TYPE_IDS, createMoveSlot, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../../src";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

const dataManager = createGen1DataManager();
const tackleMove = dataManager.getMove(CORE_MOVE_IDS.tackle);

/**
 * Helper to create a minimal ActivePokemon for turn-order tests.
 * Only the fields read by Gen1Ruleset.resolveTurnOrder are populated.
 */
function createTurnOrderActive(
  speed: number,
  moveId = CORE_MOVE_IDS.tackle,
  status: string | null = null,
) {
  return {
    pokemon: {
      speciesId: 1,
      level: 50,
      currentHp: 200,
      status,
      heldItem: null,
      nickname: null,
      moves: [createMoveSlot(moveId, tackleMove.pp)],
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
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [CORE_TYPE_IDS.normal],
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
 * Tests for Gen1Ruleset.resolveTurnOrder PRNG determinism.
 *
 * Bug: rng.chance(0.5) inside .sort() comparator consumed a non-deterministic
 * number of PRNG values. Fix: pre-assign tiebreak keys before sorting.
 *
 * Source: GitHub issue #120
 */
describe("Gen1Ruleset — resolveTurnOrder RNG determinism", () => {
  it("given two same-speed actions with same seed, when resolveTurnOrder called twice, then order is identical", () => {
    // Arrange
    const ruleset = new Gen1Ruleset();

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
    const ruleset = new Gen1Ruleset();

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
});
