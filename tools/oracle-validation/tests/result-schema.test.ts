import { describe, expect, it } from "vitest";

import { generationResultSchema, suiteResultSchema } from "../src/result-schema.js";

describe("suiteResultSchema", () => {
  it("rejects skipReason on pass results", () => {
    const parsed = suiteResultSchema.safeParse({
      status: "pass",
      suitePassed: true,
      failed: 0,
      skipped: 0,
      failures: [],
      skipReason: "not actually skipped",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects skipReason on fail results", () => {
    const parsed = suiteResultSchema.safeParse({
      status: "fail",
      suitePassed: false,
      failed: 1,
      skipped: 0,
      failures: ["mismatch"],
      skipReason: "should not be present",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts skipReason on skip results", () => {
    const parsed = suiteResultSchema.safeParse({
      status: "skip",
      suitePassed: false,
      failed: 0,
      skipped: 1,
      failures: [],
      skipReason: "oracle unavailable",
    });

    expect(parsed.success).toBe(true);
  });
});

describe("generationResultSchema", () => {
  it("requires disagreement registry metadata", () => {
    const parsed = generationResultSchema.safeParse({
      gen: 1,
      packageName: "@pokemon-lib-ts/gen1",
      suites: {
        data: {
          status: "pass",
          suitePassed: true,
          failed: 0,
          skipped: 0,
          failures: [],
          matchedKnownDisagreements: [],
          staleDisagreements: [],
          oracleChecks: [],
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts disagreement registry metadata", () => {
    const parsed = generationResultSchema.safeParse({
      gen: 1,
      packageName: "@pokemon-lib-ts/gen1",
      suites: {
        data: {
          status: "pass",
          suitePassed: true,
          failed: 0,
          skipped: 0,
          failures: [],
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
    });

    expect(parsed.success).toBe(true);
  });
});
