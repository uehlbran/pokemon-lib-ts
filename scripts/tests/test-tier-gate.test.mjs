import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test("given a documented tier with no runnable tests, when validating the tier directory, then it rejects the empty tier", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "tier-gate-present-"));

  try {
    mkdirSync(join(tempDir, "tests", "integration"), { recursive: true });
    writeFileSync(join(tempDir, "tests", "integration", ".gitkeep"), "");

    const result = validateTestTierDirectory({
      cwd: tempDir,
      tier: "integration",
    });

    assert.equal(result.isValid, false);
    assert.match(result.error ?? "", /no runnable test files/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("given an existing documented tier directory with nested runnable tests, when validating the tier directory, then it accepts the package layout", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "tier-gate-runnable-"));

  try {
    mkdirSync(join(tempDir, "tests", "integration", "engine"), { recursive: true });
    writeFileSync(
      join(tempDir, "tests", "integration", "engine", "battle-engine.test.ts"),
      "export {};",
    );

    const result = validateTestTierDirectory({
      cwd: tempDir,
      tier: "integration",
    });

    assert.equal(result.isValid, true);
    assert.equal(result.error, null);
    assert.equal(result.testDir, join(tempDir, "tests", "integration"));
    assert.deepEqual(result.testFiles, [
      join(tempDir, "tests", "integration", "engine", "battle-engine.test.ts"),
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
