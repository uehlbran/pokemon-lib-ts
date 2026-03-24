import assert from "node:assert/strict";
import test from "node:test";
import { validateChangesetRequirement } from "../lib/changeset-gate.mjs";

test("requires a changeset for package source changes", () => {
  const result = validateChangesetRequirement({
    changedFiles: ["packages/core/src/index.ts"],
    changesetFiles: [],
  });

  assert.equal(result.requiresChangeset, true);
  assert.equal(result.isValid, false);
  assert.deepEqual(result.touchedPackages, ["core"]);
});

test("accepts changeset for publishable package changes", () => {
  const result = validateChangesetRequirement({
    changedFiles: ["packages/gen9/data/moves.json", "packages/gen9/src/index.ts"],
    changesetFiles: [".changeset/gen9-move-fix.md"],
  });

  assert.equal(result.requiresChangeset, true);
  assert.equal(result.isValid, true);
  assert.deepEqual(result.touchedPackages, ["gen9"]);
});

test("does not require a changeset for docs-only changes", () => {
  const result = validateChangesetRequirement({
    changedFiles: ["README.md", "packages/core/tests/index.test.ts"],
    changesetFiles: [],
  });

  assert.equal(result.requiresChangeset, false);
  assert.equal(result.isValid, true);
});
