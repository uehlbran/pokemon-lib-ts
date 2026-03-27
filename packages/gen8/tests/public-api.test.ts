import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const indexFile = ts.createSourceFile(
  "index.ts",
  indexSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const internalSource = readFileSync(new URL("../src/internal.ts", import.meta.url), "utf8");
const internalFile = ts.createSourceFile(
  "internal.ts",
  internalSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const dataSource = readFileSync(new URL("../src/data/index.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  exports: Record<string, unknown>;
};

function getNamedExports(sourceFile: ts.SourceFile): string[] {
  const exportedNames: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue;
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      exportedNames.push(element.name.text);
    }
  }

  return exportedNames;
}

describe("@pokemon-lib-ts/gen8 public API barrel", () => {
  const rootExports = getNamedExports(indexFile);
  const internalExports = getNamedExports(internalFile);

  it("exports only the stable Gen 8 consumer entrypoints from the root barrel", () => {
    // Source: packages/gen8/src/index.ts -- stable root barrel contract for external consumers.
    expect(rootExports).toEqual(["createGen8DataManager", "Gen8Dynamax", "Gen8Ruleset"]);
  });

  it("moves stable data access to the ./data subpath", () => {
    // Source: packages/gen8/src/data/index.ts -- owned data subpath contract for ids and type chart.
    expect(dataSource).toContain('export * from "./reference-ids.js";');
    expect(dataSource).toContain(
      'export { GEN8_TYPE_CHART, GEN8_TYPES } from "../Gen8TypeChart.js";',
    );
    expect(dataSource).toContain("export function createGen8DataManager(): DataManager");
  });

  it("moves low-level helpers and mechanics constants to the ./internal subpath", () => {
    // Source: packages/gen8/src/internal.ts -- internal helper barrel owns the low-level test/mechanics surface.
    expect(rootExports).not.toContain("handleGen8StatAbility");
    expect(rootExports).not.toContain("getMaxMoveName");
    expect(rootExports).not.toContain("GEN8_CRIT_RATE_TABLE");
    expect(internalExports).toContain("handleGen8StatAbility");
    expect(internalExports).toContain("getMaxMoveName");
    expect(internalExports).toContain("GEN8_CRIT_RATE_TABLE");
  });

  it("adds an explicit ./internal package export alongside root and ./data", () => {
    // Source: packages/gen8/package.json#exports -- published package subpath contract.
    expect(packageJson.exports).toHaveProperty(".");
    expect(packageJson.exports).toHaveProperty("./data");
    expect(packageJson.exports).toHaveProperty("./internal");
  });
});
