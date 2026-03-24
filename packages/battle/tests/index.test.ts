import { describe, expect, it } from "vitest";

describe("barrel exports", () => {
  it("given the main index, when imported, then internal helpers are not exposed from the root", async () => {
    // Act
    const mod = await import("../src/index");

    // Assert — supported public exports remain available
    expect(mod.BattleEngine).toBeDefined();
    expect(mod.BaseRuleset).toBeDefined();
    expect(mod.GenerationRegistry).toBeDefined();
    expect(mod.generations).toBeDefined();
    expect(mod.RandomAI).toBeDefined();
    expect(mod.createPokemonSnapshot).toBeDefined();
    expect(mod.getPokemonName).toBeDefined();

    // Assert — internal/test helpers stay off the consumer-facing root API
    expect(mod.createActivePokemon).toBeUndefined();
    expect(mod.createDefaultStatStages).toBeUndefined();
    expect(mod.createTestPokemon).toBeUndefined();
  });
});
