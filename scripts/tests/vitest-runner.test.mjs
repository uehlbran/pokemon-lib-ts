import assert from "node:assert/strict";
import test from "node:test";
import { buildVitestRunArgs } from "../lib/vitest-runner.mjs";

test("given normal execution, when building vitest args, then it preserves the base run command", () => {
  delete process.env.VERIFY_LOCAL;
  delete process.env.VERIFY_LOCAL_VITEST_MAX_WORKERS;
  delete process.env.VERIFY_LOCAL_VITEST_MAX_CONCURRENCY;

  assert.deepEqual(buildVitestRunArgs(["tests/unit"]), [
    "exec",
    "--",
    "vitest",
    "run",
    "tests/unit",
  ]);
});

test("given verify-local mode, when building vitest args, then it caps workers and suite concurrency", () => {
  process.env.VERIFY_LOCAL = "1";
  delete process.env.VERIFY_LOCAL_VITEST_MAX_WORKERS;
  delete process.env.VERIFY_LOCAL_VITEST_MAX_CONCURRENCY;

  assert.deepEqual(buildVitestRunArgs(["tests/unit"]), [
    "exec",
    "--",
    "vitest",
    "run",
    "tests/unit",
    "--no-file-parallelism",
    "--maxConcurrency=2",
  ]);
});

test("given explicit vitest worker flags, when building vitest args, then it does not append duplicates", () => {
  process.env.VERIFY_LOCAL = "1";
  process.env.VERIFY_LOCAL_VITEST_MAX_WORKERS = "25%";
  process.env.VERIFY_LOCAL_VITEST_MAX_CONCURRENCY = "1";

  assert.deepEqual(buildVitestRunArgs(["tests/unit", "--maxWorkers=1", "--maxConcurrency=3"]), [
    "exec",
    "--",
    "vitest",
    "run",
    "tests/unit",
    "--maxWorkers=1",
    "--maxConcurrency=3",
  ]);

  delete process.env.VERIFY_LOCAL;
  delete process.env.VERIFY_LOCAL_VITEST_MAX_WORKERS;
  delete process.env.VERIFY_LOCAL_VITEST_MAX_CONCURRENCY;
});
