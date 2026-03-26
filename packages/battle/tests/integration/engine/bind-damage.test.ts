import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_MOVE_IDS,
  CORE_VOLATILE_IDS,
  type PokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, EndOfTurnEffect } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
      currentHp: 200,
    }),
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 2,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("processBindDamage — end-of-turn bind damage", () => {
  describe("Gen 2+ bind damage", () => {
    it("given a pokemon with bound volatile, when end of turn processes, then bind damage event is emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [
        CORE_END_OF_TURN_EFFECT_IDS.bind,
      ];

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Set bound on Blastoise (side 1) with enough turns so it persists through move execution
      const blastoise = engine.state.sides[1].active[0];
      blastoise?.volatileStatuses.set(CORE_VOLATILE_IDS.bound, { turnsLeft: 3 });

      // Act — submit a turn so end-of-turn processing runs
      events.length = 0; // clear start events
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const bindDamageEvents = events.filter(
        (e) =>
          e.type === "damage" && "source" in e && e.source === CORE_END_OF_TURN_EFFECT_IDS.bind,
      );
      expect(bindDamageEvents).toHaveLength(1);

      // Damage should be 1/8 of max HP (MockRuleset.calculateBindDamage)
      const bindDamage = bindDamageEvents[0];
      if (bindDamage && bindDamage.type === "damage") {
        const expectedDamage = Math.max(
          1,
          Math.floor((engine.state.sides[1].active[0]?.pokemon.calculatedStats?.hp ?? 200) / 8),
        );
        expect(bindDamage.amount).toBe(expectedDamage);
      }
    });

    it("given a bound volatile with turnsLeft=3, when end of turn processes, then damage is dealt and the counter decrements", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [
        CORE_END_OF_TURN_EFFECT_IDS.bind,
      ];

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      const blastoise = engine.state.sides[1].active[0];
      // turnsLeft=2: canExecuteMove decrements to 1 (not 0) so move is blocked but volatile stays
      // Then processBindDamage decrements to... wait, let's use turnsLeft=3 to be safe
      blastoise?.volatileStatuses.set(CORE_VOLATILE_IDS.bound, { turnsLeft: 3 });

      // Act
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const bindDamageEvents = events.filter(
        (e) =>
          e.type === "damage" && "source" in e && e.source === CORE_END_OF_TURN_EFFECT_IDS.bind,
      );
      expect(bindDamageEvents).toHaveLength(1);

      const boundState = engine.state.sides[1].active[0]?.volatileStatuses.get(
        CORE_VOLATILE_IDS.bound,
      );
      expect(boundState).toEqual({ turnsLeft: 2 });
    });

    it("given a bound volatile with turnsLeft=1, when move is attempted, then volatile-end is emitted and the volatile is cleared", () => {
      // Arrange — turnsLeft=1: canExecuteMove sees turnsLeft<=1, clears volatile and emits volatile-end,
      // then allows the move. processBindDamage finds no "bound" status → no EOT damage.
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [
        CORE_END_OF_TURN_EFFECT_IDS.bind,
      ];

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      const blastoise = engine.state.sides[1].active[0];
      blastoise?.volatileStatuses.set(CORE_VOLATILE_IDS.bound, { turnsLeft: 1 });

      // Act
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const volatileEndEvents = events.filter(
        (e) =>
          e.type === "volatile-end" && "volatile" in e && e.volatile === CORE_VOLATILE_IDS.bound,
      );
      expect(volatileEndEvents).toHaveLength(1);

      expect(engine.state.sides[1].active[0]?.volatileStatuses.has(CORE_VOLATILE_IDS.bound)).toBe(
        false,
      );
    });

    it("given a fainted pokemon with bound volatile, when end of turn processes, then no bind damage event is emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [
        CORE_END_OF_TURN_EFFECT_IDS.bind,
      ];

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      const blastoise = engine.state.sides[1].active[0];
      if (blastoise) {
        blastoise.pokemon.currentHp = 0; // fainted
        blastoise.volatileStatuses.set(CORE_VOLATILE_IDS.bound, { turnsLeft: 3 });
      }

      // Act
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no bind damage events should be emitted for a fainted pokemon
      const bindDamageEvents = events.filter(
        (e) =>
          e.type === "damage" && "source" in e && e.source === CORE_END_OF_TURN_EFFECT_IDS.bind,
      );
      expect(bindDamageEvents.length).toBe(0);
    });
  });

  describe("Gen 1 bind — no end-of-turn damage", () => {
    it("given a Gen 1 ruleset without bind in end-of-turn order, when pokemon has bound volatile, then no bind damage event is emitted", () => {
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [
        CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
      ];

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      const blastoise = engine.state.sides[1].active[0];
      blastoise?.volatileStatuses.set(CORE_VOLATILE_IDS.bound, { turnsLeft: 3 });

      // Act
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no bind damage events since "bind" is not in EOT order
      const bindDamageEvents = events.filter(
        (e) =>
          e.type === "damage" && "source" in e && e.source === CORE_END_OF_TURN_EFFECT_IDS.bind,
      );
      expect(bindDamageEvents.length).toBe(0);
    });
  });
});
