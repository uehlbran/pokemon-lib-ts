import { beforeEach, describe, expect, it } from "vitest";
import { GenerationRegistry } from "../../../src/ruleset/GenerationRegistry";
import { MockRuleset } from "../../helpers/mock-ruleset";

describe("GenerationRegistry", () => {
  let registry: GenerationRegistry;

  beforeEach(() => {
    registry = new GenerationRegistry();
  });

  describe("register", () => {
    it("given a valid ruleset, when register is called, then ruleset is stored", () => {
      // Arrange
      const ruleset = new MockRuleset();

      // Act
      registry.register(ruleset);

      // Assert
      expect(registry.has(1)).toBe(true);
    });
  });

  describe("get", () => {
    it("given a registered generation, when get is called, then the ruleset is returned", () => {
      // Arrange
      const ruleset = new MockRuleset();
      registry.register(ruleset);

      // Act
      const result = registry.get(1);

      // Assert — registry lookups return a cloned ruleset so mutable battle-local
      // state cannot leak across overlapping battles through a singleton entry.
      expect(result).not.toBe(ruleset);
      expect(result.generation).toBe(ruleset.generation);
    });

    it("given an unregistered generation, when get is called, then it throws an error", () => {
      // Act & Assert
      expect(() => registry.get(1)).toThrow("Generation 1 ruleset not registered");
    });
  });

  describe("has", () => {
    it("given a registered generation, when has is called, then true is returned", () => {
      // Arrange
      registry.register(new MockRuleset());

      // Act & Assert
      expect(registry.has(1)).toBe(true);
    });

    it("given an unregistered generation, when has is called, then false is returned", () => {
      // Act & Assert
      expect(registry.has(1)).toBe(false);
    });
  });

  describe("getAll", () => {
    it("given no registered rulesets, when getAll is called, then empty array is returned", () => {
      // Act & Assert
      expect(registry.getAll()).toEqual([]);
    });

    it("given multiple registered rulesets, when getAll is called, then sorted array is returned", () => {
      // Arrange
      const ruleset = new MockRuleset();
      registry.register(ruleset);

      // Act
      const all = registry.getAll();

      // Assert
      expect(all).toHaveLength(1);
      expect(all[0]?.generation).toBe(1);
      expect(all[0]).not.toBe(ruleset);
    });
  });
});
