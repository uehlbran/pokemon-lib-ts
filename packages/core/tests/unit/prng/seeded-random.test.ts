import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/prng/seeded-random";

// Provenance: expected sequences were captured from the current Mulberry32
// implementation in packages/core/src/prng/seeded-random.ts for the listed seeds.
const DETERMINISTIC_SEEDS = {
  primary: 42,
  alternate: 43,
  nextContract: 12345,
  diceContract: 99,
  binaryContract: 1,
  restoreContract: 0,
} as const;

const EXPECTED_NEXT_VALUES_FOR_SEED_42 = [
  0.6011037519201636,
  0.44829055899754167,
  0.8524657934904099,
  0.6697340414393693,
  0.17481389874592423,
] as const;

const EXPECTED_NEXT_VALUES_FOR_SEED_43 = [
  0.9998110907617956,
  0.2764023437630385,
  0.5294158514589071,
  0.05911232368089259,
  0.06335184047929943,
] as const;

const EXPECTED_NEXT_VALUES_FOR_SEED_12345 = [
  0.9797282677609473,
  0.3067522644996643,
  0.484205421525985,
  0.817934412509203,
  0.5094283693470061,
] as const;

const EXPECTED_INT_ROLLS_FOR_SEED_99 = [2, 5, 4, 5, 1, 5, 1, 1, 3, 5, 3, 1] as const;
const EXPECTED_BINARY_ROLLS_FOR_SEED_1 = [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0] as const;
const EXPECTED_CHANCE_RESULTS_FOR_SEED_42 = [
  false,
  true,
  false,
  false,
  true,
  false,
  true,
  false,
  false,
  true,
  true,
  false,
] as const;

const EXPECTED_PICK_SEQUENCE = ["b", "b", "c", "c", "a", "b", "a", "b"] as const;
const EXPECTED_SHUFFLED_NUMBERS = [1, 8, 4, 6, 3, 2, 9, 10, 5, 7] as const;
const EXPECTED_STATE_AFTER_100_ADVANCES = -1527012386;
const EXPECTED_RESTORED_FUTURE = [
  0.8219508074689656,
  0.12997928191907704,
  0.9727464164607227,
  0.17839484568685293,
  0.7094296528957784,
] as const;

function collectNext(rng: SeededRandom, count: number): number[] {
  return Array.from({ length: count }, () => rng.next());
}

function collectInts(rng: SeededRandom, count: number, min: number, max: number): number[] {
  return Array.from({ length: count }, () => rng.int(min, max));
}

describe("SeededRandom", () => {
  describe("determinism", () => {
    it("given the same seed, when next() is called repeatedly, then both generators return the same exact sequence", () => {
      const rng1 = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const rng2 = new SeededRandom(DETERMINISTIC_SEEDS.primary);

      const seq1 = collectNext(rng1, EXPECTED_NEXT_VALUES_FOR_SEED_42.length);
      const seq2 = collectNext(rng2, EXPECTED_NEXT_VALUES_FOR_SEED_42.length);

      expect(seq1).toEqual(EXPECTED_NEXT_VALUES_FOR_SEED_42);
      expect(seq2).toEqual(EXPECTED_NEXT_VALUES_FOR_SEED_42);
    });

    it("given different seeds, when next() is called repeatedly, then each generator returns its own exact sequence", () => {
      const rng1 = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const rng2 = new SeededRandom(DETERMINISTIC_SEEDS.alternate);

      const seq1 = collectNext(rng1, EXPECTED_NEXT_VALUES_FOR_SEED_42.length);
      const seq2 = collectNext(rng2, EXPECTED_NEXT_VALUES_FOR_SEED_43.length);

      expect(seq1).toEqual(EXPECTED_NEXT_VALUES_FOR_SEED_42);
      expect(seq2).toEqual(EXPECTED_NEXT_VALUES_FOR_SEED_43);
      expect(seq1).not.toEqual(seq2);
    });
  });

  describe("next()", () => {
    it("given seed 12345, when next() is called five times, then it returns the exact documented contract values in [0, 1)", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.nextContract);

      const values = collectNext(rng, EXPECTED_NEXT_VALUES_FOR_SEED_12345.length);

      expect(values).toEqual(EXPECTED_NEXT_VALUES_FOR_SEED_12345);
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });

  describe("int()", () => {
    it("given seed 99, when int(1, 6) is called repeatedly, then it returns the exact inclusive die-roll sequence", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.diceContract);

      const rolls = collectInts(rng, EXPECTED_INT_ROLLS_FOR_SEED_99.length, 1, 6);

      expect(rolls).toEqual(EXPECTED_INT_ROLLS_FOR_SEED_99);
    });

    it("given seed 1, when int(0, 1) is called repeatedly, then the exact binary sequence includes both min and max", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.binaryContract);

      const values = collectInts(rng, EXPECTED_BINARY_ROLLS_FOR_SEED_1.length, 0, 1);

      expect(values).toEqual(EXPECTED_BINARY_ROLLS_FOR_SEED_1);
      expect(new Set(values)).toEqual(new Set([0, 1]));
    });
  });

  describe("chance()", () => {
    it("given seed 42, when chance(0.5) is called repeatedly, then it returns the exact boolean sequence implied by next()", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);

      const values = Array.from({ length: EXPECTED_CHANCE_RESULTS_FOR_SEED_42.length }, () =>
        rng.chance(0.5),
      );

      expect(values).toEqual(EXPECTED_CHANCE_RESULTS_FOR_SEED_42);
    });

    it("chance(0) always returns false", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(0)).toBe(false);
      }
    });

    it("chance(1) always returns true", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(1)).toBe(true);
      }
    });
  });

  describe("pick()", () => {
    it("given seed 42, when picking from a three-element array, then it returns the exact deterministic pick sequence", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const values = ["a", "b", "c"] as const;

      const picks = Array.from({ length: EXPECTED_PICK_SEQUENCE.length }, () => rng.pick(values));

      expect(picks).toEqual(EXPECTED_PICK_SEQUENCE);
    });

    it("given seed 42, when picking from a three-element array enough times, then every source element appears in the observed sequence", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const values = [1, 2, 3] as const;

      const picks = Array.from({ length: EXPECTED_PICK_SEQUENCE.length }, () => rng.pick(values));

      expect(new Set(picks)).toEqual(new Set(values));
    });
  });

  describe("shuffle()", () => {
    it("given seed 42, when shuffle() is called, then it returns the exact deterministic Fisher-Yates permutation", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
      const shuffled = rng.shuffle(arr);

      expect(shuffled).toEqual(EXPECTED_SHUFFLED_NUMBERS);
    });

    it("given an input array, when shuffle() is called, then it does not mutate the original array", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const arr = [1, 2, 3, 4, 5] as const;
      const original = [...arr];
      rng.shuffle(arr);
      expect(arr).toEqual(original);
    });

    it("given the same seed, when shuffle() is called twice with the same input, then both shuffles match the exact expected permutation", () => {
      const rng1 = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const rng2 = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

      expect(rng1.shuffle(arr)).toEqual(EXPECTED_SHUFFLED_NUMBERS);
      expect(rng2.shuffle(arr)).toEqual(EXPECTED_SHUFFLED_NUMBERS);
    });
  });

  describe("serialization", () => {
    it("getState/setState roundtrip preserves sequence", () => {
      const rng = new SeededRandom(DETERMINISTIC_SEEDS.primary);
      // Advance state
      for (let i = 0; i < 100; i++) rng.next();

      const state = rng.getState();
      const future = collectNext(rng, EXPECTED_RESTORED_FUTURE.length);

      // Restore state
      const rng2 = new SeededRandom(DETERMINISTIC_SEEDS.restoreContract);
      rng2.setState(state);
      const future2 = collectNext(rng2, EXPECTED_RESTORED_FUTURE.length);

      expect(state).toBe(EXPECTED_STATE_AFTER_100_ADVANCES);
      expect(future).toEqual(EXPECTED_RESTORED_FUTURE);
      expect(future).toEqual(future2);
    });
  });
});
