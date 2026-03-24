import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

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
        // Verify startTime is stored for Gen 5 sleep counter reset
        // Source: Showdown data/mods/gen5/conditions.ts -- slp.onSwitchIn reads effectState.startTime
        const startTime = (sleepCounter?.data as Record<string, unknown>)?.startTime;
        expect(startTime).toBe(2);
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

  describe("screenSet", () => {
    it("given screenSet screen='lucky-chant' on the attacker, when move is used, then the lucky-chant screen and side field stay synchronized", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = () => [];
      let callCount = 0;
      ruleset.executeMoveEffect = () => {
        callCount++;
        if (callCount === 1) {
          return {
            statusInflicted: null,
            volatileInflicted: null,
            statChanges: [],
            recoilDamage: 0,
            healAmount: 0,
            switchOut: false,
            messages: [],
            screenSet: { screen: "lucky-chant", turnsLeft: 5, side: "attacker" as const },
          };
        }
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        };
      };

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Lucky Chant is tracked in both places so Gen 4 crit suppression can read it
      expect(engine.state.sides[0].screens).toHaveLength(1);
      expect(engine.state.sides[0].screens[0]?.turnsLeft).toBe(5);
      expect((engine.state.sides[0].screens[0] as { type: string } | undefined)?.type).toBe(
        "lucky-chant",
      );
      expect(engine.state.sides[0].luckyChant).toEqual({ active: true, turnsLeft: 5 });
    });
  });

  describe("statStagesReset", () => {
    // Source: pokered move_effects/haze.asm:15-43 — Haze resets stat stages for one or both
    // sides independently of status; status is NOT cured by statStagesReset.
    it(
      "given attacker has boosted stat stages and burn status and statStagesReset targets attacker," +
        " when processing, then attacker stages are zeroed but status is preserved",
      () => {
        // Arrange — only the first executeMoveEffect call returns statStagesReset;
        // the second call (Blastoise's move) returns a no-op so Blastoise's own stages
        // are not reset and we can verify defender stages are unaffected.
        // Source: pokered move_effects/haze.asm:15-43 — attacker side stages reset independently
        const ruleset = new MockRuleset();
        let callCount = 0;
        ruleset.executeMoveEffect = () => {
          callCount++;
          if (callCount === 1) {
            return {
              statusInflicted: null,
              volatileInflicted: null,
              statChanges: [],
              recoilDamage: 0,
              healAmount: 0,
              switchOut: false,
              messages: [],
              statStagesReset: { target: "attacker" as const },
            };
          }
          return {
            statusInflicted: null,
            volatileInflicted: null,
            statChanges: [],
            recoilDamage: 0,
            healAmount: 0,
            switchOut: false,
            messages: [],
          };
        };

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker (side 0, Charizard) has +3 attack and burn status
        // Defender (side 1, Blastoise) has +2 defense — should be unchanged after the turn
        const attackerActive = engine.state.sides[0].active[0];
        const defenderActive = engine.state.sides[1].active[0];
        if (attackerActive) {
          attackerActive.statStages.attack = 3;
          attackerActive.pokemon.status = "burn";
        }
        if (defenderActive) {
          defenderActive.statStages.defense = 2;
        }

        // Act — Charizard is faster (speed 120 > 80), so its move executes first
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — attacker attack stage reset to 0
        expect(attackerActive?.statStages.attack).toBe(0);
        // Assert — attacker status NOT cured (statStagesReset never touches status)
        expect(attackerActive?.pokemon.status).toBe("burn");
        // Assert — defender defense stage unchanged (Blastoise used a no-op move)
        expect(defenderActive?.statStages.defense).toBe(2);
        // Assert — the reset is surfaced as a stat-change event for downstream listeners
        const attackReset = events.find(
          (e) => e.type === "stat-change" && e.side === 0 && e.stat === "attack",
        );
        expect(attackReset).toBeDefined();
        expect(attackReset?.type === "stat-change" && attackReset.stages).toBe(-3);
        expect(attackReset?.type === "stat-change" && attackReset.currentStage).toBe(0);
      },
    );

    it(
      "given both Pokemon have boosted stat stages and statStagesReset targets both," +
        " when processing, then both sides stages are zeroed",
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
          // Source: pokered move_effects/haze.asm:15-43 — Haze clears all stages for both sides
          statStagesReset: { target: "both" as const },
        });

        const { engine } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker +2 attack, defender -1 defense
        const attackerActive = engine.state.sides[0].active[0];
        const defenderActive = engine.state.sides[1].active[0];
        if (attackerActive) {
          attackerActive.statStages.attack = 2;
        }
        if (defenderActive) {
          defenderActive.statStages.defense = -1;
        }

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — both sides stages zeroed
        expect(attackerActive?.statStages.attack).toBe(0);
        expect(defenderActive?.statStages.defense).toBe(0);
      },
    );

    it(
      "given defender has boosted stat stages and statStagesReset targets defender," +
        " when processing, then defender stages are zeroed but attacker stages unchanged",
      () => {
        // Arrange — only the first executeMoveEffect call returns statStagesReset targeting
        // the defender; the second call (Blastoise's move) returns a no-op so we can
        // verify that attacker stages are not touched by Blastoise's own action.
        // Source: pokered move_effects/haze.asm:15-43 — defender side reset independently
        const ruleset = new MockRuleset();
        let callCount = 0;
        ruleset.executeMoveEffect = () => {
          callCount++;
          if (callCount === 1) {
            return {
              statusInflicted: null,
              volatileInflicted: null,
              statChanges: [],
              recoilDamage: 0,
              healAmount: 0,
              switchOut: false,
              messages: [],
              statStagesReset: { target: "defender" as const },
            };
          }
          return {
            statusInflicted: null,
            volatileInflicted: null,
            statChanges: [],
            recoilDamage: 0,
            healAmount: 0,
            switchOut: false,
            messages: [],
          };
        };

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker (Charizard, side 0) +1 attack; defender (Blastoise, side 1) +3 defense
        const attackerActive = engine.state.sides[0].active[0];
        const defenderActive = engine.state.sides[1].active[0];
        if (attackerActive) {
          attackerActive.statStages.attack = 1;
        }
        if (defenderActive) {
          defenderActive.statStages.defense = 3;
        }

        // Act — Charizard moves first (speed 120 > 80), resets defender (Blastoise) stages
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — defender (Blastoise) defense stage zeroed
        expect(defenderActive?.statStages.defense).toBe(0);
        // Assert — attacker (Charizard) attack stage unchanged (Blastoise used no-op)
        expect(attackerActive?.statStages.attack).toBe(1);
        // Assert — defender reset is surfaced as a stat-change event for downstream listeners
        const defenseReset = events.find(
          (e) => e.type === "stat-change" && e.side === 1 && e.stat === "defense",
        );
        expect(defenseReset).toBeDefined();
        expect(defenseReset?.type === "stat-change" && defenseReset.stages).toBe(-3);
        expect(defenseReset?.type === "stat-change" && defenseReset.currentStage).toBe(0);
      },
    );
  });

  describe("statusCured", () => {
    it(
      "given attacker has boosted stat stages and burn status and statusCured targets attacker," +
        " when processing, then attacker stages are reset and the reset is emitted",
      () => {
        // Arrange — only the first executeMoveEffect call returns statusCured; the second
        // call returns a no-op so the defender's own action does not affect the assertion.
        const ruleset = new MockRuleset();
        let callCount = 0;
        ruleset.executeMoveEffect = () => {
          callCount++;
          if (callCount === 1) {
            return {
              statusInflicted: null,
              volatileInflicted: null,
              statChanges: [],
              recoilDamage: 0,
              healAmount: 0,
              switchOut: false,
              messages: [],
              statusCured: { target: "attacker" as const },
            };
          }
          return {
            statusInflicted: null,
            volatileInflicted: null,
            statChanges: [],
            recoilDamage: 0,
            healAmount: 0,
            switchOut: false,
            messages: [],
          };
        };

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        const attackerActive = engine.state.sides[0].active[0];
        if (attackerActive) {
          attackerActive.statStages.attack = 2;
          attackerActive.pokemon.status = "burn";
        }

        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        expect(attackerActive?.statStages.attack).toBe(0);
        expect(attackerActive?.pokemon.status).toBeNull();

        const statusCure = events.find(
          (e) => e.type === "status-cure" && e.side === 0 && e.status === "burn",
        );
        expect(statusCure).toBeDefined();

        const attackReset = events.find(
          (e) => e.type === "stat-change" && e.side === 0 && e.stat === "attack",
        );
        expect(attackReset).toBeDefined();
        expect(attackReset?.type === "stat-change" && attackReset.stages).toBe(-2);
        expect(attackReset?.type === "stat-change" && attackReset.currentStage).toBe(0);
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
