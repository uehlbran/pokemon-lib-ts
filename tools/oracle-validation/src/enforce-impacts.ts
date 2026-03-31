import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { type ImpactsReport, impactsReportSchema } from "./proof-artifact-schema.js";

const knownSuites = new Set([
  "changeset-check",
  "lint",
  "oracle-fast",
  "package-boundaries",
  "pret-validate",
  "proof-preview",
  "test",
  "typecheck",
  "typecheck:contracts",
  "workflow-contract",
]);

interface Args {
  readonly mode: string;
  readonly executedSuites: string[];
}

interface EnforcementResult {
  readonly errors: string[];
  readonly requiredSuites: string[];
  readonly executedSuites: string[];
}

function parseArgs(argv: string[]): Args {
  let mode = "local-preview";
  const executedSuites: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") {
      mode = argv[index + 1] ?? mode;
      index += 1;
      continue;
    }
    if (arg === "--executed-suite") {
      const suite = argv[index + 1];
      if (suite) executedSuites.push(suite);
      index += 1;
    }
  }

  return { mode, executedSuites };
}

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function canonicalizeSuiteId(suiteId: string): string {
  switch (suiteId) {
    case "oracle-runner":
      return "oracle-fast";
    default:
      return suiteId;
  }
}

export function evaluateImpactsEnforcement(
  impacts: ImpactsReport,
  executedSuites: readonly string[],
): EnforcementResult {
  const errors: string[] = [];
  const canonicalExecutedSuites = [...new Set(executedSuites.map(canonicalizeSuiteId))].sort();
  const requiredSuites = [...new Set(impacts.requiredSuites.map(canonicalizeSuiteId))].sort();

  for (const suiteId of canonicalExecutedSuites) {
    if (!knownSuites.has(suiteId)) {
      errors.push(`Unknown executed suite id: ${suiteId}`);
    }
  }

  for (const suiteId of requiredSuites) {
    if (!knownSuites.has(suiteId)) {
      errors.push(`Unknown required suite id in impacts.v1.json: ${suiteId}`);
      continue;
    }
    if (!canonicalExecutedSuites.includes(suiteId)) {
      errors.push(`Required suite ${suiteId} was not executed for mode ${impacts.mode}.`);
    }
  }

  if (impacts.lowConfidenceFiles.length > 0) {
    errors.push(
      `Low-confidence ownership mapping detected: ${impacts.lowConfidenceFiles.join(", ")}`,
    );
  }

  if (impacts.unmappedRuntimeOwningFiles.length > 0) {
    errors.push(
      `Unmapped runtime-owning files detected: ${impacts.unmappedRuntimeOwningFiles.join(", ")}`,
    );
  }

  return {
    errors,
    requiredSuites,
    executedSuites: canonicalExecutedSuites,
  };
}

function loadImpactsReport(repoRoot: string, mode: string): ImpactsReport {
  const gitSha = git(repoRoot, "rev-parse", "HEAD");
  const impactsPath = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "results",
    gitSha,
    mode,
    "impacts.v1.json",
  );

  let rawJson: string;
  try {
    rawJson = readFileSync(impactsPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Missing impacts artifact at ${impactsPath}: ${message}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid impacts artifact JSON at ${impactsPath}: ${message}`);
  }

  return impactsReportSchema.parse(parsedJson);
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseArgs(process.argv.slice(2));
  const impacts = loadImpactsReport(repoRoot, args.mode);
  const result = evaluateImpactsEnforcement(impacts, args.executedSuites);

  if (result.errors.length > 0) {
    console.error(`Impacts enforcement failed for ${args.mode}.`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Impacts enforcement passed for ${args.mode}. Required suites: ${result.requiredSuites.join(", ") || "(none)"}`,
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main();
}
