import type { FileContext, Finding } from "../types.ts";

// Patterns that indicate a test is about behavioral/error scenarios — weak assertions are acceptable
const BEHAVIORAL_TEST_RE = /\b(throw|emit|crash|error|reject)\b/i;

// Regex to detect the start of a test block
const TEST_BLOCK_RE = /^\s*(it|test)\s*\(/;

// Strong assertion method names (value-based, exact comparisons)
const STRONG_ASSERTION_RE = /\.(toBe|toEqual|toStrictEqual|toBeCloseTo)\(/;

// Weak assertion method names (existence/truthiness checks)
const WEAK_ASSERTION_RE =
  /\.(toBeTruthy|toBeFalsy|toBeDefined|toBeUndefined|toBeNull|not\.toBeNull)\(|\.toBeGreaterThan\(0\)|\.toBeGreaterThanOrEqual\(0\)/;

// Regex to capture a test name from the line (handles single, double, and template quotes)
const TEST_NAME_RE = /^\s*(?:it|test)\s*\(\s*(['"`])(.+?)\1/;

export function checkAssertionStrength(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];
  const lines = ctx.lines;

  // Collect all test block start lines
  const testStarts: Array<{ lineIdx: number; name: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (TEST_BLOCK_RE.test(line)) {
      const nameMatch = TEST_NAME_RE.exec(line);
      testStarts.push({ lineIdx: i, name: nameMatch?.[2] ?? "" });
    }
  }

  for (let t = 0; t < testStarts.length; t++) {
    const entry = testStarts[t];
    if (!entry) continue;
    const { lineIdx, name } = entry;
    const nextEntry = testStarts[t + 1];
    const blockEnd = nextEntry !== undefined ? nextEntry.lineIdx : lines.length;

    let hasStrong = false;
    let hasWeak = false;
    let hasExpect = false;

    for (let i = lineIdx; i < blockEnd; i++) {
      const line = lines[i] ?? "";
      if (line.includes("expect(")) hasExpect = true;
      if (STRONG_ASSERTION_RE.test(line)) hasStrong = true;
      if (WEAK_ASSERTION_RE.test(line)) hasWeak = true;
    }

    if (!hasExpect) {
      findings.push({
        check: "assertion-strength",
        severity: "info",
        file: ctx.relativePath,
        line: lineIdx + 1,
        message: "Test block has no assertions",
      });
    } else if (!hasStrong && hasWeak) {
      // Skip behavioral tests — weak assertions are fine for throw/emit/error scenarios
      if (BEHAVIORAL_TEST_RE.test(name)) continue;

      findings.push({
        check: "assertion-strength",
        severity: "warning",
        file: ctx.relativePath,
        line: lineIdx + 1,
        message: "Test block uses only weak assertions",
        suggestion:
          "Replace toBeTruthy/toBeDefined with toBe(expectedValue) — weak assertions pass even when formulas are wrong",
      });
    }
  }

  return findings;
}
