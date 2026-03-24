import assert from "node:assert/strict";
import test from "node:test";
import { validateReviewMarker } from "../lib/review-gate.mjs";

test("given a matching review marker, when validating the review gate, then it accepts the marker", () => {
  const result = validateReviewMarker({
    markerText: "feat/test-branch\nabc1234\n",
    currentBranch: "feat/test-branch",
    currentCommit: "abc1234",
  });

  assert.equal(result.isValid, true);
});

test("given a missing review marker, when validating the review gate, then it blocks the PR", () => {
  const result = validateReviewMarker({
    markerText: "",
    currentBranch: "feat/test-branch",
    currentCommit: "abc1234",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Run \/review before opening a PR/);
});

test("given a stale review marker commit, when validating the review gate, then it requires a fresh review", () => {
  const result = validateReviewMarker({
    markerText: "feat/test-branch\nabc1234\n",
    currentBranch: "feat/test-branch",
    currentCommit: "def5678",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Run \/review again/);
});

test("given a stale review marker branch, when validating the review gate, then it requires a fresh review", () => {
  const result = validateReviewMarker({
    markerText: "feat/old-branch\nabc1234\n",
    currentBranch: "feat/test-branch",
    currentCommit: "abc1234",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Run \/review again/);
});
