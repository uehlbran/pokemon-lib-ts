import { describe, expect, it, vi } from "vitest";
import { runBatch, runBattle } from "../../src/simulation/battle-runner.js";
import type { BattleRunConfig } from "../../src/simulation/types.js";

// ---------------------------------------------------------------------------
// Shared base config — small teams, short max turns for fast tests
// ---------------------------------------------------------------------------

const BASE_CONFIG: BattleRunConfig = {
  generation: 1,
  seed: 42,
  teamSize: 1,
  maxTurns: 50,
};

// ---------------------------------------------------------------------------
// Single battle — basic smoke tests
// ---------------------------------------------------------------------------

describe("runBattle — Gen 1 smoke test", () => {
  it("given a valid Gen 1 config, when running a battle, then it completes without crashing", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 1 };

    // Act
    const report = runBattle(config);

    // Assert
    expect(report.error).toBeNull();
  });

  it("given a Gen 1 config, when running a battle, then the report generation matches the config", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, generation: 1, seed: 2 };

    // Act
    const report = runBattle(config);

    // Assert
    expect(report.generation).toBe(1);
  });

  it("given a config with seed 99, when running a battle, then the report seed matches", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 99 };

    // Act
    const report = runBattle(config);

    // Assert
    expect(report.seed).toBe(99);
  });
});

describe("runBattle — battle outcome", () => {
  it("given a completed battle, when battle ends, then winner is 0, 1, or null", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 10 };

    // Act
    const report = runBattle(config);

    // Assert — winner must be 0, 1, or null (draw/timeout)
    expect([0, 1, null]).toContain(report.winner);
  });

  it("given a completed battle without error, when checking events, then events array is non-empty", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 20 };

    // Act
    const report = runBattle(config);

    // Assert
    if (!report.error) {
      expect(report.events.length).toBeGreaterThan(0);
    }
  });

  it("given a successful battle, when checking the error field, then error is null", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 30 };

    // Act
    const report = runBattle(config);

    // Assert
    expect(report.error).toBeNull();
  });
});

describe("runBattle — timeout", () => {
  it("given maxTurns: 0, when the battle is run with 0 max turns, then timedOut is true", () => {
    // Arrange — 0 turns guarantees timeout regardless of teams or damage rolls.
    // Using maxTurns: 0 (not 1) ensures this test is deterministic after any
    // engine mechanics change that could KO on the first turn.
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 5, maxTurns: 0 };

    // Act
    const report = runBattle(config);

    // Assert
    expect(report.timedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("runBattle — determinism", () => {
  it("given the same config, when running two battles, then both produce the same winner", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 77 };

    // Act
    const report1 = runBattle(config);
    const report2 = runBattle(config);

    // Assert
    expect(report1.winner).toBe(report2.winner);
  });
});

// ---------------------------------------------------------------------------
// Gen 2 smoke test
// ---------------------------------------------------------------------------

describe("runBattle — Gen 2 smoke test", () => {
  it("given a valid Gen 2 config, when running a battle, then it completes without crashing", () => {
    // Arrange
    const config: BattleRunConfig = {
      generation: 2,
      seed: 42,
      teamSize: 1,
      maxTurns: 50,
    };

    // Act
    const report = runBattle(config);

    // Assert
    expect(report.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Batch battles
// ---------------------------------------------------------------------------

describe("runBatch — battle count", () => {
  it("given count: 5, when running a batch, then totalBattles is 5", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 100 };

    // Act
    const batch = runBatch(config, 5);

    // Assert
    expect(batch.totalBattles).toBe(5);
  });

  it("given count: 3 with valid config, when running a batch, then completed equals 3", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 200, maxTurns: 100 };

    // Act
    const batch = runBatch(config, 3);

    // Assert — no crashes expected with valid config
    expect(batch.completed).toBe(3);
  });
});

describe("runBatch — progress callback", () => {
  it("given count: 4 and an onProgress callback, when running a batch, then callback is called 4 times", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 300 };
    const onProgress = vi.fn();

    // Act
    runBatch(config, 4, onProgress);

    // Assert
    expect(onProgress).toHaveBeenCalledTimes(4);
  });

  it("given count: 3 and an onProgress callback, when running a batch, then callback receives sequential indices 0, 1, 2", () => {
    // Arrange
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 400 };
    const indices: number[] = [];
    const onProgress = (i: number) => {
      indices.push(i);
    };

    // Act
    runBatch(config, 3, onProgress);

    // Assert
    expect(indices).toEqual([0, 1, 2]);
  });
});
