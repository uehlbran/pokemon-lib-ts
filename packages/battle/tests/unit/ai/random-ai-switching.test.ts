import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { RandomAI } from "../../../src/ai/RandomAI";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

describe("RandomAI switching", () => {
  it("given a RandomAI controlling both sides, when a pokemon faints and reserve is available, then AI picks a valid switch", () => {
    const ai = new RandomAI();
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(250);
    const dataManager = createMockDataManager();

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
    ];
    const team2 = [
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
      createTestPokemon(25, 50, {
        uid: "pikachu-2",
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

    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [team1, team2],
      seed: 42,
    };

    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.start();

    const aiRng = new SeededRandom(42);
    const action0 = ai.chooseAction(
      0,
      engine.getState(),
      ruleset,
      aiRng,
      engine.getAvailableMoves(0),
    );
    const action1 = ai.chooseAction(
      1,
      engine.getState(),
      ruleset,
      aiRng,
      engine.getAvailableMoves(1),
    );
    engine.submitAction(0, action0);
    engine.submitAction(1, action1);

    expect(engine.getPhase()).toBe("switch-prompt");
    expect(engine.getActive(1)?.pokemon.currentHp).toBe(0);

    const availableSwitches = engine.getAvailableSwitches(1);
    expect(availableSwitches).toEqual([1]);

    const switchSlot = ai.chooseSwitchIn(1, engine.getState(), ruleset, aiRng);
    expect(switchSlot).toBe(1);

    engine.submitSwitch(1, switchSlot ?? -1);

    expect(engine.getActive(1)?.pokemon.uid).toBe("pikachu-2");
    expect(engine.getPhase()).toBe("action-select");
  });
});
