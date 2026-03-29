import { describe, expect, it } from "vitest";

describe("barrel exports", () => {
  it("given the main index, when imported, then internal helpers are not exposed from the root", async () => {
    // Act
    const mod = await import("../../src/index");

    // Assert — supported public exports remain available
    expect(typeof mod.BattleEngine).toBe("function");
    expect(typeof mod.BaseRuleset).toBe("function");
    expect(typeof mod.GenerationRegistry).toBe("function");
    expect(typeof mod.generations).toBe("object");
    expect(typeof mod.RandomAI).toBe("function");
    expect(typeof mod.createPokemonSnapshot).toBe("function");
    expect(typeof mod.getPokemonName).toBe("function");

    // Assert — internal/test helpers stay off the consumer-facing root API
    expect(Object.hasOwn(mod, "createOnFieldPokemon")).toBe(false);
    expect(Object.hasOwn(mod, "createDefaultStatStages")).toBe(false);
    expect(Object.hasOwn(mod, "createTestPokemon")).toBe(false);
    expect(Object.hasOwn(mod, "BASE_TYPE_BOOST_ITEMS")).toBe(false);
    expect(Object.hasOwn(mod, "BASE_PLATE_ITEMS")).toBe(false);
    expect(Object.hasOwn(mod, "BASE_PINCH_ABILITY_TYPES")).toBe(false);
  });

  it("given the utils entrypoint, when imported, then internal helpers are exposed there", async () => {
    // Act
    const utils = await import("../../src/utils/index");

    // Assert — the supported submodule keeps the internal helpers available
    expect(Object.hasOwn(utils, "createOnFieldPokemon")).toBe(true);
    expect(Object.hasOwn(utils, "createDefaultStatStages")).toBe(true);
    expect(Object.hasOwn(utils, "createTestPokemon")).toBe(true);
  });
});
