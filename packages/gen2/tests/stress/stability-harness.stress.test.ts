import { describe, expect, it } from "vitest";
import { runBatch } from "../../../../tools/replay-parser/src/simulation/index.js";

// Source: this harness intentionally runs 50 deterministic battles per batch to keep the
// stress slice fast enough for CI while still exercising multiple seeded full-battle traces.
const BATCH_SIZE = 50;

describe("Gen 2 Battle Simulation Harness", () => {
  it("given 50 seeded Gen 2 random battles, when runBatch executes, then no invariants are violated", {
    timeout: 30_000,
  }, () => {
    const report = runBatch({ generation: 2, seed: 42, teamSize: 3, maxTurns: 500 }, BATCH_SIZE);

    expect(report.crashed, `${report.crashed} battles crashed`).toBe(0);
    expect(report.violations.length, formatViolations(report.violations)).toBe(0);
    expect(report.timedOut, `${report.timedOut} battles timed out`).toBe(0);
    expect(report.completed).toBe(BATCH_SIZE);
  });
});

function formatViolations(
  violations: Array<{ invariant: string; message: string; turnNumber: number | null }>,
): string {
  if (violations.length === 0) return "no violations";
  const sample = violations.slice(0, 5);
  return `${violations.length} violations: ${sample.map((v) => `[${v.invariant}] ${v.message}`).join("; ")}`;
}
