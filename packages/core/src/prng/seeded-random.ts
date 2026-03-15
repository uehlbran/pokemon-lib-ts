/**
 * Mulberry32 seeded PRNG. Deterministic: same seed = same sequence.
 * Used throughout the battle engine for reproducible simulations.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns true with the given probability (0 to 1) */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Picks a random element from an array */
  pick<T>(array: readonly T[]): T {
    return array[Math.floor(this.next() * array.length)] as T;
  }

  /** Returns a new shuffled copy of the array (Fisher-Yates) */
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j] as T, result[i] as T];
    }
    return result;
  }

  /** Get current PRNG state for serialization */
  getState(): number {
    return this.state;
  }

  /** Restore PRNG state from serialization */
  setState(state: number): void {
    this.state = state | 0;
  }
}
