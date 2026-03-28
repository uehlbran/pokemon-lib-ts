import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runDamageSuite } from "../src/compare-damage.js";
import { loadDisagreementRegistrySummary } from "../src/disagreement-registry.js";
import { discoverImplementedGenerations } from "../src/gen-discovery.js";

describe("Damage Oracle Suite", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const generations = discoverImplementedGenerations(repoRoot);

  it("discovers at least one implemented generation", () => {
    expect(generations.length).toBeGreaterThanOrEqual(1);
  });

  for (const gen of generations) {
    it(`Gen ${gen.gen}: damage suite passes with 0 unregistered failures`, () => {
      const { knownDisagreements } = loadDisagreementRegistrySummary(gen, repoRoot);
      const result = runDamageSuite(gen, knownDisagreements);

      // Suite must not have any unregistered failures
      expect(
        result.failures,
        `Gen ${gen.gen} damage failures:\n${result.failures.join("\n")}`,
      ).toHaveLength(0);

      // Suite must have run scenarios (status "skip" means no scenarios ran at all)
      expect(
        result.status,
        `Gen ${gen.gen}: expected suite to run scenarios, got status "skip"`,
      ).not.toBe("skip");
    });
  }
});
