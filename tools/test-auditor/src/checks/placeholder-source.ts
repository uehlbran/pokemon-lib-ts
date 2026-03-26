import type { FileContext, Finding } from "../types.ts";

const PLACEHOLDER_SOURCE_RE =
  /\bsource:\s*(?:(["'`])(?:test)?\1|\b[A-Za-z0-9_$.]*testSource\b|\bTEST_SOURCE\b)/;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;
const IMPORT_LINE_RE = /^\s*import\b/;

export function checkPlaceholderSources(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let index = 0; index < ctx.lines.length; index++) {
    const line = ctx.lines[index] ?? "";
    if (IMPORT_LINE_RE.test(line) || COMMENT_LINE_RE.test(line)) continue;
    if (!PLACEHOLDER_SOURCE_RE.test(line)) continue;

    findings.push({
      check: "placeholder-source",
      severity: "warning",
      file: ctx.relativePath,
      line: index + 1,
      message: "Placeholder synthetic source is used in test state/setup",
      suggestion:
        "Use an owned move/ability/source identifier when the setup models real game state, or an explicit synthetic source helper when the setup is intentionally synthetic",
    });
  }

  return findings;
}
