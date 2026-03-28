#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function runStep(label, npmArgs) {
  return new Promise((resolve) => {
    const proc = spawn("npm", npmArgs, { stdio: "inherit", env: process.env });
    proc.on("error", (err) => {
      console.error(`\n==> FAILED: ${label} (spawn error: ${err.message})`);
      process.exit(1);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`\n==> FAILED: ${label}`);
        process.exit(code ?? 1);
      }
      console.log(`==> PASSED: ${label}`);
      resolve();
    });
  });
}

if (!existsSync("node_modules")) {
  console.log("\n==> bootstrap dependencies");
  const bootstrap = spawnSync("npm", ["ci"], { stdio: "inherit" });
  if (bootstrap.status !== 0) {
    process.exit(bootstrap.status ?? 1);
  }
}

// Phase 1: Build first (other steps depend on build output)
console.log("\n==> build");
const buildResult = spawnSync("npm", ["run", "build"], { stdio: "inherit", env: process.env });
if (buildResult.status !== 0) {
  console.error("\n==> FAILED: build");
  process.exit(buildResult.status ?? 1);
}
console.log("==> PASSED: build");

// Phase 2: Run independent steps in parallel
console.log("\n==> running lint, typecheck, tests, and boundaries in parallel...");

await Promise.all([
  runStep("workflow validator tests", ["run", "test:workflow"]),
  runStep("lint", ["run", "lint:check"]),
  runStep("tests (unit + integration)", ["run", "test"]),
  runStep("typecheck", ["run", "typecheck"]),
  runStep("contract typecheck", ["run", "typecheck:contracts"]),
  runStep("package boundaries", ["run", "ci:package-boundaries"]),
]);

// Phase 3: Changeset gate (last — depends on nothing but runs fast)
console.log("\n==> changeset gate");
const changesetResult = spawnSync("npm", ["run", "changeset:check"], {
  stdio: "inherit",
  env: process.env,
});
if (changesetResult.status !== 0) {
  console.error("\n==> FAILED: changeset gate");
  process.exit(changesetResult.status ?? 1);
}
console.log("==> PASSED: changeset gate");

console.log("\nLocal verification passed.");
