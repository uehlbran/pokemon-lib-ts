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

function normalizeReport(report: ReturnType<typeof runBattle>) {
  const { durationMs, ...stableFields } = report;
  return stableFields;
}

// ---------------------------------------------------------------------------
// Single battle — basic smoke tests
// ---------------------------------------------------------------------------

describe("runBattle — Gen 1 smoke test", () => {
  it("given a valid Gen 1 config, when running a battle, then it completes without crashing", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 1 };

    const report = runBattle(config);

    expect(report.seed).toBe(1);
    expect(report.generation).toBe(1);
    expect(report.error).toBeNull();
    expect(report.timedOut).toBe(false);
    expect(report.events[0]?.type).toBe("battle-start");
    expect(report.events.at(-1)?.type).toBe("battle-end");
    expect(report.turnCount).toBe(report.events.filter((event) => event.type === "turn-start").length);
  });

  it("given a Gen 1 config, when running a battle, then the report generation matches the config", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, generation: 1, seed: 2 };

    const report = runBattle(config);

    expect(report.seed).toBe(2);
    expect(report.generation).toBe(1);
    expect(report.error).toBeNull();
    expect(report.timedOut).toBe(false);
    expect(report.events[0]?.type).toBe("battle-start");
    expect(report.events.at(-1)?.type).toBe("battle-end");
    expect(report.turnCount).toBe(report.events.filter((event) => event.type === "turn-start").length);
  });

  it("given a config with seed 99, when running a battle, then the report seed matches", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 99 };

    const report = runBattle(config);

    // Source: deterministic replay-parser regression seed for this Gen 1 case.
    expect(report.seed).toBe(99);
    expect(report.generation).toBe(1);
    expect(report.error).toBeNull();
    expect(report.timedOut).toBe(false);
    expect(report.events[0]?.type).toBe("battle-start");
    expect(report.events.at(-1)?.type).toBe("battle-end");
    expect(report.turnCount).toBe(report.events.filter((event) => event.type === "turn-start").length);
  });
});

describe("runBattle — timeout", () => {
  it("given maxTurns: 0, when the battle is run with 0 max turns, then timedOut is true", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 5, maxTurns: 0 };

    const report = runBattle(config);

    expect(report.error).toBeNull();
    expect(report.timedOut).toBe(true);
    expect(report.turnCount).toBe(0);
    expect(report.winner).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("runBattle — determinism", () => {
  it("given the same config, when running two battles, then the stable report fields are identical", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 77 };

    const report1 = normalizeReport(runBattle(config));
    const report2 = normalizeReport(runBattle(config));

    expect(report1).toEqual(report2);
  });
});

// ---------------------------------------------------------------------------
// Gen 2 smoke test
// ---------------------------------------------------------------------------

describe("runBattle — Gen 2 smoke test", () => {
  it("given a valid Gen 2 config, when running a battle, then it completes without crashing", () => {
    const config: BattleRunConfig = {
      generation: 2,
      seed: 42,
      teamSize: 1,
      maxTurns: 50,
    };

    const report = runBattle(config);

    // Source: deterministic replay-parser regression seed for this Gen 2 case.
    expect(report.seed).toBe(42);
    expect(report.generation).toBe(2);
    expect(report.error).toBeNull();
    expect(report.timedOut).toBe(false);
    expect(report.events[0]?.type).toBe("battle-start");
    expect(report.events.at(-1)?.type).toBe("battle-end");
    expect(report.turnCount).toBe(report.events.filter((event) => event.type === "turn-start").length);
  });
});

// ---------------------------------------------------------------------------
// Batch battles
// ---------------------------------------------------------------------------

describe("runBatch — battle count", () => {
  it("given count: 5, when running a batch, then totalBattles is 5", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 100 };
    const count = 5;
    // Explicit batch size for this test case.

    const batch = runBatch(config, count);

    expect(batch.config).toEqual(config);
    expect(batch.totalBattles).toBe(count);
    expect(batch.completed).toBe(count);
    expect(batch.crashed).toBe(0);
  });

  it("given count: 3 with valid config, when running a batch, then completed equals 3", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 200, maxTurns: 100 };
    const count = 3;
    // Explicit batch size for this test case.

    const batch = runBatch(config, count);

    expect(batch.config).toEqual(config);
    expect(batch.completed).toBe(count);
    expect(batch.totalBattles).toBe(count);
    expect(batch.crashed).toBe(0);
  });
});

describe("runBatch — progress callback", () => {
  it("given count: 4 and an onProgress callback, when running a batch, then callback is called 4 times", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 300 };
    const count = 4;
    const onProgress = vi.fn();

    runBatch(config, count, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(count);
    expect(onProgress.mock.calls.map(([i]) => i)).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(onProgress.mock.calls.map(([, report]) => report.seed)).toEqual(
      Array.from({ length: count }, (_, i) => config.seed + i),
    );
  });

  it("given count: 3 and an onProgress callback, when running a batch, then callback receives sequential indices 0, 1, 2", () => {
    const config: BattleRunConfig = { ...BASE_CONFIG, seed: 400 };
    const count = 3;
    const indices: number[] = [];
    const onProgress = (i: number) => {
      indices.push(i);
    };

    runBatch(config, count, onProgress);

    expect(indices).toEqual(Array.from({ length: count }, (_, i) => i));
  });
});
