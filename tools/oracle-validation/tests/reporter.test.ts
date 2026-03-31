import { describe, expect, it } from "vitest";
import { formatRunnerOutput } from "../src/reporter.js";

describe("formatRunnerOutput", () => {
  it("formats proof summary output with suite counts", () => {
    const output = formatRunnerOutput({
      schemaVersion: "proof-summary.v1",
      gitSha: "abc123",
      runMode: "fast",
      conclusion: "provisional-pass",
      timestamp: "2026-03-27T12:34:56.000Z",
      suitesRequested: ["data"],
      generations: [
        {
          gen: 1,
          packageName: "@pokemon-lib-ts/gen1",
          conclusion: "provisional-pass",
          suites: {
            data: {
              status: "pass",
              suite: "data",
              enforcement: "required",
              requiredCounts: {
                executed: 2,
                passed: 2,
                failed: 0,
                skipped: 0,
                incomplete: 0,
                deferred: 0,
                advisory: 0,
                interrupted: 0,
              },
              advisoryCounts: {
                executed: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                incomplete: 0,
                deferred: 0,
                advisory: 0,
                interrupted: 0,
              },
              failures: [],
              notes: [],
              matchedKnownDisagreements: ["cartridge-priority"],
              staleDisagreements: [],
              checkIds: ["gen1:data:oracle:cartridge-priority"],
            },
          },
        },
      ],
    });

    expect(output).toContain("Mode: fast");
    expect(output).toContain("Gen 1 (@pokemon-lib-ts/gen1) — provisional-pass");
    expect(output).toContain("data: pass (required, required=2, advisory=0)");
    expect(output).toContain("    known-disagreement: cartridge-priority");
  });
});
