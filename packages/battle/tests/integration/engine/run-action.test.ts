import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent, FleeAttemptEvent } from "../../../src/events";
import { BaseRuleset } from "../../../src/ruleset/BaseRuleset";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

// Concrete TestRuleset for testing BaseRuleset.rollFleeSuccess directly
class FormulaTestRuleset extends BaseRuleset {
  readonly generation = 4 as const;
  readonly name = "Test Gen 4";
  getTypeChart() {
    return {} as ReturnType<BaseRuleset["getTypeChart"]>;
  }
  getAvailableTypes() {
    return [] as unknown as ReturnType<BaseRuleset["getAvailableTypes"]>;
  }
  calculateDamage() {
    return { damage: 0, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

class DeterministicFleeRuleset extends MockRuleset {
  override rollFleeSuccess(
    _playerSpeed: number,
    _wildSpeed: number,
    _attempts: number,
    rng: SeededRandom,
  ): boolean {
    return rng.chance(0.5);
  }
}

function createWildBattleEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
  isWildBattle?: boolean;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = overrides?.dataManager ?? createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    isWildBattle: overrides?.isWildBattle ?? true,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("RunAction flee mechanic", () => {
  describe("successful flee", () => {
    it("given a wild battle with flee always succeeding, when RunAction is submitted, then flee-attempt event is emitted with success=true", () => {
      // Arrange
      const { engine, ruleset, events } = createWildBattleEngine();
      ruleset.setFleeSuccess(true);
      engine.start();
      events.length = 0;

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: BattleEvent discriminated union -- flee-attempt event has success field
      const fleeEvent = events.find((e) => e.type === "flee-attempt") as
        | FleeAttemptEvent
        | undefined;
      expect(fleeEvent).toBeDefined();
      expect(fleeEvent!.success).toBe(true);
      expect(fleeEvent!.side).toBe(0);
    });

    it("given a wild battle and flee succeeds, when RunAction is submitted, then battle-end event is emitted with winner null", () => {
      // Arrange
      const { engine, ruleset, events } = createWildBattleEngine();
      ruleset.setFleeSuccess(true);
      engine.start();
      events.length = 0;

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: BattleEndEvent interface -- winner is null when battle ends without a victor (flee/draw)
      const endEvent = events.find((e) => e.type === "battle-end");
      expect(endEvent).toBeDefined();
      expect(endEvent!.type).toBe("battle-end");
      expect((endEvent as { winner: 0 | 1 | null }).winner).toBeNull();
    });

    it("given a wild battle and flee succeeds, when RunAction is submitted, then 'Got away safely!' message is emitted", () => {
      // Arrange
      const { engine, ruleset, events } = createWildBattleEngine();
      ruleset.setFleeSuccess(true);
      engine.start();
      events.length = 0;

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: In-game text displayed when player successfully flees a wild battle
      const messageEvent = events.find(
        (e) => e.type === "message" && (e as { text: string }).text === "Got away safely!",
      );
      expect(messageEvent).toEqual({ type: "message", text: "Got away safely!" });
    });

    it("given a wild battle and flee succeeds, when RunAction is submitted, then engine state is ended", () => {
      // Arrange
      const { engine, ruleset } = createWildBattleEngine();
      ruleset.setFleeSuccess(true);
      engine.start();

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: BattleState.ended is set to true when battle concludes
      expect(engine.isEnded()).toBe(true);
    });
  });

  describe("failed flee", () => {
    it("given a wild battle and flee fails, when RunAction is submitted, then flee-attempt event is emitted with success=false", () => {
      // Arrange
      const { engine, ruleset, events } = createWildBattleEngine();
      ruleset.setFleeSuccess(false);
      engine.start();
      events.length = 0;

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: BattleEvent discriminated union -- flee-attempt event with success=false
      const fleeEvent = events.find((e) => e.type === "flee-attempt") as
        | FleeAttemptEvent
        | undefined;
      expect(fleeEvent).toBeDefined();
      expect(fleeEvent!.success).toBe(false);
    });

    it("given a wild battle and flee fails, when RunAction is submitted, then 'Can't escape!' message is emitted and battle continues", () => {
      // Arrange
      const { engine, ruleset, events } = createWildBattleEngine();
      ruleset.setFleeSuccess(false);
      engine.start();
      events.length = 0;

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: In-game text displayed when player fails to flee a wild battle
      const messageEvent = events.find(
        (e) => e.type === "message" && (e as { text: string }).text === "Can't escape!",
      );
      expect(messageEvent).toBeDefined();
      // Battle should not be ended
      expect(engine.isEnded()).toBe(false);
    });
  });

  describe("trainer battle restriction", () => {
    it("given a trainer battle (isWildBattle=false), when RunAction is submitted, then no flee-attempt event is emitted and trainer message shown", () => {
      // Arrange
      const { engine, events } = createWildBattleEngine({ isWildBattle: false });
      engine.start();
      events.length = 0;

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: Game mechanic -- fleeing is not allowed in trainer battles
      const fleeEvent = events.find((e) => e.type === "flee-attempt");
      expect(fleeEvent).toBeUndefined();

      // Should emit a message about trainer battles
      const trainerMessage = events.find(
        (e) =>
          e.type === "message" &&
          (e as { text: string }).text === "Can't run from a trainer battle!",
      );
      expect(trainerMessage).toBeDefined();
      expect(engine.isEnded()).toBe(false);
    });
  });

  describe("run side validation", () => {
    it("given a wild battle, when side 1 submits a RunAction, then submitAction throws instead of silently ignoring it", () => {
      const { engine } = createWildBattleEngine();
      engine.start();

      // Source: BattleEngine.submitAction run-side validation guard.
      expect(() => engine.submitAction(1, { type: "run", side: 1 })).toThrow(
        "RunAction is only valid for side 0",
      );
    });
  });

  describe("flee attempts counter", () => {
    it("given a wild battle, when flee attempted twice, then fleeAttempts increments to 2", () => {
      // Arrange
      const { engine, ruleset } = createWildBattleEngine();
      ruleset.setFleeSuccess(false);
      engine.start();

      // Act -- first flee attempt
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert first attempt
      // Source: BattleState.fleeAttempts -- incremented on each RunAction
      expect(engine.state.fleeAttempts).toBe(1);

      // Act -- second flee attempt
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert second attempt
      expect(engine.state.fleeAttempts).toBe(2);
    });
  });

  describe("isWildBattle state", () => {
    it("given isWildBattle=true in config, when engine is created, then state.isWildBattle is true", () => {
      // Arrange & Act
      const { engine } = createWildBattleEngine({ isWildBattle: true });

      // Assert
      // Source: BattleConfig.isWildBattle maps to BattleState.isWildBattle
      expect(engine.state.isWildBattle).toBe(true);
    });

    it("given isWildBattle not set in config, when engine is created, then state.isWildBattle defaults to false", () => {
      // Arrange & Act
      const ruleset = new MockRuleset();
      const dataManager = createMockDataManager();
      const config: BattleConfig = {
        generation: 1,
        format: "singles",
        teams: [
          [
            createTestPokemon(6, 50, {
              uid: "a",
              calculatedStats: {
                hp: 200,
                attack: 100,
                defense: 100,
                spAttack: 100,
                spDefense: 100,
                speed: 100,
              },
              currentHp: 200,
            }),
          ],
          [
            createTestPokemon(9, 50, {
              uid: "b",
              calculatedStats: {
                hp: 200,
                attack: 100,
                defense: 100,
                spAttack: 100,
                spDefense: 100,
                speed: 100,
              },
              currentHp: 200,
            }),
          ],
        ],
        seed: 42,
        // isWildBattle intentionally omitted
      };
      const engine = new BattleEngine(config, ruleset, dataManager);

      // Assert
      // Source: BattleEngine constructor -- defaults isWildBattle to false
      expect(engine.state.isWildBattle).toBe(false);
    });
  });

  describe("determinism", () => {
    it("given the same seed and same actions, when flee is rolled twice, then the full event trace is identical", () => {
      const runScenario = () => {
        const { engine, events } = createWildBattleEngine({
          seed: 99999,
          ruleset: new DeterministicFleeRuleset(),
        });
        engine.start();
        events.length = 0;

        engine.submitAction(0, { type: "run", side: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        return {
          events: events.map((event) => ({ ...event })),
          ended: engine.isEnded(),
          winner: engine.getWinner(),
          fleeAttempts: engine.state.fleeAttempts,
        };
      };

      const firstRun = runScenario();
      const secondRun = runScenario();

      expect(firstRun).toEqual(secondRun);
    });
  });

  describe("BaseRuleset.rollFleeSuccess formula", () => {
    it("given playerSpeed >= wildSpeed, when rollFleeSuccess is called, then flee always succeeds", () => {
      // Arrange
      // Source: Bulbapedia -- Escape (Gen III+): if playerSpeed >= wildSpeed, flee always succeeds
      const rng = new SeededRandom(42);
      const ruleset = new FormulaTestRuleset();

      // Act & Assert -- playerSpeed > wildSpeed
      expect(ruleset.rollFleeSuccess(120, 80, 1, rng)).toBe(true);

      // Act & Assert -- playerSpeed == wildSpeed
      expect(ruleset.rollFleeSuccess(100, 100, 1, rng)).toBe(true);
    });

    it("given playerSpeed < wildSpeed and F >= 256, when rollFleeSuccess is called, then flee succeeds without RNG", () => {
      // Arrange
      // Source: Bulbapedia -- Escape: F = floor(playerSpeed * 128 / wildSpeed) + 30 * attempts
      // If F >= 256, flee always succeeds.
      // With playerSpeed=90, wildSpeed=100, attempts=6:
      // F = floor(90 * 128 / 100) + 30 * 6 = floor(115.2) + 180 = 115 + 180 = 295 >= 256
      const rng = new SeededRandom(42);
      const ruleset = new FormulaTestRuleset();

      // F = floor(90 * 128 / 100) + 30 * 6 = 115 + 180 = 295 >= 256
      expect(ruleset.rollFleeSuccess(90, 100, 6, rng)).toBe(true);
    });

    it("given playerSpeed < wildSpeed and low attempts, when rollFleeSuccess is called, then seeded RNG produces a stable mix of outcomes", () => {
      // Arrange
      // Source: Bulbapedia -- Escape: flee succeeds if rng(0,255) < F
      // With playerSpeed=50, wildSpeed=100, attempts=1:
      // F = floor(50 * 128 / 100) + 30 * 1 = floor(64) + 30 = 94
      // So ~94/256 = ~36.7% chance of success
      const ruleset = new FormulaTestRuleset();

      const outcomes = Array.from({ length: 12 }, (_, seed) =>
        ruleset.rollFleeSuccess(50, 100, 1, new SeededRandom(seed)),
      );

      // Source: SeededRandom is deterministic, so these seed-specific outcomes are stable.
      expect(outcomes).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        false,
        false,
      ]);
    });
  });
});
