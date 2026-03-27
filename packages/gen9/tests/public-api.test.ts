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

describe("@pokemon-lib-ts/gen9 public API barrel", () => {
  const rootExports = getNamedExports(indexFile);
  const internalExports = getNamedExports(internalFile);

  it("exports only the stable Gen 9 consumer entrypoints from the root barrel", () => {
    expect(rootExports).toEqual([
      "createGen9DataManager",
      "Gen9Ruleset",
      "calculateTeraStab",
      "Gen9Terastallization",
    ]);
  });

  it("moves stable data access to the ./data subpath", () => {
    expect(dataSource).toContain('export * from "./reference-ids.js";');
    expect(dataSource).toContain(
      'export { GEN9_TYPE_CHART, GEN9_TYPES } from "../Gen9TypeChart.js";',
    );
    expect(dataSource).toContain("export function createGen9DataManager(): DataManager");
  });

  it("moves low-level helpers and mechanics constants to the ./internal subpath", () => {
    expect(rootExports).not.toContain("handleGen9StatAbility");
    expect(rootExports).not.toContain("executeGen9MoveEffect");
    expect(rootExports).not.toContain("GEN9_CRIT_RATE_TABLE");
    expect(internalExports).toContain("handleGen9StatAbility");
    expect(internalExports).toContain("executeGen9MoveEffect");
    expect(internalExports).toContain("GEN9_CRIT_RATE_TABLE");
  });

  it("adds an explicit ./internal package export alongside root and ./data", () => {
    expect(packageJson.exports).toHaveProperty(".");
    expect(packageJson.exports).toHaveProperty("./data");
    expect(packageJson.exports).toHaveProperty("./internal");
  });
});
