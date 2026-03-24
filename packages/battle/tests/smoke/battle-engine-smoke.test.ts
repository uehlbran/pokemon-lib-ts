import { describe, expect, it } from "vitest";
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

    expect(engine.getPhase()).toBe("action-select");
    expect(engine.getEventLog().length).toBeGreaterThan(0);
  });
});
