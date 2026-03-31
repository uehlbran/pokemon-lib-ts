import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadControlPlane } from "./control-plane.js";
import {
  type ImpactsReport,
  impactsReportSchema,
  type ProofCheck,
  type ProofSummary,
  proofCheckSchema,
  proofSummarySchema,
  type WorkflowContractArtifact,
  workflowContractArtifactSchema,
} from "./proof-artifact-schema.js";
import { validateControlPlane } from "./validate-control-plane.js";

interface Args {
  readonly mode: string;
  readonly executedSuites: string[];
}

interface EnforcementResult {
  readonly errors: string[];
  readonly requiredSuites: string[];
  readonly executedSuites: string[];
}

interface OracleFastEvidence {
  readonly summary: ProofSummary;
  readonly checks: readonly ProofCheck[];
}

type ArtifactBackedSuiteStatus = "pass" | "fail";

function isExpired(date: string, now: Date): boolean {
  return new Date(`${date}T23:59:59.999Z`).getTime() < now.getTime();
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

export function touchedOwnershipKeysForValidation(impacts: ImpactsReport): string[] {
  return [...new Set([...impacts.directOwnershipKeys, ...impacts.transitiveOwnershipKeys])].sort();
}

export function evaluateImpactsEnforcement(
  impacts: ImpactsReport,
  executedSuites: readonly string[],
  knownSuites: ReadonlySet<string>,
  controlPlaneErrors: readonly string[] = [],
  touchedOracleMechanicIds: readonly string[] = [],
  oracleFastEvidence: OracleFastEvidence | null = null,
  artifactBackedSuites: ReadonlyMap<string, ArtifactBackedSuiteStatus> = new Map(),
  waivedOracleMechanicIds: readonly string[] = [],
): EnforcementResult {
  const errors: string[] = [...controlPlaneErrors];
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
    const artifactBackedStatus = artifactBackedSuites.get(suiteId);
    if (artifactBackedStatus) {
      if (artifactBackedStatus !== "pass") {
        errors.push(`Artifact-backed suite ${suiteId} did not pass for mode ${impacts.mode}.`);
      }
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

  const waivedOracleMechanicIdSet = new Set(waivedOracleMechanicIds);
  const requiredOracleMechanicIds = [...new Set(touchedOracleMechanicIds)]
    .filter((mechanicId) => !waivedOracleMechanicIdSet.has(mechanicId))
    .sort();
  if (requiredOracleMechanicIds.length > 0) {
    if (!requiredSuites.includes("oracle-fast")) {
      errors.push(
        `Touched mechanics require oracle-fast evidence, but impacts.v1.json did not declare oracle-fast as a required suite: ${requiredOracleMechanicIds.join(", ")}`,
      );
    } else if (!oracleFastEvidence) {
      errors.push(
        `Missing oracle-fast proof artifacts for touched mechanics: ${requiredOracleMechanicIds.join(", ")}`,
      );
    } else {
      if (oracleFastEvidence.summary.runMode !== "fast") {
        errors.push(
          `oracle-fast proof summary must have runMode=fast, received ${oracleFastEvidence.summary.runMode}.`,
        );
      }
      if (oracleFastEvidence.summary.conclusion === "fail") {
        errors.push(
          `oracle-fast proof summary conclusion must not be fail, received ${oracleFastEvidence.summary.conclusion}.`,
        );
      }

      const evidencedMechanicIds = new Set(
        oracleFastEvidence.checks
          .filter((check) => check.enforcement === "required" && check.status === "pass")
          .flatMap((check) => check.mechanicIds),
      );

      for (const mechanicId of requiredOracleMechanicIds) {
        if (!evidencedMechanicIds.has(mechanicId)) {
          errors.push(
            `Touched mechanic ${mechanicId} has no required oracle-fast proof checks in checks.v1.jsonl.`,
          );
        }
      }
    }
  }

  return {
    errors,
    requiredSuites,
    executedSuites: canonicalExecutedSuites,
  };
}

function loadProofSummary(repoRoot: string, runMode: "fast" | "full"): ProofSummary {
  const gitSha = git(repoRoot, "rev-parse", "HEAD");
  const summaryPath = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "results",
    gitSha,
    runMode,
    "summary.v1.json",
  );

  let rawJson: string;
  try {
    rawJson = readFileSync(summaryPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Missing proof summary artifact at ${summaryPath}: ${message}`);
  }

  return proofSummarySchema.parse(JSON.parse(rawJson));
}

function loadProofChecks(repoRoot: string, runMode: "fast" | "full"): ProofCheck[] {
  const gitSha = git(repoRoot, "rev-parse", "HEAD");
  const checksPath = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "results",
    gitSha,
    runMode,
    "checks.v1.jsonl",
  );

  let rawLines: string;
  try {
    rawLines = readFileSync(checksPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Missing proof checks artifact at ${checksPath}: ${message}`);
  }

  return rawLines
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => proofCheckSchema.parse(JSON.parse(line)));
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

function loadWorkflowContractArtifact(repoRoot: string, mode: string): WorkflowContractArtifact {
  const gitSha = git(repoRoot, "rev-parse", "HEAD");
  const artifactPath = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "results",
    gitSha,
    mode,
    "workflow-contract.v1.json",
  );

  let rawJson: string;
  try {
    rawJson = readFileSync(artifactPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Missing workflow contract artifact at ${artifactPath}: ${message}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid workflow contract artifact JSON at ${artifactPath}: ${message}`);
  }

  return workflowContractArtifactSchema.parse(parsedJson);
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseArgs(process.argv.slice(2));
  const impacts = loadImpactsReport(repoRoot, args.mode);
  const controlPlane = loadControlPlane(repoRoot);
  const controlPlaneResult = validateControlPlane(controlPlane, {
    touchedMechanicIds: impacts.transitiveMechanicIds,
    touchedOwnershipKeys: touchedOwnershipKeysForValidation(impacts),
  });
  const artifactBackedSuites = new Map<string, ArtifactBackedSuiteStatus>([
    ["proof-preview", "pass"],
  ]);
  if (impacts.requiredSuites.map(canonicalizeSuiteId).includes("workflow-contract")) {
    const workflowContractArtifact = loadWorkflowContractArtifact(repoRoot, args.mode);
    artifactBackedSuites.set("workflow-contract", workflowContractArtifact.status);
  }
  const now = new Date();
  const waivedOracleMechanicIds = [
    ...new Set(
      controlPlane.bootstrapWaivers.waivers
        .filter(
          (waiver) =>
            !isExpired(waiver.expiresOn, now) &&
            waiver.missingProofs.some(
              (proofLayer) => proofLayer === "runtime" || proofLayer === "behavior",
            ),
        )
        .flatMap((waiver) => waiver.mechanicIds),
    ),
  ].sort();
  const result = evaluateImpactsEnforcement(
    impacts,
    args.executedSuites,
    new Set(controlPlane.proofSchema.suiteIds),
    controlPlaneResult.errors,
    impacts.transitiveMechanicIds.filter((mechanicId) => /^gen\d+\.runtime\./.test(mechanicId)),
    args.executedSuites.map(canonicalizeSuiteId).includes("oracle-fast")
      ? {
          summary: loadProofSummary(repoRoot, "fast"),
          checks: loadProofChecks(repoRoot, "fast"),
        }
      : null,
    artifactBackedSuites,
    waivedOracleMechanicIds,
  );

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
