import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_GIMMICK_IDS, CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, DamageContext, DamageResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { BattleGimmick, BattleGimmickType } from "../../../src/ruleset";
import { GenerationRegistry } from "../../../src/ruleset/GenerationRegistry";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

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

type TrackingGimmick = BattleGimmick & {
  usedBySide: Set<0 | 1>;
};

class TrackingGimmickImpl implements TrackingGimmick {
  readonly name = "Mega Evolution";
  readonly generations = [1];
  readonly usedBySide = new Set<0 | 1>();

  canUse(): boolean {
    return true;
  }

  activate(): BattleEvent[] {
    return [];
  }

  reset(): void {
    this.usedBySide.clear();
  }
}

class SharedStateRuleset extends MockRuleset {
  private readonly gimmick: TrackingGimmick = new TrackingGimmickImpl();

  override getBattleGimmick(type: BattleGimmickType): BattleGimmick | null {
    return type === CORE_GIMMICK_IDS.mega ? this.gimmick : null;
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
    createTestPokemon(9, 50, {
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

  return { engine, ruleset, events, dataManager };
}

describe("BattleEngine — simple bug fixes", () => {
  // -----------------------------------------------------------------------
  // Bug #871 — shared ruleset instances leak per-battle gimmick state
  // -----------------------------------------------------------------------
  describe("Bug #871: ruleset instance isolation", () => {
    it("given the registry returns cloned rulesets for the same generation, when two engines start from those clones, then their gimmick state stays isolated", () => {
      // Arrange — registry lookups must return battle-local ruleset copies instead of
      // sharing the same mutable singleton instance across overlapping battles.
      const registry = new GenerationRegistry();
      registry.register(new SharedStateRuleset());

      const ruleset1 = registry.get(1) as SharedStateRuleset;
      const ruleset2 = registry.get(1) as SharedStateRuleset;
      const { engine: engine1 } = createEngine({ ruleset: ruleset1 });
      const { engine: engine2 } = createEngine({ ruleset: ruleset2 });

      const gimmick1 = ruleset1.getBattleGimmick(CORE_GIMMICK_IDS.mega) as TrackingGimmick;
      const gimmick2 = ruleset2.getBattleGimmick(CORE_GIMMICK_IDS.mega) as TrackingGimmick;

      // Act — battle 1 consumes gimmick state, then battle 2 starts
      engine1.start();
      gimmick1.usedBySide.add(0);
      engine2.start();

      // Assert — battle 2 must not clear battle 1's gimmick state
      expect(gimmick1).not.toBe(gimmick2);
      expect(gimmick1.usedBySide.has(0)).toBe(true);
      expect(gimmick2.usedBySide.has(0)).toBe(false);
    });
  });

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
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
      const relevantEventTypes = events
        .filter(
          (e) => e.type === "effectiveness" || e.type === "critical-hit" || e.type === "damage",
        )
        .map((e) => e.type);

      expect(relevantEventTypes).toHaveLength(6);
      expect(relevantEventTypes.slice(0, 3)).toEqual(["effectiveness", "critical-hit", "damage"]);
      expect(relevantEventTypes.slice(3, 6)).toEqual(["effectiveness", "critical-hit", "damage"]);
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
      const relevantEventTypes = events
        .filter((e) => e.type === "effectiveness" || e.type === "damage")
        .map((e) => e.type);

      expect(relevantEventTypes).toHaveLength(4);
      expect(relevantEventTypes.slice(0, 2)).toEqual(["effectiveness", "damage"]);
      expect(relevantEventTypes.slice(2, 4)).toEqual(["effectiveness", "damage"]);

      // No crit event should be emitted
      const critIdx = events.findIndex((e) => e.type === "critical-hit");
      expect(critIdx).toBe(-1);
    });
  });
});
