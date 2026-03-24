#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function runNodeScript(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpmStep(label, npmArgs) {
  console.log(`\n==> ${label}`);
  const result = spawnSync("npm", npmArgs, { stdio: "inherit" });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNodeScript("scripts/check-worktree.mjs");

if (!existsSync("node_modules")) {
  console.log("\n==> bootstrap dependencies");
  const bootstrap = spawnSync("npm", ["ci"], { stdio: "inherit" });
  if (bootstrap.status !== 0) {
    process.exit(bootstrap.status ?? 1);
  }
}

runNpmStep("replay validation", ["run", "replay:validate"]);
runNpmStep("Gen 1 replay simulation", ["run", "replay:simulate:gen1"]);
runNpmStep("Gen 2 replay simulation", ["run", "replay:simulate:gen2"]);

console.log("\nMedium verification passed.");
