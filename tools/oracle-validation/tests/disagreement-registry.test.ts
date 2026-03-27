import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { KnownDisagreement, KnownOracleBug } from "../src/disagreement-registry.js";
import {
  loadDisagreementRegistrySummary,
  loadKnownDisagreements,
  loadKnownOracleBugs,
} from "../src/disagreement-registry.js";
import { discoverImplementedGenerations } from "../src/gen-discovery.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("disagreement registry", () => {
  const generations = discoverImplementedGenerations(repoRoot);
  const generationByNumber = new Map(generations.map((generation) => [generation.gen, generation]));
  const tempRoots: string[] = [];

  function getGeneration(gen: number) {
    const generation = generationByNumber.get(gen);
    expect(generation).toBeDefined();
    return generation!;
  }

  function makeKnownDisagreement(overrides: Partial<KnownDisagreement>): KnownDisagreement {
    return {
      id: "known-disagreement",
      gen: 1,
      suite: "groundTruth",
      description: "Known disagreement fixture",
      ourValue: "cartridge",
      oracleValue: "oracle",
      resolution: "cartridge-accurate",
      source: "pret/example",
      sourceUrl: "https://example.com/source",
      oracleVersion: "@pkmn/data@0.10.7",
      addedDate: "2026-03-27",
      ...overrides,
    };
  }

  function makeKnownOracleBug(overrides: Partial<KnownOracleBug>): KnownOracleBug {
    return {
      id: "known-oracle-bug",
      gen: 1,
      description: "Known oracle bug fixture",
      oracleValue: "oracle",
      cartridgeValue: "cartridge",
      source: "pret/example",
      sourceUrl: "https://example.com/source",
      oraclePackage: "@pkmn/data",
      addedDate: "2026-03-27",
      ...overrides,
    };
  }

  function createTempRegistryRoot(
    options: {
      disagreementsByGen?: Record<number, KnownDisagreement[]>;
      oracleBugs?: KnownOracleBug[];
    } = {},
  ): string {
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

    for (const [gen, disagreements] of Object.entries(options.disagreementsByGen ?? {})) {
      writeFileSync(
        join(disagreementDir, `gen${gen}-known-disagreements.json`),
        JSON.stringify(disagreements),
      );
    }

    if (options.oracleBugs !== undefined) {
      writeFileSync(
        join(oracleDataDir, "known-oracle-bugs.json"),
        JSON.stringify(options.oracleBugs),
      );
    }

    return tempRoot;
  }

  afterEach(() => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        rmSync(tempRoot, { force: true, recursive: true });
      }
    }
  });

  it("given mixed per-gen disagreement entries, when loading known disagreements, then it returns the entries for the requested generation", () => {
    const generation = getGeneration(1);
    const tempRoot = createTempRegistryRoot({
      disagreementsByGen: {
        1: [
          makeKnownDisagreement({
            id: "gen1-cartridge-priority",
            gen: 1,
            description: "Gen 1 disagreement",
          }),
        ],
        2: [
          makeKnownDisagreement({
            id: "gen2-critical-hit",
            gen: 2,
            description: "Gen 2 disagreement",
          }),
        ],
      },
      oracleBugs: [],
    });

    const disagreements = loadKnownDisagreements(generation, tempRoot);

    expect(disagreements).toEqual([
      makeKnownDisagreement({
        id: "gen1-cartridge-priority",
        gen: 1,
        description: "Gen 1 disagreement",
      }),
    ]);
  });

  it("given mixed-gen oracle bug entries, when loading known oracle bugs, then it filters to the requested generation", () => {
    const generation = getGeneration(1);
    const tempRoot = createTempRegistryRoot({
      disagreementsByGen: {
        1: [],
      },
      oracleBugs: [
        makeKnownOracleBug({
          id: "gen1-oracle-bug",
          gen: 1,
          description: "Gen 1 oracle bug",
        }),
        makeKnownOracleBug({
          id: "gen2-oracle-bug",
          gen: 2,
          description: "Gen 2 oracle bug",
        }),
      ],
    });

    const oracleBugs = loadKnownOracleBugs(generation, tempRoot);

    expect(oracleBugs).toEqual([
      makeKnownOracleBug({
        id: "gen1-oracle-bug",
        gen: 1,
        description: "Gen 1 oracle bug",
      }),
    ]);
  });

  it("given mixed registry fixtures, when loading the registry summary, then it returns only entries for the requested generation", () => {
    const generation = getGeneration(3);
    const tempRoot = createTempRegistryRoot({
      disagreementsByGen: {
        3: [
          makeKnownDisagreement({
            id: "gen3-ground-truth",
            gen: 3,
            description: "Gen 3 disagreement",
          }),
        ],
        4: [
          makeKnownDisagreement({
            id: "gen4-ground-truth",
            gen: 4,
            description: "Gen 4 disagreement",
          }),
        ],
      },
      oracleBugs: [
        makeKnownOracleBug({
          id: "gen3-oracle-bug",
          gen: 3,
          description: "Gen 3 oracle bug",
        }),
        makeKnownOracleBug({
          id: "gen5-oracle-bug",
          gen: 5,
          description: "Gen 5 oracle bug",
        }),
      ],
    });

    const summary = loadDisagreementRegistrySummary(generation, tempRoot);

    expect(summary).toEqual({
      knownDisagreements: [
        makeKnownDisagreement({
          id: "gen3-ground-truth",
          gen: 3,
          description: "Gen 3 disagreement",
        }),
      ],
      knownOracleBugs: [
        makeKnownOracleBug({
          id: "gen3-oracle-bug",
          gen: 3,
          description: "Gen 3 oracle bug",
        }),
      ],
    });
  });

  it("given a per-gen file with the wrong generation tag, when loading known disagreements, then it throws", () => {
    const generation = getGeneration(1);
    const tempRoot = createTempRegistryRoot();
    const disagreementDir = join(
      tempRoot,
      "tools",
      "oracle-validation",
      "data",
      "known-disagreements",
    );
    const oracleDataDir = join(tempRoot, "tools", "oracle-validation", "data");

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

    expect(() => loadKnownDisagreements(generation, tempRoot)).toThrow(
      "Known-disagreement file for Gen 1 contains mismatched entry wrong-gen-entry with gen=2",
    );
  });

  it("given malformed registry JSON, when loading known oracle bugs, then the error includes the file path", () => {
    const generation = getGeneration(1);
    const tempRoot = createTempRegistryRoot();
    const disagreementDir = join(
      tempRoot,
      "tools",
      "oracle-validation",
      "data",
      "known-disagreements",
    );
    const oracleDataDir = join(tempRoot, "tools", "oracle-validation", "data");
    const oracleBugPath = join(oracleDataDir, "known-oracle-bugs.json");

    writeFileSync(join(disagreementDir, "gen1-known-disagreements.json"), "[]");
    writeFileSync(oracleBugPath, "{not-json");

    expect(() => loadKnownOracleBugs(generation, tempRoot)).toThrow(
      `Failed to parse JSON at ${oracleBugPath}:`,
    );
  });

  it("given missing registry files, when loading the registry summary, then it falls back to empty arrays", () => {
    const generation = getGeneration(4);
    const tempRoot = createTempRegistryRoot();

    expect(loadDisagreementRegistrySummary(generation, tempRoot)).toEqual({
      knownDisagreements: [],
      knownOracleBugs: [],
    });
  });

  it("given a disagreement entry with an unknown field, when loading known disagreements, then schema validation fails", () => {
    const generation = getGeneration(1);
    const tempRoot = createTempRegistryRoot();
    const disagreementDir = join(
      tempRoot,
      "tools",
      "oracle-validation",
      "data",
      "known-disagreements",
    );
    const oracleDataDir = join(tempRoot, "tools", "oracle-validation", "data");

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

    expect(() => loadKnownDisagreements(generation, tempRoot)).toThrow("Invalid registry schema");
  });

  it("given an impossible calendar date, when loading known oracle bugs, then schema validation fails", () => {
    const generation = getGeneration(1);
    const tempRoot = createTempRegistryRoot();
    const disagreementDir = join(
      tempRoot,
      "tools",
      "oracle-validation",
      "data",
      "known-disagreements",
    );
    const oracleDataDir = join(tempRoot, "tools", "oracle-validation", "data");

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

    expect(() => loadKnownOracleBugs(generation, tempRoot)).toThrow("Invalid registry schema");
  });
});
