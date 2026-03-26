import {
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
  type PokemonInstance,
} from "@pokemon-lib-ts/core";
import { createGen2DataManager, GEN2_SPECIES_IDS } from "@pokemon-lib-ts/gen2";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

/**
 * Tests for issue #524: Sleep Talk and Snore must bypass the sleep check
 * in canExecuteMove().
 *
 * Source: Showdown sim/battle-actions.ts — sleep check skipped for sleepUsable moves
 * Source: Bulbapedia — "Sleep Talk: This move can only be used while the user is asleep."
 * Source: Bulbapedia — "Snore: This move can only be used while the user is asleep."
 */

const DATA_MANAGER = createGen2DataManager();
const SPECIES_IDS = GEN2_SPECIES_IDS;
const SLEEP_TALK = DATA_MANAGER.getMove(CORE_MOVE_IDS.sleepTalk);
const SNORE = DATA_MANAGER.getMove(CORE_MOVE_IDS.snore);
const TACKLE = DATA_MANAGER.getMove(CORE_MOVE_IDS.tackle);

function createCanonicalMoveSlot(moveId: string) {
  const move = DATA_MANAGER.getMove(moveId);
  return createMoveSlot(move.id, move.pp);
}

function createSleepTestEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  ruleset.setGenerationForTest(2);
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        createCanonicalMoveSlot(SLEEP_TALK.id),
        createCanonicalMoveSlot(SNORE.id),
        createCanonicalMoveSlot(TACKLE.id),
      ],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 200,
      status: CORE_STATUS_IDS.sleep,
    }),
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(SPECIES_IDS.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createCanonicalMoveSlot(TACKLE.id)],
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
    generation: 2,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, DATA_MANAGER);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("Sleep-usable moves (issue #524)", () => {
  it("given a sleeping Pokemon using Sleep Talk, when canExecuteMove runs, then the move is NOT blocked by sleep", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — sleepUsable moves bypass the sleep immobilization check
    const { engine, ruleset, events } = createSleepTestEngine();

    // Make processSleepTurn return false (still asleep) — but Sleep Talk should still execute
    ruleset.processSleepTurn = (_pokemon, _state) => {
      return false; // still asleep
    };

    engine.start();
    events.length = 0;

    // Act — sleeping Charizard uses Sleep Talk (slot 0)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — sleep talk reaches the move-start stage even though the user remains asleep.
    expect(
      events.some(
        (e) => e.type === "move-start" && e.side === 0 && e.move === CORE_MOVE_IDS.sleepTalk,
      ),
    ).toBe(true);
    expect(
      events.some(
        (e) => e.type === "move-fail" && e.side === 0 && e.move === CORE_MOVE_IDS.sleepTalk,
      ),
    ).toBe(false);
  });

  it("given a sleeping Pokemon using Snore, when canExecuteMove runs, then the move is NOT blocked by sleep", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Snore has sleepUsable flag
    const { engine, ruleset, events } = createSleepTestEngine();

    ruleset.processSleepTurn = (_pokemon, _state) => {
      return false; // still asleep
    };

    engine.start();
    events.length = 0;

    // Act — sleeping Charizard uses Snore (slot 1)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    expect(
      events.some((e) => e.type === "move-start" && e.side === 0 && e.move === CORE_MOVE_IDS.snore),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "damage" && e.side === 1 && e.source === CORE_MOVE_IDS.snore),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "move-fail" && e.side === 0 && e.move === CORE_MOVE_IDS.snore),
    ).toBe(false);
  });

  it("given a sleeping Pokemon using Tackle, when canExecuteMove runs, then the move IS blocked by sleep", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — normal moves are blocked when asleep
    const { engine, ruleset, events } = createSleepTestEngine();

    ruleset.processSleepTurn = (_pokemon, _state) => {
      return false; // still asleep
    };

    engine.start();
    events.length = 0;

    // Act — sleeping Charizard uses Tackle (slot 2, a regular move)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Tackle never reaches move-start and the battle reports the sleep block.
    expect(
      events.some(
        (e) => e.type === "move-start" && e.side === 0 && e.move === CORE_MOVE_IDS.tackle,
      ),
    ).toBe(false);
    expect(
      events.some((e) => e.type === "message" && "text" in e && e.text.includes("fast asleep")),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "damage" && e.side === 1 && e.source === CORE_MOVE_IDS.tackle),
    ).toBe(false);
  });

  it("given a Pokemon that wakes up, when using Sleep Talk, then the move proceeds normally (wake-up still allows move)", () => {
    // Arrange
    // Source: Showdown — if processSleepTurn returns true (woke up), the move executes regardless
    const { engine, ruleset, events } = createSleepTestEngine();

    ruleset.processSleepTurn = (pokemon, _state) => {
      // Pokemon wakes up this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.sleepCounter);
      return true;
    };

    engine.start();

    // Act — Charizard uses Sleep Talk (slot 0), but wakes up
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — waking up clears the sleep status and allows the move to execute.
    expect(
      events.some(
        (e) => e.type === "status-cure" && e.side === 0 && e.status === CORE_STATUS_IDS.sleep,
      ),
    ).toBe(true);
    expect(
      events.some(
        (e) => e.type === "move-start" && e.side === 0 && e.move === CORE_MOVE_IDS.sleepTalk,
      ),
    ).toBe(true);
  });
});
