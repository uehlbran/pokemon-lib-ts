import { describe, expect, it } from "vitest";
import { buildProofSummary, summarizeSuite } from "../src/proof-runner-output.js";

describe("buildProofSummary", () => {
  it("preserves legacy pass suites that do not emit proof checks yet", () => {
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
    expect(suite.status).toBe("pass");
    expect(summary.conclusion).toBe("provisional-pass");
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

  it("still marks required suites incomplete when only advisory checks executed", () => {
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
              matchedKnownDisagreements: ["gen1:data:move:foo"],
              staleDisagreements: [],
              oracleChecks: [
                {
                  id: "gen1:data:move:foo",
                  suite: "data",
                  description: "Known disagreement",
                  ourValue: "a",
                  oracleValue: "b",
                },
              ],
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
    expect(suite.status).toBe("advisory");
    expect(summary.conclusion).toBe("provisional-pass");
  });

  it("surfaces deferred required checks at the suite level", () => {
    const suite = summarizeSuite(
      "mechanics",
      {
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
      [
        {
          checkId: "gen5:mechanics:oracle:expected-boost",
          generation: 5,
          suite: "mechanics",
          status: "deferred",
          enforcement: "required",
          description: "Expected boost requires engine-backed validation",
          sourceRole: "authoritative",
          normalizationIds: [],
        },
      ],
    );

    expect(suite.status).toBe("deferred");
    expect(suite.requiredCounts.deferred).toBe(1);
    expect(suite.requiredCounts.executed).toBe(1);
  });
});
