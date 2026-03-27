import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadGroundTruthDataset, runGroundTruthSuite } from "../src/compare-ground-truth.js";
import { discoverImplementedGenerations } from "../src/gen-discovery.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("runGroundTruthSuite", () => {
  it("given Gen 1, when running the first ground-truth suite, then all authority-backed cases pass", () => {
    const gen1 = discoverImplementedGenerations(repoRoot).find(
      (generation) => generation.gen === 1,
    );
    expect(gen1).toBeDefined();

    const result = runGroundTruthSuite(gen1!, repoRoot);

    expect(result).toMatchObject({
      status: "pass",
      suitePassed: true,
      failed: 0,
      skipped: 0,
      failures: [],
    });
    expect(result.notes).toContain("Authority: pret/pokered");
  });

  it("given Gen 2, when running the first ground-truth suite, then the suite is explicitly skipped", () => {
    const gen2 = discoverImplementedGenerations(repoRoot).find(
      (generation) => generation.gen === 2,
    );
    expect(gen2).toBeDefined();

    const result = runGroundTruthSuite(gen2!, repoRoot);

    expect(result).toEqual({
      status: "skip",
      suitePassed: false,
      failed: 0,
      skipped: 1,
      failures: [],
      notes: [],
      skipReason: "Ground-truth dataset only implemented for Gen 1 in the initial oracle slice",
    });
  });
});

describe("loadGroundTruthDataset", () => {
  it("given the Gen 1 dataset, when loading it, then it exposes the expected authority and case count", () => {
    const dataset = loadGroundTruthDataset(repoRoot);

    expect(dataset.authority).toBe("pret/pokered");
    expect(dataset.cases).toHaveLength(10);
  });
});
