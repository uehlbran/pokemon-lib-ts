import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/prng/seeded-random";

describe("SeededRandom", () => {
  describe("determinism", () => {
    it("produces same sequence with same seed", () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);
      const seq1 = Array.from({ length: 1000 }, () => rng1.next());
      const seq2 = Array.from({ length: 1000 }, () => rng2.next());
      expect(seq1).toEqual(seq2);
    });

    it("produces different sequences with different seeds", () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(43);
      const seq1 = Array.from({ length: 100 }, () => rng1.next());
      const seq2 = Array.from({ length: 100 }, () => rng2.next());
      expect(seq1).not.toEqual(seq2);
    });
  });

  describe("next()", () => {
    it("returns values in [0, 1)", () => {
      const rng = new SeededRandom(12345);
      for (let i = 0; i < 10000; i++) {
        const val = rng.next();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe("int()", () => {
    it("returns values within bounds inclusive", () => {
      const rng = new SeededRandom(99);
      for (let i = 0; i < 10000; i++) {
        const val = rng.int(1, 6);
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(6);
      }
    });

    it("can return both min and max", () => {
      const rng = new SeededRandom(1);
      const values = new Set<number>();
      for (let i = 0; i < 10000; i++) {
        values.add(rng.int(0, 1));
      }
      expect(values.has(0)).toBe(true);
      expect(values.has(1)).toBe(true);
    });
  });

  describe("chance()", () => {
    it("returns true roughly at the given probability", () => {
      const rng = new SeededRandom(42);
      let trueCount = 0;
      const trials = 10000;
      for (let i = 0; i < trials; i++) {
        if (rng.chance(0.5)) trueCount++;
      }
      // Should be approximately 50% +/- 5%
      expect(trueCount / trials).toBeGreaterThan(0.45);
      expect(trueCount / trials).toBeLessThan(0.55);
    });

    it("chance(0) always returns false", () => {
      const rng = new SeededRandom(42);
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(0)).toBe(false);
      }
    });

    it("chance(1) always returns true", () => {
      const rng = new SeededRandom(42);
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(1)).toBe(true);
      }
    });
  });

  describe("pick()", () => {
    it("returns elements from the array", () => {
      const rng = new SeededRandom(42);
      const arr = ["a", "b", "c"];
      for (let i = 0; i < 100; i++) {
        expect(arr).toContain(rng.pick(arr));
      }
    });

    it("picks all elements given enough tries", () => {
      const rng = new SeededRandom(42);
      const arr = [1, 2, 3];
      const picked = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        picked.add(rng.pick(arr));
      }
      expect(picked.size).toBe(3);
    });
  });

  describe("shuffle()", () => {
    it("returns array with same elements", () => {
      const rng = new SeededRandom(42);
      const arr = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle(arr);
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("does not mutate original array", () => {
      const rng = new SeededRandom(42);
      const arr = [1, 2, 3, 4, 5];
      const original = [...arr];
      rng.shuffle(arr);
      expect(arr).toEqual(original);
    });

    it("produces same shuffle with same seed", () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(rng1.shuffle(arr)).toEqual(rng2.shuffle(arr));
    });
  });

  describe("serialization", () => {
    it("getState/setState roundtrip preserves sequence", () => {
      const rng = new SeededRandom(42);
      // Advance state
      for (let i = 0; i < 100; i++) rng.next();

      const state = rng.getState();
      const future = Array.from({ length: 50 }, () => rng.next());

      // Restore state
      const rng2 = new SeededRandom(0);
      rng2.setState(state);
      const future2 = Array.from({ length: 50 }, () => rng2.next());

      expect(future).toEqual(future2);
    });
  });
});
