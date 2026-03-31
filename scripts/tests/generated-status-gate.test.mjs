import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  findForbiddenStatusClaims,
  STATUS_ARTIFACT,
  validateGeneratedStatusArtifact,
} from "../lib/generated-status-gate.mjs";

test("given a missing generated completeness artifact, when validating generated status, then it fails with guidance", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "generated-status-missing-"));

  try {
    const result = validateGeneratedStatusArtifact(tempDir);
    assert.equal(result.isValid, false);
    assert.match(result.error ?? "", /Run npm run status:generate first/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("given a generated completeness artifact with invalid statuses, when validating generated status, then it rejects the bad record", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "generated-status-invalid-"));

  try {
    mkdirSync(join(tempDir, "tools", "oracle-validation", "results"), { recursive: true });
    writeFileSync(
      join(tempDir, STATUS_ARTIFACT),
      JSON.stringify({
        generations: [{ gen: 9, packageName: "@pokemon-lib-ts/gen9", status: "done" }],
      }),
    );

    const result = validateGeneratedStatusArtifact(tempDir);
    assert.equal(result.isValid, false);
    assert.match(result.error ?? "", /invalid statuses/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("given historical status docs that still claim 100% complete, when checking for forbidden status claims, then the checker reports those lines", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "generated-status-claims-"));

  try {
    mkdirSync(join(tempDir, "specs", "reference"), { recursive: true });
    writeFileSync(join(tempDir, "CLAUDE.md"), "| gen9 | 100% | 42 | 0 |\n");
    writeFileSync(
      join(tempDir, "specs", "reference", "gen9-status.md"),
      "**Overall estimate:** 100% complete (all done)\n",
    );

    const violations = findForbiddenStatusClaims(tempDir, [
      "CLAUDE.md",
      "specs/reference/gen9-status.md",
    ]);

    assert.equal(violations.length, 2);
    assert.match(violations[0].excerpt, /100%/);
    assert.match(violations[1].excerpt, /100% complete/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
