import type { RunnerOutput, SuiteResult } from "./result-schema.js";

export function formatRunnerOutput(output: RunnerOutput): string {
  const lines: string[] = [];
  lines.push(`Oracle validation run at ${output.timestamp}`);
  lines.push(`Suites: ${output.suitesRequested.join(", ")}`);

  for (const generation of output.generations) {
    lines.push(`Gen ${generation.gen} (${generation.packageName})`);
    lines.push(
      `  registry: knownDisagreements=${generation.registry.knownDisagreements.length}, knownOracleBugs=${generation.registry.knownOracleBugs.length}, staleDisagreements=${generation.staleDisagreements.length}`,
    );

    for (const [suite, result] of Object.entries(generation.suites) as [string, SuiteResult][]) {
      const suffix = result.skipReason ? ` — ${result.skipReason}` : "";
      lines.push(
        `  ${suite}: ${result.status} (suitePassed=${result.suitePassed}, failed=${result.failed}, skipped=${result.skipped})${suffix}`,
      );

      for (const knownDisagreement of result.matchedKnownDisagreements) {
        lines.push(`    known-disagreement: ${knownDisagreement}`);
      }
      for (const staleDisagreement of result.staleDisagreements) {
        lines.push(`    stale-disagreement: ${staleDisagreement}`);
      }
      for (const failure of result.failures) {
        lines.push(`    failure: ${failure}`);
      }
    }
  }

  return lines.join("\n");
}
