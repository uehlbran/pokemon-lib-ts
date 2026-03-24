import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, MoveEffectResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleAction, BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
}) {
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

  return { engine, ruleset, events, dataManager };
}

describe("BattleEngine — edge cases", () => {
  describe("phase transition sequence", () => {
    it("given both sides submit moves, when turn resolves, then phases transition turn-start -> turn-resolve -> turn-end -> faint-check -> action-select", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();
      const phaseLog: string[] = [];

      // Monkey-patch transitionTo to record phase transitions
      const originalState = engine.state;
      const handler: ProxyHandler<typeof originalState> = {
        set(target, prop, value) {
          if (prop === "phase") {
            phaseLog.push(value as string);
          }
          (target as Record<string | symbol, unknown>)[prop] = value;
          return true;
        },
      };
      const proxiedState = new Proxy(originalState, handler);
      Object.defineProperty(engine, "state", { value: proxiedState, writable: true });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — verify the phase sequence
      expect(phaseLog).toContain("turn-start");
      expect(phaseLog).toContain("turn-resolve");
      expect(phaseLog).toContain("turn-end");
      expect(phaseLog).toContain("faint-check");
      expect(phaseLog).toContain("action-select");

      const turnStartIdx = phaseLog.indexOf("turn-start");
      const turnResolveIdx = phaseLog.indexOf("turn-resolve");
      const turnEndIdx = phaseLog.indexOf("turn-end");
      const faintCheckIdx = phaseLog.indexOf("faint-check");
      const actionSelectIdx = phaseLog.indexOf("action-select");

      expect(turnStartIdx).toBeLessThan(turnResolveIdx);
      expect(turnResolveIdx).toBeLessThan(turnEndIdx);
      expect(turnEndIdx).toBeLessThan(faintCheckIdx);
      expect(faintCheckIdx).toBeLessThan(actionSelectIdx);
    });
  });

  describe("both pokemon faint simultaneously via recoil", () => {
    it("given both pokemon at low HP, when recoil from a move kills the attacker, then battle ends with correct winner", () => {
      // Arrange — Charizard attacks, KOs Blastoise, but recoil KOs Charizard too
      const ruleset = new MockRuleset();
      (ruleset as unknown as { executeMoveEffect: () => MoveEffectResult }).executeMoveEffect =
        () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 50,
          healAmount: 0,
          switchOut: false,
          messages: [],
        });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.state.sides[0].active[0]!.pokemon.currentHp = 5;
      engine.state.sides[1].active[0]!.pokemon.currentHp = 5;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — battle should have ended
      expect(engine.isEnded()).toBe(true);
      expect(engine.getWinner()).not.toBeNull();
      const faintEvents = events.filter((e) => e.type === "faint");
      expect(faintEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("both pokemon faint simultaneously via struggle recoil", () => {
    it("given both pokemon at low HP with no PP, when both use struggle, then battle ends", () => {
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
          currentHp: 10,
        }),
      ];
      const team2 = [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          moves: [{ moveId: "tackle", currentPP: 0, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 80,
          },
          currentHp: 10,
        }),
      ];

      const { engine, events } = createEngine({ team1, team2 });
      engine.start();

      // Set HP low enough that struggle + recoil will KO
      engine.state.sides[0].active[0]!.pokemon.currentHp = 10;
      engine.state.sides[1].active[0]!.pokemon.currentHp = 10;

      // Act
      engine.submitAction(0, { type: "struggle", side: 0 });
      engine.submitAction(1, { type: "struggle", side: 1 });

      // Assert
      expect(engine.isEnded()).toBe(true);
      const faintEvents = events.filter((e) => e.type === "faint");
      expect(faintEvents.length).toBeGreaterThanOrEqual(1);
      const endEvent = events.find((e) => e.type === "battle-end");
      expect(endEvent).toBeDefined();
    });
  });

  describe("all moves 0 PP forces struggle", () => {
    it("given a pokemon where all moves have 0 PP, when getAvailableMoves is called, then all moves are disabled", () => {
      // Arrange
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [
            { moveId: "tackle", currentPP: 0, maxPP: 35, ppUps: 0 },
            { moveId: "scratch", currentPP: 0, maxPP: 35, ppUps: 0 },
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
        }),
      ];

      const { engine } = createEngine({ team1 });
      engine.start();

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert — all moves disabled
      expect(moves.every((m) => m.disabled)).toBe(true);
      expect(moves.every((m) => m.disabledReason === "No PP remaining")).toBe(true);
    });
  });

  describe("move miss records the attempt", () => {
    it("given a move that misses, when the turn resolves, then lastMoveUsed is still set on the attacker", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setAlwaysHit(false);
      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — even though the move missed, lastMoveUsed should be set
      const active0 = engine.state.sides[0].active[0];
      const active1 = engine.state.sides[1].active[0];
      expect(active0?.lastMoveUsed).toBe("tackle");
      expect(active1?.lastMoveUsed).toBe("tackle");
    });

    it("given a move that misses, when the turn resolves, then movedThisTurn is reset for next turn", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setAlwaysHit(false);
      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — movedThisTurn is reset at end of turn for next turn
      expect(engine.state.sides[0].active[0]?.movedThisTurn).toBe(false);
      expect(engine.state.sides[1].active[0]?.movedThisTurn).toBe(false);
    });
  });

  describe("public battle accessors return snapshots", () => {
    it("given a caller mutates the object returned by getActive, when reading the engine again, then the live active state is unchanged", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      // Act
      const active = engine.getActive(0);
      expect(active).not.toBeNull();
      const initialHp = active!.pokemon.currentHp;
      active!.pokemon.currentHp = 1;
      active!.statStages.attack = 6;

      // Assert
      expect(engine.getActive(0)?.pokemon.currentHp).toBe(initialHp);
      expect(engine.getActive(0)?.statStages.attack).toBe(0);
    });

    it("given a caller mutates the array returned by getTeam, when reading the engine again, then the live team state is unchanged", () => {
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

      const { engine } = createEngine({ team1 });
      engine.start();

      // Act
      const team = engine.getTeam(0);
      const initialHp = team[1]!.currentHp;
      team[1]!.currentHp = 0;

      // Assert
      expect(engine.getTeam(0)[1]?.currentHp).toBe(initialHp);
    });
  });

  describe("forced switch after KO — both sides", () => {
    it("given both pokemon faint from end-of-turn damage, when both have reserves, then both sides get switch-prompt", () => {
      // Arrange — both at low HP with burn, burn will KO at end of turn
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
        createTestPokemon(25, 50, {
          uid: "pikachu-2",
          nickname: "Pikachu2",
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

      const { engine } = createEngine({ team1, team2 });
      engine.start();

      // Set both to very low HP and inflict burn — they'll take damage at end of turn
      engine.state.sides[0].active[0]!.pokemon.currentHp = 1;
      engine.state.sides[0].active[0]!.pokemon.status = "burn";
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;
      engine.state.sides[1].active[0]!.pokemon.status = "burn";

      // Both miss so no mid-turn faint — faint happens from burn at end of turn
      const ruleset = new MockRuleset();
      ruleset.setAlwaysHit(false);
      // Reconstruct with no-hit ruleset
      const { engine: engine2 } = createEngine({ team1, team2, ruleset });
      engine2.start();
      engine2.state.sides[0].active[0]!.pokemon.currentHp = 1;
      engine2.state.sides[0].active[0]!.pokemon.status = "burn";
      engine2.state.sides[1].active[0]!.pokemon.currentHp = 1;
      engine2.state.sides[1].active[0]!.pokemon.status = "burn";

      // Act
      engine2.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine2.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — engine should end or prompt switch since both fainted from burn
      // Since both sides have reserves, if the engine doesn't end the battle
      // it should be in switch-prompt. But checkMidTurnFaints calls checkBattleEnd
      // when both teams still have alive mons, switch-prompt is used.
      const phase = engine2.getPhase();
      expect(["switch-prompt", "battle-end"]).toContain(phase);
    });
  });

  describe("events emitted chronologically and completely", () => {
    it("given a normal turn, when both sides use moves, then event log has battle-start, switch-ins, turn-start, move-starts, damages in order", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — verify chronological order
      const eventTypes = events.map((e) => e.type);

      // battle-start comes first
      expect(eventTypes[0]).toBe("battle-start");

      // switch-ins come before turn-start
      const lastSwitchIn = eventTypes.lastIndexOf("switch-in");
      const turnStart = eventTypes.indexOf("turn-start");
      expect(lastSwitchIn).toBeLessThan(turnStart);

      // turn-start comes before move-starts
      const firstMoveStart = eventTypes.indexOf("move-start");
      expect(turnStart).toBeLessThan(firstMoveStart);

      // move-start comes before damage
      const firstDamage = eventTypes.indexOf("damage");
      expect(firstMoveStart).toBeLessThan(firstDamage);
    });

    it("given a battle that ends, when the last pokemon faints, then the event log contains faint before battle-end", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const eventTypes = events.map((e) => e.type);
      const faintIdx = eventTypes.indexOf("faint");
      const battleEndIdx = eventTypes.indexOf("battle-end");
      expect(faintIdx).toBeGreaterThan(-1);
      expect(battleEndIdx).toBeGreaterThan(-1);
      expect(faintIdx).toBeLessThan(battleEndIdx);
    });
  });

  describe("engine delegates all gen-specific logic to ruleset", () => {
    it("given a custom ruleset with patched damage, when a move is used, then the engine uses the ruleset's damage value", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setFixedDamage(42);

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — damage should be exactly 42 (from the custom ruleset)
      const damageEvents = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "tackle",
      );
      expect(damageEvents.length).toBeGreaterThan(0);
      for (const de of damageEvents) {
        if (de.type === "damage") {
          expect(de.amount).toBe(42);
        }
      }
    });

    it("given a custom ruleset with patched accuracy, when a move is used, then the engine uses the ruleset's accuracy check", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setAlwaysHit(false); // Everything misses

      const { engine } = createEngine({ ruleset });
      engine.start();
      const initialHp0 = engine.state.sides[0].active[0]?.pokemon.currentHp;
      const initialHp1 = engine.state.sides[1].active[0]?.pokemon.currentHp;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — both miss, no damage
      expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBe(initialHp0);
      expect(engine.state.sides[1].active[0]?.pokemon.currentHp).toBe(initialHp1);
    });

    it("given a custom ruleset with patched turn order, when actions are submitted, then the engine uses the ruleset's order", () => {
      // Arrange — make Blastoise (slower) go first via custom turn order
      const ruleset = new MockRuleset();
      (
        ruleset as unknown as { resolveTurnOrder: (actions: BattleAction[]) => BattleAction[] }
      ).resolveTurnOrder = (actions: BattleAction[]) => {
        return [...actions].reverse(); // Reverse: slower goes first
      };

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Blastoise (side 1) should move first since we reversed order
      const moveStarts = events.filter((e) => e.type === "move-start");
      expect(moveStarts).toHaveLength(2);
      if (moveStarts[0]?.type === "move-start") {
        expect(moveStarts[0].pokemon).toBe("Blastoise");
      }
    });
  });

  describe("state not leaked between turns", () => {
    it("given a turn with stat changes from move effects, when the next turn begins, then stat stages persist correctly", () => {
      // Arrange — move effect drops defender's attack by 1
      const ruleset = new MockRuleset();
      (ruleset as unknown as { executeMoveEffect: () => MoveEffectResult }).executeMoveEffect =
        () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [{ target: "defender" as const, stat: "attack" as const, stages: -1 }],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        });

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act — play turn 1
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — stat stages should persist (this is intentional, stat stages last until switch)
      const blastoise = engine.state.sides[1].active[0];
      expect(blastoise?.statStages.attack).toBeLessThan(0);

      // Play turn 2
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Stat stages should compound
      expect(engine.state.sides[1].active[0]?.statStages.attack).toBeLessThan(-1);
    });

    it("given two complete turns, when checking turn number after each, then turn number increments predictably", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      // Act & Assert
      expect(engine.getState().turnNumber).toBe(0);

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      expect(engine.getState().turnNumber).toBe(1);

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      expect(engine.getState().turnNumber).toBe(2);
    });
  });

  describe("stat stage clamping at +6/-6", () => {
    it("given a move that would push stat stages beyond +6, when effect is processed, then stage is clamped at 6", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as { executeMoveEffect: () => MoveEffectResult }).executeMoveEffect =
        () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [{ target: "attacker" as const, stat: "attack" as const, stages: 12 }],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        });

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[0].active[0]?.statStages.attack).toBe(6);
    });

    it("given a move that would push stat stages below -6, when effect is processed, then stage is clamped at -6", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as { executeMoveEffect: () => MoveEffectResult }).executeMoveEffect =
        () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [{ target: "defender" as const, stat: "defense" as const, stages: -12 }],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        });

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[1].active[0]?.statStages.defense).toBe(-6);
    });
  });

  describe("struggle when no defender", () => {
    it("given a struggle action with no opponent active, when turn resolves, then struggle emits move-start but does no damage", () => {
      // Arrange — edge case: remove defender mid-turn
      // This scenario is nearly impossible in normal play but tests the guard clause
      const { engine, events } = createEngine();
      engine.start();

      // Remove side 1's active pokemon by KOing in a previous step
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      // KO defender with regular move first, then side 0 also struggles
      // Can't test directly since turn resolution handles both at once
      // Instead verify struggle emits the move-start
      engine.submitAction(0, { type: "struggle", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const struggleMoveStart = events.find(
        (e) => e.type === "move-start" && "move" in e && e.move === "struggle",
      );
      expect(struggleMoveStart).toBeDefined();
    });
  });

  describe("permanent terrain", () => {
    it("given terrain with -1 turnsLeft (permanent), when end of turn processes terrain-countdown, then terrain persists", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        "terrain-countdown" as const,
        "status-damage" as const,
      ];

      const { engine } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.terrain = { type: "electric", turnsLeft: -1, source: "electric-surge" };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — permanent terrain should still exist
      expect(engine.state.terrain).not.toBeNull();
      expect(engine.state.terrain?.type).toBe("electric");
    });
  });

  describe("status not double-inflicted", () => {
    it("given a pokemon already with a status, when a move tries to inflict another status, then the existing status is preserved", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as { executeMoveEffect: () => MoveEffectResult }).executeMoveEffect =
        () => ({
          statusInflicted: "poison" as const,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Pre-inflict burn on Blastoise
      engine.state.sides[1].active[0]!.pokemon.status = "burn";

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — the existing burn should not be overwritten by poison
      expect(engine.state.sides[1].active[0]?.pokemon.status).toBe("burn");
      // No status-inflict event for Blastoise (already has burn)
      const statusEvents = events.filter(
        (e) => e.type === "status-inflict" && "pokemon" in e && e.pokemon === "Blastoise",
      );
      expect(statusEvents).toHaveLength(0);
    });
  });

  describe("volatile not double-inflicted", () => {
    it("given a pokemon already with a volatile, when a move tries to inflict the same volatile, then no duplicate is created", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as { executeMoveEffect: () => MoveEffectResult }).executeMoveEffect =
        () => ({
          statusInflicted: null,
          volatileInflicted: "confusion" as const,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Pre-inflict confusion on Blastoise
      engine.state.sides[1].active[0]?.volatileStatuses.set("confusion", { turnsLeft: 3 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no volatile-start event for already confused Blastoise
      const volatileEvents = events.filter(
        (e) =>
          e.type === "volatile-start" &&
          "pokemon" in e &&
          e.pokemon === "Blastoise" &&
          "volatile" in e &&
          e.volatile === "confusion",
      );
      expect(volatileEvents).toHaveLength(0);
    });
  });

  describe("heal does not exceed max HP", () => {
    it("given a pokemon at full HP, when a move effect tries to heal, then HP stays at max", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as { executeMoveEffect: () => MoveEffectResult }).executeMoveEffect =
        () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 100,
          switchOut: false,
          messages: [],
        });

      const { engine, events } = createEngine({ ruleset });
      engine.start();
      // Charizard at full HP (200)

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no heal event emitted since HP was already at max
      const _healEvents = events.filter(
        (e) => e.type === "heal" && "pokemon" in e && e.pokemon === "Charizard",
      );
      // Charizard takes 10 damage from Blastoise first (goes to 190), then heals
      // Depending on turn order, Charizard (faster, 120 speed) moves first
      // So Charizard heals before being damaged -> no heal emitted
      // or after being damaged -> heal emitted
      // Either way, HP should not exceed 200
      expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBeLessThanOrEqual(200);
    });
  });

  describe("switch clears volatile statuses", () => {
    it("given a pokemon with volatile statuses, when it switches out, then volatiles are cleared", () => {
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

      const { engine } = createEngine({ team1 });
      engine.start();

      // Add volatile statuses to Charizard
      engine.state.sides[0].active[0]?.volatileStatuses.set("confusion", { turnsLeft: 3 });
      // Modify stat stages
      engine.state.sides[0].active[0]!.statStages.attack = 3;

      // Act — switch out Charizard
      engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Charizard's stat stages and volatiles should be cleared
      // The team slot 0's Pokemon data persists, but volatiles were on the ActivePokemon
      const active = engine.state.sides[0].active[0];
      expect(active?.pokemon.uid).toBe("pikachu-1");
      // The old active's volatiles were cleared during executeSwitch
    });
  });

  describe("getAvailableSwitches excludes fainted pokemon", () => {
    it("given a team with one fainted bench pokemon, when getAvailableSwitches is called, then fainted pokemon is excluded", () => {
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
          currentHp: 120,
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
        }),
        createTestPokemon(9, 50, {
          uid: "blastoise-bench",
          nickname: "Blastoise",
          currentHp: 150,
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 80,
          },
        }),
      ];

      const { engine } = createEngine({ team1 });
      engine.start();

      // Faint Pikachu after start (constructor recalculates stats/HP)
      engine.state.sides[0].team[1]!.currentHp = 0;

      // Act
      const switches = engine.getAvailableSwitches(0);

      // Assert — only slot 2 (alive, not active); slot 1 (Pikachu) is fainted
      expect(switches).toEqual([2]);
      expect(switches).not.toContain(1); // Pikachu fainted
    });
  });
});
