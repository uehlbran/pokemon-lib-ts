import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { z } from "zod";

import { buildImpactsReport } from "./changed-mechanics.js";

const directMutationFindingSchema = z.strictObject({
  filePath: z.string().min(1),
  line: z.number().int().positive(),
  pattern: z.string().min(1),
  excerpt: z.string().min(1),
});

const directMutationAuditSchema = z.strictObject({
  schemaVersion: z.literal("direct-mutation-audit.v1"),
  gitSha: z.string().min(1),
  timestamp: z.string().datetime(),
  mode: z.string().min(1),
  findings: z.array(directMutationFindingSchema),
});

const assignmentOperatorPattern = String.raw`(?:\+\+|--|(?:\+\+|--)\s*|(?:\+|-|\*|\/|%|<<|>>|>>>|&|\^|\||\*\*)?=(?!=))`;
const propertyAccessPattern = String.raw`(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])+`;
const stateTargetPattern = String.raw`ctx\.state${propertyAccessPattern}`;
const activePokemonTargetPattern = String.raw`ctx\.(?:attacker|defender)(?:\.pokemon)?${propertyAccessPattern}`;
const mutatorMethodNames = new Set([
  "set",
  "delete",
  "clear",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
]);
const trackedContextRoots: ReadonlyMap<string, MutationRootKind> = new Map([
  ["state", "state"],
  ["attacker", "active"],
  ["defender", "active"],
  ["pokemon", "active"],
]);
const assignmentOperatorKinds = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
]);

type MutationRootKind = "state" | "active";

const suspiciousPatterns: { name: string; regex: RegExp }[] = [
  {
    name: "ctx-state-mutation",
    regex: new RegExp(
      String.raw`(?:\+\+|--)\s*${stateTargetPattern}|${stateTargetPattern}\s*${assignmentOperatorPattern}`,
    ),
  },
  {
    name: "active-pokemon-mutation",
    regex: new RegExp(
      String.raw`(?:\+\+|--)\s*${activePokemonTargetPattern}|${activePokemonTargetPattern}\s*${assignmentOperatorPattern}`,
    ),
  },
];

export function detectDirectMutationPatterns(line: string): string[] {
  return suspiciousPatterns
    .filter((pattern) => pattern.regex.test(line))
    .map((pattern) => pattern.name);
}

function parseArgs(argv: string[]): { mode: string } {
  let mode = "local-preview";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--mode") {
      mode = argv[index + 1] ?? mode;
      index += 1;
    }
  }
  return { mode };
}

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

export function shouldInspect(filePath: string): boolean {
  return (
    /^packages\/gen\d+\/src\/Gen\d+(MoveEffects|Abilities|Items|Terrain|Weather|Dynamax|DamageCalc)/.test(
      filePath,
    ) || /^packages\/gen\d+\/src\/Gen\d+Ruleset/.test(filePath)
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function resolveMutationRootKind(
  expression: ts.Expression,
  aliases: ReadonlyMap<string, MutationRootKind>,
): MutationRootKind | null {
  const current = unwrapExpression(expression);

  if (ts.isIdentifier(current)) {
    return aliases.get(current.text) ?? null;
  }

  if (ts.isPropertyAccessExpression(current)) {
    const receiver = unwrapExpression(current.expression);
    if (ts.isIdentifier(receiver) && (receiver.text === "ctx" || receiver.text === "context")) {
      return trackedContextRoots.get(current.name.text) ?? null;
    }
    return resolveMutationRootKind(current.expression, aliases);
  }

  if (ts.isElementAccessExpression(current)) {
    return resolveMutationRootKind(current.expression, aliases);
  }

  return null;
}

function recordAliasFromDeclaration(
  declaration: ts.VariableDeclaration,
  aliases: Map<string, MutationRootKind>,
): void {
  if (!declaration.initializer) {
    return;
  }

  if (ts.isIdentifier(declaration.name)) {
    const rootKind = resolveMutationRootKind(declaration.initializer, aliases);
    if (rootKind) {
      aliases.set(declaration.name.text, rootKind);
    }
    return;
  }

  if (!ts.isObjectBindingPattern(declaration.name)) {
    return;
  }

  const initializer = unwrapExpression(declaration.initializer);
  const isTrackedContextRoot =
    ts.isIdentifier(initializer) && (initializer.text === "ctx" || initializer.text === "context");
  if (!isTrackedContextRoot) {
    return;
  }

  for (const element of declaration.name.elements) {
    if (element.dotDotDotToken || !ts.isIdentifier(element.name)) {
      continue;
    }

    const propertyName =
      element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : element.name.text;
    const rootKind = trackedContextRoots.get(propertyName);
    if (rootKind) {
      aliases.set(element.name.text, rootKind);
    }
  }
}

function recordAliasFromBindingName(
  name: ts.BindingName,
  rootKind: MutationRootKind,
  aliases: Map<string, MutationRootKind>,
): void {
  if (ts.isIdentifier(name)) {
    aliases.set(name.text, rootKind);
    return;
  }

  for (const element of name.elements) {
    if (ts.isOmittedExpression(element) || element.dotDotDotToken) {
      continue;
    }
    recordAliasFromBindingName(element.name, rootKind, aliases);
  }
}

function findingPatternForRoot(rootKind: MutationRootKind): string {
  return rootKind === "state" ? "ctx-state-mutation" : "active-pokemon-mutation";
}

export function scanSourceForDirectMutations(
  sourceText: string,
  filePath: string,
): z.infer<typeof directMutationFindingSchema>[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const findings: z.infer<typeof directMutationFindingSchema>[] = [];
  const emitted = new Set<string>();

  function pushFinding(node: ts.Node, pattern: string): void {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const excerpt = node.getText(sourceFile).trim();
    const key = `${start.line + 1}:${pattern}:${excerpt}`;
    if (emitted.has(key)) {
      return;
    }
    emitted.add(key);
    findings.push({
      filePath,
      line: start.line + 1,
      pattern,
      excerpt,
    });
  }

  function visit(node: ts.Node, aliases: Map<string, MutationRootKind>): void {
    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      visit(node.expression, aliases);

      const loopAliases = new Map(aliases);
      if (ts.isVariableDeclarationList(node.initializer)) {
        const rootKind = resolveMutationRootKind(node.expression, aliases);
        if (rootKind) {
          for (const declaration of node.initializer.declarations) {
            recordAliasFromBindingName(declaration.name, rootKind, loopAliases);
          }
        }
      }

      visit(node.statement, loopAliases);
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      recordAliasFromDeclaration(node, aliases);
    }

    if (ts.isBinaryExpression(node) && assignmentOperatorKinds.has(node.operatorToken.kind)) {
      const rootKind = resolveMutationRootKind(node.left, aliases);
      if (rootKind) {
        pushFinding(node, findingPatternForRoot(rootKind));
      }
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      const rootKind = resolveMutationRootKind(node.operand, aliases);
      if (rootKind) {
        pushFinding(node, findingPatternForRoot(rootKind));
      }
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const rootKind = resolveMutationRootKind(node.expression.expression, aliases);
      if (rootKind && mutatorMethodNames.has(node.expression.name.text)) {
        pushFinding(node, findingPatternForRoot(rootKind));
      }
    }

    const nextAliases =
      ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isFunctionLike(node)
        ? new Map(aliases)
        : aliases;

    ts.forEachChild(node, (child) => visit(child, nextAliases));
  }

  visit(sourceFile, new Map());
  return findings.sort(
    (left, right) => left.line - right.line || left.pattern.localeCompare(right.pattern),
  );
}

function inspectFile(repoRoot: string, filePath: string) {
  const contents = readFileSync(join(repoRoot, filePath), "utf8");
  return scanSourceForDirectMutations(contents, filePath);
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseArgs(process.argv.slice(2));
  const impacts = buildImpactsReport(repoRoot, { baseRef: "origin/main", mode: args.mode });
  const findings = impacts.changedFiles
    .filter((filePath) => shouldInspect(filePath))
    .flatMap((filePath) => inspectFile(repoRoot, filePath));
  const gitSha = git(repoRoot, "rev-parse", "HEAD");
  const resultsDir = join(repoRoot, "tools", "oracle-validation", "results", gitSha, args.mode);
  mkdirSync(resultsDir, { recursive: true });
  const report = directMutationAuditSchema.parse({
    schemaVersion: "direct-mutation-audit.v1",
    gitSha,
    timestamp: new Date().toISOString(),
    mode: args.mode,
    findings,
  });
  const outputPath = join(resultsDir, "direct-mutation-audit.v1.json");
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  if (findings.length > 0) {
    console.error(`Direct mutation audit findings written to ${outputPath}`);
    for (const finding of findings) {
      console.error(
        `- ${finding.filePath}:${finding.line} [${finding.pattern}] ${finding.excerpt}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Direct mutation audit written to ${outputPath}`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main();
}
