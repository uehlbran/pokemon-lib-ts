/**
 * Mulberry32 seeded PRNG. Deterministic: same seed = same sequence.
 * Used throughout the battle engine for reproducible simulations.
 */
export class SeededRandom {
  private state: number;

  /**
   * Creates a new `SeededRandom` instance.
   *
   * @param seed - 32-bit integer seed. Same seed always produces the same sequence.
   *   Use a fixed seed in tests; use a timestamp or random value for live battles.
   */
  constructor(seed: number) {
    this.state = seed | 0;
  }

  /**
   * Advances the PRNG state and returns the next pseudorandom float.
   *
   * @returns A float in `[0, 1)` (includes 0, excludes 1).
   */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a pseudorandom integer in the inclusive range `[min, max]`.
   *
   * @param min - Lower bound (inclusive).
   * @param max - Upper bound (inclusive). Must be ≥ `min`.
   * @returns A random integer `n` where `min <= n <= max`.
   */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns `true` with the given probability. Convenience wrapper around `next()`.
   *
   * @param probability - Probability in `[0, 1]`. `0` always returns `false`; `1` always returns `true`.
   * @returns `true` with frequency equal to `probability`.
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Returns a uniformly random element from a non-empty array.
   *
   * @param array - The array to pick from.
   * @returns A randomly selected element.
   * @throws If `array` is empty (undefined access — validate length before calling).
   */
  pick<T>(array: readonly T[]): T {
    return array[Math.floor(this.next() * array.length)] as T;
  }

  /**
   * Returns a new array containing the same elements in a randomly shuffled order.
   * Uses the Fisher-Yates algorithm. Does NOT mutate the original array.
   *
   * @param array - The array to shuffle.
   * @returns A new array with the same elements in a random order.
   */
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j] as T, result[i] as T];
    }
    return result;
  }

  /**
   * Returns the current internal PRNG state as a 32-bit integer.
   * Use together with `setState()` to checkpoint and restore the PRNG
   * for deterministic replay or branching simulations.
   *
   * @returns The current state value.
   */
  getState(): number {
    return this.state;
  }

  /**
   * Restores the PRNG to a previously captured state.
   * After calling this, the generator produces the same sequence as it did
   * immediately after the state was captured with `getState()`.
   *
   * @param state - A value previously returned by `getState()`.
   */
  setState(state: number): void {
    this.state = state | 0;
  }
}
