import { describe, expect, it } from "vitest";
import {
  applyModifier,
  applyModifierChain,
  getStabModifier,
  getWeatherModifier,
} from "../../src/logic/damage-utils";

// --- applyModifier ---

describe("applyModifier", () => {
  it("given a value and modifier of 1.0, when called, then returns the same value", () => {
    // Arrange / Act
    const result = applyModifier(100, 1.0);

    // Assert
    expect(result).toBe(100);
  });

  it("given a value and modifier of 1.5, when called, then returns floor of result", () => {
    // Arrange / Act
    const result = applyModifier(100, 1.5);

    // Assert
    expect(result).toBe(150);
  });

  it("given a value and modifier of 0.5, when called, then returns half", () => {
    // Arrange / Act
    const result = applyModifier(100, 0.5);

    // Assert
    expect(result).toBe(50);
  });

  it("given an odd value and modifier of 1.5, when called, then applies floor truncation", () => {
    // Arrange / Act
    const result = applyModifier(99, 1.5);

    // Assert
    // 99 * 1.5 = 148.5 -> floor = 148
    expect(result).toBe(148);
  });

  it("given a value and modifier of 0, when called, then returns 0", () => {
    // Arrange / Act
    const result = applyModifier(100, 0);

    // Assert
    expect(result).toBe(0);
  });

  it("given a value of 1 and a small modifier, when called, then applies floor truncation to 0", () => {
    // Arrange / Act
    const result = applyModifier(1, 0.3);

    // Assert
    // 1 * 0.3 = 0.3 -> floor = 0
    expect(result).toBe(0);
  });

  it("given a large value and modifier of 2.0, when called, then doubles the value", () => {
    // Arrange / Act
    const result = applyModifier(250, 2.0);

    // Assert
    expect(result).toBe(500);
  });
});

// --- applyModifierChain ---

describe("applyModifierChain", () => {
  it("given a value and empty modifier chain, when called, then returns the original value", () => {
    // Arrange / Act
    const result = applyModifierChain(100, []);

    // Assert
    expect(result).toBe(100);
  });

  it("given a value and single modifier, when called, then behaves like applyModifier", () => {
    // Arrange / Act
    const result = applyModifierChain(100, [1.5]);

    // Assert
    expect(result).toBe(150);
  });

  it("given a value and multiple modifiers, when called, then applies each with floor in sequence", () => {
    // Arrange / Act
    const result = applyModifierChain(100, [1.5, 0.5]);

    // Assert
    // Step 1: floor(100 * 1.5) = 150
    // Step 2: floor(150 * 0.5) = 75
    expect(result).toBe(75);
  });

  it("given a value with chain causing truncation at each step, when called, then floors at each step", () => {
    // Arrange / Act
    const result = applyModifierChain(99, [1.5, 1.5]);

    // Assert
    // Step 1: floor(99 * 1.5) = floor(148.5) = 148
    // Step 2: floor(148 * 1.5) = floor(222) = 222
    expect(result).toBe(222);
  });

  it("given three modifiers chained, when called, then applies all three in order", () => {
    // Arrange / Act
    const result = applyModifierChain(100, [2.0, 0.5, 1.5]);

    // Assert
    // Step 1: floor(100 * 2.0) = 200
    // Step 2: floor(200 * 0.5) = 100
    // Step 3: floor(100 * 1.5) = 150
    expect(result).toBe(150);
  });

  it("given a modifier of 0 in the chain, when called, then zeroes out the result", () => {
    // Arrange / Act
    const result = applyModifierChain(100, [1.5, 0, 2.0]);

    // Assert
    // Step 1: floor(100 * 1.5) = 150
    // Step 2: floor(150 * 0) = 0
    // Step 3: floor(0 * 2.0) = 0
    expect(result).toBe(0);
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

// --- getWeatherModifier ---

describe("getWeatherModifier", () => {
  it("given null weather, when called, then returns 1.0", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("fire", null);

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given rain and a water move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("water", "rain");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given rain and a fire move, when called, then returns 0.5 (weakened)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("fire", "rain");

    // Assert
    expect(modifier).toBe(0.5);
  });

  it("given sun and a fire move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("fire", "sun");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given sun and a water move, when called, then returns 0.5 (weakened)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("water", "sun");

    // Assert
    expect(modifier).toBe(0.5);
  });

  it("given rain and a grass move, when called, then returns 1.0 (unaffected)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("grass", "rain");

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given sun and an electric move, when called, then returns 1.0 (unaffected)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("electric", "sun");

    // Assert
    expect(modifier).toBe(1.0);
  });

  it("given sand weather, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherModifier("fire", "sand")).toBe(1.0);
    expect(getWeatherModifier("water", "sand")).toBe(1.0);
    expect(getWeatherModifier("rock", "sand")).toBe(1.0);
  });

  it("given hail weather, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherModifier("fire", "hail")).toBe(1.0);
    expect(getWeatherModifier("ice", "hail")).toBe(1.0);
  });

  it("given snow weather, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherModifier("ice", "snow")).toBe(1.0);
    expect(getWeatherModifier("water", "snow")).toBe(1.0);
  });

  // --- Extreme weather cases ---

  it("given heavy-rain and a water move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("water", "heavy-rain");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given heavy-rain and a fire move, when called, then returns 0 (completely blocked)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("fire", "heavy-rain");

    // Assert
    expect(modifier).toBe(0);
  });

  it("given harsh-sun and a fire move, when called, then returns 1.5 (boosted)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("fire", "harsh-sun");

    // Assert
    expect(modifier).toBe(1.5);
  });

  it("given harsh-sun and a water move, when called, then returns 0 (completely blocked)", () => {
    // Arrange / Act
    const modifier = getWeatherModifier("water", "harsh-sun");

    // Assert
    expect(modifier).toBe(0);
  });

  it("given strong-winds, when called with any type, then returns 1.0", () => {
    // Arrange / Act / Assert
    expect(getWeatherModifier("fire", "strong-winds")).toBe(1.0);
    expect(getWeatherModifier("water", "strong-winds")).toBe(1.0);
    expect(getWeatherModifier("flying", "strong-winds")).toBe(1.0);
  });
});
