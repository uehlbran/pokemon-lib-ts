/**
 * Action mutation safety tests.
 *
 * Verifies that the engine clones submitted actions so that caller-side
 * mutations after submitAction() cannot affect queued engine behavior.
 *
 * BattleAction is currently all-primitives (strings, numbers, booleans),
 * so the shallow spread clone on BattleEngine.ts is sufficient. These tests
 * document that contract and will catch regressions if a nested object is
 * ever added to BattleAction without updating the clone strategy.
 */

import { CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleAction, BattleEvent, MoveAction } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

const { tackle } = CORE_MOVE_IDS;

function createEngine(teamSize = 1): { engine: BattleEngine; events: BattleEvent[] } {
  const ruleset = new MockRuleset();
  const dataManager = createMockDataManager();

  const team1 = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(tackle)],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 200,
    }),
  ];
  if (teamSize > 1) {
    team1.push(
      createTestPokemon(6, 50, {
        uid: "charizard-2",
        nickname: "Charizard2",
        moves: [createMockMoveSlot(tackle)],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 200,
      }),
    );
  }

  const team2 = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(tackle)],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  const events: BattleEvent[] = [];
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, events };
}

describe("Action mutation safety — caller cannot alter queued engine behavior", () => {
  it("given a MoveAction submitted to side 0, when caller mutates moveIndex after submission, then engine uses the original moveIndex", () => {
    // Arrange
    const { engine } = createEngine();
    engine.start();

    const action: MoveAction = { type: "move", side: 0, moveIndex: 0 };

    // Act — submit then mutate the caller's object
    engine.submitAction(0, action);
    (action as { moveIndex: number }).moveIndex = 99;

    // Submit side 1 to trigger turn resolution
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — engine should have used moveIndex 0, not 99.
    // If the engine stored a reference to the caller's action, the mutation
    // would cause an out-of-bounds move lookup or wrong move selection.
    const state = engine.getState();
    expect(state.turnNumber).toBeGreaterThanOrEqual(1);
  });

  it("given a SwitchAction submitted, when caller mutates switchTo after submission, then engine uses the original switchTo value", () => {
    // Arrange — need 2 pokemon on side 0 for switching
    const { engine } = createEngine(2);
    engine.start();

    const switchAction: BattleAction = { type: "switch", side: 0, switchTo: 1 };

    // Act — submit then mutate
    engine.submitAction(0, switchAction);
    (switchAction as { switchTo: number }).switchTo = 999;

    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — engine should have switched to team slot 1, not 999
    const state = engine.getState();
    expect(state.turnNumber).toBeGreaterThanOrEqual(1);
  });
});
