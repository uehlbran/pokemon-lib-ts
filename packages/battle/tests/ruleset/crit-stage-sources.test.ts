import type { Generation, MoveData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { DamageContext, DamageResult } from "../../src/context";
import { BaseRuleset } from "../../src/ruleset/BaseRuleset";
import type { BattleState } from "../../src/state";
import { createActivePokemon, createTestPokemon } from "../../src/utils";

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
    return [
      "normal",
      "fire",
      "water",
      "electric",
      "grass",
      "ice",
      "fighting",
      "poison",
      "ground",
      "flying",
      "psychic",
      "bug",
      "rock",
      "ghost",
      "dragon",
      "dark",
      "steel",
      "fairy",
    ];
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

/** Create a minimal MoveData with optional critRatio */
function createTestMove(overrides?: Partial<MoveData>): MoveData {
  return {
    id: "tackle",
    displayName: "Tackle",
    type: "normal" as const,
    category: "physical" as const,
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

describe("rollCritical — crit stage sources (issue #86)", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  it("given move with critRatio 1, when rollCritical called 1000 times with seeded rng, then crit rate is approximately 1/8", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — moves with critRatio: 1 get +1 crit stage
    // Gen 6+ crit table: [24, 8, 2, 1] — stage 1 = 1/8 = 12.5%
    const pokemon = createTestPokemon(6, 50);
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const rng = new SeededRandom(42);
    const move = createTestMove({
      id: "slash",
      displayName: "Slash",
      critRatio: 1,
    });

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/8 = 12.5%, allow range 7%-18% for statistical variance
    // Source: Gen 6+ crit stage table — stage 1 = 1/8 chance
    expect(crits).toBeGreaterThanOrEqual(70);
    expect(crits).toBeLessThanOrEqual(180);
  });

  it("given attacker holding scope-lens, when rollCritical called 1000 times, then crit rate is approximately 1/8", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Scope Lens gives +1 crit stage
    // Gen 6+ crit table: stage 1 = 1/8 = 12.5%
    const pokemon = createTestPokemon(6, 50, { heldItem: "scope-lens" });
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const rng = new SeededRandom(123);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/8 = 12.5%, allow range 7%-18%
    // Source: Gen 6+ crit stage table — stage 1 = 1/8 chance
    expect(crits).toBeGreaterThanOrEqual(70);
    expect(crits).toBeLessThanOrEqual(180);
  });

  it("given attacker holding razor-claw, when rollCritical called 1000 times, then crit rate is approximately 1/8", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Razor Claw gives +1 crit stage (same as Scope Lens)
    const pokemon = createTestPokemon(6, 50, { heldItem: "razor-claw" });
    const active = createActivePokemon(pokemon, 0, ["normal"]);
    const rng = new SeededRandom(999);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/8 = 12.5%, allow range 7%-18%
    expect(crits).toBeGreaterThanOrEqual(70);
    expect(crits).toBeLessThanOrEqual(180);
  });

  it("given attacker with super-luck ability, when rollCritical called 1000 times, then crit rate is approximately 1/8", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Super Luck gives +1 crit stage
    // Gen 6+ crit table: stage 1 = 1/8 = 12.5%
    const pokemon = createTestPokemon(6, 50, { ability: "super-luck" });
    const active = createActivePokemon(pokemon, 0, ["dark", "flying"]);
    const rng = new SeededRandom(7777);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/8 = 12.5%, allow range 7%-18%
    // Source: Gen 6+ crit stage table — stage 1 = 1/8 chance
    expect(crits).toBeGreaterThanOrEqual(70);
    expect(crits).toBeLessThanOrEqual(180);
  });

  it("given Farfetch'd holding leek, when rollCritical called 1000 times, then crit rate is approximately 1/2", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Leek/Stick on Farfetch'd (speciesId=83) gives +2 crit stage
    // Gen 6+ crit table: stage 2 = 1/2 = 50%
    const pokemon = createTestPokemon(83, 50, { heldItem: "leek" });
    const active = createActivePokemon(pokemon, 0, ["normal", "flying"]);
    const rng = new SeededRandom(42);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/2 = 50%, allow range 40%-60%
    // Source: Gen 6+ crit stage table — stage 2 = 1/2 chance
    expect(crits).toBeGreaterThanOrEqual(400);
    expect(crits).toBeLessThanOrEqual(600);
  });

  it("given Sirfetch'd (speciesId=865) holding leek, when rollCritical called 1000 times, then crit rate is approximately 1/2", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Leek on Sirfetch'd (speciesId=865) gives +2 crit stage
    const pokemon = createTestPokemon(865, 50, { heldItem: "leek" });
    const active = createActivePokemon(pokemon, 0, ["fighting"]);
    const rng = new SeededRandom(42);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/2 = 50%, allow range 40%-60%
    expect(crits).toBeGreaterThanOrEqual(400);
    expect(crits).toBeLessThanOrEqual(600);
  });

  it("given non-Farfetch'd holding leek, when rollCritical called 1000 times, then crit rate stays at base 1/24", () => {
    // Arrange
    // Source: Showdown — Leek only gives bonus to Farfetch'd (83) and Sirfetch'd (865)
    const pokemon = createTestPokemon(6, 50, { heldItem: "leek" });
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const rng = new SeededRandom(42);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/24 = 4.2%, allow range 1%-8%
    // Source: Gen 6+ crit stage table — stage 0 = 1/24 chance
    expect(crits).toBeGreaterThanOrEqual(10);
    expect(crits).toBeLessThanOrEqual(80);
  });

  it("given Chansey holding lucky-punch, when rollCritical called 1000 times, then crit rate is approximately 1/2", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — Lucky Punch on Chansey (speciesId=113) gives +2 crit stage
    // Gen 6+ crit table: stage 2 = 1/2 = 50%
    const pokemon = createTestPokemon(113, 50, { heldItem: "lucky-punch" });
    const active = createActivePokemon(pokemon, 0, ["normal"]);
    const rng = new SeededRandom(42);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/2 = 50%, allow range 40%-60%
    // Source: Gen 6+ crit stage table — stage 2 = 1/2 chance
    expect(crits).toBeGreaterThanOrEqual(400);
    expect(crits).toBeLessThanOrEqual(600);
  });

  it("given non-Chansey holding lucky-punch, when rollCritical called 1000 times, then crit rate stays at base 1/24", () => {
    // Arrange
    // Source: Showdown — Lucky Punch only gives bonus to Chansey (speciesId=113)
    const pokemon = createTestPokemon(6, 50, { heldItem: "lucky-punch" });
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const rng = new SeededRandom(42);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/24 = 4.2%, allow range 1%-8%
    expect(crits).toBeGreaterThanOrEqual(10);
    expect(crits).toBeLessThanOrEqual(80);
  });

  it("given focus-energy + high-crit move + scope-lens, when rollCritical called, then always crits (stage 3+ = guaranteed)", () => {
    // Arrange
    // Source: Showdown sim/battle-actions.ts — stages stack: focus-energy (+2) + critRatio (+1) + Scope Lens (+1) = 4
    // Gen 6+ crit table: stage 3+ = rate 1 = always crit
    const pokemon = createTestPokemon(6, 50, { heldItem: "scope-lens" });
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    active.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
    const rng = new SeededRandom(42);
    const move = createTestMove({
      id: "slash",
      displayName: "Slash",
      critRatio: 1,
    });

    // Act
    const trials = 100;
    let crits = 0;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — guaranteed crit (stage >= 3)
    expect(crits).toBe(trials);
  });

  it("given focus-energy + super-luck, when rollCritical called, then always crits (stage 3 = guaranteed)", () => {
    // Arrange
    // Source: Showdown — focus-energy (+2) + Super Luck (+1) = stage 3
    // Gen 6+ crit table: stage 3 = rate 1 = always crit
    const pokemon = createTestPokemon(6, 50, { ability: "super-luck" });
    const active = createActivePokemon(pokemon, 0, ["dark", "flying"]);
    active.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
    const rng = new SeededRandom(42);
    const move = createTestMove();

    // Act
    const trials = 100;
    let crits = 0;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — guaranteed crit (stage 3)
    expect(crits).toBe(trials);
  });

  it("given no crit stage sources and no critRatio, when rollCritical called 1000 times, then crit rate is approximately 1/24", () => {
    // Arrange
    // Source: Gen 6+ crit stage table — stage 0 = 1/24 = ~4.2%
    // This is the regression test ensuring the base case still works
    const pokemon = createTestPokemon(6, 50);
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const rng = new SeededRandom(42);
    const move = createTestMove();

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — expected 1/24 = 4.2%, allow range 1%-8%
    expect(crits).toBeGreaterThanOrEqual(10);
    expect(crits).toBeLessThanOrEqual(80);
  });

  it("given move with undefined critRatio, when rollCritical called, then treated as 0 (no bonus)", () => {
    // Arrange
    // Regression test: a move without critRatio should get no crit stage bonus
    const pokemon = createTestPokemon(6, 50);
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const rng = new SeededRandom(42);
    const move = createTestMove(); // no critRatio field

    // Act
    let crits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (
        ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
      ) {
        crits++;
      }
    }

    // Assert — should behave the same as stage 0 (1/24 = ~4.2%)
    expect(crits).toBeGreaterThanOrEqual(10);
    expect(crits).toBeLessThanOrEqual(80);
  });
});
