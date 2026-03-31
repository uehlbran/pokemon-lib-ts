import type { ProofSuiteResult, ProofSummary } from "./proof-artifact-schema.js";

export function formatRunnerOutput(output: ProofSummary): string {
  const lines: string[] = [];
  lines.push(`Oracle validation run at ${output.timestamp}`);
  lines.push(
    `Mode: ${output.runMode} — conclusion=${output.conclusion} — suites=${output.suitesRequested.join(", ")}`,
  );

  for (const generation of output.generations) {
    lines.push(`Gen ${generation.gen} (${generation.packageName}) — ${generation.conclusion}`);

    for (const [suite, result] of Object.entries(generation.suites) as [
      string,
      ProofSuiteResult,
    ][]) {
      lines.push(
        `  ${suite}: ${result.status} (${result.enforcement}, required=${result.requiredCounts.executed}, advisory=${result.advisoryCounts.executed})`,
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
