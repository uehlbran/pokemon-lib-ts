import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_MOVE_IDS, CORE_VOLATILE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, DamageContext, DamageResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { ActivePokemon, BattleState } from "../../../src/state";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

const MOVE_IDS = CORE_MOVE_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;

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
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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
      moves: [{ moveId: MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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

// ─── Recharge Enforcement Tests (#104) ────────────────────────────────────────

describe("recharge enforcement (#104)", () => {
  describe("given a Pokemon with the recharge volatile that submits a MoveAction", () => {
    it("when resolveTurn processes the turn, then the recharge action fires and emits a must-recharge message", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      const onFieldPokemon0 = engine.state.sides[0].active[0];
      if (!onFieldPokemon0) {
        throw new Error("Expected an active Pokemon on side 0");
      }
      onFieldPokemon0.volatileStatuses.set(VOLATILE_IDS.recharge, { turnsLeft: 1 });

      // Act — side 0 tries to submit a move but has recharge volatile
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — a recharge message appears for side 0
      const messages = events.filter((e) => e.type === "message");
      const hasRechargeMessage = messages.some(
        (e) => e.type === "message" && e.text === "Charizard must recharge!",
      );
      expect(hasRechargeMessage).toBe(true);
    });

    it("when resolveTurn processes the turn, then the recharge volatile is cleared from the Pokemon", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      const onFieldPokemon0 = engine.state.sides[0].active[0];
      if (!onFieldPokemon0) {
        throw new Error("Expected an active Pokemon on side 0");
      }
      onFieldPokemon0.volatileStatuses.set(VOLATILE_IDS.recharge, { turnsLeft: 1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — volatile is gone after the turn
      expect(onFieldPokemon0.volatileStatuses.has(VOLATILE_IDS.recharge)).toBe(false);
    });

    it("when the recharge turn resolves, then on the next turn the Pokemon can act normally", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      const onFieldPokemon0 = engine.state.sides[0].active[0];
      if (!onFieldPokemon0) {
        throw new Error("Expected an active Pokemon on side 0");
      }
      onFieldPokemon0.volatileStatuses.set(VOLATILE_IDS.recharge, { turnsLeft: 1 });

      // Turn 1 — recharge fires
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Turn 2 — no recharge volatile, so a normal move executes
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no recharge message on turn 2; a move-start event appears for side 0
      const messages = events.filter((e) => e.type === "message");
      const hasRechargeMessage = messages.some(
        (e) => e.type === "message" && e.text === "Charizard must recharge!",
      );
      expect(hasRechargeMessage).toBe(false);

      const moveStart = events.find((e) => e.type === "move-start" && e.side === 0);
      expect(moveStart).toBeDefined();
    });
  });
});

// ─── Struggle Damage Delegation Tests (#80) ───────────────────────────────────

/**
 * MockRuleset subclass that returns a fixed damage value from calculateStruggleDamage,
 * letting us verify the engine calls the ruleset instead of computing inline.
 */
class FixedStruggleDamageRuleset extends MockRuleset {
  private readonly fixedStruggle: number;

  constructor(fixedStruggle: number) {
    super();
    this.fixedStruggle = fixedStruggle;
  }

  override calculateStruggleDamage(
    _attacker: ActivePokemon,
    _defender: ActivePokemon,
    _state: BattleState,
  ): number {
    return this.fixedStruggle;
  }
}

/**
 * MockRuleset subclass that returns 0 from calculateStruggleDamage,
 * simulating a type-immune Struggle result (Gen 1 Ghost vs Normal-type Struggle).
 */
class ZeroStruggleDamageRuleset extends MockRuleset {
  override calculateStruggleDamage(
    _attacker: ActivePokemon,
    _defender: ActivePokemon,
    _state: BattleState,
  ): number {
    return 0;
  }

  // Also override calculateDamage to return 0 (avoid unrelated damage)
  override calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 0, effectiveness: 0, isCrit: false, randomFactor: 1 };
  }
}

describe("Struggle damage delegation (#80)", () => {
  describe("given a ruleset that returns a fixed Struggle damage of 99", () => {
    it("when executeStruggle runs, then the damage event reflects the ruleset's value, not a hardcoded 1/4 maxHP", () => {
      // Arrange — attacker has maxHp 200, so old hardcoded formula would give 50.
      //           Ruleset returns 99, confirming delegation.
      const ruleset = new FixedStruggleDamageRuleset(99);
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Trigger Struggle by setting PP to 0 first, then submit a struggle action directly
      // We access the active Pokemon and submit a struggle action
      events.length = 0;
      engine.submitAction(0, { type: "struggle", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — find the damage event whose source is "struggle"
      const struggleDamage = events.find(
        (e) => e.type === "damage" && "source" in e && e.source === MOVE_IDS.struggle,
      );
      if (!struggleDamage || struggleDamage.type !== "damage") {
        throw new Error("Expected a Struggle damage event");
      }
      // Source: this ruleset instance is constructed with FixedStruggleDamageRuleset(99).
      expect(struggleDamage.amount).toBe(99);
    });
  });

  describe("given a ruleset that returns 0 Struggle damage (simulating Gen 1 Ghost immunity)", () => {
    it("when executeStruggle runs, then the damage event shows 0 damage to the defender", () => {
      // Arrange
      const ruleset = new ZeroStruggleDamageRuleset();
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      events.length = 0;
      engine.submitAction(0, { type: "struggle", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Struggle damage event amount is 0
      const struggleDamage = events.find(
        (e) => e.type === "damage" && "source" in e && e.source === MOVE_IDS.struggle,
      );
      if (!struggleDamage || struggleDamage.type !== "damage") {
        throw new Error("Expected a Struggle damage event");
      }
      expect(struggleDamage.amount).toBe(0);
    });
  });

  describe("given a ruleset that returns 60 Struggle damage (simulating Gen 2+ typeless)", () => {
    it("when executeStruggle runs, then the damage event shows 60 damage regardless of defender type", () => {
      // Arrange — 60 > 0, proving no type immunity applies for Gen 2+ style
      const ruleset = new FixedStruggleDamageRuleset(60);
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      events.length = 0;
      engine.submitAction(0, { type: "struggle", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const struggleDamage = events.find(
        (e) => e.type === "damage" && "source" in e && e.source === MOVE_IDS.struggle,
      );
      if (!struggleDamage || struggleDamage.type !== "damage") {
        throw new Error("Expected a Struggle damage event");
      }
      // Source: this ruleset instance is constructed with FixedStruggleDamageRuleset(60).
      expect(struggleDamage.amount).toBe(60);
    });
  });
});
