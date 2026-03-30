import {
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  type DataManager,
  type PokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, EntryHazardResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { ActivePokemon, BattleSide, BattleState } from "../../../src/state";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

const { stickyWeb } = CORE_HAZARD_IDS;
const { confusion, struggle, tackle } = CORE_MOVE_IDS;
const { burn, poison } = CORE_STATUS_IDS;
const { substitute } = CORE_VOLATILE_IDS;
const { male } = CORE_GENDERS;

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

  const team2 = overrides?.team2 ?? [
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
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

function createVoluntarySelfSwitchScenario(overrides?: {
  ruleset?: MockRuleset;
  team2?: PokemonInstance[];
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
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
    createTestPokemon(25, 50, {
      uid: "pikachu-1",
      nickname: "Pikachu",
    }),
  ];

  const team2 = overrides?.team2 ?? [
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

  return createTestEngine({ team1, team2, ruleset: overrides?.ruleset });
}

describe("BattleEngine", () => {
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
      expect(startEvent).toEqual({
        type: "battle-start",
        format: "singles",
        generation: 1,
      });
    });

    it("given a new battle, when start is called, then switch-in events are emitted for both sides", () => {
      // Arrange
      const { engine, events } = createTestEngine();

      // Act
      engine.start();

      // Assert
      const switchIns = events.filter((e) => e.type === "switch-in");
      expect(switchIns).toEqual([
        {
          type: "switch-in",
          side: 0,
          slot: 0,
          pokemon: {
            speciesId: 6,
            nickname: "Charizard",
            level: 50,
            currentHp: 153,
            maxHp: 153,
            status: null,
            gender: male,
            isShiny: false,
          },
        },
        {
          type: "switch-in",
          side: 1,
          slot: 0,
          pokemon: {
            speciesId: 9,
            nickname: "Blastoise",
            level: 50,
            currentHp: 154,
            maxHp: 154,
            status: null,
            gender: male,
            isShiny: false,
          },
        },
      ]);
    });

    it("given a new battle, when start is called, then active pokemon are set for both sides", () => {
      // Arrange
      const { engine } = createTestEngine();

      // Act
      engine.start();

      // Assert
      // Source: createTestEngine() defaults the active pair to Charizard (#6) and Blastoise (#9).
      expect(engine.state.sides[0].active[0]?.pokemon.speciesId).toBe(6);
      expect(engine.state.sides[1].active[0]?.pokemon.speciesId).toBe(9);
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
      expect(damageEvents).toEqual([
        {
          type: "damage",
          side: 1,
          pokemon: "Blastoise",
          amount: 10,
          currentHp: 144,
          maxHp: 154,
          source: tackle,
        },
        {
          type: "damage",
          side: 0,
          pokemon: "Charizard",
          amount: 10,
          currentHp: 143,
          maxHp: 153,
          source: tackle,
        },
      ]);
    });

    it("given both sides submit moves, when turn resolves, then event pokemon fields use display names instead of uids", () => {
      const { engine, events } = createTestEngine();
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 10;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const moveStarts = events.filter((e) => e.type === "move-start");
      const damageEvents = events.filter((e) => e.type === "damage");
      const faintEvents = events.filter((e) => e.type === "faint");
      // Provenance: createTestEngine() defaults side 0/1 actives to Charizard/Blastoise in BattleHelpers.

      expect(
        moveStarts.map((event) => (event.type === "move-start" ? event.pokemon : null)),
      ).toEqual(["Charizard"]);
      expect(damageEvents.map((event) => (event.type === "damage" ? event.pokemon : null))).toEqual(
        ["Blastoise"],
      );
      expect(faintEvents.map((event) => (event.type === "faint" ? event.pokemon : null))).toEqual([
        "Blastoise",
      ]);
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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(tackle)],
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
      expect(moveStarts).toEqual([
        {
          type: "move-start",
          side: 0,
          pokemon: "Charizard",
          move: tackle,
        },
        {
          type: "move-start",
          side: 1,
          pokemon: "Blastoise",
          move: tackle,
        },
      ]);
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
      expect(turnStart).toEqual({
        type: "turn-start",
        turnNumber: 1,
      });
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
      // Derived: each active starts at Tackle's canonical max PP and spends exactly one PP on the resolved turn.
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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(tackle)],
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
      expect(switchOuts).toEqual([
        {
          type: "switch-out",
          side: 0,
          pokemon: {
            speciesId: 6,
            nickname: "Charizard",
            level: 50,
            currentHp: 153,
            maxHp: 153,
            status: null,
            gender: male,
            isShiny: false,
          },
        },
      ]);
      // 2 switch-ins from start + 1 from the switch action
      expect(switchIns).toHaveLength(3);

      const active = engine.state.sides[0].active[0] as ActivePokemon;
      expect(active.pokemon.uid).toBe("pikachu-1");
    });

    it("given a switch action, when turn resolves, then switch happens before moves", () => {
      // Arrange
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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(tackle)],
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

      expect(turnSwitchOuts).toEqual([
        {
          type: "switch-out",
          side: 0,
          pokemon: {
            speciesId: 6,
            nickname: "Charizard",
            level: 50,
            currentHp: 153,
            maxHp: 153,
            status: null,
            gender: male,
            isShiny: false,
          },
        },
      ]);
      expect(turnMoveStarts).toEqual([
        {
          type: "move-start",
          side: 1,
          pokemon: "Blastoise",
          move: tackle,
        },
      ]);
    });

    it("given a move effect that requests a voluntary self-switch, when the turn resolves, then the engine enters switch-prompt and allows the replacement", () => {
      const { engine, ruleset, events } = createVoluntarySelfSwitchScenario();
      ruleset.setMoveEffectResult({ switchOut: true });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(engine.getPhase()).toBe("switch-prompt");

      engine.submitSwitch(0, 1);

      expect(engine.getPhase()).toBe("action-select");
      expect(engine.state.sides[0].active[0]?.pokemon.uid).toBe("pikachu-1");
      expect(events.some((event) => event.type === "switch-out" && event.side === 0)).toBe(true);
    });

    it("given Baton Pass sets a voluntary self-switch, when the replacement is chosen, then stat stages and volatile statuses carry to the incoming pokemon", () => {
      const { engine, ruleset } = createVoluntarySelfSwitchScenario();
      ruleset.setMoveEffectResult({ switchOut: true, batonPass: true });
      engine.start();

      const attacker = engine.state.sides[0].active[0]!;
      attacker.statStages.attack = 2;
      attacker.statStages.speed = 1;
      attacker.substituteHp = 50;
      attacker.volatileStatuses.set(confusion, { turnsLeft: 2 });
      attacker.volatileStatuses.set(substitute, { turnsLeft: -1 });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      engine.submitSwitch(0, 1);

      const replacement = engine.state.sides[0].active[0]!;
      expect(replacement.pokemon.uid).toBe("pikachu-1");
      // Source: Baton Pass preserves the user's stat stages for the incoming Pokemon.
      // The test queues Baton Pass via ruleset.setMoveEffectResult({ switchOut: true, batonPass: true }),
      // so the replacement should inherit attacker.statStages.attack = +2 and speed = +1.
      expect(replacement.statStages.attack).toBe(2);
      expect(replacement.statStages.speed).toBe(1);
      // Source: Baton Pass also preserves an existing Substitute, and the engine tracks that
      // via replacement.substituteHp alongside the substitute volatile. The opposing Tackle
      // hits the substitute for 10 damage before the switch prompt, so the passed substitute has 40 HP left.
      expect(replacement.substituteHp).toBe(40);
      // Source: the mock ruleset decrements confusion during turn processing before the switch prompt,
      // so attacker.volatileStatuses.get(confusion) goes from { turnsLeft: 2 } to { turnsLeft: 1 }
      // before engine.submitSwitch sends the replacement in.
      expect(replacement.volatileStatuses.get(confusion)).toEqual({ turnsLeft: 1 });
      expect(replacement.volatileStatuses.get(substitute)).toEqual({ turnsLeft: -1 });
    });

    it("given Baton Pass into Sticky Web, when the replacement is chosen, then inherited boosts are merged before switch-in effects", () => {
      const ruleset = new MockRuleset();
      let speedSeenByStickyWeb: number | null = null;
      ruleset.getAvailableHazards = () => [stickyWeb];
      ruleset.applyEntryHazards = (
        pokemon: ActivePokemon,
        _side: BattleSide,
        _state?: BattleState,
      ): EntryHazardResult => {
        speedSeenByStickyWeb = pokemon.statStages.speed;
        return {
          damage: 0,
          statusInflicted: null,
          statChanges: [{ stat: "speed", stages: -1 }],
          messages: [],
        };
      };

      const { engine } = createVoluntarySelfSwitchScenario({ ruleset });
      ruleset.setMoveEffectResult({ switchOut: true, batonPass: true });
      engine.start();

      engine.state.sides[0].hazards.push({ type: stickyWeb, layers: 1 });

      const attacker = engine.state.sides[0].active[0]!;
      attacker.statStages.speed = 1;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      engine.submitSwitch(0, 1);

      const replacement = engine.state.sides[0].active[0]!;
      expect(replacement.pokemon.uid).toBe("pikachu-1");
      // Source: Sticky Web should see the Baton Pass speed boost before applying its own -1 drop.
      expect(speedSeenByStickyWeb).toBe(1);
      // Source: Baton Pass applies the queued +1 speed stage first, then Sticky Web applies -1 on switch-in.
      expect(replacement.statStages.speed).toBe(0);
    });

    it("given a queued Baton Pass user faints before switching, when the replacement is chosen, then it is handled as a normal faint replacement", () => {
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

      const ruleset = new MockRuleset();
      ruleset.calculateDamage = (context) => ({
        damage: context.attacker.pokemon.uid === "charizard-1" ? 10 : 250,
        effectiveness: 1,
        isCrit: context.isCrit,
        randomFactor: 1,
      });

      const { engine, events } = createVoluntarySelfSwitchScenario({ ruleset, team2 });
      ruleset.setMoveEffectResult({ switchOut: true, batonPass: true });
      engine.start();

      const attacker = engine.state.sides[0].active[0]!;
      attacker.statStages.attack = 2;
      attacker.volatileStatuses.set(confusion, { turnsLeft: 2 });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(engine.getPhase()).toBe("switch-prompt");

      engine.submitSwitch(0, 1);

      const replacement = engine.state.sides[0].active[0]!;
      // Source: submitSwitch(0, 1) selects the second Pokemon from team1, whose fixture uid is "pikachu-1".
      expect(replacement.pokemon.uid).toBe("pikachu-1");
      // Source: the Baton Pass user fainted before the voluntary switch resolved, so no stat stages are preserved.
      expect(replacement.statStages.attack).toBe(0);
      // Source: volatiles are only transferred for a live Baton Pass replacement, not after the passer faints.
      expect(replacement.volatileStatuses.has(confusion)).toBe(false);
      // Source: the live self-switch branch emits switch-out, but a faint replacement does not reuse that event path.
      expect(
        events.filter((event) => event.type === "switch-out" && event.side === 0),
      ).toHaveLength(0);
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
          moves: [createMockMoveSlot(tackle)],
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
      expect(faintEvents).toEqual([
        {
          type: "faint",
          side: 1,
          pokemon: "Blastoise",
        },
      ]);
    });

    it("given all pokemon on one side faint, when turn resolves, then battle ends", () => {
      // Arrange
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
      expect(endEvent).toEqual({
        type: "battle-end",
        winner: 0,
      });
    });

    it("given a pokemon faints with a switch available, when switch-in is submitted, then battle continues", () => {
      // Arrange
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
          currentHp: 1,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(tackle)],
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
          moves: [createMockMoveSlot(tackle)],
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
          moves: [createMockMoveSlot(tackle)],
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
          moves: [createMockMoveSlot(tackle)],
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
          moves: [createMockMoveSlot(tackle)],
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
          moves: [createMockMoveSlot(tackle)],
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
          moves: [createMockMoveSlot(tackle)],
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
          moves: [createMockMoveSlot(tackle)],
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

  describe(struggle, () => {
    it("given a pokemon with no PP, when struggle is used, then damage is dealt and recoil applied", () => {
      // Arrange
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(tackle, { currentPP: 0 })],
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
      engine.submitAction(0, { type: struggle, side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — should have damage events (struggle damage + recoil + opponent's move damage)
      const damageEvents = events.filter((e) => e.type === "damage");
      expect(damageEvents.length).toBeGreaterThanOrEqual(2); // Struggle damage + recoil
    });
  });

  describe("status effects", () => {
    it("given a burned pokemon, when end of turn processes, then burn damage is applied", () => {
      // Arrange
      const { engine, events } = createTestEngine();
      engine.start();

      // Inflict burn on side 0's active pokemon
      const active = engine.state.sides[0].active[0] as ActivePokemon;
      active.pokemon.status = burn;

      // Act — run a turn to trigger end-of-turn
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const burnDamage = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === burn,
      );
      expect(burnDamage).toEqual([
        {
          type: "damage",
          side: 0,
          pokemon: "Charizard",
          amount: 9,
          currentHp: 134,
          maxHp: 153,
          source: burn,
        },
      ]);
    });

    it("given a poisoned pokemon, when end of turn processes, then poison damage is applied", () => {
      // Arrange
      const { engine, events } = createTestEngine();
      engine.start();

      // Inflict poison on side 1's active pokemon
      const active = engine.state.sides[1].active[0] as ActivePokemon;
      active.pokemon.status = poison;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const poisonDamage = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === poison,
      );
      expect(poisonDamage).toEqual([
        {
          type: "damage",
          side: 1,
          pokemon: "Blastoise",
          amount: 19,
          currentHp: 125,
          maxHp: 154,
          source: poison,
        },
      ]);
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
      // Derived: the loop submits exactly three fully resolved turns.
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
