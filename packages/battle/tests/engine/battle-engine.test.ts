import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import type { ActivePokemon } from "../../src/state";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

class TrappedSwitchRuleset extends MockRuleset {
  override canSwitch(): boolean {
    return false;
  }
}

function createTestEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
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
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("BattleEngine", () => {
  describe("constructor", () => {
    it("given a valid config, when engine is created, then initial phase is battle-start", () => {
      // Arrange & Act
      const { engine } = createTestEngine();

      // Assert
      expect(engine.getPhase()).toBe("battle-start");
    });

    it("given a valid config, when engine is created, then battle is not ended", () => {
      // Arrange & Act
      const { engine } = createTestEngine();

      // Assert
      expect(engine.isEnded()).toBe(false);
      expect(engine.getWinner()).toBeNull();
    });

    it("given a valid config, when engine is created, then teams are stored", () => {
      // Arrange & Act
      const { engine } = createTestEngine();

      // Assert
      expect(engine.state.sides[0].team).toHaveLength(1);
      expect(engine.state.sides[1].team).toHaveLength(1);
    });

    it("given caller-owned team members, when engine is created, then constructor state stays engine-owned and does not mutate the caller objects", () => {
      const team1 = [
        createTestPokemon(25, 5, {
          currentHp: 1,
          calculatedStats: {
            hp: 1,
            attack: 1,
            defense: 1,
            spAttack: 1,
            spDefense: 1,
            speed: 1,
          },
        }),
      ];
      const originalPokemon = team1[0]!;
      const originalMoves = originalPokemon.moves;
      const originalEvs = originalPokemon.evs;
      const originalIvs = originalPokemon.ivs;
      const originalCalculatedStats = originalPokemon.calculatedStats;

      const { engine } = createTestEngine({ team1 });

      const enginePokemon = engine.getTeam(0)[0]!;
      expect(enginePokemon).not.toBe(originalPokemon);
      expect(enginePokemon.moves).not.toBe(originalMoves);
      expect(enginePokemon.evs).not.toBe(originalEvs);
      expect(enginePokemon.ivs).not.toBe(originalIvs);
      expect(enginePokemon.calculatedStats).not.toBe(originalCalculatedStats);

      expect(originalPokemon.currentHp).toBe(1);
      expect(originalPokemon.calculatedStats).toEqual({
        hp: 1,
        attack: 1,
        defense: 1,
        spAttack: 1,
        spDefense: 1,
        speed: 1,
      });

      originalPokemon.currentHp = 7;
      originalPokemon.moves[0]!.currentPP = 1;
      originalPokemon.evs.hp = 200;

      expect(enginePokemon.currentHp).toBe(20);
      expect(enginePokemon.moves[0]!.currentPP).toBe(35);
      expect(enginePokemon.evs.hp).toBe(0);
    });

    it("given a ruleset whose generation does not match the battle config, when engine is created, then it throws", () => {
      const ruleset = new MockRuleset();
      Object.defineProperty(ruleset, "generation", { value: 9 });

      const dataManager = createMockDataManager();
      const config: BattleConfig = {
        generation: 1,
        format: "singles",
        teams: [[createTestPokemon(6, 50)], [createTestPokemon(9, 50)]],
        seed: 12345,
      };

      expect(() => new BattleEngine(config, ruleset, dataManager)).toThrow(
        "BattleEngine: ruleset generation 9 does not match battle generation 1",
      );
    });

    it("given a non-singles battle format, when engine is created, then it rejects unsupported multi-active formats", () => {
      const dataManager = createMockDataManager();
      const config: BattleConfig = {
        generation: 1,
        format: "doubles",
        teams: [[createTestPokemon(6, 50)], [createTestPokemon(9, 50)]],
        seed: 12345,
      };

      expect(() => new BattleEngine(config, new MockRuleset(), dataManager)).toThrow(
        'BattleEngine: battle format "doubles" is not supported',
      );
    });
  });

  describe("start", () => {
    it("given a new battle, when start is called, then phase transitions to action-select", () => {
      // Arrange
      const { engine } = createTestEngine();

      // Act
      engine.start();

      // Assert
      expect(engine.getPhase()).toBe("action-select");
    });

    it("given a new battle, when start is called, then battle-start event is emitted", () => {
      // Arrange
      const { engine, events } = createTestEngine();

      // Act
      engine.start();

      // Assert
      const startEvent = events.find((e) => e.type === "battle-start");
      expect(startEvent).toBeDefined();
      expect(startEvent).toEqual(
        expect.objectContaining({
          type: "battle-start",
          format: "singles",
          generation: 1,
        }),
      );
    });

    it("given a new battle, when start is called, then switch-in events are emitted for both sides", () => {
      // Arrange
      const { engine, events } = createTestEngine();

      // Act
      engine.start();

      // Assert
      const switchIns = events.filter((e) => e.type === "switch-in");
      expect(switchIns).toHaveLength(2);
      expect(switchIns[0]?.type).toBe("switch-in");
      expect(switchIns[1]?.type).toBe("switch-in");
    });

    it("given a new battle, when start is called, then active pokemon are set for both sides", () => {
      // Arrange
      const { engine } = createTestEngine();

      // Act
      engine.start();

      // Assert
      expect(engine.state.sides[0].active[0]).not.toBeNull();
      expect(engine.state.sides[1].active[0]).not.toBeNull();
    });

    it("given a battle already started, when start is called again, then it throws an error", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();

      // Act & Assert
      expect(() => engine.start()).toThrow("Cannot start battle in phase action-select");
    });
  });

  describe("submitAction", () => {
    it("given battle in action-select, when one side submits, then phase remains action-select", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });

      // Assert
      expect(engine.getPhase()).toBe("action-select");
    });

    it("given both sides submit moves, when turn resolves, then turn number increments", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.getState().turnNumber).toBe(1);
    });

    it("given both sides submit moves, when turn resolves, then damage events are emitted", () => {
      // Arrange
      const { engine, events } = createTestEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const damageEvents = events.filter((e) => e.type === "damage");
      expect(damageEvents.length).toBeGreaterThan(0);
    });

    it("given a mismatched submitAction side and action.side, when submitAction is called, then it throws instead of queueing an inconsistent action", () => {
      const { engine } = createTestEngine();
      engine.start();

      expect(() => engine.submitAction(0, { type: "move", side: 1, moveIndex: 0 })).toThrow(
        "Submitted side 0 does not match action.side 1",
      );
    });

    it("given a move action with targetSide and targetSlot, when submitAction is called, then it rejects unsupported multi-active targeting fields", () => {
      const { engine } = createTestEngine();
      engine.start();

      expect(() =>
        engine.submitAction(0, {
          type: "move",
          side: 0,
          moveIndex: 0,
          targetSide: 1,
          targetSlot: 0,
        }),
      ).toThrow("BattleEngine: move targetSide/targetSlot are not supported in singles battles");
    });

    it("given a move action without moveIndex, when submitAction is called, then it throws instead of accepting a malformed action", () => {
      const { engine } = createTestEngine();
      engine.start();

      // Source: BattleEngine.submitAction moveIndex integer validation guard.
      expect(() =>
        engine.submitAction(0, {
          type: "move",
          side: 0,
        } as unknown as Parameters<typeof engine.submitAction>[1]),
      ).toThrow("MoveAction requires an integer moveIndex");
    });

    it("given a move action with an out-of-range moveIndex, when submitAction is called, then it throws instead of silently skipping the move", () => {
      const { engine } = createTestEngine();
      engine.start();

      // Source: createTestEngine gives the active Pokemon exactly one move, so valid indexes stop at 0.
      expect(() => engine.submitAction(0, { type: "move", side: 0, moveIndex: 99 })).toThrow(
        "MoveAction moveIndex 99 is out of range",
      );
    });

    it("given a trapped active pokemon, when submitAction is called with a switch action, then it rejects the illegal switch", () => {
      const { engine } = createTestEngine({ ruleset: new TrappedSwitchRuleset() });
      engine.start();

      expect(() => engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 })).toThrow(
        "Invalid switch slot 1",
      );
    });

    it("given a switch action that targets an unavailable team slot, when submitAction is called, then it rejects the invalid switch target", () => {
      const team1 = [
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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];
      const { engine } = createTestEngine({ team1 });
      engine.start();

      expect(() => engine.submitAction(0, { type: "switch", side: 0, switchTo: 99 })).toThrow(
        "Invalid switch slot 99",
      );
    });

    it("given both sides submit moves, when turn resolves, then move-start events are emitted", () => {
      // Arrange
      const { engine, events } = createTestEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const moveStarts = events.filter((e) => e.type === "move-start");
      expect(moveStarts).toHaveLength(2);
    });

    it("given both sides submit moves, when turn resolves, then turn-start event is emitted", () => {
      // Arrange
      const { engine, events } = createTestEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const turnStart = events.find((e) => e.type === "turn-start");
      expect(turnStart).toBeDefined();
      if (turnStart?.type === "turn-start") {
        expect(turnStart.turnNumber).toBe(1);
      }
    });

    it("given battle not in action-select, when action is submitted, then it throws an error", () => {
      // Arrange
      const { engine } = createTestEngine();
      // Don't start the battle — still in battle-start

      // Act & Assert
      expect(() => engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 })).toThrow(
        "Cannot submit action in phase battle-start",
      );
    });

    it("given both sides submit moves, when turn resolves, then PP is deducted", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const active0 = engine.state.sides[0].active[0] as ActivePokemon;
      const active1 = engine.state.sides[1].active[0] as ActivePokemon;
      expect(active0.pokemon.moves[0]?.currentPP).toBe(34);
      expect(active1.pokemon.moves[0]?.currentPP).toBe(34);
    });

    it("given a faster pokemon, when both sides use moves, then faster pokemon attacks first", () => {
      // Arrange — Charizard (speed 120) vs Blastoise (speed 80)
      const { engine, events } = createTestEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Charizard should move first
      const moveStarts = events.filter((e) => e.type === "move-start");
      expect(moveStarts).toHaveLength(2);
      if (moveStarts[0]?.type === "move-start") {
        expect(moveStarts[0].pokemon).toBe("Charizard");
      }
      if (moveStarts[1]?.type === "move-start") {
        expect(moveStarts[1].pokemon).toBe("Blastoise");
      }
    });
  });

  describe("switching", () => {
    it("given a side submits a switch action, when turn resolves, then pokemon switches", () => {
      // Arrange
      const team1 = [
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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];

      const { engine, events } = createTestEngine({ team1 });
      engine.start();

      // Act
      engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const switchOuts = events.filter((e) => e.type === "switch-out");
      const switchIns = events.filter((e) => e.type === "switch-in");
      expect(switchOuts.length).toBeGreaterThanOrEqual(1);
      // 2 switch-ins from start + 1 from the switch action
      expect(switchIns.length).toBeGreaterThanOrEqual(3);

      const active = engine.state.sides[0].active[0] as ActivePokemon;
      expect(active.pokemon.uid).toBe("pikachu-1");
    });

    it("given a switch action, when turn resolves, then switch happens before moves", () => {
      // Arrange
      const team1 = [
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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];

      const { engine, events } = createTestEngine({ team1 });
      engine.start();

      // Act
      engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — switch-out event should appear before the opponent's move-start event
      const turnEvents = events.filter((e) => e.type === "switch-out" || e.type === "move-start");
      // After start there are no switch-outs until the action phase
      const turnSwitchOuts = turnEvents.filter((e) => e.type === "switch-out");
      const turnMoveStarts = turnEvents.filter((e) => e.type === "move-start");

      expect(turnSwitchOuts.length).toBeGreaterThan(0);
      expect(turnMoveStarts.length).toBeGreaterThan(0);

      // The switch-out must come before the move-start in the full event log
      const switchOutIndex = events.findIndex((e) => e.type === "switch-out");
      const lastMoveStartIndex = events.findLastIndex((e) => e.type === "move-start");
      expect(switchOutIndex).toBeLessThan(lastMoveStartIndex);
    });
  });

  describe("getAvailableMoves", () => {
    it("given an active pokemon with PP, when getAvailableMoves is called, then moves are returned", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert
      expect(moves).toHaveLength(1);
      expect(moves[0]?.moveId).toBe("tackle");
      expect(moves[0]?.pp).toBe(35);
      expect(moves[0]?.disabled).toBe(false);
    });

    it("given an active pokemon with 0 PP, when getAvailableMoves is called, then move is marked disabled", () => {
      // Arrange
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 0, maxPP: 35, ppUps: 0 }],
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
      const { engine } = createTestEngine({ team1 });
      engine.start();

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert
      expect(moves[0]?.disabled).toBe(true);
      expect(moves[0]?.disabledReason).toBe("No PP remaining");
    });
  });

  describe("getAvailableSwitches", () => {
    it("given a team with alive benched pokemon, when getAvailableSwitches is called, then valid slots are returned", () => {
      // Arrange
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          currentHp: 200,
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 120,
          },
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          currentHp: 100,
          calculatedStats: {
            hp: 100,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
        }),
      ];
      const { engine } = createTestEngine({ team1 });
      engine.start();

      // Act
      const switches = engine.getAvailableSwitches(0);

      // Assert
      expect(switches).toEqual([1]);
    });

    it("given a team with only one pokemon, when getAvailableSwitches is called, then empty array is returned", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();

      // Act
      const switches = engine.getAvailableSwitches(0);

      // Assert
      expect(switches).toEqual([]);
    });
  });

  describe("determinism", () => {
    it("given same seed and actions, when two battles run identically, then events match", () => {
      // Arrange
      const events1: BattleEvent[] = [];
      const events2: BattleEvent[] = [];

      const makeEngine = (eventStore: BattleEvent[]) => {
        const team1 = [
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
        const team2 = [
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

        const ruleset = new MockRuleset();
        const dataManager = createMockDataManager();
        const config: BattleConfig = {
          generation: 1,
          format: "singles",
          teams: [team1, team2],
          seed: 42,
        };
        const engine = new BattleEngine(config, ruleset, dataManager);
        engine.on((e) => eventStore.push(e));
        return engine;
      };

      const engine1 = makeEngine(events1);
      const engine2 = makeEngine(events2);

      // Act
      engine1.start();
      engine1.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine1.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      engine2.start();
      engine2.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine2.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — same events in same order
      expect(events1).toEqual(events2);
    });

    it("given different seeds, when two battles run identically, then event logs still match in structure", () => {
      // Arrange — with the mock ruleset (no randomness in damage), structure should match
      const events1: BattleEvent[] = [];
      const events2: BattleEvent[] = [];

      const makeEngine = (seed: number, eventStore: BattleEvent[]) => {
        const team1 = [
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
        const team2 = [
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
          seed,
        };
        const engine = new BattleEngine(config, new MockRuleset(), createMockDataManager());
        engine.on((e) => eventStore.push(e));
        return engine;
      };

      const engine1 = makeEngine(42, events1);
      const engine2 = makeEngine(99, events2);

      // Act
      engine1.start();
      engine1.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine1.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      engine2.start();
      engine2.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine2.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — event types should match even with different seeds
      const types1 = events1.map((e) => e.type);
      const types2 = events2.map((e) => e.type);
      expect(types1).toEqual(types2);
    });
  });

  describe("battle end", () => {
    it("given a pokemon at 1 HP, when it takes lethal damage, then faint event is emitted", () => {
      // Arrange — set defender HP to 1, damage to 10
      const team2 = [
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
          currentHp: 1,
        }),
      ];

      const { engine, events } = createTestEngine({ team2 });
      engine.start();

      // Set Blastoise HP to 1 (after calculatedStats override in start)
      const blastoise = engine.state.sides[1].active[0] as ActivePokemon;
      blastoise.pokemon.currentHp = 1;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const faintEvents = events.filter((e) => e.type === "faint");
      expect(faintEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("given all pokemon on one side faint, when turn resolves, then battle ends", () => {
      // Arrange
      const team2 = [
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
          currentHp: 1,
        }),
      ];

      const { engine, events } = createTestEngine({ team2 });
      engine.start();

      // Set Blastoise HP to 1
      const blastoise = engine.state.sides[1].active[0] as ActivePokemon;
      blastoise.pokemon.currentHp = 1;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.isEnded()).toBe(true);
      expect(engine.getWinner()).toBe(0); // Side 0 wins
      const endEvent = events.find((e) => e.type === "battle-end");
      expect(endEvent).toBeDefined();
    });

    it("given a pokemon faints with a switch available, when switch-in is submitted, then battle continues", () => {
      // Arrange
      const team2 = [
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
          currentHp: 1,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];

      const { engine } = createTestEngine({ team2 });
      engine.start();

      // Set Blastoise HP to 1
      const blastoise = engine.state.sides[1].active[0] as ActivePokemon;
      blastoise.pokemon.currentHp = 1;

      // Act — turn resolves, Blastoise faints
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Should be in switch-prompt phase
      expect(engine.getPhase()).toBe("switch-prompt");

      // Submit switch
      engine.submitSwitch(1, 1);

      // Assert — battle continues
      expect(engine.isEnded()).toBe(false);
      expect(engine.getPhase()).toBe("action-select");
      expect(engine.state.sides[1].active[0]?.pokemon.uid).toBe("pikachu-1");
    });

    it("given switch-prompt for side 1, when side 0 submits a switch, then it throws", () => {
      const team2 = [
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
          currentHp: 1,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];

      const { engine } = createTestEngine({ team2 });
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(engine.getPhase()).toBe("switch-prompt");
      expect(() => engine.submitSwitch(0, 0)).toThrow("Side 0 does not need to switch");
    });

    it("given switch-prompt, when the chosen replacement has fainted, then submitSwitch throws", () => {
      const team2 = [
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
          currentHp: 1,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 0,
        }),
        createTestPokemon(6, 50, {
          uid: "charizard-2",
          nickname: "Charizard2",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 180,
            attack: 100,
            defense: 90,
            spAttack: 100,
            spDefense: 90,
            speed: 120,
          },
          currentHp: 180,
        }),
      ];

      const { engine } = createTestEngine({ team2 });
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;
      engine.state.sides[1].team[1]!.currentHp = 0;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(engine.getPhase()).toBe("switch-prompt");
      expect(() => engine.submitSwitch(1, 1)).toThrow("Team slot 1 has fainted");
    });

    it("given switch-prompt, when the chosen replacement is already active, then submitSwitch throws", () => {
      const team2 = [
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
          currentHp: 1,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];

      const { engine } = createTestEngine({ team2 });
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(engine.getPhase()).toBe("switch-prompt");
      expect(() => engine.submitSwitch(1, 0)).toThrow("Team slot 0 is already active");
    });
  });

  describe("struggle", () => {
    it("given a pokemon with no PP, when struggle is used, then damage is dealt and recoil applied", () => {
      // Arrange
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 0, maxPP: 35, ppUps: 0 }],
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

      const { engine, events } = createTestEngine({ team1 });
      engine.start();

      // Act
      engine.submitAction(0, { type: "struggle", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — should have damage events (struggle damage + recoil + opponent's move damage)
      const damageEvents = events.filter((e) => e.type === "damage");
      expect(damageEvents.length).toBeGreaterThanOrEqual(2); // Struggle damage + recoil
    });
  });

  describe("event system", () => {
    it("given multiple listeners, when events are emitted, then all listeners receive events", () => {
      // Arrange
      const { engine } = createTestEngine();
      const log1: BattleEvent[] = [];
      const log2: BattleEvent[] = [];
      engine.on((e) => log1.push(e));
      engine.on((e) => log2.push(e));

      // Act
      engine.start();

      // Assert
      expect(log1.length).toBeGreaterThan(0);
      expect(log1.length).toBe(log2.length);
    });

    it("given a removed listener, when events are emitted, then removed listener does not receive events", () => {
      // Arrange
      const { engine } = createTestEngine();
      const log: BattleEvent[] = [];
      const listener = (e: BattleEvent) => log.push(e);
      engine.on(listener);
      engine.off(listener);

      // Act
      engine.start();

      // Assert
      expect(log).toHaveLength(0);
    });

    it("given a battle with events, when getEventLog is called, then all events are returned", () => {
      // Arrange
      const { engine } = createTestEngine();

      // Act
      engine.start();

      // Assert
      const log = engine.getEventLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[0]?.type).toBe("battle-start");
    });
  });

  describe("serialization", () => {
    it("given a started battle, when serialized and deserialized, then state is preserved", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const dataManager = createMockDataManager();
      const { engine } = createTestEngine({ ruleset, dataManager });
      engine.start();

      // Act
      const serialized = engine.serialize();
      const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);

      // Assert
      expect(restored.getPhase()).toBe(engine.getPhase());
      expect(restored.getState().turnNumber).toBe(engine.getState().turnNumber);
      expect(restored.getState().generation).toBe(engine.getState().generation);
      expect(restored.isEnded()).toBe(engine.isEnded());
    });
  });

  describe("status effects", () => {
    it("given a burned pokemon, when end of turn processes, then burn damage is applied", () => {
      // Arrange
      const { engine, events } = createTestEngine();
      engine.start();

      // Inflict burn on side 0's active pokemon
      const active = engine.state.sides[0].active[0] as ActivePokemon;
      active.pokemon.status = "burn";

      // Act — run a turn to trigger end-of-turn
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const burnDamage = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "burn",
      );
      expect(burnDamage.length).toBeGreaterThanOrEqual(1);
    });

    it("given a poisoned pokemon, when end of turn processes, then poison damage is applied", () => {
      // Arrange
      const { engine, events } = createTestEngine();
      engine.start();

      // Inflict poison on side 1's active pokemon
      const active = engine.state.sides[1].active[0] as ActivePokemon;
      active.pokemon.status = "poison";

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const poisonDamage = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "poison",
      );
      expect(poisonDamage.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("multiple turns", () => {
    it("given a battle, when multiple turns are played, then turn number increments correctly", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();

      // Act — play 3 turns
      for (let i = 0; i < 3; i++) {
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      }

      // Assert
      expect(engine.getState().turnNumber).toBe(3);
    });

    it("given a battle, when multiple turns are played, then HP decreases each turn", () => {
      // Arrange
      const { engine } = createTestEngine();
      engine.start();
      const initialHp0 = engine.state.sides[0].active[0]?.pokemon.currentHp;
      const initialHp1 = engine.state.sides[1].active[0]?.pokemon.currentHp;

      // Act — play 1 turn
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — both pokemon should have taken damage
      expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBeLessThan(initialHp0);
      expect(engine.state.sides[1].active[0]?.pokemon.currentHp).toBeLessThan(initialHp1);
    });
  });
});
