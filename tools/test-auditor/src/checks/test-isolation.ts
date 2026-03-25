import type { FileContext, Finding } from "../types.ts";

const LET_DECL_RE = /^\s*let\s+(\w+)/;
const TEST_BLOCK_RE = /^\s*(?:it|test)\s*\(/;

export function checkTestIsolation(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];
  const lines = ctx.lines;
  const content = ctx.content;

  // Collect all describe-scope let declarations
  const letDeclarations: Array<{ varName: string; lineIdx: number }> = [];

  let braceDepth = 0;
  let activeTestDepth: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (activeTestDepth === null && TEST_BLOCK_RE.test(line)) {
      activeTestDepth = braceDepth;
    }

    const match = activeTestDepth === null ? LET_DECL_RE.exec(line) : null;
    if (match) {
      letDeclarations.push({ varName: match[1] ?? "", lineIdx: i });
    }

    braceDepth += countChar(line, "{") - countChar(line, "}");
    if (activeTestDepth !== null && braceDepth <= activeTestDepth) {
      activeTestDepth = null;
    }
  }

  for (const { varName, lineIdx } of letDeclarations) {
    // Check if this variable is reassigned inside any it()/test() block
    // Reassignment patterns: `varName =`, `varName.push(`, `varName[`
    const reassignRE = new RegExp(
      `(?:^|\\s)${escapeRegex(varName)}\\s*=|(?:^|\\s)${escapeRegex(varName)}\\.push\\(|(?:^|\\s)${escapeRegex(varName)}\\[`,
      "m",
    );

    // Only look at lines after the declaration
    const afterDecl = lines.slice(lineIdx + 1).join("\n");
    if (!reassignRE.test(afterDecl)) continue;

    // Check if there is a beforeEach that resets this variable
    const hasBeforeEachReset = hasBeforeEachWithReset(content, varName);

    if (!hasBeforeEachReset) {
      findings.push({
        check: "test-isolation",
        severity: "warning",
        file: ctx.relativePath,
        line: lineIdx + 1,
        message: `Shared mutable variable '${varName}' is reassigned inside test blocks without a beforeEach reset`,
        suggestion:
          "Move variable initialisation into a beforeEach() hook to ensure test isolation",
      });
    }
  }

  return findings;
}

/**
 * Returns true if the file content contains a beforeEach block that assigns to varName.
 * Uses a simple scan: find "beforeEach(" then scan forward for varName + "=" within the same block.
 */
function hasBeforeEachWithReset(content: string, varName: string): boolean {
  const beforeEachRE = /beforeEach\s*\(/g;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
  while ((match = beforeEachRE.exec(content)) !== null) {
    // Grab the text from the match position to a reasonable lookahead (500 chars)
    const slice = content.slice(match.index, match.index + 500);
    const assignRE = new RegExp(`\\b${escapeRegex(varName)}\\s*=`);
    if (assignRE.test(slice)) return true;
  }

  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countChar(line: string, needle: "{" | "}"): number {
  return [...line].filter((char) => char === needle).length;
}
