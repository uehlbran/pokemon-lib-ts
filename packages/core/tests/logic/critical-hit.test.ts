import { describe, expect, it } from "vitest";
import {
  CRIT_MULTIPLIER_CLASSIC,
  CRIT_MULTIPLIER_MODERN,
  CRIT_RATE_PROBABILITIES_GEN2,
  CRIT_RATE_PROBABILITIES_GEN3_5,
  CRIT_RATE_PROBABILITIES_GEN6,
  CRIT_RATES_GEN2,
  CRIT_RATES_GEN3_5,
  CRIT_RATES_GEN6,
  getCritRate,
} from "../../src/logic/critical-hit";

// --- CRIT_RATES_GEN6 ---

describe("CRIT_RATES_GEN6", () => {
  it("given the Gen 6+ rate table, when checked, then has correct values", () => {
    // Assert
    expect(CRIT_RATES_GEN6).toHaveLength(4);
    expect(CRIT_RATES_GEN6[0]).toBeCloseTo(1 / 24);
    expect(CRIT_RATES_GEN6[1]).toBeCloseTo(1 / 8);
    expect(CRIT_RATES_GEN6[2]).toBeCloseTo(1 / 2);
    expect(CRIT_RATES_GEN6[3]).toBe(1);
  });

  it("given the explicit Gen 6 probability export, when compared to the legacy alias, then they are the same table", () => {
    // Source: issue #773 keeps CRIT_RATES_GEN6 as a deprecated compatibility alias while
    // the canonical probability name becomes CRIT_RATE_PROBABILITIES_GEN6.
    expect(CRIT_RATE_PROBABILITIES_GEN6).toBe(CRIT_RATES_GEN6);
  });
});

// --- CRIT_RATES_GEN2 ---

describe("CRIT_RATES_GEN2", () => {
  it("given the Gen 2 rate table, when checked, then has correct values", () => {
    expect(CRIT_RATES_GEN2).toHaveLength(5);
    expect(CRIT_RATES_GEN2[0]).toBeCloseTo(17 / 256);
    expect(CRIT_RATES_GEN2[1]).toBeCloseTo(32 / 256);
    expect(CRIT_RATES_GEN2[2]).toBeCloseTo(64 / 256);
    expect(CRIT_RATES_GEN2[3]).toBeCloseTo(85 / 256);
    expect(CRIT_RATES_GEN2[4]).toBeCloseTo(128 / 256);
  });

  it("given the explicit Gen 2 probability export, when compared to the legacy alias, then they are the same table", () => {
    // Source: issue #773 keeps CRIT_RATES_GEN2 as a deprecated compatibility alias while
    // the canonical probability name becomes CRIT_RATE_PROBABILITIES_GEN2.
    expect(CRIT_RATE_PROBABILITIES_GEN2).toBe(CRIT_RATES_GEN2);
  });
});

// --- CRIT_RATES_GEN3_5 ---

describe("CRIT_RATES_GEN3_5", () => {
  it("given the Gen 3-5 rate table, when checked, then has correct values", () => {
    // Assert
    expect(CRIT_RATES_GEN3_5).toHaveLength(5);
    expect(CRIT_RATES_GEN3_5[0]).toBeCloseTo(1 / 16);
    expect(CRIT_RATES_GEN3_5[1]).toBeCloseTo(1 / 8);
    expect(CRIT_RATES_GEN3_5[2]).toBeCloseTo(1 / 4);
    expect(CRIT_RATES_GEN3_5[3]).toBeCloseTo(1 / 3);
    expect(CRIT_RATES_GEN3_5[4]).toBeCloseTo(1 / 2);
  });

  it("given the explicit Gen 3-5 probability export, when compared to the legacy alias, then they are the same table", () => {
    // Source: issue #773 keeps CRIT_RATES_GEN3_5 as a deprecated compatibility alias while
    // the canonical probability name becomes CRIT_RATE_PROBABILITIES_GEN3_5.
    expect(CRIT_RATE_PROBABILITIES_GEN3_5).toBe(CRIT_RATES_GEN3_5);
  });
});

// --- CRIT_MULTIPLIER constants ---

describe("CRIT_MULTIPLIER_MODERN", () => {
  it("given the modern crit multiplier, when checked, then equals 1.5", () => {
    expect(CRIT_MULTIPLIER_MODERN).toBe(1.5);
  });
});

describe("CRIT_MULTIPLIER_CLASSIC", () => {
  it("given the classic crit multiplier, when checked, then equals 2.0", () => {
    expect(CRIT_MULTIPLIER_CLASSIC).toBe(2.0);
  });
});

// --- getCritRate ---

describe("getCritRate", () => {
  it("given stage 0 and Gen 6 table, when called, then returns 1/24", () => {
    // Arrange / Act
    const rate = getCritRate(0, CRIT_RATES_GEN6);

    // Assert
    expect(rate).toBeCloseTo(1 / 24);
  });

  it("given stage 1 and Gen 6 table, when called, then returns 1/8", () => {
    // Arrange / Act
    const rate = getCritRate(1, CRIT_RATES_GEN6);

    // Assert
    expect(rate).toBeCloseTo(1 / 8);
  });

  it("given stage 2 and Gen 6 table, when called, then returns 1/2", () => {
    // Arrange / Act
    const rate = getCritRate(2, CRIT_RATES_GEN6);

    // Assert
    expect(rate).toBeCloseTo(1 / 2);
  });

  it("given stage 3 and Gen 6 table, when called, then returns 1 (guaranteed crit)", () => {
    // Arrange / Act
    const rate = getCritRate(3, CRIT_RATES_GEN6);

    // Assert
    expect(rate).toBe(1);
  });

  it("given stage 4 and Gen 2-5 table, when called, then returns 1/2", () => {
    // Arrange / Act
    const rate = getCritRate(4, CRIT_RATES_GEN3_5);

    // Assert
    expect(rate).toBeCloseTo(1 / 2);
  });

  it("given a negative stage, when called, then clamps to stage 0", () => {
    // Arrange / Act
    const rate = getCritRate(-1, CRIT_RATES_GEN6);

    // Assert
    expect(rate).toBeCloseTo(1 / 24);
  });

  it("given a stage exceeding max index for Gen 6, when called, then clamps to max stage", () => {
    // Arrange / Act
    const rate = getCritRate(10, CRIT_RATES_GEN6);

    // Assert
    expect(rate).toBe(1); // Clamped to stage 3 (last index)
  });

  it("given a stage exceeding max index for Gen 2-5, when called, then clamps to max stage", () => {
    // Arrange / Act
    const rate = getCritRate(99, CRIT_RATES_GEN3_5);

    // Assert
    expect(rate).toBeCloseTo(1 / 2); // Clamped to stage 4 (last index)
  });

  it("given each stage of Gen 2-5 table, when called, then returns correct rate", () => {
    // Assert
    expect(getCritRate(0, CRIT_RATES_GEN3_5)).toBeCloseTo(1 / 16);
    expect(getCritRate(1, CRIT_RATES_GEN3_5)).toBeCloseTo(1 / 8);
    expect(getCritRate(2, CRIT_RATES_GEN3_5)).toBeCloseTo(1 / 4);
    expect(getCritRate(3, CRIT_RATES_GEN3_5)).toBeCloseTo(1 / 3);
    expect(getCritRate(4, CRIT_RATES_GEN3_5)).toBeCloseTo(1 / 2);
  });
});
