import { describe, expect, it } from "vitest";
import { evaluateImpactsEnforcement } from "../src/enforce-impacts.js";
import type { ImpactsReport } from "../src/proof-artifact-schema.js";

function createImpactsReport(overrides: Partial<ImpactsReport> = {}): ImpactsReport {
  return {
    schemaVersion: "impacts.v1",
    gitSha: "abc123",
    timestamp: "2026-03-31T00:00:00.000Z",
    mode: "local-preview",
    requestedBaseRef: "origin/main",
    resolvedBaseRef: "origin/main",
    usedFallbackBaseRef: false,
    changedFiles: [],
    unmappedRuntimeOwningFiles: [],
    directOwnershipKeys: [],
    transitiveOwnershipKeys: [],
    directMechanicIds: [],
    transitiveMechanicIds: [],
    touchedAuthorityKeys: [],
    requiredSuites: ["proof-preview"],
    lowConfidenceFiles: [],
    fileClassifications: [],
    ...overrides,
  };
}

describe("evaluateImpactsEnforcement", () => {
  it("passes when all required suites executed and no ambiguity exists", () => {
    const result = evaluateImpactsEnforcement(createImpactsReport(), ["proof-preview"]);

    expect(result.errors).toEqual([]);
    expect(result.requiredSuites).toEqual(["proof-preview"]);
  });

  it("fails when a required suite was not executed", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["proof-preview", "workflow-contract"] }),
      ["proof-preview"],
    );

    expect(result.errors).toContain(
      "Required suite workflow-contract was not executed for mode local-preview.",
    );
  });

  it("fails on unknown required suite ids", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["unknown-suite"] }),
      ["proof-preview"],
    );

    expect(result.errors).toContain("Unknown required suite id in impacts.v1.json: unknown-suite");
  });

  it("fails on low-confidence mappings", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ lowConfidenceFiles: ["packages/battle/src/engine/BattleEngine.ts"] }),
      ["proof-preview"],
    );

    expect(result.errors).toContain(
      "Low-confidence ownership mapping detected: packages/battle/src/engine/BattleEngine.ts",
    );
  });
});
