/**
 * Tests for BattleGimmick.modifyMove() engine hook.
 *
 * Verifies that executeMove() calls gimmick.modifyMove() after gimmick.activate()
 * and before damage calculation, so that gimmick-transformed move data (e.g., Z-Move
 * power override) feeds into the damage formula.
 *
 * Source: Showdown sim/battle-actions.ts — Z-Move base power override happens in useMove,
 *   after the gimmick is activated but before the damage step.
 */
import { CORE_MOVE_IDS, type MoveData, type PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type {
  BattleConfig,
  BattleGimmick,
  DamageContext,
  EndOfTurnEffect,
} from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { ActivePokemon, BattleSide, BattleState } from "../../../src/state";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager, MOCK_SPECIES_IDS } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_DATA_MANAGER = createMockDataManager();
const TACKLE_POWER = MOCK_DATA_MANAGER.getMove(CORE_MOVE_IDS.tackle).power ?? 0;

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
    generation: 7,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BattleGimmick.modifyMove() engine hook", () => {
  it("given a Z-Move gimmick with modifyMove that doubles base power, when a move executes with action.zMove=true, then calculateDamage receives the doubled power", () => {
    // Source: Showdown sim/battle-actions.ts — Z-Move modifies move power before damage calc.
    // The canonical mock Tackle payload comes from the Gen 1 data bundle; this test doubles
    // that real power instead of relying on a handwritten literal.
    const ruleset = new MockRuleset();
    const capturedContexts: DamageContext[] = [];
    const callOrder: string[] = [];

    // Capture the DamageContext passed to calculateDamage
    const originalCalcDamage = ruleset.calculateDamage.bind(ruleset);
    ruleset.calculateDamage = (ctx: DamageContext) => {
      capturedContexts.push(ctx);
      return originalCalcDamage(ctx);
    };

    const mockZMoveGimmick: BattleGimmick = {
      name: "Z-Move",
      generations: [7],
      canUse: (_pokemon: ActivePokemon, _side: BattleSide, _state: BattleState) => true,
      activate: (
        _pokemon: ActivePokemon,
        _side: BattleSide,
        _state: BattleState,
      ): BattleEvent[] => {
        callOrder.push("activate");
        return [];
      },
      modifyMove: (move: MoveData, _pokemon: ActivePokemon): MoveData => {
        callOrder.push("modifyMove");
        // Double the base power (simulating Z-Move power transformation)
        return { ...move, power: move.power !== null ? move.power * 2 : move.power };
      },
    };

    ruleset.getBattleGimmick = () => mockZMoveGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;
    capturedContexts.length = 0;

    // Act — side 0 uses Z-Move, side 1 uses normal move
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, zMove: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — activate runs before modifyMove, then damage is calculated for both sides.
    expect(callOrder).toEqual(["activate", "modifyMove"]);
    expect(capturedContexts).toHaveLength(2);
    expect(capturedContexts[0]?.move.power).toBe(TACKLE_POWER * 2);
    expect(capturedContexts[1]?.move.power).toBe(TACKLE_POWER);
  });

  it("given a gimmick WITHOUT modifyMove, when a move executes with action.mega=true, then calculateDamage receives the original move power unchanged", () => {
    // Source: Mega Evolution does not modify moves — only Z-Move/Dynamax do.
    // This ensures the engine gracefully handles gimmicks without modifyMove.
    const ruleset = new MockRuleset();
    const capturedContexts: DamageContext[] = [];

    const originalCalcDamage = ruleset.calculateDamage.bind(ruleset);
    ruleset.calculateDamage = (ctx: DamageContext) => {
      capturedContexts.push(ctx);
      return originalCalcDamage(ctx);
    };

    const mockMegaGimmick: BattleGimmick = {
      name: "Mega Evolution",
      generations: [6],
      canUse: () => true,
      activate: (): BattleEvent[] => [],
      // No modifyMove — Mega Evolution doesn't transform moves
    };

    ruleset.getBattleGimmick = () => mockMegaGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;
    capturedContexts.length = 0;

    // Act — side 0 uses Mega, side 1 normal
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, mega: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — power should be unmodified (canonical mock Tackle power)
    expect(capturedContexts.length).toBeGreaterThanOrEqual(1);
    const megaMoveContext = capturedContexts[0];
    expect(megaMoveContext.move.power).toBe(TACKLE_POWER);
  });

  it("given a gimmick with modifyMove, when modifyMove is called, then it runs AFTER activate (ordering guarantee)", () => {
    // Source: Showdown sim/battle-actions.ts — gimmick activation precedes move transformation
    const ruleset = new MockRuleset();
    const callOrder: string[] = [];

    const mockGimmick: BattleGimmick = {
      name: "Z-Move",
      generations: [7],
      canUse: () => true,
      activate: (): BattleEvent[] => {
        callOrder.push("activate");
        return [];
      },
      modifyMove: (move: MoveData, _pokemon: ActivePokemon): MoveData => {
        callOrder.push("modifyMove");
        return move;
      },
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, zMove: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — activate must be called before modifyMove
    expect(callOrder).toEqual(["activate", "modifyMove"]);
  });

  it("given no gimmick flag on the action, when move executes, then modifyMove is never called even if gimmick implements it", () => {
    // Source: modifyMove should only fire when a gimmick flag is set on the action
    const ruleset = new MockRuleset();
    const capturedContexts: DamageContext[] = [];

    const originalCalcDamage = ruleset.calculateDamage.bind(ruleset);
    ruleset.calculateDamage = (ctx: DamageContext) => {
      capturedContexts.push(ctx);
      return originalCalcDamage(ctx);
    };

    const mockGimmick: BattleGimmick = {
      name: "Z-Move",
      generations: [7],
      canUse: () => true,
      activate: (): BattleEvent[] => [],
      modifyMove: (move: MoveData): MoveData => {
        return { ...move, power: 9999 };
      },
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine } = createEngine({ ruleset });
    engine.start();

    // No gimmick flags on either action
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(capturedContexts).toHaveLength(2);
    expect(capturedContexts[0]?.move.power).toBe(TACKLE_POWER);
    expect(capturedContexts[1]?.move.power).toBe(TACKLE_POWER);
  });

  it("given a gimmick with modifyMove that changes move type, when damage calc runs, then the modified type is in the DamageContext", () => {
    // Source: Showdown sim/battle-actions.ts — Z-Moves can change the move type
    // (e.g., Normalium Z changes Normal-type moves to Z-powered Normal moves)
    const ruleset = new MockRuleset();
    const capturedContexts: DamageContext[] = [];

    const originalCalcDamage = ruleset.calculateDamage.bind(ruleset);
    ruleset.calculateDamage = (ctx: DamageContext) => {
      capturedContexts.push(ctx);
      return originalCalcDamage(ctx);
    };

    const mockGimmick: BattleGimmick = {
      name: "Z-Move",
      generations: [7],
      canUse: () => true,
      activate: (): BattleEvent[] => [],
      modifyMove: (move: MoveData, _pokemon: ActivePokemon): MoveData => {
        // Change type from normal to fire (simulating type-changing Z-crystal)
        return { ...move, type: "fire", power: 160 };
      },
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;
    capturedContexts.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, zMove: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — the damage context should have the modified type and power
    // Source: canonical mock Tackle is normal-type; after modifyMove it should be fire/160
    expect(capturedContexts.length).toBeGreaterThanOrEqual(1);
    const zMoveContext = capturedContexts[0];
    expect(zMoveContext.move.type).toBe("fire");
    expect(zMoveContext.move.power).toBe(160);
  });

  it("given a gimmick with modifyMove but canUse returns false, when move executes with zMove flag, then modifyMove is NOT called", () => {
    // Guards against a regression where modifyMove was called unconditionally on the action
    // flag, even if canUse() returned false and activation was skipped.
    // Source: Showdown sim/battle-actions.ts — modifyMove only runs after activation succeeds
    const ruleset = new MockRuleset();
    const capturedContexts: DamageContext[] = [];

    const originalCalcDamage = ruleset.calculateDamage.bind(ruleset);
    ruleset.calculateDamage = (ctx: DamageContext) => {
      capturedContexts.push(ctx);
      return originalCalcDamage(ctx);
    };

    const mockGimmick: BattleGimmick = {
      name: "Z-Move",
      generations: [7],
      // canUse returns false — gimmick cannot activate this turn
      canUse: (_pokemon: ActivePokemon, _side: BattleSide, _state: BattleState) => false,
      activate: (): BattleEvent[] => [],
      modifyMove: (move: MoveData): MoveData => {
        return { ...move, power: 9999 };
      },
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine } = createEngine({ ruleset });
    engine.start();

    // Action has zMove flag but canUse() returns false
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, zMove: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // modifyMove must NOT have been called since canUse() returned false.
    expect(capturedContexts).toHaveLength(2);
    expect(capturedContexts[0]?.move.power).toBe(TACKLE_POWER);
    expect(capturedContexts[1]?.move.power).toBe(TACKLE_POWER);
  });

  it("given a gimmick with reset(), when BattleEngine is constructed, then reset() is called to clear cross-battle state", () => {
    // Source: Showdown resets side.megaUsed / side.zMoveUsed at battle start.
    // A shared Gen7Ruleset instance could be reused across battles in tests;
    // the engine must reset gimmick state on construction to prevent leakage.
    const ruleset = new MockRuleset();
    let resetCallCount = 0;

    const mockGimmick: BattleGimmick = {
      name: "Z-Move",
      generations: [7],
      canUse: () => true,
      activate: (): BattleEvent[] => [],
      reset: () => {
        resetCallCount++;
      },
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    // Construct two engines using the same ruleset — each must call reset()
    createEngine({ ruleset });
    createEngine({ ruleset });

    // reset() must have been called once per construction (once per gimmick type attempted)
    // The engine iterates ["mega","zmove","dynamax","tera"] but getBattleGimmick always
    // returns the same mock, so reset fires 4 times per construction × 2 constructions = 8
    expect(resetCallCount).toBe(8);
  });

  it("given a gimmick without reset(), when BattleEngine is constructed, then no error is thrown", () => {
    // reset() is optional — existing gimmicks (Gen 6 Mega) don't need to implement it
    const ruleset = new MockRuleset();

    const mockGimmick: BattleGimmick = {
      name: "Mega Evolution",
      generations: [6],
      canUse: () => true,
      activate: (): BattleEvent[] => [],
      // No reset() method
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    // Should not throw even though reset() is absent
    expect(() => createEngine({ ruleset })).not.toThrow();
  });
});
