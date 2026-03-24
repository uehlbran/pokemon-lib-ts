import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, ItemContext, ItemResult } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { hasGoFirstItemActivated } from "../../src/ruleset/GoFirstItemActivation";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

class GoFirstItemRuleset extends MockRuleset {
  constructor(
    private readonly activationMode: "none" | "consume" | "item-activate",
    private readonly activatingPokemonUid: string,
  ) {
    super();
    this.setGenerationForTest(9);
  }

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    if (
      trigger !== "before-turn-order" ||
      context.pokemon.pokemon.uid !== this.activatingPokemonUid ||
      this.activationMode === "none"
    ) {
      return { activated: false, effects: [], messages: [] };
    }

    if (this.activationMode === "consume") {
      return {
        activated: true,
        effects: [
          {
            type: "consume",
            target: "self",
            value: context.pokemon.pokemon.heldItem ?? "custap-berry",
          },
        ],
        messages: [`${context.pokemon.pokemon.nickname}'s item let it move first!`],
      };
    }

    return {
      activated: true,
      effects: [],
      messages: [`${context.pokemon.pokemon.nickname}'s item let it move first!`],
    };
  }

  override resolveTurnOrder(
    actions: Parameters<MockRuleset["resolveTurnOrder"]>[0],
    state: Parameters<MockRuleset["resolveTurnOrder"]>[1],
    rng: Parameters<MockRuleset["resolveTurnOrder"]>[2],
  ) {
    return [...actions].sort((actionA, actionB) => {
      const goFirstA = hasGoFirstItemActivated(actionA);
      const goFirstB = hasGoFirstItemActivated(actionB);
      if (goFirstA && !goFirstB) return -1;
      if (goFirstB && !goFirstA) return 1;

      const speedA = state.sides[actionA.side]?.active[0]?.pokemon.calculatedStats?.speed ?? 0;
      const speedB = state.sides[actionB.side]?.active[0]?.pokemon.calculatedStats?.speed ?? 0;
      if (speedA !== speedB) return speedB - speedA;

      return rng.chance(0.5) ? -1 : 1;
    });
  }
}

function createEngine(ruleset: MockRuleset, team1: PokemonInstance[], team2: PokemonInstance[]) {
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];
  const config: BattleConfig = {
    generation: 9,
    format: "singles",
    teams: [team1, team2],
    seed: 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));
  engine.start();

  return { engine, events };
}

function createTeams(heldItem: string | null) {
  const slowerHolder = createTestPokemon(9, 50, {
    uid: "blastoise-1",
    nickname: "Blastoise",
    heldItem,
    currentHp: 200,
    calculatedStats: {
      hp: 200,
      attack: 110,
      defense: 100,
      spAttack: 65,
      spDefense: 110,
      speed: 30,
    },
    moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
  });

  const fasterOpponent = createTestPokemon(6, 50, {
    uid: "charizard-1",
    nickname: "Charizard",
    currentHp: 200,
    calculatedStats: {
      hp: 200,
      attack: 65,
      defense: 60,
      spAttack: 110,
      spDefense: 95,
      speed: 130,
    },
    moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
  });

  return { team1: [slowerHolder], team2: [fasterOpponent] };
}

describe("go-first item activation", () => {
  it("consumes an activated go-first item before turn order is resolved", () => {
    const ruleset = new GoFirstItemRuleset("consume", "blastoise-1");
    const { team1, team2 } = createTeams("custap-berry");
    const { engine, events } = createEngine(ruleset, team1, team2);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const moveStarts = events.filter((event) => event.type === "move-start");
    expect(moveStarts).toHaveLength(2);
    expect(moveStarts[0]).toMatchObject({ pokemon: "Blastoise" });
    expect(engine.getActive(0)?.pokemon.heldItem).toBeNull();

    const itemConsumed = events.find(
      (event) =>
        event.type === "item-consumed" && "pokemon" in event && event.pokemon === "Blastoise",
    );
    expect(itemConsumed).toBeDefined();
  });

  it("supports non-consuming go-first items in the same pre-turn path", () => {
    const ruleset = new GoFirstItemRuleset("item-activate", "blastoise-1");
    const { team1, team2 } = createTeams("quick-claw");
    const { engine, events } = createEngine(ruleset, team1, team2);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const moveStarts = events.filter((event) => event.type === "move-start");
    expect(moveStarts).toHaveLength(2);
    expect(moveStarts[0]).toMatchObject({ pokemon: "Blastoise" });
    expect(engine.getActive(0)?.pokemon.heldItem).toBe("quick-claw");

    const itemActivated = events.find(
      (event) =>
        event.type === "item-activate" && "pokemon" in event && event.pokemon === "Blastoise",
    );
    expect(itemActivated).toBeDefined();
  });

  it("leaves turn order unchanged when no go-first item activates", () => {
    const ruleset = new GoFirstItemRuleset("none", "blastoise-1");
    const { team1, team2 } = createTeams("custap-berry");
    const { engine, events } = createEngine(ruleset, team1, team2);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const moveStarts = events.filter((event) => event.type === "move-start");
    expect(moveStarts).toHaveLength(2);
    expect(moveStarts[0]).toMatchObject({ pokemon: "Charizard" });
    expect(engine.getActive(0)?.pokemon.heldItem).toBe("custap-berry");

    const itemEvent = events.find(
      (event) =>
        (event.type === "item-consumed" || event.type === "item-activate") &&
        "pokemon" in event &&
        event.pokemon === "Blastoise",
    );
    expect(itemEvent).toBeUndefined();
  });
});
