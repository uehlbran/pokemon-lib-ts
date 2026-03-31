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

  it("given Gen 2, when running the ground-truth suite, then all authority-backed cases pass", () => {
    const gen2 = discoverImplementedGenerations(repoRoot).find(
      (generation) => generation.gen === 2,
    );
    const result = runGroundTruthSuite(gen2!, repoRoot);

    expect(result).toMatchObject({
      status: "pass",
      suitePassed: true,
      failed: 0,
      failures: [],
    });
    expect(result.notes).toContain("Authority: pret/pokecrystal");
  });

  it("given Gen 3, when running the ground-truth suite, then all authority-backed cases pass", () => {
    const gen3 = discoverImplementedGenerations(repoRoot).find(
      (generation) => generation.gen === 3,
    );
    const result = runGroundTruthSuite(gen3!, repoRoot);

    expect(result).toMatchObject({
      status: "pass",
      suitePassed: true,
      failed: 0,
      failures: [],
    });
    expect(result.notes).toContain("Authority: pret/pokeemerald");
  });

  it("given Gen 4 with an abilityCheck case (iron-fist), when running the suite, then flag check passes and expectedBoost is explicitly deferred", () => {
    // The abilityCheck evaluator validates move flags but cannot validate the damage boost
    // multiplier without running the battle engine. The expectedBoost must be deferred and
    // NOT silently counted as evaluated. This test verifies that the deferred note is emitted.
    const gen4 = discoverImplementedGenerations(repoRoot).find(
      (generation) => generation.gen === 4,
    );
    const result = runGroundTruthSuite(gen4!, repoRoot);

    // The flag check itself should still pass
    expect(result).toMatchObject({
      status: "pass",
      suitePassed: true,
      failed: 0,
    });

    // The expectedBoost portion must be explicitly deferred — not silently counted as evaluated
    const deferredNote = result.notes.find(
      (n) => n.includes("iron-fist-punch-boost") && n.includes("expectedBoost"),
    );
    expect(deferredNote).toBeDefined();
  });
});

describe("loadGroundTruthDataset", () => {
  it("given the Gen 1 dataset, when loading it, then it exposes the expected authority and case count", () => {
    const dataset = loadGroundTruthDataset(repoRoot);

    expect(dataset.authority).toBe("pret/pokered");
    expect(dataset.cases).toHaveLength(14); // updated: 4 movePriorityCheck cases added in fix/gen1-move-priorities (issue #1116)
  });
});
