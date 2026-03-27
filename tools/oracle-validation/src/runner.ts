import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDataSuite } from "./compare-data.js";
import { runStatsSuite } from "./compare-stats.js";
import { discoverImplementedGenerations, type ImplementedGeneration } from "./gen-discovery.js";
import { formatRunnerOutput } from "./reporter.js";
import { type GenerationResult, runnerOutputSchema, type SuiteResult } from "./result-schema.js";

type SupportedSuite = "data" | "stats" | "groundTruth" | "fast";
const SUPPORTED_SUITES: ReadonlySet<SupportedSuite> = new Set([
  "data",
  "stats",
  "groundTruth",
  "fast",
]);

/**
 * Parse CLI arguments for the oracle runner.
 */
function parseArgs(argv: string[]): { suites: SupportedSuite[]; gen?: number } {
  const suites: SupportedSuite[] = [];
  let gen: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--suite") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value after --suite");
      if (!SUPPORTED_SUITES.has(value as SupportedSuite)) {
        throw new Error(
          `Invalid --suite value "${value}". Expected one of: ${[...SUPPORTED_SUITES].join(", ")}`,
        );
      }
      suites.push(value as SupportedSuite);
      index += 1;
      continue;
    }

    if (arg === "--gen") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value after --gen");
      gen = Number.parseInt(value, 10);
      if (!Number.isInteger(gen) || gen < 0) {
        throw new Error(`Invalid --gen value "${value}". Expected a non-negative integer.`);
      }
      index += 1;
    }
  }

  return {
    suites: suites.length > 0 ? suites : ["fast"],
    gen,
  };
}

/**
 * Expand composite suite aliases into concrete suite runs.
 */
function expandSuites(suites: SupportedSuite[]): SupportedSuite[] {
  if (suites.includes("fast")) {
    return ["data", "stats", "groundTruth"];
  }

  return suites;
}

/**
 * Build a skipped suite result with a human-readable reason.
 */
function makeSkip(reason: string): SuiteResult {
  return {
    status: "skip",
    suitePassed: false,
    failed: 0,
    skipped: 1,
    failures: [],
    notes: [],
    skipReason: reason,
  };
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const { suites, gen } = parseArgs(process.argv.slice(2));
  const expandedSuites = expandSuites(suites);
  const generations = discoverImplementedGenerations(repoRoot).filter(
    (candidate: ImplementedGeneration) => (gen ? candidate.gen === gen : candidate.gen <= 3),
  );

  const generationResults: GenerationResult[] = generations.map(
    (generation: ImplementedGeneration) => {
      const suiteResults: Record<string, SuiteResult> = {};

      for (const suite of expandedSuites) {
        if (suite === "data") {
          suiteResults[suite] = runDataSuite(generation);
        } else if (suite === "stats") {
          suiteResults[suite] = runStatsSuite(generation);
        } else if (suite === "groundTruth") {
          suiteResults[suite] = makeSkip(
            "Ground-truth scenario harness not implemented in this initial slice",
          );
        }
      }

      return {
        gen: generation.gen,
        packageName: generation.packageName,
        suites: suiteResults,
      };
    },
  );

  const output = runnerOutputSchema.parse({
    timestamp: new Date().toISOString(),
    suitesRequested: expandedSuites,
    generations: generationResults,
  });

  const resultsDir = join(repoRoot, "tools", "oracle-validation", "results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "fast-path.json"), JSON.stringify(output, null, 2));
  console.log(formatRunnerOutput(output));
}

void main();
