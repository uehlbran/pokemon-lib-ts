import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile(
  "index.ts",
  indexSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function getRootExports(): string[] {
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
  const rootExports = getRootExports();

  it("exports explicit canonical names for low-level helpers and trigger handlers", () => {
    expect(rootExports).toContain("applyGen9IntrepidSwordBoost");
    expect(rootExports).toContain("applyGen9DauntlessShieldBoost");
    expect(rootExports).toContain("applyGen9ProteanTypeChange");
    expect(rootExports).toContain("handleGen9IntrepidSwordTrigger");
    expect(rootExports).toContain("handleGen9DauntlessShieldTrigger");
    expect(rootExports).toContain("handleGen9ProteanTrigger");
  });

  it("given the Gen9 root barrel, when checking deprecated ambiguous aliases, then it does not re-export them", () => {
    expect(rootExports).not.toContain("handleGen9IntrepidSword");
    expect(rootExports).not.toContain("handleGen9DauntlessShield");
    expect(rootExports).not.toContain("handleGen9ProteanTypeChange");
    expect(rootExports).not.toContain("handleIntrepidSwordGen9");
    expect(rootExports).not.toContain("handleDauntlessShieldGen9");
    expect(rootExports).not.toContain("handleProteanGen9");
  });

  it("given the Gen9 root barrel, when checking Supreme Overlord helpers, then it keeps only the fixed-point helper", () => {
    expect(rootExports).toContain("getSupremeOverlordModifier");
    expect(rootExports).not.toContain("getSupremeOverlordFloatMultiplier");
    expect(rootExports).not.toContain("getSupremeOverlordMultiplier");
    expect(rootExports).not.toContain("SUPREME_OVERLORD_TABLE");
  });
});
