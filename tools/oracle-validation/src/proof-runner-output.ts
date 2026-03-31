import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { DisagreementRegistrySummary, OracleCheck } from "./disagreement-registry.js";
import {
  coverageReportSchema,
  type ImpactsReport,
  type ProofCheck,
  type ProofSuiteResult,
  type ProofSummary,
  proofSummarySchema,
  runModeSchema,
} from "./proof-artifact-schema.js";
import type { SuiteResult } from "./result-schema.js";

export interface LegacyGenerationRun {
  readonly gen: number;
  readonly packageName: string;
  readonly suites: Record<string, SuiteResult>;
  readonly registry: DisagreementRegistrySummary;
  readonly staleDisagreements: string[];
}

interface ProofCheckMetadata {
  readonly mechanicIds: readonly string[];
  readonly authorityKeys: readonly string[];
  readonly clusters: readonly string[];
  readonly topologies: readonly string[];
}

const RUNTIME_EVIDENCE_SUITES = new Set([
  "groundTruth",
  "damage",
  "mechanics",
  "terrain",
  "gimmicks",
  "edgeCases",
  "replay",
  "damageTrace",
  "smoke",
]);

function createEmptyCounts() {
  return {
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    incomplete: 0,
    deferred: 0,
    advisory: 0,
    interrupted: 0,
  };
}

function inferRunMode(suitesRequested: readonly string[]): "fast" | "full" {
  const requested = new Set(suitesRequested);
  return requested.size === 1 && requested.has("fast") ? "fast" : "full";
}

function classifyCheckStatus(check: OracleCheck): "pass" | "fail" {
  return isDeepStrictEqual(check.ourValue, check.oracleValue) ? "pass" : "fail";
}

function emptyProofCheckMetadata(): ProofCheckMetadata {
  return {
    mechanicIds: [],
    authorityKeys: [],
    clusters: [],
    topologies: [],
  };
}

function resolveProofCheckMetadata(
  generation: LegacyGenerationRun,
  suiteName: string,
  runtimeMechanicMetadataByGeneration: ReadonlyMap<number, ProofCheckMetadata>,
): ProofCheckMetadata {
  if (!RUNTIME_EVIDENCE_SUITES.has(suiteName)) {
    return emptyProofCheckMetadata();
  }

  return runtimeMechanicMetadataByGeneration.get(generation.gen) ?? emptyProofCheckMetadata();
}

function createProofChecks(
  generation: LegacyGenerationRun,
  suiteName: string,
  suiteResult: SuiteResult,
  runtimeMechanicMetadataByGeneration: ReadonlyMap<number, ProofCheckMetadata>,
): ProofCheck[] {
  const metadata = resolveProofCheckMetadata(
    generation,
    suiteName,
    runtimeMechanicMetadataByGeneration,
  );
  const checks: ProofCheck[] = suiteResult.oracleChecks.map((check) => {
    const status = classifyCheckStatus(check);
    const matchedKnownDisagreement = suiteResult.matchedKnownDisagreements.includes(check.id);
    return {
      checkId: `gen${generation.gen}:${suiteName}:oracle:${check.id}`,
      generation: generation.gen,
      suite: suiteName,
      status: matchedKnownDisagreement && status === "fail" ? "advisory" : status,
      enforcement: matchedKnownDisagreement ? "advisory" : "required",
      description: check.description,
      mechanicIds: [...metadata.mechanicIds],
      authorityKeys: [...metadata.authorityKeys],
      clusters: [...metadata.clusters],
      topologies: [...metadata.topologies],
      sourceRole: "authoritative",
      rawOurValue: check.ourValue,
      rawOracleValue: check.oracleValue,
      normalizedOurValue: check.ourValue,
      normalizedOracleValue: check.oracleValue,
      normalizationIds: [],
      tolerance: null,
    };
  });

  if (checks.length === 0) {
    for (const [index, failure] of suiteResult.failures.entries()) {
      checks.push({
        checkId: `gen${generation.gen}:${suiteName}:failure:${index + 1}`,
        generation: generation.gen,
        suite: suiteName,
        status: "fail",
        enforcement: "required",
        description: failure,
        mechanicIds: [...metadata.mechanicIds],
        authorityKeys: [...metadata.authorityKeys],
        clusters: [...metadata.clusters],
        topologies: [...metadata.topologies],
        sourceRole: "authoritative",
        normalizationIds: [],
      });
    }
  }

  return checks;
}

export function summarizeSuite(
  suiteName: string,
  suiteResult: SuiteResult,
  checks: readonly ProofCheck[],
): ProofSuiteResult {
  const requiredCounts = createEmptyCounts();
  const advisoryCounts = createEmptyCounts();

  const enforcement =
    suiteName === "smoke" ||
    suiteName === "damageTrace" ||
    suiteName === "replay" ||
    suiteName === "stats"
      ? "advisory"
      : "required";

  for (const check of checks) {
    const counts = check.enforcement === "required" ? requiredCounts : advisoryCounts;
    counts.executed += 1;
    if (check.status === "pass") counts.passed += 1;
    else if (check.status === "fail") counts.failed += 1;
    else if (check.status === "skip") counts.skipped += 1;
    else if (check.status === "incomplete") counts.incomplete += 1;
    else if (check.status === "deferred") counts.deferred += 1;
    else if (check.status === "interrupted") counts.interrupted += 1;
    else counts.advisory += 1;
  }

  const hasProofChecks = requiredCounts.executed > 0 || advisoryCounts.executed > 0;
  const requiredNonSkippedChecks = requiredCounts.executed - requiredCounts.skipped;

  let status: ProofSuiteResult["status"];
  if (suiteResult.status === "skip") {
    status = "skip";
  } else if (suiteResult.failed > 0 || requiredCounts.failed > 0) {
    status = "fail";
  } else if (requiredCounts.interrupted > 0) {
    status = "interrupted";
  } else if (requiredCounts.incomplete > 0) {
    status = "incomplete";
  } else if (requiredCounts.deferred > 0) {
    status = "deferred";
  } else if (enforcement === "required" && requiredNonSkippedChecks === 0) {
    // Required suites are fail-closed once the proof pipeline is active. A legacy
    // pass result without non-skipped required proof checks is missing evidence,
    // not success.
    status = "incomplete";
  } else if (!hasProofChecks) {
    status = "advisory";
  } else if (enforcement === "advisory") {
    status = "advisory";
  } else {
    status = "pass";
  }

  return {
    suite: suiteName,
    status,
    enforcement,
    requiredCounts,
    advisoryCounts,
    failures: suiteResult.failures,
    notes: suiteResult.notes,
    matchedKnownDisagreements: suiteResult.matchedKnownDisagreements,
    staleDisagreements: suiteResult.staleDisagreements,
    checkIds: checks.map((check) => check.checkId),
  };
}

function summarizeGeneration(
  generation: LegacyGenerationRun,
  runtimeMechanicMetadataByGeneration: ReadonlyMap<number, ProofCheckMetadata>,
): {
  summary: ProofSummary["generations"][number];
  checks: ProofCheck[];
} {
  const suiteEntries = Object.entries(generation.suites).map(([suiteName, suiteResult]) => {
    const checks = createProofChecks(
      generation,
      suiteName,
      suiteResult,
      runtimeMechanicMetadataByGeneration,
    );
    return {
      suiteName,
      checks,
      result: summarizeSuite(suiteName, suiteResult, checks),
    };
  });

  const suites = Object.fromEntries(
    suiteEntries.map((entry) => [entry.suiteName, entry.result] as const),
  );
  const checks = suiteEntries.flatMap((entry) => entry.checks);

  let conclusion: ProofSummary["generations"][number]["conclusion"] = "compliant";
  if (suiteEntries.some((entry) => entry.result.status === "fail")) {
    conclusion = "fail";
  } else if (
    suiteEntries.some(
      (entry) =>
        entry.result.status === "incomplete" ||
        entry.result.status === "interrupted" ||
        entry.result.status === "deferred",
    )
  ) {
    conclusion = "interrupted";
  } else if (suiteEntries.every((entry) => entry.result.enforcement === "advisory")) {
    conclusion = "provisional-pass";
  }

  return {
    summary: {
      gen: generation.gen,
      packageName: generation.packageName,
      conclusion,
      suites,
    },
    checks,
  };
}

function computeOverallConclusion(
  runMode: "fast" | "full",
  generationSummaries: readonly ProofSummary["generations"][number][],
): ProofSummary["conclusion"] {
  if (generationSummaries.some((generation) => generation.conclusion === "fail")) {
    return "fail";
  }
  if (generationSummaries.some((generation) => generation.conclusion === "interrupted")) {
    return "interrupted";
  }
  return runMode === "fast" ? "provisional-pass" : "compliant";
}

export function buildProofSummary(
  gitSha: string,
  suitesRequested: readonly string[],
  generations: readonly LegacyGenerationRun[],
  runtimeMechanicMetadataByGeneration: ReadonlyMap<number, ProofCheckMetadata> = new Map(),
): {
  summary: ProofSummary;
  checks: ProofCheck[];
} {
  const runMode = inferRunMode(suitesRequested);
  runModeSchema.parse(runMode);
  const summarized = generations.map((generation) =>
    summarizeGeneration(generation, runtimeMechanicMetadataByGeneration),
  );
  const generationSummaries = summarized.map((entry) => entry.summary);
  const summary = proofSummarySchema.parse({
    schemaVersion: "proof-summary.v1",
    gitSha,
    timestamp: new Date().toISOString(),
    runMode,
    suitesRequested,
    conclusion: computeOverallConclusion(runMode, generationSummaries),
    generations: generationSummaries,
  });

  return {
    summary,
    checks: summarized.flatMap((entry) => entry.checks),
  };
}

function readImpacts(resultsDir: string): ImpactsReport | null {
  const path = join(resultsDir, "impacts.v1.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ImpactsReport;
  } catch {
    return null;
  }
}

export function writeProofArtifacts(
  repoRoot: string,
  gitSha: string,
  summary: ProofSummary,
  checks: readonly ProofCheck[],
): string {
  const resultsDir = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "results",
    gitSha,
    summary.runMode,
  );
  mkdirSync(resultsDir, { recursive: true });

  const summaryPath = join(resultsDir, "summary.v1.json");
  const checksPath = join(resultsDir, "checks.v1.jsonl");
  const coveragePath = join(resultsDir, "coverage.v1.json");
  const impacts = readImpacts(resultsDir);
  const impactsPath = join(resultsDir, "impacts.v1.json");

  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  writeFileSync(checksPath, `${checks.map((check) => JSON.stringify(check)).join("\n")}\n`);
  writeFileSync(
    coveragePath,
    JSON.stringify(
      coverageReportSchema.parse({
        schemaVersion: "coverage.v1",
        gitSha,
        timestamp: summary.timestamp,
        runMode: summary.runMode,
        generations: summary.generations.map((generation) => ({
          gen: generation.gen,
          packageName: generation.packageName,
          suites: generation.suites,
        })),
      }),
      null,
      2,
    ),
  );
  if (impacts) {
    writeFileSync(impactsPath, JSON.stringify(impacts, null, 2));
  }

  return resultsDir;
}
