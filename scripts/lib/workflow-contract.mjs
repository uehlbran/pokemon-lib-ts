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
    "npm run proof:preview -- --mode fast",
    "npm run proof:preview -- --mode full",
    "npm run proof:audit:mutation -- --mode fast",
    "npm run proof:audit:mutation -- --mode full",
    "summary.v1.json",
    "tools/oracle-validation/results/" + githubShaExpression + "/fast",
    "tools/oracle-validation/results/" + githubShaExpression + "/full",
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
