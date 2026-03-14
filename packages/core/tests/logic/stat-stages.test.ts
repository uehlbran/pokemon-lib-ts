import { describe, expect, it } from "vitest";
import {
  calculateAccuracy,
  getAccuracyEvasionMultiplier,
  getStatStageMultiplier,
} from "../../src/logic/stat-stages";

describe("getStatStageMultiplier", () => {
  it("should return 1.0 at stage 0", () => {
    expect(getStatStageMultiplier(0)).toBe(1.0);
  });

  it("should return 4.0 at stage +6", () => {
    expect(getStatStageMultiplier(6)).toBe(4.0);
  });

  it("should return 0.25 at stage -6", () => {
    expect(getStatStageMultiplier(-6)).toBe(0.25);
  });

  it("should return 1.5 at stage +1", () => {
    expect(getStatStageMultiplier(1)).toBe(1.5);
  });

  it("should return 2.0 at stage +2", () => {
    expect(getStatStageMultiplier(2)).toBe(2.0);
  });

  it("should return 2.5 at stage +3", () => {
    expect(getStatStageMultiplier(3)).toBe(2.5);
  });

  it("should return 3.0 at stage +4", () => {
    expect(getStatStageMultiplier(4)).toBe(3.0);
  });

  it("should return 3.5 at stage +5", () => {
    expect(getStatStageMultiplier(5)).toBe(3.5);
  });

  it("should return 2/3 at stage -1", () => {
    expect(getStatStageMultiplier(-1)).toBeCloseTo(2 / 3);
  });

  it("should return 0.5 at stage -2", () => {
    expect(getStatStageMultiplier(-2)).toBe(0.5);
  });

  it("should return 0.4 at stage -3", () => {
    expect(getStatStageMultiplier(-3)).toBe(0.4);
  });

  it("should return 2/6 at stage -4", () => {
    expect(getStatStageMultiplier(-4)).toBeCloseTo(2 / 6);
  });

  it("should return 2/7 at stage -5", () => {
    expect(getStatStageMultiplier(-5)).toBeCloseTo(2 / 7);
  });

  it("should clamp values beyond +6", () => {
    expect(getStatStageMultiplier(7)).toBe(4.0);
    expect(getStatStageMultiplier(10)).toBe(4.0);
  });

  it("should clamp values beyond -6", () => {
    expect(getStatStageMultiplier(-7)).toBe(0.25);
    expect(getStatStageMultiplier(-10)).toBe(0.25);
  });

  it("should always be positive", () => {
    for (let stage = -6; stage <= 6; stage++) {
      expect(getStatStageMultiplier(stage)).toBeGreaterThan(0);
    }
  });

  it("should be symmetric: stage(n) * stage(-n) = 1 (approximately)", () => {
    for (let n = 1; n <= 6; n++) {
      const product = getStatStageMultiplier(n) * getStatStageMultiplier(-n);
      expect(product).toBeCloseTo(1.0);
    }
  });
});

describe("getAccuracyEvasionMultiplier", () => {
  it("should return 1.0 at stage 0", () => {
    expect(getAccuracyEvasionMultiplier(0)).toBe(1.0);
  });

  it("should return 3.0 at stage +6", () => {
    expect(getAccuracyEvasionMultiplier(6)).toBe(3.0);
  });

  it("should return 3/9 at stage -6", () => {
    expect(getAccuracyEvasionMultiplier(-6)).toBeCloseTo(3 / 9);
  });

  it("should return 4/3 at stage +1", () => {
    expect(getAccuracyEvasionMultiplier(1)).toBeCloseTo(4 / 3);
  });

  it("should return 5/3 at stage +2", () => {
    expect(getAccuracyEvasionMultiplier(2)).toBeCloseTo(5 / 3);
  });

  it("should return 2.0 at stage +3", () => {
    expect(getAccuracyEvasionMultiplier(3)).toBe(2.0);
  });

  it("should return 0.75 at stage -1", () => {
    expect(getAccuracyEvasionMultiplier(-1)).toBe(0.75);
  });

  it("should return 0.6 at stage -2", () => {
    expect(getAccuracyEvasionMultiplier(-2)).toBe(0.6);
  });

  it("should return 0.5 at stage -3", () => {
    expect(getAccuracyEvasionMultiplier(-3)).toBe(0.5);
  });

  it("should clamp values beyond +6", () => {
    expect(getAccuracyEvasionMultiplier(7)).toBe(3.0);
  });

  it("should clamp values beyond -6", () => {
    expect(getAccuracyEvasionMultiplier(-7)).toBeCloseTo(3 / 9);
  });
});

describe("calculateAccuracy", () => {
  it("should return Infinity for moves that never miss (accuracy null)", () => {
    expect(calculateAccuracy(null, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("should return base accuracy when both stages are 0", () => {
    expect(calculateAccuracy(100, 0, 0)).toBe(100);
    expect(calculateAccuracy(95, 0, 0)).toBe(95);
  });

  it("should increase accuracy with positive accuracy stage", () => {
    const base = calculateAccuracy(100, 0, 0);
    const boosted = calculateAccuracy(100, 1, 0);
    expect(boosted).toBeGreaterThan(base);
  });

  it("should decrease accuracy with positive evasion stage", () => {
    const base = calculateAccuracy(100, 0, 0);
    const evaded = calculateAccuracy(100, 0, 1);
    expect(evaded).toBeLessThan(base);
  });

  it("should calculate correctly with opposing stages", () => {
    // +1 accuracy vs +1 evasion: floor(100 * (4/3) / (4/3))
    // Due to floating-point truncation: floor(133.33.../1.333...) = floor(99.999...) = 99
    const result = calculateAccuracy(100, 1, 1);
    expect(result).toBe(99);
  });

  it("should floor the result", () => {
    // 100 * (4/3) = 133.33... -> floor -> 133
    expect(calculateAccuracy(100, 1, 0)).toBe(133);
  });
});
