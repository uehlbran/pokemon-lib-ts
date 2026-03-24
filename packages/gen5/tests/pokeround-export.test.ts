import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const damageCalcSource = readFileSync(new URL("../src/Gen5DamageCalc.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile(
  "Gen5DamageCalc.ts",
  damageCalcSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

describe("Gen5 pokeRound export wiring", () => {
  it("imports pokeRound from core instead of maintaining a local copy", () => {
    const importsPokeRoundFromCore = sourceFile.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.getText(sourceFile) === '"@pokemon-lib-ts/core"' &&
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings) &&
        statement.importClause.namedBindings.elements.some(
          (element) => element.name.text === "pokeRound",
        ),
    );

    // Source: the predicate above succeeds only when the AST contains
    // `import { pokeRound } from "@pokemon-lib-ts/core"` in Gen5DamageCalc.
    expect(importsPokeRoundFromCore).toBe(true);
  });

  it("re-exports pokeRound for compatibility without defining a local implementation", () => {
    const reexportsPokeRound = sourceFile.statements.some(
      (statement) =>
        ts.isExportDeclaration(statement) &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some((element) => element.name.text === "pokeRound"),
    );
    const definesLocalPokeRound = sourceFile.statements.some(
      (statement) =>
        (ts.isFunctionDeclaration(statement) && statement.name?.text === "pokeRound") ||
        (ts.isVariableStatement(statement) &&
          statement.declarationList.declarations.some((declaration) =>
            ts.isIdentifier(declaration.name) ? declaration.name.text === "pokeRound" : false,
          )),
    );

    // Source: the export predicate above matches `export { pokeRound }`, while the
    // local-definition predicate rejects a function or variable named `pokeRound`.
    expect(reexportsPokeRound).toBe(true);
    expect(definesLocalPokeRound).toBe(false);
  });
});
