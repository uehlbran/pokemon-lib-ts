import assert from "node:assert/strict";
import test from "node:test";
import { validatePullRequestBody } from "../lib/pr-body.mjs";

test("accepts a single closing reference", () => {
  const result = validatePullRequestBody("## Related Issue\nCloses #123");
  assert.equal(result.isValid, true);
  assert.deepEqual(result.closingIssues, [123]);
});

test("accepts explicit no-issue marker", () => {
  const result = validatePullRequestBody("## Related Issue\nCloses: N/A");
  assert.equal(result.isValid, true);
  assert.deepEqual(result.closingIssues, []);
});

test("rejects orphaned multi-issue line", () => {
  const result = validatePullRequestBody("## Related Issue\nCloses #123, #456");
  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /Each issue needs its own closing keyword/);
  assert.deepEqual(result.orphanedLines, ["Closes #123, #456"]);
});

test("rejects missing issue reference", () => {
  const result = validatePullRequestBody("## Related Issue\nNone listed here");
  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /must include a closing reference/);
});
