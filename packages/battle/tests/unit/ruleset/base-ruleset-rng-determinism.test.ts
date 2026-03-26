import type { Generation, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { CORE_TYPE_IDS, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { DamageContext, DamageResult } from "../../../src/context";
import type { BattleAction } from "../../../src/events";
import { BaseRuleset } from "../../../src/ruleset/BaseRuleset";
import type { BattleState } from "../../../src/state";
import { createOnFieldPokemon, createTestPokemon } from "../../../src/utils";

const TYPE_IDS = CORE_TYPE_IDS;

/**
 * Concrete stub of BaseRuleset for testing resolveTurnOrder RNG determinism.
 */
class StubRuleset extends BaseRuleset {
  readonly generation: Generation = 3;
  readonly name = "Stub Gen 3";

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
    return [TYPE_IDS.normal, TYPE_IDS.fire, TYPE_IDS.water];
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

/**
 * Tests for resolveTurnOrder PRNG determinism in BaseRuleset.
 *
 * Bug: rng.chance(0.5) inside .sort() comparator consumed a non-deterministic
 * number of PRNG values because V8's sort algorithm calls comparators a variable
 * number of times depending on input. Fix: pre-assign one rng.next() tiebreak key
 * per action BEFORE sorting, then use those keys deterministically in the comparator.
 *
 * Source: GitHub issue #120
 */
describe("BaseRuleset — resolveTurnOrder RNG determinism", () => {
  it("given 3 same-speed same-priority actions and same seed, when resolveTurnOrder called twice, then order is identical", () => {
    // Arrange: 3 Pokemon all at speed 100 — forces the speed-tie tiebreak path
    const ruleset = new StubRuleset();

    const createSyntheticBattleState = (): { state: BattleState; actions: BattleAction[] } => {
      const pokemon0 = createTestPokemon(1, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const pokemon1 = createTestPokemon(2, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const pokemon2 = createTestPokemon(3, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active0 = createOnFieldPokemon(pokemon0, 0, [TYPE_IDS.normal]);
      const active1 = createOnFieldPokemon(pokemon1, 0, [TYPE_IDS.normal]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [TYPE_IDS.normal]);

      // 3-slot battle state (unusual but valid for testing tiebreaks)
      const state = {
        sides: [{ active: [active0] }, { active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions: BattleAction[] = [
        { type: "move" as const, side: 0 as 0, moveIndex: 0 },
        { type: "move" as const, side: 1 as 0, moveIndex: 0 },
        { type: "move" as const, side: 2 as 0, moveIndex: 0 },
      ];

      return { state, actions };
    };

    // Act: call resolveTurnOrder twice with the same seed
    const { state: state1, actions: actions1 } = createSyntheticBattleState();
    const rng1 = new SeededRandom(12345);
    const order1 = ruleset.resolveTurnOrder(actions1, state1, rng1);

    const { state: state2, actions: actions2 } = createSyntheticBattleState();
    const rng2 = new SeededRandom(12345);
    const order2 = ruleset.resolveTurnOrder(actions2, state2, rng2);

    // Assert: identical ordering
    // Source: determinism requirement — same seed must yield same sequence (PRNG contract)
    expect(order1.map((a) => a.side)).toEqual(order2.map((a) => a.side));
  });

  it("given same seed, when resolveTurnOrder called with N same-speed actions, then PRNG advances by exactly N", () => {
    // Arrange: 3 actions, all same speed — each needs exactly one rng.next() tiebreak key
    const ruleset = new StubRuleset();

    const pokemon0 = createTestPokemon(1, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const pokemon1 = createTestPokemon(2, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const pokemon2 = createTestPokemon(3, 50, {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active0 = createOnFieldPokemon(pokemon0, 0, [TYPE_IDS.normal]);
    const active1 = createOnFieldPokemon(pokemon1, 0, [TYPE_IDS.normal]);
    const active2 = createOnFieldPokemon(pokemon2, 0, [TYPE_IDS.normal]);

    const state = {
      sides: [{ active: [active0] }, { active: [active1] }, { active: [active2] }],
      trickRoom: { active: false, turnsLeft: 0 },
    } as unknown as BattleState;

    const actions: BattleAction[] = [
      { type: "move" as const, side: 0 as 0, moveIndex: 0 },
      { type: "move" as const, side: 1 as 0, moveIndex: 0 },
      { type: "move" as const, side: 2 as 0, moveIndex: 0 },
    ];

    const seed = 99999;
    const rng = new SeededRandom(seed);
    const stateBefore = rng.getState();

    // Act
    ruleset.resolveTurnOrder(actions, state, rng);
    const stateAfter = rng.getState();

    // Compute the expected state after exactly 3 rng.next() calls
    const referenceRng = new SeededRandom(seed);
    referenceRng.setState(stateBefore);
    referenceRng.next(); // call 1
    referenceRng.next(); // call 2
    referenceRng.next(); // call 3
    const expectedState = referenceRng.getState();

    // Assert: PRNG advanced by exactly N=3 calls (one per action)
    // Source: fix design — pre-assign tiebreak keys consumes exactly N rng.next() calls
    expect(stateAfter).toBe(expectedState);
  });
});
