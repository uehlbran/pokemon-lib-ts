import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  loadDisagreementRegistrySummary,
  loadKnownDisagreements,
  loadKnownOracleBugs,
} from "../src/disagreement-registry.js";
import { discoverImplementedGenerations } from "../src/gen-discovery.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("disagreement registry", () => {
  const generations = discoverImplementedGenerations(repoRoot);

  it("given Gen 1, when loading known disagreements, then the initial registry is an empty array", () => {
    const generation = generations.find((candidate) => candidate.gen === 1);
    expect(generation).toBeDefined();

    const disagreements = loadKnownDisagreements(generation!, repoRoot);

    expect(disagreements).toEqual([]);
  });

  it("given Gen 1, when loading known oracle bugs, then unrelated generations are filtered out", () => {
    const generation = generations.find((candidate) => candidate.gen === 1);
    expect(generation).toBeDefined();

    const oracleBugs = loadKnownOracleBugs(generation!, repoRoot);

    expect(oracleBugs).toEqual([]);
  });

  it("given Gen 3, when loading the registry summary, then both registry arrays are present", () => {
    const generation = generations.find((candidate) => candidate.gen === 3);
    expect(generation).toBeDefined();

    const summary = loadDisagreementRegistrySummary(generation!, repoRoot);

    expect(summary).toEqual({
      knownDisagreements: [],
      knownOracleBugs: [],
    });
  });

  it("given a per-gen file with the wrong generation tag, when loading known disagreements, then it throws", () => {
    const generation = generations.find((candidate) => candidate.gen === 1);
    expect(generation).toBeDefined();

    const tempRoot = mkdtempSync(join(tmpdir(), "oracle-registry-"));
    const disagreementDir = join(
      tempRoot,
      "tools",
      "oracle-validation",
      "data",
      "known-disagreements",
    );
    const oracleDataDir = join(tempRoot, "tools", "oracle-validation", "data");

    mkdirSync(disagreementDir, { recursive: true });
    mkdirSync(oracleDataDir, { recursive: true });
    writeFileSync(
      join(disagreementDir, "gen1-known-disagreements.json"),
      JSON.stringify([
        {
          id: "wrong-gen-entry",
          gen: 2,
          suite: "data",
          description: "intentional mismatch",
          ourValue: 1,
          oracleValue: 2,
          resolution: "cartridge-accurate",
          source: "pret/example",
          sourceUrl: "https://example.com/source",
          oracleVersion: "@pkmn/data@0.10.7",
          addedDate: "2026-03-27",
        },
      ]),
    );
    writeFileSync(join(oracleDataDir, "known-oracle-bugs.json"), "[]");

    expect(() => loadKnownDisagreements(generation!, tempRoot)).toThrow(
      "Known-disagreement file for Gen 1 contains mismatched entry wrong-gen-entry with gen=2",
    );
  });
});
