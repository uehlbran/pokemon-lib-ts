import type { FileContext, Finding } from "../types.ts";

// Numeric literals that are too trivial to require a source citation
const TRIVIAL_VALUES = new Set(["0", "1", "-1", "2", "-2", "0.5", "100"]);

// Keywords in comments that constitute a valid citation/derivation
const CITATION_KEYWORDS = [
  "Source:",
  "Ref:",
  "Derived:",
  "Bulbapedia",
  "Showdown",
  "pret",
  "pokered",
  "pokecrystal",
  "ground-truth",
  "formula:",
  "verified",
  "ROM",
  "floor(",
  "ceil(",
  "Math.",
];

// Matches assertion calls with a numeric literal argument
const NUMERIC_ASSERTION_RE = /\.(toBe|toEqual|toBeCloseTo)\(\s*(-?\d[\d.]*)\s*\)/;

// Matches the start of a test or describe block
const BLOCK_START_RE = /^\s*(it|test|describe)\s*\(/;

export function checkProvenance(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i] ?? "";
    const match = NUMERIC_ASSERTION_RE.exec(line);
    if (!match) continue;

    const value = match[2] ?? "";
    if (TRIVIAL_VALUES.has(value)) continue;

    // Scan back to the nearest enclosing test/describe block start for citations.
    // This handles AAA-style tests where derivation comments appear at the top of
    // the test body, many lines above the assertion.
    let startIdx = Math.max(0, i - 3);
    for (let j = i - 1; j >= 0; j--) {
      if (BLOCK_START_RE.test(ctx.lines[j] ?? "")) {
        startIdx = j;
        break;
      }
    }
    const contextLines = ctx.lines.slice(startIdx, i + 1).join("\n");

    const hasCitation = CITATION_KEYWORDS.some((kw) => contextLines.includes(kw));
    if (hasCitation) continue;

    findings.push({
      check: "provenance",
      severity: "warning",
      file: ctx.relativePath,
      line: i + 1,
      message: `Numeric assertion ${value} lacks a source comment`,
      suggestion:
        "Add a comment citing Bulbapedia, pret disassembly, or inline derivation (e.g., // floor(...) = N)",
    });
  }

  return findings;
}
