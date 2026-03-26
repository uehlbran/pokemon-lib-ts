import type { FileContext, Finding } from "../types.ts";

const TEST_BLOCK_RE = /^\s*(it|test)\s*\(/;
const TEST_NAME_RE = /^\s*(?:it|test)\s*\(\s*(['"`])(.+?)\1/;
const MESSAGE_CONTEXT_RE = /\b(?:message|messages|text|events)\b/;
const SUBSTRING_PROXY_RE = /\.includes\(/;
const WEAK_BOOLEAN_PROXY_RE =
  /(?:\.toBe\(true\)|\.toBe\(false\)|\.toBeTruthy\(\)|\.toBeFalsy\(\)|\.toBeDefined\(\))/;
const STRONG_MESSAGE_ASSERTION_RE =
  /(?:toContainEqual|toEqual|toStrictEqual|toMatchObject)\(\s*\{[\s\S]*\btext:\s*['"`]/;

export function checkMessageProxyAssertions(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];
  const testStarts: Array<{ lineIdx: number; name: string }> = [];

  for (let index = 0; index < ctx.lines.length; index++) {
    const line = ctx.lines[index] ?? "";
    if (!TEST_BLOCK_RE.test(line)) continue;
    const nameMatch = TEST_NAME_RE.exec(line);
    testStarts.push({ lineIdx: index, name: nameMatch?.[2] ?? "" });
  }

  for (let testIndex = 0; testIndex < testStarts.length; testIndex++) {
    const entry = testStarts[testIndex];
    if (!entry) continue;
    const nextEntry = testStarts[testIndex + 1];
    const blockEnd = nextEntry ? nextEntry.lineIdx : ctx.lines.length;
    const blockLines = ctx.lines.slice(entry.lineIdx, blockEnd);
    const block = blockLines.join("\n");

    if (!MESSAGE_CONTEXT_RE.test(block)) continue;
    if (!SUBSTRING_PROXY_RE.test(block)) continue;
    if (!WEAK_BOOLEAN_PROXY_RE.test(block)) continue;
    if (STRONG_MESSAGE_ASSERTION_RE.test(block)) continue;

    findings.push({
      check: "message-proxy-assertion",
      severity: "warning",
      file: ctx.relativePath,
      line: entry.lineIdx + 1,
      message: `Test "${entry.name}" uses substring/proxy message assertions`,
      suggestion:
        "Assert the exact message only when text is the contract, or assert stronger state/events instead of includes()/some()/find()+toBeDefined() proxies",
    });
  }

  return findings;
}
