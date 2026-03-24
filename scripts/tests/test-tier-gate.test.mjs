import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateTestTierDirectory } from "../lib/test-tier-gate.mjs";

test("given an unknown test tier, when validating the documented tier directory, then it rejects the tier", () => {
  const result = validateTestTierDirectory({
    cwd: "/repo/packages/demo",
    tier: "banana",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Unknown test tier/i);
});

test("given a documented tier with no directory, when validating the tier directory, then it reports the missing path", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "tier-gate-missing-"));

  try {
    const result = validateTestTierDirectory({
      cwd: tempDir,
      tier: "smoke",
    });

    assert.equal(result.isValid, false);
    assert.match(result.error ?? "", /Missing tests\/smoke directory/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("given an existing documented tier directory, when validating the tier directory, then it accepts the package layout", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "tier-gate-present-"));

  try {
    mkdirSync(join(tempDir, "tests", "integration"), { recursive: true });

    const result = validateTestTierDirectory({
      cwd: tempDir,
      tier: "integration",
    });

    assert.equal(result.isValid, true);
    assert.equal(result.error, null);
    assert.equal(result.testDir, join(tempDir, "tests", "integration"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
