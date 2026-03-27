import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadDisagreementRegistrySummary,
  loadKnownDisagreements,
  loadKnownOracleBugs,
} from "../src/disagreement-registry.js";
import { discoverImplementedGenerations } from "../src/gen-discovery.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("disagreement registry", () => {
  const generations = discoverImplementedGenerations(repoRoot);
  const tempRoots: string[] = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        rmSync(tempRoot, { force: true, recursive: true });
      }
    }
  });

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
    tempRoots.push(tempRoot);
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

  it("given malformed registry JSON, when loading known oracle bugs, then the error includes the file path", () => {
    const generation = generations.find((candidate) => candidate.gen === 1);
    expect(generation).toBeDefined();

    const tempRoot = mkdtempSync(join(tmpdir(), "oracle-registry-"));
    tempRoots.push(tempRoot);
    const disagreementDir = join(
      tempRoot,
      "tools",
      "oracle-validation",
      "data",
      "known-disagreements",
    );
    const oracleDataDir = join(tempRoot, "tools", "oracle-validation", "data");
    const oracleBugPath = join(oracleDataDir, "known-oracle-bugs.json");

    mkdirSync(disagreementDir, { recursive: true });
    mkdirSync(oracleDataDir, { recursive: true });
    writeFileSync(join(disagreementDir, "gen1-known-disagreements.json"), "[]");
    writeFileSync(oracleBugPath, "{not-json");

    expect(() => loadKnownOracleBugs(generation!, tempRoot)).toThrow(
      `Failed to parse JSON at ${oracleBugPath}:`,
    );
  });

  it("given missing registry files, when loading the registry summary, then it falls back to empty arrays", () => {
    const generation = generations.find((candidate) => candidate.gen === 4);
    expect(generation).toBeDefined();

    const tempRoot = mkdtempSync(join(tmpdir(), "oracle-registry-"));
    tempRoots.push(tempRoot);

    expect(loadDisagreementRegistrySummary(generation!, tempRoot)).toEqual({
      knownDisagreements: [],
      knownOracleBugs: [],
    });
  });

  it("given a disagreement entry with an unknown field, when loading known disagreements, then schema validation fails", () => {
    const generation = generations.find((candidate) => candidate.gen === 1);
    expect(generation).toBeDefined();

    const tempRoot = mkdtempSync(join(tmpdir(), "oracle-registry-"));
    tempRoots.push(tempRoot);
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
          id: "extra-field-entry",
          gen: 1,
          suite: "data",
          description: "unexpected field",
          ourValue: 1,
          oracleValue: 2,
          resolution: "cartridge-accurate",
          source: "pret/example",
          sourceUrl: "https://example.com/source",
          oracleVersion: "@pkmn/data@0.10.7",
          addedDate: "2026-03-27",
          extraField: true,
        },
      ]),
    );
    writeFileSync(join(oracleDataDir, "known-oracle-bugs.json"), "[]");

    expect(() => loadKnownDisagreements(generation!, tempRoot)).toThrow("Invalid registry schema");
  });

  it("given an impossible calendar date, when loading known oracle bugs, then schema validation fails", () => {
    const generation = generations.find((candidate) => candidate.gen === 1);
    expect(generation).toBeDefined();

    const tempRoot = mkdtempSync(join(tmpdir(), "oracle-registry-"));
    tempRoots.push(tempRoot);
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
    writeFileSync(join(disagreementDir, "gen1-known-disagreements.json"), "[]");
    writeFileSync(
      join(oracleDataDir, "known-oracle-bugs.json"),
      JSON.stringify([
        {
          id: "bad-date-entry",
          gen: 1,
          description: "impossible date",
          oracleValue: "broken",
          cartridgeValue: "fixed",
          source: "pret/example",
          sourceUrl: "https://example.com/source",
          oraclePackage: "@pkmn/data",
          addedDate: "2026-02-30",
        },
      ]),
    );

    expect(() => loadKnownOracleBugs(generation!, tempRoot)).toThrow("Invalid registry schema");
  });
});
