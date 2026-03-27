import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDataSuite } from "../src/compare-data.js";
import type { KnownDisagreement } from "../src/disagreement-registry.js";
import type { ImplementedGeneration } from "../src/gen-discovery.js";

const tempDirs: string[] = [];

function createTempGenerationData(): ImplementedGeneration {
  const root = mkdtempSync(join(tmpdir(), "oracle-data-suite-"));
  tempDirs.push(root);

  const dataDir = join(root, "data");
  mkdirSync(dataDir, { recursive: true });

  writeFileSync(
    join(dataDir, "pokemon.json"),
    JSON.stringify([
      {
        id: 1,
        name: "bulbasaur",
        displayName: "Bulbasaur",
        types: ["normal"],
        baseStats: {
          hp: 45,
          attack: 49,
          defense: 49,
          spAttack: 65,
          spDefense: 65,
          speed: 45,
        },
      },
    ]),
  );
  writeFileSync(
    join(dataDir, "type-chart.json"),
    JSON.stringify({
      normal: {
        normal: 1,
      },
    }),
  );

  return {
    gen: 1,
    packageDir: root,
    dataDir,
    packageName: "@pokemon-lib-ts/gen1",
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runDataSuite", () => {
  it("given known and stale disagreement ids, when the data suite runs, then it reports matched, stale, and still-new disagreements separately", () => {
    const generation = createTempGenerationData();
    const knownDisagreements: KnownDisagreement[] = [
      {
        id: "gen1:data:species:bulbasaur:types",
        gen: 1,
        suite: "data",
        description: "Synthetic mismatch for the test-local Bulbasaur types",
        ourValue: ["normal"],
        oracleValue: ["grass", "poison"],
        resolution: "cartridge-accurate",
        source: "test fixture",
        sourceUrl: "https://example.com/bulbasaur-types",
        oracleVersion: "test",
        addedDate: "2026-03-27",
      },
      {
        id: "gen1:data:typeChart:normal-to-normal:effectiveness",
        gen: 1,
        suite: "data",
        description: "Synthetic stale disagreement for a value that now matches",
        ourValue: 999,
        oracleValue: 123,
        resolution: "showdown-deviation",
        source: "test fixture",
        sourceUrl: "https://example.com/normal-normal",
        oracleVersion: "test",
        addedDate: "2026-03-27",
      },
    ];

    const result = runDataSuite(generation, knownDisagreements);

    expect(result.matchedKnownDisagreements).toEqual(["gen1:data:species:bulbasaur:types"]);
    expect(result.staleDisagreements).toEqual([
      "gen1:data:typeChart:normal-to-normal:effectiveness",
    ]);
    expect(result.notes).toContain(
      "Known disagreement matched registry: gen1:data:species:bulbasaur:types",
    );
    expect(result.notes).toContain(
      "Stale disagreement detected: gen1:data:typeChart:normal-to-normal:effectiveness",
    );
    expect(result.failures).toContain("Gen 1: type count mismatch (ours=1, expected=15)");
    expect(
      result.failures.some((failure) =>
        failure.includes("NEW DISAGREEMENT DETECTED: gen1:data:species:base:count"),
      ),
    ).toBe(true);
    expect(
      result.failures.some((failure) => failure.includes("gen1:data:species:bulbasaur:types")),
    ).toBe(false);
  });
});
