import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

function terminateChildProcessTree(child, signal) {
  if (!child.pid) {
    return;
  }

  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
    } catch {}
  }

  try {
    child.kill(signal);
  } catch {}
}

export function buildTurboOptions({ concurrency = null, affected = false } = {}) {
  const args = [];

  if (affected) {
    args.push("--affected");
  }

  if (concurrency) {
    args.push(`--concurrency=${concurrency}`, "--log-order=grouped");
  }

  return args;
}

export function buildTurboExecArgs(scriptName, options = {}) {
  return ["exec", "--", "turbo", "run", scriptName, ...buildTurboOptions(options)];
}

export async function runVerification({ bootstrap = true, env = {}, steps }) {
  const childEnv = { ...process.env, ...env };
  const activeChildren = new Set();
  let shuttingDown = false;

  function cleanupActiveChildren() {
    shuttingDown = true;

    for (const child of activeChildren) {
      terminateChildProcessTree(child, "SIGTERM");
      setTimeout(() => terminateChildProcessTree(child, "SIGKILL"), 1500).unref();
    }
  }

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      cleanupActiveChildren();
      process.exit(SIGNAL_EXIT_CODES[signal]);
    });
  }

  process.on("exit", cleanupActiveChildren);

  function runStep(label, stepArgs, command = npmCommand) {
    return new Promise((resolve, reject) => {
      console.log(`\n==> ${label}`);

      const child = spawn(command, stepArgs, {
        stdio: "inherit",
        env: childEnv,
        detached: process.platform !== "win32",
      });

      activeChildren.add(child);

      child.on("error", (error) => {
        activeChildren.delete(child);
        reject(new Error(`FAILED: ${label} (spawn error: ${error.message})`));
      });

      child.on("close", (code) => {
        activeChildren.delete(child);

        if (shuttingDown) {
          return;
        }

        if (code !== 0) {
          reject(new Error(`FAILED: ${label}`));
          return;
        }

        console.log(`==> PASSED: ${label}`);
        resolve();
      });
    });
  }

  try {
    if (bootstrap && !existsSync("node_modules")) {
      await runStep("bootstrap dependencies", ["ci"]);
    }

    for (const step of steps) {
      await runStep(step.label, step.args ?? step.npmArgs, step.command);
    }

    console.log("\nVerification passed.");
  } catch (error) {
    cleanupActiveChildren();
    console.error(`\n==> ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
