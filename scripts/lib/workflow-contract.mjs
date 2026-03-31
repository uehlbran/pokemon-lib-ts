import { readFileSync } from "node:fs";
import { join } from "node:path";

function readWorkflow(repoRoot, workflowFile) {
  return readFileSync(join(repoRoot, ".github", "workflows", workflowFile), "utf8");
}

export function validateComplianceWorkflow(repoRoot) {
  const workflow = readWorkflow(repoRoot, "compliance.yml");
  const errors = [];
  const githubShaExpression = "${" + "{ github.sha }}";

  for (const expected of [
    "ready_for_review",
    "converted_to_draft",
    "fetch-depth: 0",
    "npm run proof:preview -- --mode fast",
    "npm run proof:preview -- --mode full",
    "npm run proof:audit:mutation -- --mode fast",
    "npm run proof:audit:mutation -- --mode full",
    "summary.v1.json",
    `tools/oracle-validation/results/${githubShaExpression}/fast`,
    `tools/oracle-validation/results/${githubShaExpression}/full`,
  ]) {
    if (!workflow.includes(expected)) {
      errors.push(`Missing expected compliance workflow contract snippet: ${expected}`);
    }
  }

  for (const forbidden of ["fast-path.json"]) {
    if (workflow.includes(forbidden)) {
      errors.push(`Forbidden legacy compliance artifact reference still present: ${forbidden}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validatePrTriggerWorkflow(repoRoot, workflowFile) {
  const workflow = readWorkflow(repoRoot, workflowFile);
  const errors = [];

  for (const expected of ["ready_for_review", "converted_to_draft"]) {
    if (!workflow.includes(expected)) {
      errors.push(`${workflowFile} is missing pull_request trigger type ${expected}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateCiWorkflow(repoRoot) {
  const workflow = readWorkflow(repoRoot, "ci.yml");
  const errors = [];

  for (const expected of [
    "ready_for_review",
    "converted_to_draft",
    "proof-gate:",
    "needs: [lint]",
    "validate-control-plane.ts",
    "npm run changeset:check",
    "npm run proof:preview -- --mode ci-preview",
    "npm run proof:audit:mutation -- --mode ci-preview",
    "npm run proof:audit:workflow -- --mode ci-preview",
    "npm run test:workflow",
    "npm run oracle:fast",
    "npm run proof:enforce -- --mode ci-preview",
  ]) {
    if (!workflow.includes(expected)) {
      errors.push(`Missing expected CI workflow contract snippet: ${expected}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
