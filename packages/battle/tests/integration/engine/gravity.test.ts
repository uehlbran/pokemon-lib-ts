import { CORE_MOVE_IDS, type PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, MoveEffectContext, MoveEffectResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager, MOCK_SPECIES_IDS } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle), createMockMoveSlot(CORE_MOVE_IDS.fly)],
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

  const team2 = overrides?.team2 ?? [
    createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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

  return { engine, ruleset, events, dataManager };
}

// ─── Gravity Engine Infrastructure Tests ──────────────────────────────────────

describe("gravity engine infrastructure", () => {
  describe("given gravitySet in move effect result, when processEffectResult runs, then state.gravity is set to active with 5 turns", () => {
    it("sets gravity active=true and turnsLeft=5, and emits 'Gravity intensified!' message", () => {
      // Arrange: configure executeMoveEffect to return gravitySet=true on the first call
      // Source: Showdown Gen 4 mod — Gravity lasts 5 turns
      const ruleset = new MockRuleset();
      let callCount = 0;
      const origExecute = ruleset.executeMoveEffect.bind(ruleset);
      ruleset.executeMoveEffect = (context: MoveEffectContext): MoveEffectResult => {
        callCount++;
        if (callCount === 1 && context.attacker.pokemon.uid === "charizard-1") {
          return {
            statusInflicted: null,
            volatileInflicted: null,
            statChanges: [],
            recoilDamage: 0,
            healAmount: 0,
            switchOut: false,
            messages: [],
            gravitySet: true,
          };
        }
        return origExecute(context);
      };

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act: submit moves — Charizard's move triggers gravitySet
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: gravity should be active with 5 turns
      const state = engine.getState();
      expect(state.gravity.active).toBe(true);
      expect(state.gravity.turnsLeft).toBe(5);

      // Assert: "Gravity intensified!" message emitted
      const gravityMessages = events.filter(
        (e) => e.type === "message" && "text" in e && e.text === "Gravity intensified!",
      );
      expect(gravityMessages.length).toBe(1);
    });
  });

  describe("given gravity active, when gravity-countdown end-of-turn effect processed, then turnsLeft decremented by 1", () => {
    it("decrements turnsLeft from 5 to 4 after one turn", () => {
      // Arrange: configure ruleset to include gravity-countdown in end-of-turn order
      // and set gravity via the first move's effect
      // Source: Showdown Gen 4 mod — Gravity countdown decrements each turn
      const ruleset = new MockRuleset();
      let callCount = 0;
      const origExecute = ruleset.executeMoveEffect.bind(ruleset);
      ruleset.executeMoveEffect = (context: MoveEffectContext): MoveEffectResult => {
        callCount++;
        if (callCount === 1 && context.attacker.pokemon.uid === "charizard-1") {
          return {
            statusInflicted: null,
            volatileInflicted: null,
            statChanges: [],
            recoilDamage: 0,
            healAmount: 0,
            switchOut: false,
            messages: [],
            gravitySet: true,
          };
        }
        return origExecute(context);
      };

      // Override getEndOfTurnOrder to include gravity-countdown
      ruleset.getEndOfTurnOrder = () => ["gravity-countdown"];

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act: turn 1 — sets gravity (turnsLeft=5), end-of-turn decrements to 4
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: after 1 end-of-turn, turnsLeft should be 4
      const state = engine.getState();
      expect(state.gravity.active).toBe(true);
      expect(state.gravity.turnsLeft).toBe(4);
    });
  });

  describe("given gravity active for 5 turns, when the 5th gravity-countdown runs, then gravity deactivates", () => {
    it("deactivates gravity and emits 'Gravity returned to normal!' when turnsLeft reaches 0", () => {
      // Arrange: set gravity directly to turnsLeft=1 (simulating 4 turns already passed)
      // Source: Showdown Gen 4 mod — Gravity ends after 5 turns
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = () => ["gravity-countdown"];

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Directly set gravity to its last turn
      const state = engine.getState();
      (state as { gravity: { active: boolean; turnsLeft: number } }).gravity = {
        active: true,
        turnsLeft: 1,
      };

      // Act: run a turn — the end-of-turn gravity-countdown should decrement 1 -> 0
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: gravity should be deactivated
      expect(state.gravity.active).toBe(false);
      expect(state.gravity.turnsLeft).toBe(0);

      // Assert: "Gravity returned to normal!" message emitted
      const normalMessages = events.filter(
        (e) => e.type === "message" && "text" in e && e.text === "Gravity returned to normal!",
      );
      expect(normalMessages.length).toBe(1);
    });
  });

  describe("given gravity active, when Pokemon tries to use a move with flags.gravity=true, then the move is blocked", () => {
    it("emits a message about gravity preventing the move and does not deal damage", () => {
      // Arrange: activate gravity, then have Charizard try to use Fly (gravity flag = true)
      // Source: Showdown Gen 4 mod — Gravity disables Fly, Bounce, etc.
      const { engine, events } = createEngine();
      engine.start();

      // Directly set gravity active
      const state = engine.getState();
      (state as { gravity: { active: boolean; turnsLeft: number } }).gravity = {
        active: true,
        turnsLeft: 5,
      };

      // Act: Charizard tries to use Fly (moveIndex 1, which has gravity: true in mock data)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: gravity block message emitted for Charizard's Fly
      const blockMessages = events.filter(
        (e) =>
          e.type === "message" &&
          "text" in e &&
          (e.text as string).includes("can't use Fly because of gravity"),
      );
      expect(blockMessages.length).toBe(1);

      // Assert: no damage event targeting Blastoise from Fly
      // (Blastoise may take damage from its own tackle execution, but Fly should not fire)
      const flyDamageEvents = events.filter(
        (e) =>
          e.type === "move-execute" &&
          "pokemon" in e &&
          e.pokemon === "Charizard" &&
          "move" in e &&
          e.move === "Fly",
      );
      expect(flyDamageEvents.length).toBe(0);
    });
  });
});
