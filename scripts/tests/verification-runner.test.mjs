import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("given a stubborn child process, when verification is interrupted, then the runner exits and escalates child cleanup", async () => {
  const childPidFile = join(tmpdir(), `verification-runner-child-${process.pid}.pid`);
  rmSync(childPidFile, { force: true });

  const fixture = spawn(
    process.execPath,
    [join(process.cwd(), "scripts/tests/fixtures/verification-runner-signal-fixture.mjs")],
    {
      env: { ...process.env, VERIFICATION_RUNNER_CHILD_PID_FILE: childPidFile },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("fixture did not start verification step"));
    }, 5000);

    fixture.stdout.on("data", (chunk) => {
      if (String(chunk).includes("==> stubborn child")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    fixture.on("exit", () => {
      clearTimeout(timeout);
      reject(new Error("fixture exited before starting"));
    });
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("stubborn child did not publish its pid"));
    }, 5000);

    const poll = setInterval(() => {
      if (existsSync(childPidFile)) {
        clearInterval(poll);
        clearTimeout(timeout);
        resolve();
      }
    }, 25);
  });

  fixture.kill("SIGINT");

  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("fixture did not exit after interrupt"));
    }, 6000);

    fixture.on("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  assert.deepEqual(exit, { code: 130, signal: null });
  const childPid = Number.parseInt(readFileSync(childPidFile, "utf8"), 10);
  assert.equal(Number.isInteger(childPid), true);
  assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
  rmSync(childPidFile, { force: true });
});
