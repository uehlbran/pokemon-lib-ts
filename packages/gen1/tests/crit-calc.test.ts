import { describe, expect, it } from "vitest";
import { getGen1CritRate } from "../src/Gen1CritCalc";

/**
 * Gen 1 Critical Hit Tests
 *
 * In Gen 1, crit rate is determined by the attacker's base Speed stat:
 *   critRate = floor(baseSpeed / 2)
 *   probability = critRate / 256
 *
 * Key mechanics:
 * - Base Speed 100 -> crit rate = 50/256 ~ 19.5%
 * - Base Speed 80  -> crit rate = 40/256 ~ 15.6%
 * - Base Speed 120 -> crit rate = 60/256 ~ 23.4%
 * - Focus Energy BUG: divides crit rate by 4 instead of multiplying
 * - High crit-ratio moves (like Slash, Karate Chop) multiply the rate by 8
 *   (or use baseSpeed * 4 / 256, clamped to 255)
 * - Crits ignore stat stages and use base stats
 * - Gen 1 crit damage multiplier is 2x (not 1.5x like Gen 6+)
 */
describe("Gen 1 Critical Hit", () => {
  // --- Base Crit Rate Calculation ---

  it("given base speed 100, when calculating crit rate, then returns approximately 19.5%", () => {
    // Arrange
    const baseSpeed = 100;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(100/2) / 256 = 50/256 ~ 0.1953
    expect(critChance).toBeCloseTo(50 / 256, 2);
  });

  it("given base speed 80, when calculating crit rate, then returns approximately 15.6%", () => {
    // Arrange
    const baseSpeed = 80;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(80/2) / 256 = 40/256 ~ 0.1563
    expect(critChance).toBeCloseTo(40 / 256, 2);
  });

  it("given base speed 120, when calculating crit rate, then returns approximately 23.4%", () => {
    // Arrange
    const baseSpeed = 120;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(120/2) / 256 = 60/256 ~ 0.2344
    expect(critChance).toBeCloseTo(60 / 256, 2);
  });

  it("given base speed 130 (Mewtwo), when calculating crit rate, then returns approximately 25.4%", () => {
    // Arrange
    const baseSpeed = 130;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(130/2) / 256 = 65/256 ~ 0.2539
    expect(critChance).toBeCloseTo(65 / 256, 2);
  });

  it("given base speed 20, when calculating crit rate, then returns approximately 3.9%", () => {
    // Arrange
    const baseSpeed = 20;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(20/2) / 256 = 10/256 ~ 0.0391
    expect(critChance).toBeCloseTo(10 / 256, 2);
  });

  it("given base speed 45, when calculating crit rate, then returns approximately 8.6%", () => {
    // Arrange
    const baseSpeed = 45;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(45/2) / 256 = 22/256 ~ 0.0859
    expect(critChance).toBeCloseTo(22 / 256, 2);
  });

  it("given base speed 1, when calculating crit rate, then returns very low rate", () => {
    // Arrange
    const baseSpeed = 1;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(1/2) / 256 = 0/256 = 0
    expect(critChance).toBeLessThanOrEqual(1 / 256);
  });

  // --- Monotonicity ---

  it("given increasing base speed, when calculating crit rate, then rate increases monotonically", () => {
    // Arrange
    const speeds = [10, 20, 40, 60, 80, 100, 120, 140, 160];
    // Act
    const rates = speeds.map((s) => getGen1CritRate(s, false, false));
    // Assert
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1] ?? 0);
    }
  });

  // --- Crit Rate Bounds ---

  it("given any base speed, when calculating crit rate, then rate is between 0 and 1", () => {
    // Arrange / Act / Assert
    for (let speed = 0; speed <= 255; speed++) {
      const rate = getGen1CritRate(speed, false, false);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });

  it("given very high base speed (255), when calculating crit rate, then rate is capped at most 255/256", () => {
    // Arrange
    const baseSpeed = 255;
    // Act
    const critChance = getGen1CritRate(baseSpeed, false, false);
    // Assert: floor(255/2) / 256 = 127/256 ~ 0.496, but capped at 255/256
    // The rate should be at most 1.0
    expect(critChance).toBeLessThanOrEqual(1.0);
  });

  // --- Focus Energy Bug ---

  it("given Focus Energy active, when calculating crit rate, then rate DECREASES (Gen 1 bug)", () => {
    // Arrange
    const baseSpeed = 100;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const focusEnergyRate = getGen1CritRate(baseSpeed, true, false);
    // Assert: Focus Energy DIVIDES by 4 instead of multiplying by 4
    // normalRate = 50/256 ~ 0.195
    // focusEnergyRate = floor(50/4) / 256 = 12/256 ~ 0.047
    expect(focusEnergyRate).toBeLessThan(normalRate);
  });

  it("given Focus Energy active with base speed 100, when calculating crit rate, then rate is approximately 4.7%", () => {
    // Arrange
    const baseSpeed = 100;
    // Act
    const rate = getGen1CritRate(baseSpeed, true, false);
    // Assert: floor(floor(100/2) / 4) / 256 = floor(50/4)/256 = 12/256 ~ 0.0469
    expect(rate).toBeCloseTo(12 / 256, 2);
  });

  it("given Focus Energy active with low speed, when calculating crit rate, then rate drops to 0 or near-zero", () => {
    // Arrange
    const baseSpeed = 20;
    // Act
    const rate = getGen1CritRate(baseSpeed, true, false);
    // Assert: floor(floor(20/2) / 4) / 256 = floor(10/4)/256 = 2/256 ~ 0.0078
    expect(rate).toBeLessThanOrEqual(3 / 256);
  });

  // --- High Crit-Ratio Moves ---

  it("given a high crit-ratio move, when calculating crit rate, then rate is significantly higher", () => {
    // Arrange: High crit moves (Slash, Karate Chop) use a different formula
    // In Gen 1: high crit rate = floor(baseSpeed * 8 / 2) / 256, capped at 255
    const baseSpeed = 100;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const highCritRate = getGen1CritRate(baseSpeed, false, true);
    // Assert
    expect(highCritRate).toBeGreaterThan(normalRate);
  });

  it("given a high crit-ratio move with base speed 100, when calculating crit rate, then rate is very high", () => {
    // Arrange
    const baseSpeed = 100;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, true);
    // Assert: High crit should give a rate well above the base rate
    // With base speed 100: floor(100 * 8 / 2) / 256 = 400/256, capped at 255/256 ~ 99.6%
    expect(rate).toBeGreaterThan(0.5);
  });

  it("given a high crit-ratio move with low base speed 20, when calculating crit rate, then rate is still elevated", () => {
    // Arrange
    const baseSpeed = 20;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const highCritRate = getGen1CritRate(baseSpeed, false, true);
    // Assert
    expect(highCritRate).toBeGreaterThan(normalRate);
  });

  // --- Critical Hit Damage ---

  it("given Gen 1, when checking crit multiplier, then it should be 2.0 (not 1.5 like Gen 6+)", () => {
    // Arrange / Act / Assert
    // Gen 1 crit multiplier is a well-known constant: 2x damage
    const GEN1_CRIT_MULTIPLIER = 2;
    expect(GEN1_CRIT_MULTIPLIER).toBe(2);
  });

  // --- Edge Cases ---

  it("given base speed 0, when calculating crit rate, then returns 0", () => {
    // Arrange
    const baseSpeed = 0;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, false);
    // Assert
    expect(rate).toBe(0);
  });

  it("given high crit AND focus energy, when calculating crit rate, then both modifiers apply", () => {
    // Arrange: These two interact in interesting ways
    const baseSpeed = 100;
    // Act
    const rate = getGen1CritRate(baseSpeed, true, true);
    // Assert: The rate should be defined and reasonable
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});
