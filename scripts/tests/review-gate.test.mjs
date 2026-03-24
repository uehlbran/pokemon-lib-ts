import assert from "node:assert/strict";
import test from "node:test";
import { validateReviewMarker } from "../lib/review-gate.mjs";

test("accepts matching review marker", () => {
  const result = validateReviewMarker({
    markerText: "feat/test-branch\nabc1234\n",
    currentBranch: "feat/test-branch",
    currentCommit: "abc1234",
  });

  assert.equal(result.isValid, true);
});

test("rejects missing review marker", () => {
  const result = validateReviewMarker({
    markerText: "",
    currentBranch: "feat/test-branch",
    currentCommit: "abc1234",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Run \/review before opening a PR/);
});

test("rejects stale review marker commit", () => {
  const result = validateReviewMarker({
    markerText: "feat/test-branch\nabc1234\n",
    currentBranch: "feat/test-branch",
    currentCommit: "def5678",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Run \/review again/);
});
