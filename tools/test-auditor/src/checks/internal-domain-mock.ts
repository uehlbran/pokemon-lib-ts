import type { FileContext, Finding } from "../types.ts";

const INTERNAL_MOCK_RE =
  /\bvi\.(?:mock|doMock|unstable_mockModule)\s*\(\s*(['"])(@pokemon-lib-ts\/[^'"]+)\1/;

export function checkInternalDomainMocking(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i] ?? "";
    const match = INTERNAL_MOCK_RE.exec(line);
    if (!match) continue;

    const moduleName = match[2] ?? "";

    findings.push({
      check: "internal-domain-mock",
      severity: "warning",
      file: ctx.relativePath,
      line: i + 1,
      message: `Mocks internal repo module '${moduleName}'`,
      suggestion:
        "Prefer exercising the real internal package or a local stub for boundary-only behavior instead of mocking domain modules",
    });
  }

  return findings;
}
