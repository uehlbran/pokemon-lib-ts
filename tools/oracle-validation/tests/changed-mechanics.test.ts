import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildImpactsReport,
  computeBaseRefCandidates,
  isLowConfidenceClassification,
  listChangedFiles,
  resolveBaseRefFromCandidates,
} from "../src/changed-mechanics.js";
import { classifyRepoFile, loadControlPlane } from "../src/control-plane.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("base ref resolution", () => {
  it("includes GitHub base branch fallbacks in candidate order", () => {
    const originalBaseRef = process.env.GITHUB_BASE_REF;
    try {
      process.env.GITHUB_BASE_REF = "feature-base";

      expect(computeBaseRefCandidates("origin/main")).toEqual([
        "origin/main",
        "origin/feature-base",
        "feature-base",
        "main",
      ]);
    } finally {
      if (originalBaseRef === undefined) {
        delete process.env.GITHUB_BASE_REF;
      } else {
        process.env.GITHUB_BASE_REF = originalBaseRef;
      }
    }
  });

  it("falls back to the first available candidate when the requested ref is unavailable", () => {
    const resolution = resolveBaseRefFromCandidates(
      "origin/main",
      ["origin/main", "origin/feature-base", "main"],
      (candidate) => candidate === "main",
    );

    expect(resolution).toEqual({
      requestedBaseRef: "origin/main",
      resolvedBaseRef: "main",
      usedFallbackBaseRef: true,
    });
  });
});

describe("buildImpactsReport", () => {
  it("includes deleted files in every tracked diff invocation", () => {
    const calls: string[][] = [];

    listChangedFiles(repoRoot, "origin/main", (_repoRoot, ...args) => {
      calls.push(args);
      return "";
    });

    expect(calls).toEqual([
      ["diff", "--name-only", "--diff-filter=ACDMRTUXB", "origin/main...HEAD"],
      ["diff", "--name-only", "--cached", "--diff-filter=ACDMRTUXB"],
      ["diff", "--name-only", "--diff-filter=ACDMRTUXB"],
      ["ls-files", "--others", "--exclude-standard"],
    ]);
  });

  it("records the requested and resolved base refs in the impacts artifact", () => {
    const report = buildImpactsReport(repoRoot, {
      baseRef: "HEAD",
      mode: "test-preview",
    });

    expect(report.requestedBaseRef).toBe("HEAD");
    expect(report.resolvedBaseRef).toBe("HEAD");
    expect(report.usedFallbackBaseRef).toBe(false);
  });

  it("does not flag explicitly shared ownership files as low-confidence", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, "packages/battle/src/context/types.ts");

    expect(classification.ownershipKeys).toEqual([
      "battle:contract:ability-context-result",
      "battle:contract:damage-context",
      "battle:contract:field-effect-results",
      "battle:contract:hit-check-contexts",
      "battle:contract:item-context-result",
      "battle:contract:move-effect-context",
      "battle:contract:move-effect-result",
    ]);
    expect(isLowConfidenceClassification(classification)).toBe(false);
  });
});
