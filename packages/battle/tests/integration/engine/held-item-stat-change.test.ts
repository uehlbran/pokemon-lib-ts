import { CORE_ITEM_TRIGGER_IDS, CORE_MOVE_IDS, CORE_STAT_IDS } from "@pokemon-lib-ts/core";
import { GEN9_ITEM_IDS, GEN9_SPECIES_IDS } from "../../../../gen9/src/data";
import { BATTLE_EFFECT_TARGETS, BATTLE_ITEM_EFFECT_TYPES } from "../../../src";
import type { BattleConfig, ItemContext } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent, StatChangeEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createStats(hp: number, speed: number) {
  return {
    hp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed,
  };
}

class HeldItemStatBoostRuleset extends MockRuleset {
  readonly itemTriggers: string[] = [];

  override hasHeldItems(): boolean {
    return true;
  }

  override calculateDamage() {
    // Fixture: return super-effective damage so a Weakness Policy-style item activates.
    return {
      damage: 20,
      effectiveness: 2,
      isCrit: false,
      randomFactor: 1,
    };
  }

  override applyHeldItem(trigger: string, context: ItemContext) {
    this.itemTriggers.push(trigger);

    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onDamageTaken &&
      context.pokemon.pokemon.heldItem === GEN9_ITEM_IDS.weaknessPolicy
    ) {
      return {
        activated: true,
        effects: [
          // Source: packages/gen9/tests/items.test.ts -- Weakness Policy raises Attack and SpAtk by 2 stages.
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.attack,
            stages: 2,
          },
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.spAttack,
            stages: 2,
          },
        ],
        messages: ["Weakness Policy activated!"],
      };
    }

    return { activated: false, effects: [], messages: [] };
  }
}

function createHeldItemStatBoostEngine(ruleset: HeldItemStatBoostRuleset) {
  const config: BattleConfig = {
    generation: 9,
    format: "singles",
    teams: [
      [
        createTestPokemon(GEN9_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: createStats(200, 120),
          currentHp: 200,
        }),
      ],
      [
        createTestPokemon(GEN9_SPECIES_IDS.blastoise, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          heldItem: GEN9_ITEM_IDS.weaknessPolicy,
          moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: createStats(200, 80),
          currentHp: 200,
        }),
      ],
    ],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  return new BattleEngine(config, ruleset, createMockDataManager());
}

describe("BattleEngine held-item stat boosts", () => {
  it("given a held item stat-boost effect, when damage resolves, then a stat-change event is emitted and the stage is applied", () => {
    const ruleset = new HeldItemStatBoostRuleset();
    const engine = createHeldItemStatBoostEngine(ruleset);
    const events: BattleEvent[] = [];
    engine.on((event) => events.push(event));
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const statChangeEvents = events.filter(
      (event): event is StatChangeEvent => event.type === "stat-change",
    );
    expect(statChangeEvents).toHaveLength(2);
    expect(statChangeEvents.map((event) => event.stat)).toEqual([
      CORE_STAT_IDS.attack,
      CORE_STAT_IDS.spAttack,
    ]);
    expect(statChangeEvents.map((event) => event.stages)).toEqual([2, 2]);
    expect(statChangeEvents.map((event) => event.currentStage)).toEqual([2, 2]);

    const defender = engine.state.sides[1].active[0];
    expect(defender!.statStages.attack).toBe(2);
    expect(defender!.statStages.spAttack).toBe(2);
    expect(ruleset.itemTriggers).toContain(CORE_ITEM_TRIGGER_IDS.onDamageTaken);
  });
});
