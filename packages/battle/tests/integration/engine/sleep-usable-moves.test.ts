import type { DataManager, MoveData, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

/**
 * Tests for issue #524: Sleep Talk and Snore must bypass the sleep check
 * in canExecuteMove().
 *
 * Source: Showdown sim/battle-actions.ts — sleep check skipped for sleepUsable moves
 * Source: Bulbapedia — "Sleep Talk: This move can only be used while the user is asleep."
 * Source: Bulbapedia — "Snore: This move can only be used while the user is asleep."
 */

/** Standard MoveFlags with all false */
const defaultFlags: MoveData["flags"] = {
  contact: false,
  sound: false,
  bullet: false,
  pulse: false,
  punch: false,
  bite: false,
  wind: false,
  slicing: false,
  powder: false,
  protect: true,
  mirror: true,
  snatch: false,
  gravity: false,
  defrost: false,
  recharge: false,
  charge: false,
  bypassSubstitute: false,
};

function createSleepTestDataManager(): DataManager {
  const dm = createMockDataManager();
  const existingSpecies = dm.getAllSpecies();
  const existingMoves = dm.getAllMoves();
  const existingTypeChart = dm.getTypeChart();

  // Sleep Talk — status move usable while asleep
  // Source: Showdown data/moves.ts — sleepUsable: true, handler calls randomMove
  const sleepTalkData: MoveData = {
    id: "sleep-talk",
    displayName: "Sleep Talk",
    type: "normal",
    category: "status",
    power: null,
    accuracy: null,
    pp: 10,
    priority: 0,
    target: "self",
    flags: { ...defaultFlags, protect: false, mirror: false, snatch: false },
    effect: { type: "custom", handler: "sleep-talk" },
    description: "While it is asleep, the user randomly uses one of the moves it knows.",
    generation: 2,
  };

  // Snore — damaging move usable while asleep
  // Source: Showdown data/moves.ts — sleepUsable: true
  const snoreData: MoveData = {
    id: "snore",
    displayName: "Snore",
    type: "normal",
    category: "special",
    power: 50,
    accuracy: 100,
    pp: 15,
    priority: 0,
    target: "adjacent-foe",
    flags: { ...defaultFlags, sound: true },
    effect: null,
    description:
      "This attack can be used only if the user is asleep. The harsh noise may also make the target flinch.",
    generation: 2,
  };

  // Reload the full fixture snapshot so the helper stays compatible with
  // DataManager.loadFromObjects replacing all entity maps atomically.
  dm.loadFromObjects({
    pokemon: existingSpecies,
    moves: [...existingMoves, sleepTalkData, snoreData],
    items: [],
    typeChart: existingTypeChart,
  });

  return dm;
}

function createSleepTestEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = overrides?.dataManager ?? createSleepTestDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        { moveId: "sleep-talk", currentPP: 10, maxPP: 10, ppUps: 0 },
        { moveId: "snore", currentPP: 15, maxPP: 15, ppUps: 0 },
        { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
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
      status: "sleep",
    }),
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
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
      events.some((e) => e.type === "move-start" && e.side === 0 && e.move === "sleep-talk"),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "move-fail" && e.side === 0 && e.move === "sleep-talk"),
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
    expect(events.some((e) => e.type === "move-start" && e.side === 0 && e.move === "snore")).toBe(
      true,
    );
    expect(
      events.some((e) => e.type === "damage" && e.side === 1 && e.source === "snore"),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "move-fail" && e.side === 0 && e.move === "snore"),
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
    expect(events.some((e) => e.type === "move-start" && e.side === 0 && e.move === "tackle")).toBe(
      false,
    );
    expect(
      events.some(
        (e) => e.type === "message" && "text" in e && e.text.includes("fast asleep"),
      ),
    ).toBe(true);
    expect(events.some((e) => e.type === "damage" && e.side === 1 && e.source === "tackle")).toBe(
      false,
    );
  });

  it("given a Pokemon that wakes up, when using Sleep Talk, then the move proceeds normally (wake-up still allows move)", () => {
    // Arrange
    // Source: Showdown — if processSleepTurn returns true (woke up), the move executes regardless
    const { engine, ruleset, events } = createSleepTestEngine();

    ruleset.processSleepTurn = (pokemon, _state) => {
      // Pokemon wakes up this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    };

    engine.start();

    // Act — Charizard uses Sleep Talk (slot 0), but wakes up
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — waking up clears the sleep status and allows the move to execute.
    expect(
      events.some((e) => e.type === "status-cure" && e.side === 0 && e.status === "sleep"),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "move-start" && e.side === 0 && e.move === "sleep-talk"),
    ).toBe(true);
  });
});
