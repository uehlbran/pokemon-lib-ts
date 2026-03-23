import { describe, expect, it } from "vitest";

describe("barrel exports", () => {
  it("given the main index, when imported, then all key exports are available", async () => {
    // Act
    const mod = await import("../src/index");

    // Assert — check key exports exist
    expect(mod.BattleEngine).toBeDefined();
    expect(mod.BaseRuleset).toBeDefined();
    expect(mod.GenerationRegistry).toBeDefined();
    expect(mod.generations).toBeDefined();
    expect(mod.RandomAI).toBeDefined();
    expect(mod.createDefaultStatStages).toBeDefined();
    expect(mod.createActivePokemon).toBeDefined();
    expect(mod.createPokemonSnapshot).toBeDefined();
    expect(mod.getPokemonName).toBeDefined();
  });
});
