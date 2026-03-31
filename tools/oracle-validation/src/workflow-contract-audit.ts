import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type WorkflowContractArtifact,
  workflowContractArtifactSchema,
} from "./proof-artifact-schema.js";

interface Args {
  readonly mode: string;
}

interface WorkflowValidation {
  readonly workflow: string;
  readonly errors: readonly string[];
}

interface WorkflowValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

interface WorkflowContractModule {
  readonly validateComplianceWorkflow: (repoRoot: string) => WorkflowValidationResult;
  readonly validatePrTriggerWorkflow: (
    repoRoot: string,
    workflowFile: string,
  ) => WorkflowValidationResult;
  readonly validateCiWorkflow: (repoRoot: string) => WorkflowValidationResult;
}

async function loadWorkflowContractModule(): Promise<WorkflowContractModule> {
  const moduleUrl = new URL("../../../scripts/lib/workflow-contract.mjs", import.meta.url).href;
  return (await import(moduleUrl)) as WorkflowContractModule;
}

function parseArgs(argv: readonly string[]): Args {
  let mode = "local-preview";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--mode") {
      mode = argv[index + 1] ?? mode;
      index += 1;
    }
  }
  return { mode };
}

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function buildWorkflowContractArtifact(
  gitSha: string,
  mode: string,
  validations: readonly WorkflowValidation[],
): WorkflowContractArtifact {
  return workflowContractArtifactSchema.parse({
    schemaVersion: "workflow-contract.v1",
    gitSha,
    timestamp: new Date().toISOString(),
    mode,
    status: validations.some((validation) => validation.errors.length > 0) ? "fail" : "pass",
    checks: validations.map((validation) => ({
      checkId: `workflow-contract:${validation.workflow}`,
      workflow: validation.workflow,
      status: validation.errors.length > 0 ? "fail" : "pass",
      errors: [...validation.errors],
    })),
  });
}

async function collectWorkflowValidations(repoRoot: string): Promise<WorkflowValidation[]> {
  const { validateCiWorkflow, validateComplianceWorkflow, validatePrTriggerWorkflow } =
    await loadWorkflowContractModule();
  const compliance = validateComplianceWorkflow(repoRoot);
  const ci = validateCiWorkflow(repoRoot);
  const prReview = validatePrTriggerWorkflow(repoRoot, "pr-review.yml");
  const issueLink = validatePrTriggerWorkflow(repoRoot, "check-issue-link.yml");

  return [
    { workflow: "compliance.yml", errors: compliance.errors },
    { workflow: "ci.yml", errors: ci.errors },
    { workflow: "pr-review.yml", errors: prReview.errors },
    { workflow: "check-issue-link.yml", errors: issueLink.errors },
  ];
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseArgs(process.argv.slice(2));
  const gitSha = git(repoRoot, "rev-parse", "HEAD");
  const validations = await collectWorkflowValidations(repoRoot);
  const artifact = buildWorkflowContractArtifact(gitSha, args.mode, validations);
  const resultsDir = join(repoRoot, "tools", "oracle-validation", "results", gitSha, args.mode);
  mkdirSync(resultsDir, { recursive: true });
  const outputPath = join(resultsDir, "workflow-contract.v1.json");
  writeFileSync(outputPath, JSON.stringify(artifact, null, 2));

  if (artifact.status === "fail") {
    console.error("Workflow contract audit failed.");
    for (const check of artifact.checks) {
      for (const error of check.errors) {
        console.error(`- ${check.workflow}: ${error}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Workflow contract audit written to ${outputPath}`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  void main();
}

export { buildWorkflowContractArtifact, collectWorkflowValidations };
