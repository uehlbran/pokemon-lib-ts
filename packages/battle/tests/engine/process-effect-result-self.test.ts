import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

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

describe("processEffectResult — self-targeted effects", () => {
  describe("selfStatusInflicted", () => {
    it(
      "given selfStatusInflicted=sleep with selfVolatileData.turnsLeft=2," +
        " when move is used, then attacker gets sleep status and sleep-counter volatile with turnsLeft=2",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          selfStatusInflicted: "sleep" as const,
          selfVolatileData: { turnsLeft: 2 },
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — attacker (side 0, Charizard) gets sleep status
        const statusInflict = events.find((e) => e.type === "status-inflict" && e.side === 0);
        expect(statusInflict).toBeDefined();
        expect(statusInflict?.type === "status-inflict" && statusInflict.status).toBe("sleep");

        // Assert — attacker's active pokemon has sleep status
        const attackerActive = engine.state.sides[0].active[0];
        expect(attackerActive?.pokemon.status).toBe("sleep");

        // Assert — sleep-counter volatile is set with turnsLeft=2 (NOT rolled from ruleset)
        const sleepCounter = attackerActive?.volatileStatuses.get("sleep-counter");
        expect(sleepCounter).toBeDefined();
        expect(sleepCounter?.turnsLeft).toBe(2);
      },
    );

    it(
      "given selfStatusInflicted=sleep when attacker already has a status," +
        " when move is used, then attacker status is NOT overwritten",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          selfStatusInflicted: "sleep" as const,
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker already has burn
        const attackerActive = engine.state.sides[0].active[0];
        if (attackerActive) {
          attackerActive.pokemon.status = "burn";
        }

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — status is still burn, not sleep
        expect(attackerActive?.pokemon.status).toBe("burn");

        // Assert — no sleep status-inflict event for side 0
        const sleepInflict = events.find(
          (e) => e.type === "status-inflict" && e.side === 0 && e.status === "sleep",
        );
        expect(sleepInflict).toBeUndefined();
      },
    );
  });

  describe("selfVolatileInflicted", () => {
    it(
      "given selfVolatileInflicted='mist'," +
        " when move is used, then attacker gains mist volatile in volatileStatuses",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          selfVolatileInflicted: "mist" as const,
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — attacker (side 0) has mist in volatileStatuses
        const attackerActive = engine.state.sides[0].active[0];
        expect(attackerActive?.volatileStatuses.has("mist")).toBe(true);

        // Assert — volatile-start event emitted for side 0 with volatile="mist"
        const volatileStart = events.find(
          (e) => e.type === "volatile-start" && e.side === 0 && e.volatile === "mist",
        );
        expect(volatileStart).toBeDefined();
      },
    );

    it(
      "given selfVolatileInflicted='mist' when attacker already has mist," +
        " when move is used, then mist is NOT applied again",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          selfVolatileInflicted: "mist" as const,
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker already has mist
        const attackerActive = engine.state.sides[0].active[0];
        attackerActive?.volatileStatuses.set("mist", { turnsLeft: -1 });

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — no volatile-start event for mist on side 0 (already had it)
        // NOTE: side 1 may still get mist from their own move execution, but we
        // only care that side 0 did NOT get a duplicate volatile-start
        const volatileStartsSide0 = events.filter(
          (e) => e.type === "volatile-start" && e.volatile === "mist" && e.side === 0,
        );
        expect(volatileStartsSide0).toHaveLength(0);
      },
    );
  });

  describe("typeChange", () => {
    it(
      "given typeChange target=attacker types=['water']," +
        " when move is used, then attacker.types=['water'] and message event emitted",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          typeChange: { target: "attacker" as const, types: ["water" as const] },
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — attacker's types updated
        const attackerActive = engine.state.sides[0].active[0];
        expect(attackerActive?.types).toEqual(["water"]);

        // Assert — message event emitted with type-changed text
        const messageEvent = events.find(
          (e) => e.type === "message" && e.text.includes("type changed"),
        );
        expect(messageEvent).toBeDefined();
      },
    );

    it(
      "given typeChange target=defender types=['fire','flying']," +
        " when move is used, then defender.types=['fire','flying']",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          typeChange: {
            target: "defender" as const,
            types: ["fire" as const, "flying" as const],
          },
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — defender's types updated
        const defenderActive = engine.state.sides[1].active[0];
        expect(defenderActive?.types).toEqual(["fire", "flying"]);

        // Assert — message event emitted
        const messageEvent = events.find(
          (e) => e.type === "message" && e.text.includes("type changed"),
        );
        expect(messageEvent).toBeDefined();
      },
    );
  });

  describe("statusCuredOnly", () => {
    it(
      "given statusCuredOnly target=attacker and attacker has burn with non-zero stat stages," +
        " when move is used, then status is cleared but stat stages are NOT reset",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          statusCuredOnly: { target: "attacker" as const },
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker has burn and +2 attack stage
        const attackerActive = engine.state.sides[0].active[0];
        if (attackerActive) {
          attackerActive.pokemon.status = "burn";
          attackerActive.statStages.attack = 2;
        }

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — status is cured
        expect(attackerActive?.pokemon.status).toBeNull();

        // Assert — stat stages are NOT reset (attack still +2)
        expect(attackerActive?.statStages.attack).toBe(2);

        // Assert — status-cure event emitted for side 0
        const statusCure = events.find(
          (e) => e.type === "status-cure" && e.side === 0 && e.status === "burn",
        );
        expect(statusCure).toBeDefined();
      },
    );

    it(
      "given statusCuredOnly target=attacker when attacker has no status," +
        " when move is used, then no status-cure event is emitted",
      () => {
        // Arrange
        const ruleset = new MockRuleset();
        ruleset.executeMoveEffect = () => ({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          statusCuredOnly: { target: "attacker" as const },
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker has no status (default)

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — no status-cure event for side 0
        const statusCure = events.find((e) => e.type === "status-cure" && e.side === 0);
        expect(statusCure).toBeUndefined();
      },
    );
  });
});
