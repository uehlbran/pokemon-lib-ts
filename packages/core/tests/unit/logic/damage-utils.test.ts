import { describe, expect, it } from "vitest";
import {
  applyDamageModifier,
  applyDamageModifierChain,
  getStabModifier,
  getWeatherDamageModifier,
  pokeRound,
} from "../../../src/logic/damage-utils";

// --- applyDamageModifier ---

describe("applyDamageModifier", () => {
  it("given a value and modifier of 1.0, when called, then returns the same value", () => {
    // Arrange / Act
    const result = applyDamageModifier(100, 1.0);

    // Assert
    expect(result).toBe(100);
  });

  it("given a value and modifier of 1.5, when called, then returns floor of result", () => {
    // Arrange / Act
    const result = applyDamageModifier(100, 1.5);

    // Assert
    expect(result).toBe(150);
  });

  it("given a value and modifier of 0.5, when called, then returns half", () => {
    // Arrange / Act
    const result = applyDamageModifier(100, 0.5);

    // Assert
    expect(result).toBe(50);
  });

  it("given an odd value and modifier of 1.5, when called, then applies floor truncation", () => {
    // Arrange / Act
    const result = applyDamageModifier(99, 1.5);

    // Assert
    // 99 * 1.5 = 148.5 -> floor = 148
    expect(result).toBe(148);
  });

  it("given a value and modifier of 0, when called, then returns 0", () => {
    // Arrange / Act
    const result = applyDamageModifier(100, 0);

    // Assert
    expect(result).toBe(0);
  });

  it("given a value of 1 and a small modifier, when called, then applies floor truncation to 0", () => {
    // Arrange / Act
    const result = applyDamageModifier(1, 0.3);

    // Assert
    // 1 * 0.3 = 0.3 -> floor = 0
    expect(result).toBe(0);
  });

  it("given a large value and modifier of 2.0, when called, then doubles the value", () => {
    // Arrange / Act
    const result = applyDamageModifier(250, 2.0);

    // Assert
    expect(result).toBe(500);
  });
});

// --- applyDamageModifierChain ---

describe("applyDamageModifierChain", () => {
  it("given a value and empty modifier chain, when called, then returns the original value", () => {
    // Arrange / Act
    const result = applyDamageModifierChain(100, []);

    // Assert
    expect(result).toBe(100);
  });

  it("given a value and single modifier, when called, then behaves like applyDamageModifier", () => {
    // Arrange / Act
    const result = applyDamageModifierChain(100, [1.5]);

    // Assert
    expect(result).toBe(150);
  });

  it("given a value and multiple modifiers, when called, then applies each with floor in sequence", () => {
    // Arrange / Act
    const result = applyDamageModifierChain(100, [1.5, 0.5]);

    // Assert
    // Step 1: floor(100 * 1.5) = 150
    // Step 2: floor(150 * 0.5) = 75
    expect(result).toBe(75);
  });

  it("given a value with chain causing truncation at each step, when called, then floors at each step", () => {
    // Arrange / Act
    const result = applyDamageModifierChain(99, [1.5, 1.5]);

    // Assert
    // Step 1: floor(99 * 1.5) = floor(148.5) = 148
    // Step 2: floor(148 * 1.5) = floor(222) = 222
    expect(result).toBe(222);
  });

  it("given three modifiers chained, when called, then applies all three in order", () => {
    // Arrange / Act
    const result = applyDamageModifierChain(100, [2.0, 0.5, 1.5]);

    // Assert
    // Step 1: floor(100 * 2.0) = 200
    // Step 2: floor(200 * 0.5) = 100
    // Step 3: floor(100 * 1.5) = 150
    expect(result).toBe(150);
  });

  it("given a modifier of 0 in the chain, when called, then zeroes out the result", () => {
    // Arrange / Act
    const result = applyDamageModifierChain(100, [1.5, 0, 2.0]);

    // Assert
    // Step 1: floor(100 * 1.5) = 150
    // Step 2: floor(150 * 0) = 0
    // Step 3: floor(0 * 2.0) = 0
    expect(result).toBe(0);
  });
});

describe("pokeRound", () => {
  it("given a half modifier on a boundary case, when called, then uses Showdown's +2047 rounding", () => {
    // Source: Showdown sim/battle.ts modify() -- floor((value * modifier + 2047) / 4096)
    // Derivation: floor((3 * 2048 + 2047) / 4096) = floor(8191 / 4096) = 1
    expect(pokeRound(3, 2048)).toBe(1);
  });

  it("given a 1.5x modifier on a boundary case, when called, then does not round up", () => {
    // Source: Showdown sim/battle.ts modify() -- floor((value * modifier + 2047) / 4096)
    // Derivation: floor((57 * 6144 + 2047) / 4096) = floor(352255 / 4096) = 85
    expect(pokeRound(57, 6144)).toBe(85);
  });

  it("given an identity modifier, when called, then returns the original value", () => {
    // Source: Showdown sim/battle.ts modify() -- floor((value * modifier + 2047) / 4096)
    // Derivation: floor((100 * 4096 + 2047) / 4096) = floor(411647 / 4096) = 100
    expect(pokeRound(100, 4096)).toBe(100);
  });
});

// --- getStabModifier ---

describe("getStabModifier", () => {
  it("given a move type not in attacker types, when called, then returns 1.0 (no STAB)", () => {
    // Arrange / Act
    const modifier = getStabModifier("fire", ["water", "flying"]);

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given a move type matching attacker type, when called, then returns 1.5 (STAB)", () => {
    // Arrange / Act
    const modifier = getStabModifier("fire", ["fire", "flying"]);

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given a move type matching attacker type with Adaptability, when called, then returns 2.0", () => {
    // Arrange / Act
    const modifier = getStabModifier("fire", ["fire", "flying"], true);

    // Assert
    expect(modifier).toBe(2.0);
  });

  it("given a move type not matching with Adaptability, when called, then returns 1.0", () => {
    // Arrange / Act
    const modifier = getStabModifier("water", ["fire", "flying"], true);

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given a single-typed attacker with matching move, when called, then returns 1.5", () => {
    // Arrange / Act
    const modifier = getStabModifier("electric", ["electric"]);

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given hasAdaptability defaults to false, when called without it, then uses normal STAB", () => {
    // Arrange / Act
    const modifier = getStabModifier("grass", ["grass", "poison"]);

    // Assert
    expect(modifier).toBe(1.5);
  });
});

// --- getWeatherDamageModifier ---

describe("getWeatherDamageModifier", () => {
  it("given null weather, when called, then returns 1.0", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("fire", null);

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given rain and a water move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("water", "rain");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given rain and a fire move, when called, then returns 0.5 (weakened)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("fire", "rain");

    // Assert
    expect(modifier).toBe(0.5);
  });

  it("given sun and a fire move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("fire", "sun");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given sun and a water move, when called, then returns 0.5 (weakened)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("water", "sun");

    // Assert
    expect(modifier).toBe(0.5);
  });

  it("given rain and a grass move, when called, then returns 1.0 (unaffected)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("grass", "rain");

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given sun and an electric move, when called, then returns 1.0 (unaffected)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("electric", "sun");

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given sand weather, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherDamageModifier("fire", "sand")).toBe(1.0);
    expect(getWeatherDamageModifier("water", "sand")).toBe(1.0);
    expect(getWeatherDamageModifier("rock", "sand")).toBe(1.0);
  });

  it("given hail weather, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherDamageModifier("fire", "hail")).toBe(1.0);
    expect(getWeatherDamageModifier("ice", "hail")).toBe(1.0);
  });

  it("given snow weather, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherDamageModifier("ice", "snow")).toBe(1.0);
    expect(getWeatherDamageModifier("water", "snow")).toBe(1.0);
  });

  // --- Extreme weather cases ---

  it("given heavy-rain and a water move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("water", "heavy-rain");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given heavy-rain and a fire move, when called, then returns 0 (completely blocked)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("fire", "heavy-rain");

    // Assert
    expect(modifier).toBe(0);
  });

  it("given harsh-sun and a fire move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("fire", "harsh-sun");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given harsh-sun and a water move, when called, then returns 0 (completely blocked)", () => {
    // Arrange / Act
    const modifier = getWeatherDamageModifier("water", "harsh-sun");

    // Assert
    expect(modifier).toBe(0);
  });

  it("given strong-winds, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherDamageModifier("fire", "strong-winds")).toBe(1.0);
    expect(getWeatherDamageModifier("water", "strong-winds")).toBe(1.0);
    expect(getWeatherDamageModifier("flying", "strong-winds")).toBe(1.0);
  });
});
