import assert from "node:assert/strict";
import test from "node:test";
import { validateActivePrState } from "../lib/active-pr-gate.mjs";

test("allows work when there is no active PR marker", () => {
  const result = validateActivePrState({
    marker: null,
    action: "start-task",
    currentBranch: "main",
    pullRequest: null,
  });

  assert.equal(result.isValid, true);
});

test("blocks starting a new task while another PR is open", () => {
  const result = validateActivePrState({
    marker: { prNumber: 101, branch: "fix/current" },
    action: "start-task",
    currentBranch: "main",
    pullRequest: { state: "OPEN", headRefName: "fix/current" },
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /still active/i);
});

test("blocks opening a second PR on another branch", () => {
  const result = validateActivePrState({
    marker: { prNumber: 101, branch: "fix/current" },
    action: "pr-create",
    currentBranch: "fix/next",
    pullRequest: { state: "OPEN", headRefName: "fix/current" },
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /active PR slot/i);
});

test("clears stale markers once the tracked PR is no longer open", () => {
  const result = validateActivePrState({
    marker: { prNumber: 101, branch: "fix/current" },
    action: "start-task",
    currentBranch: "main",
    pullRequest: { state: "MERGED", headRefName: "fix/current" },
  });

  assert.equal(result.isValid, true);
  assert.equal(result.shouldClearMarker, true);
});

test("clears stale markers once the tracked PR is closed without merge", () => {
  const result = validateActivePrState({
    marker: { prNumber: 101, branch: "fix/current" },
    action: "start-task",
    currentBranch: "main",
    pullRequest: { state: "CLOSED", headRefName: "fix/current" },
  });

  assert.equal(result.isValid, true);
  assert.equal(result.shouldClearMarker, true);
});
