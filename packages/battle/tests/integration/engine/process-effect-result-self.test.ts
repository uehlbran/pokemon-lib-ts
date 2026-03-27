import type { PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_MOVE_IDS,
  CORE_SCREEN_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, MoveEffectResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager, MOCK_SPECIES_IDS } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

const NO_OP_MOVE_EFFECT_RESULT: MoveEffectResult = {
  statusInflicted: null,
  volatileInflicted: null,
  statChanges: [],
  recoilDamage: 0,
  healAmount: 0,
  switchOut: false,
  messages: [],
};

function createMoveEffectSequence(...results: MoveEffectResult[]) {
  const queuedResults = [...results];
  return () => queuedResults.shift() ?? NO_OP_MOVE_EFFECT_RESULT;
}

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
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
          selfStatusInflicted: CORE_STATUS_IDS.sleep as const,
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
        expect(statusInflict?.type === "status-inflict" && statusInflict.status).toBe(
          CORE_STATUS_IDS.sleep,
        );

        // Assert — attacker's active pokemon has sleep status
        const attackerActive = engine.state.sides[0].active[0];
        expect(attackerActive?.pokemon.status).toBe(CORE_STATUS_IDS.sleep);

        // Assert — sleep-counter volatile is set with turnsLeft=2 (NOT rolled from ruleset)
        const sleepCounter = attackerActive?.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter);
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
          selfStatusInflicted: CORE_STATUS_IDS.sleep as const,
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker already has burn
        const attackerActive = engine.state.sides[0].active[0];
        if (attackerActive) {
          attackerActive.pokemon.status = CORE_STATUS_IDS.burn;
        }

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — status is still burn, not sleep
        expect(attackerActive?.pokemon.status).toBe(CORE_STATUS_IDS.burn);

        // Assert — no sleep status-inflict event for side 0
        const sleepInflict = events.find(
          (e) => e.type === "status-inflict" && e.side === 0 && e.status === CORE_STATUS_IDS.sleep,
        );
        expect(sleepInflict).toBeUndefined();
      },
    );
  });

  describe("selfVolatileInflicted", () => {
    it(
      `given selfVolatileInflicted=${CORE_VOLATILE_IDS.mist},` +
        ` when move is used, then attacker gains ${CORE_VOLATILE_IDS.mist} volatile in volatileStatuses`,
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
          selfVolatileInflicted: CORE_VOLATILE_IDS.mist as const,
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — attacker (side 0) has mist in volatileStatuses
        const attackerActive = engine.state.sides[0].active[0];
        expect(attackerActive?.volatileStatuses.has(CORE_VOLATILE_IDS.mist)).toBe(true);

        // Assert — volatile-start event emitted for side 0 with volatile=CORE_VOLATILE_IDS.mist
        const volatileStart = events.find(
          (e) =>
            e.type === "volatile-start" && e.side === 0 && e.volatile === CORE_VOLATILE_IDS.mist,
        );
        expect(volatileStart).toBeDefined();
      },
    );

    it(
      `given selfVolatileInflicted=${CORE_VOLATILE_IDS.mist} when attacker already has mist,` +
        ` when move is used, then ${CORE_VOLATILE_IDS.mist} is NOT applied again`,
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
          selfVolatileInflicted: CORE_VOLATILE_IDS.mist as const,
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker already has mist
        const attackerActive = engine.state.sides[0].active[0];
        attackerActive?.volatileStatuses.set(CORE_VOLATILE_IDS.mist, { turnsLeft: -1 });

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — no volatile-start event for mist on side 0 (already had it)
        // NOTE: side 1 may still get mist from their own move execution, but we
        // only care that side 0 did NOT get a duplicate volatile-start
        const volatileStartsSide0 = events.filter(
          (e) =>
            e.type === "volatile-start" && e.volatile === CORE_VOLATILE_IDS.mist && e.side === 0,
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
          typeChange: { target: "attacker" as const, types: [CORE_TYPE_IDS.water as const] },
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — attacker's types updated
        const attackerActive = engine.state.sides[0].active[0];
        expect(attackerActive?.types).toEqual([CORE_TYPE_IDS.water]);

        // Assert — message event emitted with type-changed text
        expect(events).toContainEqual({
          type: "message",
          text: "Charizard's type changed!",
        });
      },
    );

    it(
      `given typeChange target=defender types=['${CORE_TYPE_IDS.fire}','${CORE_TYPE_IDS.flying}'],` +
        ` when move is used, then defender.types=['${CORE_TYPE_IDS.fire}','${CORE_TYPE_IDS.flying}']`,
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
            types: [CORE_TYPE_IDS.fire as const, CORE_TYPE_IDS.flying as const],
          },
        });

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Act
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        // Assert — defender's types updated
        const defenderActive = engine.state.sides[1].active[0];
        expect(defenderActive?.types).toEqual([CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);

        // Assert — message event emitted
        expect(events).toContainEqual({
          type: "message",
          text: "Blastoise's type changed!",
        });
      },
    );
  });

  describe("screenSet", () => {
    it(`given screenSet screen=${CORE_SCREEN_IDS.luckyChant} on the attacker, when move is used, then the ${CORE_SCREEN_IDS.luckyChant} screen and side field stay synchronized`, () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.getEndOfTurnOrder = () => [];
      ruleset.executeMoveEffect = createMoveEffectSequence(
        {
          ...NO_OP_MOVE_EFFECT_RESULT,
          screenSet: {
            screen: CORE_SCREEN_IDS.luckyChant,
            turnsLeft: 5,
            side: "attacker" as const,
          },
        },
        NO_OP_MOVE_EFFECT_RESULT,
      );

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Lucky Chant is tracked in both places so Gen 4 crit suppression can read it
      expect(engine.state.sides[0].screens).toHaveLength(1);
      // Source: Lucky Chant lasts 5 turns in the shared screen constants.
      expect(engine.state.sides[0].screens[0]?.turnsLeft).toBe(5);
      expect((engine.state.sides[0].screens[0] as { type: string } | undefined)?.type).toBe(
        CORE_SCREEN_IDS.luckyChant,
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
        ruleset.executeMoveEffect = createMoveEffectSequence(
          {
            ...NO_OP_MOVE_EFFECT_RESULT,
            statStagesReset: { target: "attacker" as const },
          },
          NO_OP_MOVE_EFFECT_RESULT,
        );

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        // Pre-condition: attacker (side 0, Charizard) has +3 attack and burn status
        // Defender (side 1, Blastoise) has +2 defense — should be unchanged after the turn
        const attackerActive = engine.state.sides[0].active[0];
        const defenderActive = engine.state.sides[1].active[0];
        if (attackerActive) {
          attackerActive.statStages.attack = 3;
          attackerActive.pokemon.status = CORE_STATUS_IDS.burn;
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
        expect(attackerActive?.pokemon.status).toBe(CORE_STATUS_IDS.burn);
        // Assert — defender defense stage unchanged (Blastoise used a no-op move)
        expect(defenderActive?.statStages.defense).toBe(2);
        // Assert — the reset is surfaced as a stat-change event for downstream listeners
        const attackReset = events.find(
          (e) => e.type === "stat-change" && e.side === 0 && e.stat === CORE_STAT_IDS.attack,
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
        ruleset.executeMoveEffect = createMoveEffectSequence(
          {
            ...NO_OP_MOVE_EFFECT_RESULT,
            statStagesReset: { target: "defender" as const },
          },
          NO_OP_MOVE_EFFECT_RESULT,
        );

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
          (e) => e.type === "stat-change" && e.side === 1 && e.stat === CORE_STAT_IDS.defense,
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
        ruleset.executeMoveEffect = createMoveEffectSequence(
          {
            ...NO_OP_MOVE_EFFECT_RESULT,
            statusCured: { target: "attacker" as const },
          },
          NO_OP_MOVE_EFFECT_RESULT,
        );

        const { engine, events } = createEngine({ ruleset });
        engine.start();

        const attackerActive = engine.state.sides[0].active[0];
        if (attackerActive) {
          attackerActive.statStages.attack = 2;
          attackerActive.pokemon.status = CORE_STATUS_IDS.burn;
        }

        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        expect(attackerActive?.statStages.attack).toBe(0);
        expect(attackerActive?.pokemon.status).toBeNull();

        const statusCure = events.find(
          (e) => e.type === "status-cure" && e.side === 0 && e.status === CORE_STATUS_IDS.burn,
        );
        expect(statusCure).toBeDefined();

        const attackReset = events.find(
          (e) => e.type === "stat-change" && e.side === 0 && e.stat === CORE_STAT_IDS.attack,
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
          attackerActive.pokemon.status = CORE_STATUS_IDS.burn;
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
          (e) => e.type === "status-cure" && e.side === 0 && e.status === CORE_STATUS_IDS.burn,
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
