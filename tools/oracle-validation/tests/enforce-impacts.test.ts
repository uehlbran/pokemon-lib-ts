import { describe, expect, it } from "vitest";
import {
  evaluateImpactsEnforcement,
  touchedOwnershipKeysForValidation,
} from "../src/enforce-impacts.js";
import type { ImpactsReport, ProofCheck, ProofSummary } from "../src/proof-artifact-schema.js";

const knownSuites = new Set(["control-plane", "proof-preview", "workflow-contract"]);

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
    touchedClusters: [],
    requiredSuites: ["proof-preview"],
    lowConfidenceFiles: [],
    fileClassifications: [],
    ...overrides,
  };
}

function createProofSummary(overrides: Partial<ProofSummary> = {}): ProofSummary {
  return {
    schemaVersion: "proof-summary.v1",
    gitSha: "abc123",
    timestamp: "2026-03-31T00:00:00.000Z",
    runMode: "fast",
    suitesRequested: ["fast"],
    conclusion: "provisional-pass",
    generations: [],
    ...overrides,
  };
}

function createProofCheck(overrides: Partial<ProofCheck> = {}): ProofCheck {
  return {
    checkId: "gen5:mechanics:oracle:sample",
    generation: 5,
    suite: "mechanics",
    status: "pass",
    enforcement: "required",
    description: "sample",
    mechanicIds: [],
    authorityKeys: [],
    clusters: [],
    topologies: [],
    sourceRole: "authoritative",
    normalizationIds: [],
    ...overrides,
  };
}

describe("evaluateImpactsEnforcement", () => {
  it("includes propagated ownership keys in lineage validation input", () => {
    expect(
      touchedOwnershipKeysForValidation(
        createImpactsReport({
          directOwnershipKeys: ["battle:contract:damage-context"],
          transitiveOwnershipKeys: [
            "battle:contract:damage-context",
            "gen8:leaf-mechanic:ability-trigger-surface",
          ],
        }),
      ),
    ).toEqual(["battle:contract:damage-context", "gen8:leaf-mechanic:ability-trigger-surface"]);
  });

  it("passes when all required suites executed and no ambiguity exists", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport(),
      ["proof-preview"],
      knownSuites,
    );

    expect(result.errors).toEqual([]);
    expect(result.requiredSuites).toEqual(["proof-preview"]);
  });

  it("passes when proof-preview is satisfied by an artifact-backed suite", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport(),
      [],
      knownSuites,
      [],
      [],
      null,
      new Map([["proof-preview", "pass" as const]]),
    );

    expect(result.errors).toEqual([]);
  });

  it("fails when a required suite was not executed", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["proof-preview", "workflow-contract"] }),
      ["proof-preview"],
      knownSuites,
    );

    expect(result.errors).toContain(
      "Required suite workflow-contract was not executed for mode local-preview.",
    );
  });

  it("fails when an artifact-backed workflow contract suite does not pass", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["proof-preview", "workflow-contract"] }),
      [],
      knownSuites,
      [],
      [],
      null,
      new Map([
        ["proof-preview", "pass" as const],
        ["workflow-contract", "fail" as const],
      ]),
    );

    expect(result.errors).toContain(
      "Artifact-backed suite workflow-contract did not pass for mode local-preview.",
    );
  });

  it("passes when all artifact-backed required suites pass", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["proof-preview", "workflow-contract"] }),
      [],
      knownSuites,
      [],
      [],
      null,
      new Map([
        ["proof-preview", "pass" as const],
        ["workflow-contract", "pass" as const],
      ]),
    );

    expect(result.errors).toEqual([]);
  });

  it("fails on unknown required suite ids", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["unknown-suite"] }),
      ["proof-preview"],
      knownSuites,
    );

    expect(result.errors).toContain("Unknown required suite id in impacts.v1.json: unknown-suite");
  });

  it("fails on low-confidence mappings", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ lowConfidenceFiles: ["packages/battle/src/engine/BattleEngine.ts"] }),
      ["proof-preview"],
      knownSuites,
    );

    expect(result.errors).toContain(
      "Low-confidence ownership mapping detected: packages/battle/src/engine/BattleEngine.ts",
    );
  });

  it("fails when control-plane validation reports touched legacy mechanics", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport(),
      ["proof-preview"],
      knownSuites,
      [
        "Touched legacy mechanic shared.engine.turn-order is legacy-unproven and has no active bootstrap waiver.",
      ],
    );

    expect(result.errors).toContain(
      "Touched legacy mechanic shared.engine.turn-order is legacy-unproven and has no active bootstrap waiver.",
    );
  });

  it("fails when touched mechanics require oracle-fast evidence but artifacts are missing", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["oracle-fast"] }),
      ["oracle-fast"],
      new Set([...knownSuites, "oracle-fast"]),
      [],
      ["gen5.runtime.ruleset"],
      null,
    );

    expect(result.errors).toContain(
      "Missing oracle-fast proof artifacts for touched mechanics: gen5.runtime.ruleset",
    );
  });

  it("fails when oracle-fast artifacts do not include required proof checks for touched mechanics", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["oracle-fast"] }),
      ["oracle-fast"],
      new Set([...knownSuites, "oracle-fast"]),
      [],
      ["gen5.runtime.ruleset"],
      {
        summary: createProofSummary(),
        checks: [createProofCheck({ mechanicIds: ["gen4.runtime.ruleset"] })],
      },
    );

    expect(result.errors).toContain(
      "Touched mechanic gen5.runtime.ruleset has no required oracle-fast proof checks in checks.v1.jsonl.",
    );
  });

  it("fails when touched mechanics only have non-pass required oracle-fast checks", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["oracle-fast"] }),
      ["oracle-fast"],
      new Set([...knownSuites, "oracle-fast"]),
      [],
      ["gen5.runtime.ruleset"],
      {
        summary: createProofSummary({ conclusion: "interrupted" }),
        checks: [
          createProofCheck({
            mechanicIds: ["gen5.runtime.ruleset"],
            status: "deferred",
          }),
        ],
      },
    );

    expect(result.errors).toContain(
      "Touched mechanic gen5.runtime.ruleset has no required oracle-fast proof checks in checks.v1.jsonl.",
    );
  });

  it("passes when oracle-fast artifacts include required proof checks for touched mechanics", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["oracle-fast"] }),
      ["oracle-fast"],
      new Set([...knownSuites, "oracle-fast"]),
      [],
      ["gen5.runtime.ruleset"],
      {
        summary: createProofSummary(),
        checks: [createProofCheck({ mechanicIds: ["gen5.runtime.ruleset"] })],
      },
    );

    expect(result.errors).toEqual([]);
  });

  it("allows interrupted oracle-fast summaries when touched mechanics still have required evidence", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["oracle-fast"] }),
      ["oracle-fast"],
      new Set([...knownSuites, "oracle-fast"]),
      [],
      ["gen5.runtime.ruleset"],
      {
        summary: createProofSummary({ conclusion: "interrupted" }),
        checks: [createProofCheck({ mechanicIds: ["gen5.runtime.ruleset"] })],
      },
    );

    expect(result.errors).toEqual([]);
  });

  it("fails when oracle-fast proof summary conclusion is fail", () => {
    const result = evaluateImpactsEnforcement(
      createImpactsReport({ requiredSuites: ["oracle-fast"] }),
      ["oracle-fast"],
      new Set([...knownSuites, "oracle-fast"]),
      [],
      ["gen5.runtime.ruleset"],
      {
        summary: createProofSummary({ conclusion: "fail" }),
        checks: [createProofCheck({ mechanicIds: ["gen5.runtime.ruleset"] })],
      },
    );

    expect(result.errors).toContain(
      "oracle-fast proof summary conclusion must not be fail, received fail.",
    );
  });
});
