import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runGimmicksSuite } from "../src/compare-gimmicks.js";
import { loadDisagreementRegistrySummary } from "../src/disagreement-registry.js";
import { discoverImplementedGenerations } from "../src/gen-discovery.js";

describe("Gimmicks Oracle Suite", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const generations = discoverImplementedGenerations(repoRoot);

  it("discovers at least one implemented generation", () => {
    expect(generations.length).toBeGreaterThanOrEqual(1);
  });

  for (const gen of generations) {
    if (gen.gen <= 5) {
      it(`Gen ${gen.gen}: gimmicks suite is skipped (no gimmicks in this generation)`, () => {
        const result = runGimmicksSuite(gen);

        expect(result.status).toBe("skip");
        expect(result.failures).toHaveLength(0);
        expect(result.suitePassed).toBe(false);
        expect(result.skipped).toBeGreaterThan(0);
        expect(result.skipReason).toBeTruthy();
      });
    } else {
      it(`Gen ${gen.gen}: gimmicks suite passes with 0 failures`, () => {
        const { knownDisagreements } = loadDisagreementRegistrySummary(gen, repoRoot);
        const result = runGimmicksSuite(gen, knownDisagreements);

        // Documentation suite never has failures
        expect(
          result.failures,
          `Gen ${gen.gen} gimmick failures:\n${result.failures.join("\n")}`,
        ).toHaveLength(0);

        // Gen 6+ gimmicks are documented, not skipped
        expect(
          result.status,
          `Gen ${gen.gen}: expected gimmicks suite to run, got status "skip"`,
        ).not.toBe("skip");

        expect(result.status).toBe("pass");
        expect(result.suitePassed).toBe(true);
        expect(result.notes.length).toBeGreaterThan(0);
        // Gen 7: validates Z-Move power for all damaging moves (hundreds of checks).
        // Gen 8: validates getDynamaxMaxHp() at levels 0/5/10 (3 checks).
        // Gen 6 and Gen 9: documentation notes only (no live comparisons for Mega/Tera).
        if (gen.gen === 7 || gen.gen === 8) {
          expect(
            result.oracleChecks.length,
            `Gen ${gen.gen}: expected live oracle checks but got 0`,
          ).toBeGreaterThan(0);
        } else {
          expect(result.oracleChecks).toHaveLength(0);
        }
      });
    }
  }
});
