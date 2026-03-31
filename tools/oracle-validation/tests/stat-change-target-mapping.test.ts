import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { afterEach, describe, expect, it } from "vitest";
import { mapStatChangeTarget, runDataSuite, STAT_CHANGE_TARGET_MAP } from "../src/compare-data.js";
import type { ImplementedGeneration } from "../src/gen-discovery.js";

// ---------------------------------------------------------------------------
// Unit tests: STAT_CHANGE_TARGET_MAP exhaustiveness
// ---------------------------------------------------------------------------

describe("STAT_CHANGE_TARGET_MAP", () => {
  it("maps 'self' to 'self'", () => {
    expect(mapStatChangeTarget("self")).toBe("self");
  });

  it("maps 'adjacentAllyOrSelf' to 'self'", () => {
    expect(mapStatChangeTarget("adjacentAllyOrSelf")).toBe("self");
  });

  it("maps 'adjacentAlly' to 'ally'", () => {
    // Source: Showdown move data — Aromatic Mist, Coaching use adjacentAlly
    expect(mapStatChangeTarget("adjacentAlly")).toBe("ally");
  });

  it("maps 'normal' to 'foe'", () => {
    expect(mapStatChangeTarget("normal")).toBe("foe");
  });

  it("maps 'adjacentFoe' to 'foe'", () => {
    expect(mapStatChangeTarget("adjacentFoe")).toBe("foe");
  });

  it("maps 'allAdjacentFoes' to 'foe'", () => {
    expect(mapStatChangeTarget("allAdjacentFoes")).toBe("foe");
  });

  it("maps 'allAdjacent' to 'foe'", () => {
    expect(mapStatChangeTarget("allAdjacent")).toBe("foe");
  });

  it("maps 'scripted' to 'foe'", () => {
    expect(mapStatChangeTarget("scripted")).toBe("foe");
  });

  it("throws on unknown target instead of silently returning a default", () => {
    // This is the core enforcement: no silent catch-all.
    // Any new Showdown target must be added to STAT_CHANGE_TARGET_MAP explicitly.
    expect(() => mapStatChangeTarget("unknownTarget_FAKE")).toThrow(
      /Unknown Showdown target.*unknownTarget_FAKE/,
    );
  });

  it("produces at least 3 distinct output values (self, foe, ally) — not a binary collapse", () => {
    // Guards against regressing to the binary self/foe collapse.
    const outputs = new Set(Object.values(STAT_CHANGE_TARGET_MAP));
    expect(outputs.size).toBeGreaterThanOrEqual(3);
    expect(outputs.has("self")).toBe(true);
    expect(outputs.has("foe")).toBe(true);
    expect(outputs.has("ally")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Source-derived exhaustiveness: every Showdown target on pure stat-change
// moves must be explicitly handled by STAT_CHANGE_TARGET_MAP.
// Uses @pkmn/data (npm package, available in CI — not /references/).
// ---------------------------------------------------------------------------

describe("STAT_CHANGE_TARGET_MAP covers all @pkmn/data stat-change move targets", () => {
  it("handles every distinct target value on pure stat-change moves across all gens", () => {
    const gens = new Generations(Dex);
    const unseenTargets = new Set<string>();

    for (let genNum = 1; genNum <= 9; genNum++) {
      const gen = gens.get(genNum);
      for (const move of gen.moves) {
        // Pure stat-change moves: have boosts, no base power
        if (!move.boosts || move.basePower) continue;
        if (!(move.target in STAT_CHANGE_TARGET_MAP)) {
          unseenTargets.add(move.target);
        }
      }
    }

    expect(unseenTargets.size).toBe(0);
    if (unseenTargets.size > 0) {
      throw new Error(
        `STAT_CHANGE_TARGET_MAP missing entries for Showdown targets: ${[...unseenTargets].join(", ")}` +
          "\nAdd explicit mappings to STAT_CHANGE_TARGET_MAP in tools/oracle-validation/src/compare-data.ts",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: oracle detects wrong effect.target on ally-targeting moves
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function createTempGen(
  moves: Array<{ id: string; target: string; effect: object | null }>,
): ImplementedGeneration {
  const root = mkdtempSync(join(tmpdir(), "oracle-stat-change-target-"));
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
        types: ["grass", "poison"],
        baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
      },
    ]),
  );
  writeFileSync(
    join(dataDir, "type-chart.json"),
    JSON.stringify({
      normal: { normal: 1 },
      fire: { normal: 1 },
      water: { normal: 1 },
      electric: { normal: 1 },
      grass: { normal: 1 },
      ice: { normal: 1 },
      fighting: { normal: 1 },
      poison: { normal: 1 },
      ground: { normal: 1 },
      flying: { normal: 1 },
      psychic: { normal: 1 },
      bug: { normal: 1 },
      rock: { normal: 1 },
      ghost: { normal: 1 },
      dragon: { normal: 1 },
    }),
  );
  writeFileSync(join(dataDir, "moves.json"), JSON.stringify(moves));

  return { gen: 6, packageDir: root, dataDir, packageName: "@pokemon-lib-ts/gen6" };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runDataSuite stat-change-target oracle check", () => {
  it("given aromatic-mist with correct effect.target 'ally', when the suite runs, then no mismatch is reported", () => {
    const gen = createTempGen([
      {
        id: "aromatic-mist",
        target: "adjacent-ally",
        effect: {
          type: "stat-change",
          changes: [{ stat: "spDefense", stages: 1 }],
          target: "ally",
          chance: 100,
        },
      },
    ]);

    const result = runDataSuite(gen);

    const targetCheck = result.oracleChecks?.find((c) =>
      c.id.includes("aromaticmist:stat-change-target"),
    );
    expect(targetCheck).toBeDefined();
    expect(targetCheck?.ourValue).toBe("ally");
    expect(targetCheck?.oracleValue).toBe("ally");
    expect(result.failures.some((f) => f.includes("aromatic-mist"))).toBe(false);
  });

  it("given aromatic-mist with wrong effect.target 'foe', when the suite runs, then a mismatch is detected", () => {
    const gen = createTempGen([
      {
        id: "aromatic-mist",
        target: "adjacent-ally",
        effect: {
          type: "stat-change",
          changes: [{ stat: "spDefense", stages: 1 }],
          target: "foe", // WRONG — should be "ally"
          chance: 100,
        },
      },
    ]);

    const result = runDataSuite(gen);

    const targetCheck = result.oracleChecks?.find((c) =>
      c.id.includes("aromaticmist:stat-change-target"),
    );
    expect(targetCheck).toBeDefined();
    expect(targetCheck?.ourValue).toBe("foe");
    expect(targetCheck?.oracleValue).toBe("ally");
    expect(result.failures.some((f) => f.includes("NEW DISAGREEMENT DETECTED"))).toBe(true);
    expect(result.failures.some((f) => f.includes("aromaticmist:stat-change-target"))).toBe(true);
  });

  it("given aromatic-mist with wrong effect.target 'self', when the suite runs, then a mismatch is detected", () => {
    const gen = createTempGen([
      {
        id: "aromatic-mist",
        target: "adjacent-ally",
        effect: {
          type: "stat-change",
          changes: [{ stat: "spDefense", stages: 1 }],
          target: "self", // WRONG — should be "ally"
          chance: 100,
        },
      },
    ]);

    const result = runDataSuite(gen);

    expect(result.failures.some((f) => f.includes("aromaticmist:stat-change-target"))).toBe(true);
  });
});
