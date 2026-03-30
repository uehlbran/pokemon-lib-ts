import assert from "node:assert/strict";
import test from "node:test";
import { buildTurboExecArgs, buildTurboOptions } from "../lib/verification-runner.mjs";

test("given bounded turbo options, when building options, then concurrency flags stay on the turbo side", () => {
  assert.deepEqual(buildTurboOptions({ concurrency: "2" }), [
    "--concurrency=2",
    "--log-order=grouped",
  ]);
});

test("given an affected-only turbo exec, when building args, then the selector and concurrency stay with turbo", () => {
  assert.deepEqual(buildTurboExecArgs("test:unit", { concurrency: "2", affected: true }), [
    "exec",
    "--",
    "turbo",
    "run",
    "test:unit",
    "--affected",
    "--concurrency=2",
    "--log-order=grouped",
  ]);
});
