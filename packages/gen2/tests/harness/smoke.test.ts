import { describe, expect, it } from "vitest";
import { runBatch } from "../../../../tools/replay-parser/src/simulation/index.js";

describe("Gen 2 Battle Simulation Harness", () => {
  it("should complete 200 random battles with no invariant violations", {
    timeout: 120_000,
  }, () => {
    const report = runBatch({ generation: 2, seed: 42, teamSize: 3, maxTurns: 500 }, 200);

    expect(report.crashed, `${report.crashed} battles crashed`).toBe(0);
    expect(report.violations.length, formatViolations(report.violations)).toBe(0);
    expect(report.timedOut, `${report.timedOut} battles timed out`).toBe(0);
    expect(report.completed).toBe(200);
  });
});

function formatViolations(
  violations: Array<{ invariant: string; message: string; turnNumber: number | null }>,
): string {
  if (violations.length === 0) return "no violations";
  const sample = violations.slice(0, 5);
  return `${violations.length} violations: ${sample.map((v) => `[${v.invariant}] ${v.message}`).join("; ")}`;
}
