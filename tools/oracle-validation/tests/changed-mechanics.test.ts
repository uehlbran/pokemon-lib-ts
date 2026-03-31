import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildImpactsReport,
  computeBaseRefCandidates,
  resolveBaseRefFromCandidates,
} from "../src/changed-mechanics.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("base ref resolution", () => {
  it("includes GitHub base branch fallbacks in candidate order", () => {
    const originalBaseRef = process.env.GITHUB_BASE_REF;
    process.env.GITHUB_BASE_REF = "feature-base";

    expect(computeBaseRefCandidates("origin/main")).toEqual([
      "origin/main",
      "origin/feature-base",
      "feature-base",
      "main",
    ]);

    process.env.GITHUB_BASE_REF = originalBaseRef;
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
  it("records the requested and resolved base refs in the impacts artifact", () => {
    const report = buildImpactsReport(repoRoot, {
      baseRef: "origin/main",
      mode: "test-preview",
    });

    expect(report.requestedBaseRef).toBe("origin/main");
    expect(report.resolvedBaseRef.length).toBeGreaterThan(0);
  });
});
