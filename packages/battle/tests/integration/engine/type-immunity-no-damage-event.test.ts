/**
 * Regression tests for #1161: Engine must NOT emit DamageEvent with amount=0
 * when a move has type immunity (effectiveness=0).
 *
 * Source: pokered engine/battle/core.asm CheckTypeMatchup — 0× immunity returns
 *   immediately with "It doesn't affect" message; no damage is dealt or emitted.
 * Source: Showdown sim/battle-actions.ts — "It doesn't affect..." emitted and
 *   move execution terminates before any damage path when typeEffectiveness===0.
 */

import { CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type {
  BattleConfig,
  DamageContext,
  DamageResult,
  MoveEffectContext,
  MoveEffectResult,
} from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager, MOCK_SPECIES_IDS } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

// ---------------------------------------------------------------------------
// MockRuleset that simulates a type-immune attack (effectiveness=0, damage=0)
// Source: pokered data/types/type_matchups.asm — Normal→Ghost = 0×
// ---------------------------------------------------------------------------
class ImmunityRuleset extends MockRuleset {
  calculateDamage(context: DamageContext): DamageResult {
    // Simulate e.g. Normal move vs Ghost-type: effectiveness=0, damage=0
    return {
      damage: 0,
      effectiveness: 0,
      isCrit: context.isCrit,
      randomFactor: 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Stateful MockRuleset that returns a recursiveMove on the first call only,
// to exercise the executeMoveById code path without infinite recursion.
// Source: BattleEngine.ts — executeMoveById is called when effectResult.recursiveMove is set
// ---------------------------------------------------------------------------
class RecursiveOnceImmunityRuleset extends ImmunityRuleset {
  private recursiveCallCount = 0;

  override executeMoveEffect(_context: MoveEffectContext): MoveEffectResult {
    this.recursiveCallCount++;
    if (this.recursiveCallCount === 1) {
      // First call: trigger a recursive tackle (also immune via calculateDamage override)
      // Source: BattleEngine.ts line 3307 — "if (effectResult.recursiveMove) executeMoveById(...)"
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
        recursiveMove: CORE_MOVE_IDS.tackle,
      };
    }
    // Subsequent calls: no recursive move (prevents infinite loop)
    return {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
  }
}

function createEngine(ruleset: MockRuleset, seed = 42) {
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = [
    createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
      uid: "attacker-1",
      nickname: "Attacker",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    }),
  ];
  const team2 = [
    createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
      uid: "defender-1",
      nickname: "Defender",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));
  engine.start();
  return { engine, events };
}

describe("BattleEngine — type immunity: no DamageEvent with amount=0 (#1161)", () => {
  // --- Core contract: DamageEvent.amount must be positive ---

  it("given a type-immune move (effectiveness=0), when the move executes, then no DamageEvent is emitted", () => {
    // Arrange
    const ruleset = new ImmunityRuleset();
    const { engine, events } = createEngine(ruleset);
    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    // Assert: no DamageEvent emitted for either immune attack
    // Source: pokered engine/battle/core.asm CheckTypeMatchup — 0× immunity exits
    //   battle_calc loop entirely; no damage is subtracted or recorded
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents).toHaveLength(0);
  });

  it("given a type-immune move (effectiveness=0), when the move executes, then a 'doesn't affect' message is emitted", () => {
    // Arrange
    const ruleset = new ImmunityRuleset();
    const { engine, events } = createEngine(ruleset);
    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    // Assert: "doesn't affect" message is emitted for each immune attack
    // Source: pokered engine/battle/core.asm PrintTypeEffectiveness — prints "It doesn't affect"
    //   when type matchup product is 0
    const immunityMessages = events.filter(
      (e) =>
        e.type === "message" &&
        (e as { type: "message"; text: string }).text.includes("doesn't affect"),
    );
    expect(immunityMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("given a type-immune move (effectiveness=0), when the move executes, then no effectiveness event with multiplier=0 is emitted", () => {
    // Arrange
    const ruleset = new ImmunityRuleset();
    const { engine, events } = createEngine(ruleset);
    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    // Assert: no effectiveness event emitted for immunity (the "doesn't affect" message replaces it)
    // Source: pokered engine/battle/core.asm PrintTypeEffectiveness — bypasses the effectiveness
    //   banner when result is 0; shows distinct "no effect" text only
    const immunityEffectivenessEvents = events.filter(
      (e) =>
        e.type === "effectiveness" &&
        (e as { type: "effectiveness"; multiplier: number }).multiplier === 0,
    );
    expect(immunityEffectivenessEvents).toHaveLength(0);
  });

  it("given a type-immune move (effectiveness=0), when the move executes, then the defender's HP is unchanged", () => {
    // Arrange
    const ruleset = new ImmunityRuleset();
    const { engine, events } = createEngine(ruleset);
    // Get HP after engine.start() recalculates stats — startHp is the true initial HP
    const defenderBeforeTurn = engine.getState().sides[1]?.active[0];
    const startHp = defenderBeforeTurn?.pokemon.currentHp ?? 0;
    expect(startHp).toBeGreaterThan(0); // sanity check: Pokemon must start with > 0 HP
    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    // Assert: defender still at full HP after an immune attack
    // Source: pokered engine/battle/core.asm HandleBattleCore — no HP subtraction when type product = 0
    const defenderAfterTurn = engine.getState().sides[1]?.active[0];
    expect(defenderAfterTurn?.pokemon.currentHp).toBe(startHp);
  });

  // --- Ensure normal (non-immune) damage still emits DamageEvent correctly ---

  it("given a normal effective move (effectiveness=1, damage > 0), when the move executes, then a DamageEvent with positive amount is emitted", () => {
    // Arrange — use default MockRuleset which returns effectiveness=1, fixedDamage=10
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(10);
    const { engine, events } = createEngine(ruleset);
    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    // Assert: damage events ARE emitted for non-immune attacks with positive amounts
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
    for (const evt of damageEvents) {
      // Source: BattleEngine contract — DamageEvent.amount must be a positive integer
      expect((evt as { type: "damage"; amount: number }).amount).toBeGreaterThan(0);
    }
  });

  // --- executeMoveById path (recursive moves: Mirror Move, Metronome chains) ---

  it("given a recursive move via executeMoveById with effectiveness=0, when it executes, then no DamageEvent is emitted", () => {
    // Arrange — the move effect triggers a recursive tackle which is also immune
    // Source: BattleEngine.ts executeMoveById — secondary code path used by Mirror Move,
    //   Metronome, and other recursive attacks; must apply same immunity guard
    const ruleset = new RecursiveOnceImmunityRuleset();
    const { engine, events } = createEngine(ruleset);
    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    // Assert: no DamageEvent with amount=0 from either primary or recursive immune hit
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents).toHaveLength(0);
  });

  // --- Smoke: every DamageEvent.amount must be > 0 regardless of immunities ---

  it("given any battle turn with type immunity, when DamageEvents are emitted, then every amount is a positive integer", () => {
    // Arrange — ImmunityRuleset returns effectiveness=0, damage=0 for all attacks
    const ruleset = new ImmunityRuleset();
    const { engine, events } = createEngine(ruleset, 99999);
    // Act — run 3 turns, neither side can deal damage via type immunity
    for (let i = 0; i < 3; i++) {
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    }
    // Assert: no DamageEvent with amount <= 0 should ever appear
    // Source: BattleEngine contract — DamageEvent.amount must be a positive integer (>0)
    //   Emitting amount=0 causes smoke runner invariant violation (tools/oracle-validation/src/smoke-runner.ts)
    //   and confuses downstream event renderers that assume damage is meaningful
    for (const evt of events) {
      if (evt.type === "damage") {
        expect((evt as { type: "damage"; amount: number }).amount).toBeGreaterThan(0);
      }
    }
  });
});
