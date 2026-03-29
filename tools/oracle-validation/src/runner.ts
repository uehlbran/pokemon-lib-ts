import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReplaySuite } from "./battle-replay.js";
import { runDamageSuite } from "./compare-damage.js";
import { runDataSuite } from "./compare-data.js";
import { runGimmicksSuite } from "./compare-gimmicks.js";
import { runGroundTruthSuite } from "./compare-ground-truth.js";
import { runMechanicsSuite } from "./compare-mechanics.js";
import { runStatsSuite } from "./compare-stats.js";
import { runTerrainSuite } from "./compare-terrain.js";
import { runDamageTraceSuite } from "./damage-trace.js";
import { loadDisagreementRegistrySummary } from "./disagreement-registry.js";
import { discoverImplementedGenerations, type ImplementedGeneration } from "./gen-discovery.js";
import { formatRunnerOutput } from "./reporter.js";
import { type GenerationResult, runnerOutputSchema, type SuiteResult } from "./result-schema.js";
import { runSmokeSuite } from "./smoke-runner.js";

type SupportedSuite =
  | "data"
  | "stats"
  | "groundTruth"
  | "damage"
  | "mechanics"
  | "terrain"
  | "gimmicks"
  | "replay"
  | "damageTrace"
  | "smoke"
  | "fast";
const SUPPORTED_SUITES: ReadonlySet<SupportedSuite> = new Set([
  "data",
  "stats",
  "groundTruth",
  "damage",
  "mechanics",
  "terrain",
  "gimmicks",
  "replay",
  "damageTrace",
  "smoke",
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
      if (!Number.isInteger(gen) || gen < 1 || gen > 9) {
        throw new Error(`Invalid --gen value "${value}". Expected an integer between 1 and 9.`);
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
    return ["data", "stats", "groundTruth", "damage", "mechanics", "terrain", "gimmicks"];
  }

  return suites;
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const { suites, gen } = parseArgs(process.argv.slice(2));
  const expandedSuites = expandSuites(suites);
  const generations = discoverImplementedGenerations(repoRoot).filter(
    (candidate: ImplementedGeneration) => (gen !== undefined ? candidate.gen === gen : true),
  );

  if (generations.length === 0) {
    console.error(
      gen !== undefined
        ? `No implemented generation matches --gen ${gen}. Check packages/gen${gen}/ exists.`
        : "No implemented generations discovered. Check the packages/ directory.",
    );
    process.exitCode = 1;
    return;
  }

  const generationResults: GenerationResult[] = generations.map(
    (generation: ImplementedGeneration) => {
      const suiteResults: Record<string, SuiteResult> = {};
      const registry = loadDisagreementRegistrySummary(generation, repoRoot);

      for (const suite of expandedSuites) {
        if (suite === "data") {
          suiteResults[suite] = runDataSuite(generation, registry.knownDisagreements);
        } else if (suite === "stats") {
          suiteResults[suite] = runStatsSuite(generation);
        } else if (suite === "groundTruth") {
          suiteResults[suite] = runGroundTruthSuite(generation, repoRoot);
        } else if (suite === "damage") {
          suiteResults[suite] = runDamageSuite(generation, registry.knownDisagreements);
        } else if (suite === "mechanics") {
          suiteResults[suite] = runMechanicsSuite(generation, registry.knownDisagreements);
        } else if (suite === "terrain") {
          suiteResults[suite] = runTerrainSuite(generation, registry.knownDisagreements);
        } else if (suite === "gimmicks") {
          suiteResults[suite] = runGimmicksSuite(generation, registry.knownDisagreements);
        } else if (suite === "replay") {
          suiteResults[suite] = runReplaySuite(generation, repoRoot);
        } else if (suite === "damageTrace") {
          suiteResults[suite] = runDamageTraceSuite(generation);
        } else if (suite === "smoke") {
          suiteResults[suite] = runSmokeSuite(generation);
        }
      }

      return {
        gen: generation.gen,
        packageName: generation.packageName,
        suites: suiteResults,
        registry,
        staleDisagreements: [
          ...new Set(Object.values(suiteResults).flatMap((result) => result.staleDisagreements)),
        ].sort(),
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

  // Exit non-zero if any suite has actual failures (stale disagreements also count)
  const hasFailures = output.generations.some(
    (g) => Object.values(g.suites).some((s) => s.failed > 0) || g.staleDisagreements.length > 0,
  );
  if (hasFailures) {
    process.exitCode = 1;
  }
}

void main();
