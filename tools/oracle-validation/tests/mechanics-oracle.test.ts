import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runMechanicsSuite } from "../src/compare-mechanics.js";
import { loadDisagreementRegistrySummary } from "../src/disagreement-registry.js";
import { discoverImplementedGenerations } from "../src/gen-discovery.js";

describe("Mechanics Oracle Suite", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const generations = discoverImplementedGenerations(repoRoot);

  it("discovers at least one implemented generation", () => {
    expect(generations.length).toBeGreaterThanOrEqual(1);
  });

  for (const gen of generations) {
    it(`Gen ${gen.gen}: mechanics suite passes with 0 unregistered failures`, () => {
      const { knownDisagreements } = loadDisagreementRegistrySummary(gen, repoRoot);
      const result = runMechanicsSuite(gen, knownDisagreements);

      // Suite must not have any unregistered failures
      expect(
        result.failures,
        `Gen ${gen.gen} mechanics failures:\n${result.failures.join("\n")}`,
      ).toHaveLength(0);

      // Suite must have run scenarios (status "skip" means no scenarios ran at all)
      expect(
        result.status,
        `Gen ${gen.gen}: expected suite to run scenarios, got status "skip"`,
      ).not.toBe("skip");
    });
  }
});
