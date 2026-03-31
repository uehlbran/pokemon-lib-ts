import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateCiWorkflow,
  validateComplianceWorkflow,
  validatePrTriggerWorkflow,
} from "../lib/workflow-contract.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("compliance workflow uses versioned artifacts and proof preview", () => {
  const result = validateComplianceWorkflow(repoRoot);
  assert.equal(result.isValid, true, result.errors.join("\n"));
});

test("pr review workflow retriggers on draft state changes", () => {
  const result = validatePrTriggerWorkflow(repoRoot, "pr-review.yml");
  assert.equal(result.isValid, true, result.errors.join("\n"));
});

test("issue-link workflow retriggers on draft state changes", () => {
  const result = validatePrTriggerWorkflow(repoRoot, "check-issue-link.yml");
  assert.equal(result.isValid, true, result.errors.join("\n"));
});

test("ci workflow runs proof-gate enforcement with preview artifacts", () => {
  const result = validateCiWorkflow(repoRoot);
  assert.equal(result.isValid, true, result.errors.join("\n"));
});
