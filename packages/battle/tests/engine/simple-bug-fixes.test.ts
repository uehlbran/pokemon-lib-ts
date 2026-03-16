import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, DamageContext, DamageResult } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// A MockRuleset subclass that returns super-effective + crit damage
class SuperEffectiveCritRuleset extends MockRuleset {
  calculateDamage(context: DamageContext): DamageResult {
    return {
      damage: 50,
      effectiveness: 2,
      isCrit: context.isCrit,
      randomFactor: 1,
    };
  }
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

  return { engine, ruleset, events, dataManager };
}

describe("BattleEngine — simple bug fixes", () => {
  // -----------------------------------------------------------------------
  // Bug #82 — sendOut() emits wrong slot index
  // -----------------------------------------------------------------------
  describe("Bug #82: switch-in slot index", () => {
    it("given a team with 2 pokemon and a switch to team slot 1, when switch-in occurs, then slot is 0 (active slot, not team slot)", () => {
      // Arrange — two-pokemon team so we can switch
      const team1 = [
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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];

      const { engine, events } = createEngine({ team1 });
      engine.start();

      // Act — switch side 0's lead (team slot 0) to team slot 1 (Pikachu)
      engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — every switch-in event must have slot 0 (active slot in singles)
      const switchIns = events.filter((e) => e.type === "switch-in");
      // There are at least 3: 2 lead switch-ins + 1 from the switch action
      expect(switchIns.length).toBeGreaterThanOrEqual(3);
      for (const event of switchIns) {
        if (event.type === "switch-in") {
          expect(event.slot).toBe(0);
        }
      }
    });

    it("given battle start, when both leads are sent out, then both switch-in events have slot 0", () => {
      // Arrange
      const { engine, events } = createEngine();

      // Act
      engine.start();

      // Assert
      const switchIns = events.filter((e) => e.type === "switch-in");
      expect(switchIns).toHaveLength(2);
      for (const event of switchIns) {
        if (event.type === "switch-in") {
          expect(event.slot).toBe(0);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Bug #83 — getSideIndex() silently returns 0 instead of throwing
  // -----------------------------------------------------------------------
  describe("Bug #83: getSideIndex throws for unknown ActivePokemon", () => {
    it("given an engine, when getSideIndex is called with an ActivePokemon not in any side, then it throws", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      // Access the private method via casting — test-only pattern
      const engineAny = engine as any;

      // Create a fake ActivePokemon that is not registered on any side
      const fakePokemon = {
        pokemon: { uid: "ghost-1", currentHp: 100 },
        volatileStatuses: new Map(),
        boosts: {},
      };

      // Act & Assert
      expect(() => engineAny.getSideIndex(fakePokemon)).toThrow(
        "BattleEngine: ActivePokemon not found in any side",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Bug #81 — effectiveness + critical-hit events emitted AFTER damage
  // -----------------------------------------------------------------------
  describe("Bug #81: effectiveness and critical-hit events emitted before damage", () => {
    it("given a super-effective crit move, when damage is dealt, then effectiveness → critical-hit → damage event order is preserved", () => {
      // Arrange — ruleset returns effectiveness: 2 and always crits
      const ruleset = new SuperEffectiveCritRuleset();
      ruleset.setAlwaysCrit(true);

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — find the relative ordering of the three event types
      const effectivenessIdx = events.findIndex((e) => e.type === "effectiveness");
      const critIdx = events.findIndex((e) => e.type === "critical-hit");
      const damageIdx = events.findIndex((e) => e.type === "damage");

      expect(effectivenessIdx).toBeGreaterThanOrEqual(0);
      expect(critIdx).toBeGreaterThanOrEqual(0);
      expect(damageIdx).toBeGreaterThanOrEqual(0);

      // effectiveness must come before damage
      expect(effectivenessIdx).toBeLessThan(damageIdx);
      // critical-hit must come before damage
      expect(critIdx).toBeLessThan(damageIdx);
      // effectiveness before critical-hit (natural ordering)
      expect(effectivenessIdx).toBeLessThan(critIdx);
    });

    it("given a super-effective non-crit move, when damage is dealt, then effectiveness event appears before damage event", () => {
      // Arrange — ruleset returns effectiveness: 2, no crit
      const ruleset = new SuperEffectiveCritRuleset();
      ruleset.setAlwaysCrit(false);

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const effectivenessIdx = events.findIndex((e) => e.type === "effectiveness");
      const damageIdx = events.findIndex((e) => e.type === "damage");

      expect(effectivenessIdx).toBeGreaterThanOrEqual(0);
      expect(damageIdx).toBeGreaterThanOrEqual(0);
      expect(effectivenessIdx).toBeLessThan(damageIdx);

      // No crit event should be emitted
      const critIdx = events.findIndex((e) => e.type === "critical-hit");
      expect(critIdx).toBe(-1);
    });
  });
});
