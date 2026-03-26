import type { Generation, MoveData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { CORE_MOVE_CATEGORIES, CORE_MOVE_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { GEN1_MOVE_IDS, GEN1_SPECIES_IDS } from "@pokemon-lib-ts/gen1";
import { GEN4_ABILITY_IDS, GEN4_ITEM_IDS } from "@pokemon-lib-ts/gen4";
import { GEN8_ITEM_IDS, GEN8_SPECIES_IDS } from "@pokemon-lib-ts/gen8";
import { describe, expect, it } from "vitest";
import type { DamageContext, DamageResult } from "../../../src/context";
import { BaseRuleset } from "../../../src/ruleset/BaseRuleset";
import type { BattleState } from "../../../src/state";
import { createOnFieldPokemon, createTestPokemon } from "../../../src/utils";

// Concrete test implementation of BaseRuleset
class TestRuleset extends BaseRuleset {
  readonly generation: Generation = 6;
  readonly name = "Test Gen 6";

  getTypeChart(): TypeChart {
    const types = this.getAvailableTypes();
    const chart: Record<string, Record<string, number>> = {};
    for (const atk of types) {
      const row: Record<string, number> = {};
      chart[atk] = row;
      for (const def of types) {
        row[def] = 1;
      }
    }
    return chart as TypeChart;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return Object.values(CORE_TYPE_IDS);
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

/** Create a minimal MoveData with optional critRatio */
function createTestMove(overrides?: Partial<MoveData>): MoveData {
  return {
    id: CORE_MOVE_IDS.tackle,
    displayName: "Tackle",
    type: CORE_TYPE_IDS.normal,
    category: CORE_MOVE_CATEGORIES.physical,
    power: 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe" as const,
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 1 as const,
    ...overrides,
  };
}

function createProbeRng(result: number) {
  const calls: Array<{ min: number; max: number }> = [];
  return {
    calls,
    rng: {
      int(min: number, max: number): number {
        calls.push({ min, max });
        return result;
      },
    },
  };
}

function probeCritRate(
  ruleset: TestRuleset,
  attacker: ReturnType<typeof createOnFieldPokemon>,
  move: MoveData,
  expectedRate: number,
) {
  const hitProbe = createProbeRng(1);
  const hitResult = ruleset.rollCritical({
    attacker,
    move,
    state: {} as BattleState,
    rng: hitProbe.rng as never,
  });

  const missProbe = createProbeRng(expectedRate);
  const missResult = ruleset.rollCritical({
    attacker,
    move,
    state: {} as BattleState,
    rng: missProbe.rng as never,
  });

  return {
    hitResult,
    hitCalls: hitProbe.calls,
    missResult,
    missCalls: missProbe.calls,
  };
}

describe("rollCritical — crit stage sources (issue #86)", () => {
  it("given move with critRatio 1, when rollCritical is called, then it uses the stage-1 1-in-8 table entry", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — moves with critRatio: 1 get +1 crit stage
    // Gen 6+ crit table: [24, 8, 2, 1] — stage 1 uses rate 8.
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    const move = createTestMove({
      id: GEN1_MOVE_IDS.slash,
      displayName: "Slash",
      critRatio: 1,
    });

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 8)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 8 }],
      missResult: false,
      missCalls: [{ min: 1, max: 8 }],
    });
  });

  it("given attacker holding scope-lens, when rollCritical is called, then it uses the stage-1 1-in-8 table entry", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Scope Lens gives +1 crit stage
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      heldItem: GEN4_ITEM_IDS.scopeLens,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 8)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 8 }],
      missResult: false,
      missCalls: [{ min: 1, max: 8 }],
    });
  });

  it("given attacker holding razor-claw, when rollCritical is called, then it uses the stage-1 1-in-8 table entry", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Razor Claw gives +1 crit stage (same as Scope Lens)
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      heldItem: GEN4_ITEM_IDS.razorClaw,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.normal]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 8)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 8 }],
      missResult: false,
      missCalls: [{ min: 1, max: 8 }],
    });
  });

  it("given attacker with super-luck ability, when rollCritical is called, then it uses the stage-1 1-in-8 table entry", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Super Luck gives +1 crit stage
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      ability: GEN4_ABILITY_IDS.superLuck,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.dark, CORE_TYPE_IDS.flying]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 8)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 8 }],
      missResult: false,
      missCalls: [{ min: 1, max: 8 }],
    });
  });

  it("given Farfetch'd holding leek, when rollCritical is called, then it uses the stage-2 1-in-2 table entry", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Leek/Stick on Farfetch'd (speciesId=83) gives +2 crit stage
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.farfetchd, 50, {
      heldItem: GEN8_ITEM_IDS.leek,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.normal, CORE_TYPE_IDS.flying]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 2)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 2 }],
      missResult: false,
      missCalls: [{ min: 1, max: 2 }],
    });
  });

  it("given Sirfetch'd holding leek, when rollCritical is called, then it uses the stage-2 1-in-2 table entry", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Leek on Sirfetch'd (speciesId=865) gives +2 crit stage
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN8_SPECIES_IDS.sirfetchd, 50, {
      heldItem: GEN8_ITEM_IDS.leek,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fighting]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 2)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 2 }],
      missResult: false,
      missCalls: [{ min: 1, max: 2 }],
    });
  });

  it("given non-Farfetch'd holding leek, when rollCritical is called, then species gating keeps the base 1-in-24 table entry", () => {
    // Arrange
    // Source: Showdown — Leek only gives bonus to Farfetch'd (83) and Sirfetch'd (865)
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      heldItem: GEN8_ITEM_IDS.leek,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 24)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 24 }],
      missResult: false,
      missCalls: [{ min: 1, max: 24 }],
    });
  });

  it("given Chansey holding lucky-punch, when rollCritical is called, then it uses the stage-2 1-in-2 table entry", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Lucky Punch on Chansey (speciesId=113) gives +2 crit stage
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.chansey, 50, {
      heldItem: GEN4_ITEM_IDS.luckyPunch,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.normal]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 2)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 2 }],
      missResult: false,
      missCalls: [{ min: 1, max: 2 }],
    });
  });

  it("given non-Chansey holding lucky-punch, when rollCritical is called, then species gating keeps the base 1-in-24 table entry", () => {
    // Arrange
    // Source: Showdown — Lucky Punch only gives bonus to Chansey (speciesId=113)
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      heldItem: GEN4_ITEM_IDS.luckyPunch,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 24)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 24 }],
      missResult: false,
      missCalls: [{ min: 1, max: 24 }],
    });
  });

  it("given focus-energy plus a high-crit move plus scope-lens, when rollCritical is called, then stage 3 clamps to guaranteed crits without using rng", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — stages stack: focus-energy (+2) + critRatio (+1) + Scope Lens (+1) = 4
    // Gen 6+ crit table: stage 3+ = rate 1 = always crit
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      heldItem: GEN4_ITEM_IDS.scopeLens,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    active.volatileStatuses.set(GEN1_MOVE_IDS.focusEnergy, { turnsLeft: -1 });
    const move = createTestMove({
      id: GEN1_MOVE_IDS.slash,
      displayName: "Slash",
      critRatio: 1,
    });

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 1)).toEqual({
      hitResult: true,
      hitCalls: [],
      missResult: true,
      missCalls: [],
    });
  });

  it("given focus-energy plus super-luck, when rollCritical is called, then stage 3 guarantees crits without using rng", () => {
    // Arrange
    // Source: Showdown — focus-energy (+2) + Super Luck (+1) = stage 3
    // Gen 6+ crit table: stage 3 = rate 1 = always crit
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      ability: GEN4_ABILITY_IDS.superLuck,
    });
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.dark, CORE_TYPE_IDS.flying]);
    active.volatileStatuses.set(GEN1_MOVE_IDS.focusEnergy, { turnsLeft: -1 });
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 1)).toEqual({
      hitResult: true,
      hitCalls: [],
      missResult: true,
      missCalls: [],
    });
  });

  it("given no crit stage sources and no critRatio, when rollCritical is called, then it uses the base 1-in-24 table entry", () => {
    // Arrange
    // Source: Gen 6+ crit stage table — stage 0 uses rate 24.
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    const move = createTestMove();

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 24)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 24 }],
      missResult: false,
      missCalls: [{ min: 1, max: 24 }],
    });
  });

  it("given move with undefined critRatio, when rollCritical is called, then it is treated as zero bonus and keeps the base 1-in-24 table entry", () => {
    // Arrange
    // Regression test: a move without critRatio should get no crit stage bonus
    const ruleset = new TestRuleset();
    const pokemon = createTestPokemon(GEN1_SPECIES_IDS.charizard, 50);
    const active = createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    const move = createTestMove(); // no critRatio field

    // Act & Assert
    expect(probeCritRate(ruleset, active, move, 24)).toEqual({
      hitResult: true,
      hitCalls: [{ min: 1, max: 24 }],
      missResult: false,
      missCalls: [{ min: 1, max: 24 }],
    });
  });
});
