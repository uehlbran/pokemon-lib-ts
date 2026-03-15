import type { ValidationResult, ValidationSeverity } from "./replay-types.js";
import type { SimulationResult } from "./simulation/types.js";

// ANSI color codes
const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  bold: "\x1b[1m",
} as const;

function colorize(text: string, color: keyof typeof ANSI, noColor: boolean): string {
  if (noColor) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function severityLabel(severity: ValidationSeverity, noColor: boolean): string {
  switch (severity) {
    case "error":
      return colorize("ERROR", "red", noColor);
    case "warning":
      return colorize("WARN ", "yellow", noColor);
    case "info":
      return colorize("INFO ", "blue", noColor);
  }
}

export function formatReport(
  result: ValidationResult,
  opts?: { json?: boolean; noColor?: boolean },
): string {
  if (opts?.json) {
    return JSON.stringify(result, null, 2);
  }

  const noColor = opts?.noColor ?? false;
  const lines: string[] = [];

  // Header
  lines.push(`Replay: ${result.replayId}`);
  lines.push(
    `Format: ${result.format} | Turns: ${result.totalTurns} | Winner: ${result.winner ?? "none"}`,
  );
  lines.push("");

  // Mismatches
  for (const m of result.mismatches) {
    const label = severityLabel(m.severity, noColor);
    lines.push(`Turn ${m.turnNumber}: ${label}  ${m.check} — ${m.message}`);
  }

  if (result.mismatches.length > 0) {
    lines.push("");
  }

  // Summary
  const errors = result.mismatches.filter((m) => m.severity === "error").length;
  const warnings = result.mismatches.filter((m) => m.severity === "warning").length;
  const skipped = result.mismatches.filter((m) => m.severity === "info").length;

  const passedStr = colorize(`${result.passed} passed`, "green", noColor);
  const summaryParts = [passedStr];
  if (errors > 0)
    summaryParts.push(colorize(`${errors} error${errors !== 1 ? "s" : ""}`, "red", noColor));
  if (warnings > 0)
    summaryParts.push(
      colorize(`${warnings} warning${warnings !== 1 ? "s" : ""}`, "yellow", noColor),
    );
  if (skipped > 0) summaryParts.push(`${skipped} skipped`);

  lines.push(`Summary: ${summaryParts.join(", ")}`);

  return lines.join("\n");
}

export function printReport(
  result: ValidationResult,
  opts?: { json?: boolean; noColor?: boolean },
): void {
  const text = formatReport(result, opts);
  process.stdout.write(`${text}\n`);
}

/**
 * Format a combined report for multiple replays.
 */
export function formatCombinedReport(
  results: readonly ValidationResult[],
  opts?: { json?: boolean; noColor?: boolean },
): string {
  if (opts?.json) {
    return JSON.stringify(results, null, 2);
  }

  const parts = results.map((r) => formatReport(r, opts));

  // Add overall summary
  const totalErrors = results.reduce(
    (sum, r) => sum + r.mismatches.filter((m) => m.severity === "error").length,
    0,
  );
  const totalWarnings = results.reduce(
    (sum, r) => sum + r.mismatches.filter((m) => m.severity === "warning").length,
    0,
  );
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);

  const noColor = opts?.noColor ?? false;
  const overallSummary = [
    "",
    "─".repeat(60),
    `Overall: ${results.length} replays | ${colorize(`${totalPassed} passed`, "green", noColor)} | ${totalErrors} errors | ${totalWarnings} warnings`,
  ].join("\n");

  return [...parts, overallSummary].join("\n\n");
}

export function formatSimulationReport(
  result: SimulationResult,
  opts?: { json?: boolean; noColor?: boolean; verbose?: boolean },
): string {
  const { report } = result;
  const noColor = opts?.noColor ?? false;

  if (opts?.json) {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [];

  // Header
  lines.push(`Battle Simulation: Gen ${report.config.generation}`);
  lines.push("=".repeat(40));
  lines.push(
    `Battles: ${report.totalBattles} | Teams: ${report.config.teamSize}v${report.config.teamSize} | Max turns: ${report.config.maxTurns} | Seed: ${report.config.seed}`,
  );
  lines.push("");

  // Summary line
  const completedStr = colorize(`✓ ${report.completed} completed`, "green", noColor);
  const violationsCount = report.violations.length;
  const violStr =
    violationsCount > 0
      ? colorize(`✗ ${violationsCount} violations`, "red", noColor)
      : colorize(`✓ 0 violations`, "green", noColor);
  const timeoutStr =
    report.timedOut > 0
      ? colorize(
          `⚠ ${report.timedOut} timeout${report.timedOut !== 1 ? "s" : ""}`,
          "yellow",
          noColor,
        )
      : null;
  const crashStr =
    report.crashed > 0
      ? colorize(`✗ ${report.crashed} crash${report.crashed !== 1 ? "es" : ""}`, "red", noColor)
      : null;

  const summaryParts = [completedStr, violStr];
  if (timeoutStr) summaryParts.push(timeoutStr);
  if (crashStr) summaryParts.push(crashStr);
  lines.push(`  ${summaryParts.join("    ")}`);
  lines.push("");

  // Violations
  if (report.violations.length > 0) {
    lines.push("Failures:");
    for (const v of report.violations.slice(0, 20)) {
      const label = `[${v.invariant}]`.padEnd(30);
      const turn = v.turnNumber !== null ? `, turn ${v.turnNumber}` : "";
      lines.push(
        `  ${colorize(label, "red", noColor)} Seed ${report.config.seed}${turn}: ${v.message}`,
      );
    }
    if (report.violations.length > 20) {
      lines.push(`  ... and ${report.violations.length - 20} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
