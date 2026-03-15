import type { Generation, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { DamageContext, DamageResult } from "../../src/context";
import { BaseRuleset } from "../../src/ruleset/BaseRuleset";
import type { BattleState } from "../../src/state";
import { createActivePokemon, createTestPokemon } from "../../src/utils";

class TestRuleset extends BaseRuleset {
  readonly generation: Generation = 3;
  readonly name = "Test Gen 3";

  getTypeChart(): TypeChart {
    const chart: Record<string, Record<string, number>> = {};
    for (const t of this.getAvailableTypes()) {
      const row: Record<string, number> = {};
      chart[t] = row;
      for (const t2 of this.getAvailableTypes()) {
        row[t2] = 1;
      }
    }
    return chart as TypeChart;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return ["normal", "fire", "water", "electric", "grass"];
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

describe("BaseRuleset — additional branches", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  describe("applyStatusDamage — badly-poisoned", () => {
    it("given a badly-poisoned pokemon, when applyStatusDamage is called, then 1/16 damage is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 160,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createActivePokemon(pokemon, 0, ["fire"]);

      // Act
      const damage = ruleset.applyStatusDamage(
        active,
        "badly-poisoned",
        {} as unknown as BattleState,
      );

      // Assert
      expect(damage).toBe(10); // floor(160/16) = 10
    });

    it("given a pokemon with low HP, when applyStatusDamage is called for burn, then minimum 1 damage", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 10,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createActivePokemon(pokemon, 0, ["fire"]);

      // Act
      const damage = ruleset.applyStatusDamage(active, "burn", {} as unknown as BattleState);

      // Assert — min(1, floor(10/16)=0) → max(1, 0) = 1
      expect(damage).toBe(1);
    });
  });

  describe("resolveTurnOrder — item before move", () => {
    it("given an item action and a move action, when resolveTurnOrder is called, then item goes first", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 50,
        },
      });
      const pokemon2 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
      });
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      const rng = new SeededRandom(42);

      const state = {
        sides: [{ active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions = [
        { type: "item" as const, side: 0 as const, itemId: "potion" },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // Act
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert
      expect(ordered[0]?.type).toBe("item");
    });
  });

  describe("resolveTurnOrder — run before move", () => {
    it("given a run action and a move action, when resolveTurnOrder is called, then run goes first", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 50,
        },
      });
      const pokemon2 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
      });
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      const rng = new SeededRandom(42);

      const state = {
        sides: [{ active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions = [
        { type: "run" as const, side: 0 as const },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // Act
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert
      expect(ordered[0]?.type).toBe("run");
    });
  });

  describe("resolveTurnOrder — same speed tiebreak", () => {
    it("given two moves with same speed, when resolveTurnOrder is called, then RNG determines order", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const pokemon2 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);

      const state = {
        sides: [{ active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions = [
        { type: "move" as const, side: 0 as const, moveIndex: 0 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // Run with multiple seeds and check both orderings occur
      const firstSides = new Set<number>();
      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRandom(seed);
        const ordered = ruleset.resolveTurnOrder([...actions], state, rng);
        firstSides.add(ordered[0]?.side);
      }

      // Assert — both sides should have gone first at least once
      expect(firstSides.has(0)).toBe(true);
      expect(firstSides.has(1)).toBe(true);
    });
  });

  describe("rollCritical with focus-energy", () => {
    it("given a pokemon with focus-energy, when rollCritical is called, then higher crit stage is used", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      active.volatileStatuses.set("focus-energy", { turnsLeft: -1 });

      const rng = new SeededRandom(42);
      const move = {
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
      };

      // Act — run many times
      let crits = 0;
      for (let i = 0; i < 1000; i++) {
        if (
          ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
        ) {
          crits++;
        }
      }

      // Assert — with focus energy (stage 2), crit rate is 1/2 = 50%
      expect(crits).toBeGreaterThan(400);
      expect(crits).toBeLessThan(600);
    });
  });
});
