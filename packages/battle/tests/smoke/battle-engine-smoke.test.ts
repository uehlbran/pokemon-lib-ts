import { describe, expect, it } from "vitest";
import { BATTLE_EVENT_TYPES } from "../../src/constants/reference-ids";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

describe("BattleEngine smoke", () => {
  it("given a minimal singles battle, when the engine starts and resolves one turn, then the battle stays operational", () => {
    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [
        [createTestPokemon(6, 50, { nickname: "Charizard" })],
        [createTestPokemon(9, 50, { nickname: "Blastoise" })],
      ],
      seed: 42,
    };

    const engine = new BattleEngine(config, new MockRuleset(), createMockDataManager());

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const eventLog = engine.getEventLog();

    expect(engine.getPhase()).toBe("action-select");
    expect(eventLog).toHaveLength(8);
    expect(eventLog.map((event) => event.type)).toEqual([
      BATTLE_EVENT_TYPES.battleStart,
      BATTLE_EVENT_TYPES.switchIn,
      BATTLE_EVENT_TYPES.switchIn,
      BATTLE_EVENT_TYPES.turnStart,
      BATTLE_EVENT_TYPES.moveStart,
      BATTLE_EVENT_TYPES.damage,
      BATTLE_EVENT_TYPES.moveStart,
      BATTLE_EVENT_TYPES.damage,
    ]);
    expect(eventLog[4]).toMatchObject({
      type: BATTLE_EVENT_TYPES.moveStart,
      side: 0,
      pokemon: "Charizard",
      move: "tackle",
    });
    expect(eventLog[5]).toMatchObject({
      type: BATTLE_EVENT_TYPES.damage,
      side: 1,
      pokemon: "Blastoise",
      amount: 10,
      currentHp: 144,
      maxHp: 154,
      source: "tackle",
    });
  });
});
