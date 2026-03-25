import type { FileContext, Finding } from "../types.ts";

const TODO_SKIP_RE = /^\s*(?:it|test|describe)\.(todo|skip)\s*\(/;

export function checkTodoSkipDebt(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i] ?? "";
    const match = TODO_SKIP_RE.exec(line);
    if (!match) continue;

    findings.push({
      check: "todo-skip-debt",
      severity: "warning",
      file: ctx.relativePath,
      line: i + 1,
      message: `Explicit ${match[1]} debt remains in a committed test file`,
      suggestion:
        "Implement the test or convert the gap into a tracked issue instead of leaving todo/skip in committed tests",
    });
  }

  return findings;
}
