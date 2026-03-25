import type { FileContext, Finding } from "../types.ts";

const STALE_COMMENT_RE =
  /\b([A-Za-z][A-Za-z0-9_.-]+)\s+(?:does(?:n't| not)\s+exist\s+yet|is\s+not\s+implemented)\b/i;

export function checkStaleTestComments(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i] ?? "";
    if (!/^\s*(?:\/\/|\/\*|\*)/.test(line)) continue;

    const match = STALE_COMMENT_RE.exec(line);
    if (!match) continue;

    const symbol = match[1] ?? "";
    const symbolPattern = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");
    const occurrences = ctx.content.match(symbolPattern)?.length ?? 0;

    if (occurrences < 2) continue;

    findings.push({
      check: "stale-test-comments",
      severity: "warning",
      file: ctx.relativePath,
      line: i + 1,
      message: `Comment suggests '${symbol}' is missing or unimplemented, but the symbol is present in the file`,
      suggestion:
        "Rewrite the comment to describe current behavior, or remove it if it no longer reflects the test intent",
    });
  }

  return findings;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
