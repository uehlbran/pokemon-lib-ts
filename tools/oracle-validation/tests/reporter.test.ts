import { describe, expect, it } from "vitest";
import { formatRunnerOutput } from "../src/reporter.js";

describe("formatRunnerOutput", () => {
  it("given registry metadata, when formatting runner output, then it includes the exact registry summary line", () => {
    const output = formatRunnerOutput({
      timestamp: "2026-03-27T12:34:56.000Z",
      suitesRequested: ["data"],
      generations: [
        {
          gen: 1,
          packageName: "@pokemon-lib-ts/gen1",
          suites: {
            data: {
              status: "pass",
              suitePassed: true,
              failed: 0,
              skipped: 0,
              failures: [],
              notes: [],
              matchedKnownDisagreements: ["cartridge-priority"],
              staleDisagreements: [],
              oracleChecks: [],
            },
          },
          registry: {
            knownDisagreements: [
              {
                id: "cartridge-priority",
                gen: 1,
                suite: "groundTruth",
                description: "Cartridge behavior differs from Showdown",
                ourValue: "cartridge",
                oracleValue: "showdown",
                resolution: "cartridge-accurate",
                source: "pret/pokered",
                sourceUrl: "https://example.com/pret/pokered",
                oracleVersion: "@pkmn/sim@1.0.0",
                addedDate: "2026-03-27",
              },
            ],
            knownOracleBugs: [
              {
                id: "stats-overflow",
                gen: 1,
                description: "Oracle bug example",
                oracleValue: "overflow",
                cartridgeValue: "clamped",
                source: "pret/pokered",
                sourceUrl: "https://example.com/pret/pokered",
                oraclePackage: "@pkmn/stats",
                addedDate: "2026-03-27",
              },
            ],
          },
          staleDisagreements: ["stale-data-check"],
        },
      ],
    });

    expect(output).toContain(
      "  registry: knownDisagreements=1, knownOracleBugs=1, staleDisagreements=1",
    );
    expect(output).toContain("    known-disagreement: cartridge-priority");
  });
});
