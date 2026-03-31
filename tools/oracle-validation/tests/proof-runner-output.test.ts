import { describe, expect, it } from "vitest";
import { buildProofSummary } from "../src/proof-runner-output.js";

describe("buildProofSummary", () => {
  it("marks required suites with zero executed checks as incomplete", () => {
    const { summary } = buildProofSummary(
      "abc123",
      ["fast"],
      [
        {
          gen: 1,
          packageName: "@pokemon-lib-ts/gen1",
          suites: {
            data: {
              status: "pass",
              suitePassed: true,
              failed: 0,
              skipped: 0,
              failures: [],
              notes: [],
              matchedKnownDisagreements: [],
              staleDisagreements: [],
              oracleChecks: [],
            },
          },
          registry: {
            knownDisagreements: [],
            knownOracleBugs: [],
          },
          staleDisagreements: [],
        },
      ],
    );

    const generation = summary.generations[0];
    expect(generation).toBeDefined();
    if (!generation) {
      throw new Error("Expected a generation summary");
    }
    const suite = generation.suites.data;
    expect(suite).toBeDefined();
    if (!suite) {
      throw new Error("Expected a data suite summary");
    }
    expect(suite.status).toBe("incomplete");
    expect(summary.conclusion).toBe("interrupted");
  });

  it("treats advisory suites as advisory when they have no executable checks", () => {
    const { summary } = buildProofSummary(
      "abc123",
      ["all"],
      [
        {
          gen: 8,
          packageName: "@pokemon-lib-ts/gen8",
          suites: {
            stats: {
              status: "pass",
              suitePassed: true,
              failed: 0,
              skipped: 0,
              failures: [],
              notes: [],
              matchedKnownDisagreements: [],
              staleDisagreements: [],
              oracleChecks: [],
            },
          },
          registry: {
            knownDisagreements: [],
            knownOracleBugs: [],
          },
          staleDisagreements: [],
        },
      ],
    );

    const generation = summary.generations[0];
    expect(generation).toBeDefined();
    if (!generation) {
      throw new Error("Expected a generation summary");
    }
    const suite = generation.suites.stats;
    expect(suite).toBeDefined();
    if (!suite) {
      throw new Error("Expected a stats suite summary");
    }
    expect(suite.status).toBe("advisory");
  });
});
