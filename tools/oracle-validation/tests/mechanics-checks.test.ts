import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { afterEach, describe, expect, it } from "vitest";
import { runMechanicsSuite } from "../src/compare-mechanics.js";
import type { ImplementedGeneration } from "../src/gen-discovery.js";

// ---------------------------------------------------------------------------
// Source-derived exhaustiveness: every move category value used by @pkmn/data
// must be one of "physical", "special", or "status".
// ---------------------------------------------------------------------------

describe("move category values are exhaustive across all gens", () => {
  it("every category in @pkmn/data is physical, special, or status (lowercase)", () => {
    const gens = new Generations(Dex);
    const unknownCategories = new Set<string>();

    for (let genNum = 1; genNum <= 9; genNum++) {
      const gen = gens.get(genNum);
      for (const move of gen.moves) {
        const cat = move.category.toLowerCase();
        if (cat !== "physical" && cat !== "special" && cat !== "status") {
          unknownCategories.add(cat);
        }
      }
    }

    expect(unknownCategories.size).toBe(0);
    if (unknownCategories.size > 0) {
      throw new Error(
        `Unexpected category values in @pkmn/data: ${[...unknownCategories].join(", ")}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: runMechanicsSuite correctly detects category/accuracy/PP/flag
// mismatches against @pkmn/data.
// Uses gen 4 as the test generation (gen 4 has per-move physical/special split).
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function createTempGen4(
  moves: Array<{
    id: string;
    priority: number;
    power: number | null;
    accuracy: number | null;
    pp: number;
    category: string;
    flags: Record<string, boolean>;
    effect: object | null;
  }>,
): ImplementedGeneration {
  const root = mkdtempSync(join(tmpdir(), "oracle-mechanics-checks-"));
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
  writeFileSync(join(dataDir, "type-chart.json"), JSON.stringify({ normal: { normal: 1 } }));
  writeFileSync(join(dataDir, "moves.json"), JSON.stringify(moves));
  writeFileSync(join(dataDir, "abilities.json"), JSON.stringify([]));
  writeFileSync(join(dataDir, "items.json"), JSON.stringify([]));
  writeFileSync(join(dataDir, "natures.json"), JSON.stringify([]));

  return { gen: 4, packageDir: root, dataDir, packageName: "@pokemon-lib-ts/gen4" };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Category checks ──────────────────────────────────────────────────────────

describe("runMechanicsSuite move-category oracle check", () => {
  it("given earthquake with correct category 'physical', when the suite runs, then no mismatch is reported", () => {
    const gen = createTempGen4([
      {
        id: "earthquake",
        priority: 0,
        power: 100,
        accuracy: 100,
        pp: 10,
        category: "physical",
        flags: {
          contact: false,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("move-category:earthquake"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe("physical");
    expect(check?.oracleValue).toBe("physical");
    expect(result.failures.some((f) => f.includes("move-category:earthquake"))).toBe(false);
  });

  it("given earthquake with wrong category 'special', when the suite runs, then a mismatch is detected", () => {
    const gen = createTempGen4([
      {
        id: "earthquake",
        priority: 0,
        power: 100,
        accuracy: 100,
        pp: 10,
        category: "special", // WRONG — should be "physical"
        flags: {
          contact: false,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("move-category:earthquake"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe("special");
    expect(check?.oracleValue).toBe("physical");
    expect(result.failures.some((f) => f.includes("NEW DISAGREEMENT DETECTED"))).toBe(true);
    expect(result.failures.some((f) => f.includes("move-category:earthquake"))).toBe(true);
  });
});

// ── Accuracy checks ──────────────────────────────────────────────────────────

describe("runMechanicsSuite move-accuracy oracle check", () => {
  it("given swift with accuracy null (always hits), when the suite runs, then no mismatch is reported", () => {
    const gen = createTempGen4([
      {
        id: "swift",
        priority: 0,
        power: 60,
        accuracy: null, // always hits → oracle true
        pp: 20,
        category: "special",
        flags: {
          contact: false,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("move-accuracy:swift"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(true);
    expect(check?.oracleValue).toBe(true);
    expect(result.failures.some((f) => f.includes("move-accuracy:swift"))).toBe(false);
  });

  it("given flamethrower with correct accuracy 100, when the suite runs, then no mismatch is reported", () => {
    const gen = createTempGen4([
      {
        id: "flamethrower",
        priority: 0,
        power: 95,
        accuracy: 100,
        pp: 15,
        category: "special",
        flags: {
          contact: false,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("move-accuracy:flamethrower"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(100);
    expect(check?.oracleValue).toBe(100);
    expect(result.failures.some((f) => f.includes("move-accuracy:flamethrower"))).toBe(false);
  });

  it("given flamethrower with wrong accuracy 70, when the suite runs, then a mismatch is detected", () => {
    const gen = createTempGen4([
      {
        id: "flamethrower",
        priority: 0,
        power: 95,
        accuracy: 70, // WRONG — should be 100
        pp: 15,
        category: "special",
        flags: {
          contact: false,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("move-accuracy:flamethrower"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(70);
    expect(check?.oracleValue).toBe(100);
    expect(result.failures.some((f) => f.includes("move-accuracy:flamethrower"))).toBe(true);
  });
});

// ── PP checks ────────────────────────────────────────────────────────────────

describe("runMechanicsSuite move-pp oracle check", () => {
  it("given tackle with correct pp 35, when the suite runs, then no mismatch is reported", () => {
    const gen = createTempGen4([
      {
        id: "tackle",
        priority: 0,
        power: 35,
        accuracy: 95,
        pp: 35,
        category: "physical",
        flags: {
          contact: true,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("move-pp:tackle"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(35);
    expect(check?.oracleValue).toBe(35);
    expect(result.failures.some((f) => f.includes("move-pp:tackle"))).toBe(false);
  });

  it("given tackle with wrong pp 10, when the suite runs, then a mismatch is detected", () => {
    const gen = createTempGen4([
      {
        id: "tackle",
        priority: 0,
        power: 35,
        accuracy: 95,
        pp: 10, // WRONG — should be 35
        category: "physical",
        flags: {
          contact: true,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("move-pp:tackle"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(10);
    expect(check?.oracleValue).toBe(35);
    expect(result.failures.some((f) => f.includes("move-pp:tackle"))).toBe(true);
  });
});

// ── Flag checks ──────────────────────────────────────────────────────────────

describe("runMechanicsSuite flag-contact oracle check", () => {
  it("given tackle with correct contact=true, when the suite runs, then no mismatch is reported", () => {
    const gen = createTempGen4([
      {
        id: "tackle",
        priority: 0,
        power: 35,
        accuracy: 95,
        pp: 35,
        category: "physical",
        flags: {
          contact: true,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("flag-contact:tackle"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(true);
    expect(check?.oracleValue).toBe(true);
    expect(result.failures.some((f) => f.includes("flag-contact:tackle"))).toBe(false);
  });

  it("given tackle with wrong contact=false, when the suite runs, then a mismatch is detected", () => {
    const gen = createTempGen4([
      {
        id: "tackle",
        priority: 0,
        power: 35,
        accuracy: 95,
        pp: 35,
        category: "physical",
        flags: {
          contact: false,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        }, // WRONG
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("flag-contact:tackle"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(false);
    expect(check?.oracleValue).toBe(true);
    expect(result.failures.some((f) => f.includes("flag-contact:tackle"))).toBe(true);
  });

  it("given flamethrower with correct contact=false, when the suite runs, then no mismatch is reported", () => {
    const gen = createTempGen4([
      {
        id: "flamethrower",
        priority: 0,
        power: 95,
        accuracy: 100,
        pp: 15,
        category: "special",
        flags: {
          contact: false,
          sound: false,
          punch: false,
          bite: false,
          bullet: false,
          powder: false,
        },
        effect: null,
      },
    ]);

    const result = runMechanicsSuite(gen);

    const check = result.oracleChecks.find((c) => c.id.includes("flag-contact:flamethrower"));
    expect(check).toBeDefined();
    expect(check?.ourValue).toBe(false);
    expect(check?.oracleValue).toBe(false);
    expect(result.failures.some((f) => f.includes("flag-contact:flamethrower"))).toBe(false);
  });
});
