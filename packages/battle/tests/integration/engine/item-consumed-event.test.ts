import { CORE_ITEM_IDS, CORE_MOVE_IDS, type PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createMockMoveSlot } from "../../helpers/move-slot";
import type { BattleConfig, ItemContext, ItemResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createTestEngine(overrides?: {
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  seed?: number;
}): { engine: BattleEngine; events: BattleEvent[] } {
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
      heldItem: CORE_ITEM_IDS.airBalloon,
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
    generation: 6,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));

  return { engine, events };
}

class ConsumeEffectMockRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    if (trigger !== "on-damage-taken") {
      return { activated: false, effects: [], messages: [] };
    }

    if (context.pokemon.pokemon.heldItem !== CORE_ITEM_IDS.airBalloon) {
      return { activated: false, effects: [], messages: [] };
    }

    return {
      activated: true,
      effects: [{ type: "consume", target: "self", value: CORE_ITEM_IDS.airBalloon }],
      messages: ["Blastoise's Air Balloon popped!"],
    };
  }
}

describe("BattleEngine - held item consumption events", () => {
  it("given an on-damage-taken item effect that consumes a held item, when the Pokemon is hit, then item-consumed is emitted", () => {
    const ruleset = new ConsumeEffectMockRuleset();
    const { engine, events } = createTestEngine({ ruleset });

    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const itemConsumedEvents = events.filter((event) => event.type === "item-consumed");
    expect(itemConsumedEvents).toHaveLength(1);

    const itemConsumed = itemConsumedEvents[0];
    if (itemConsumed?.type === "item-consumed") {
      expect(itemConsumed.side).toBe(1);
      expect(itemConsumed.pokemon).toBe("Blastoise");
      expect(itemConsumed.item).toBe(CORE_ITEM_IDS.airBalloon);
    }

    const defender = engine.state.sides[1].active[0];
    expect(defender?.pokemon.heldItem).toBeNull();
  });
});
