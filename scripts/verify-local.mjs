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

const steps = [
  ["workflow validator tests", ["run", "test:workflow"]],
  ["lint", ["run", "lint:check"]],
  ["build", ["run", "build"]],
  ["tests", ["run", "test"]],
  ["typecheck", ["run", "typecheck"]],
  ["contract typecheck", ["run", "typecheck:contracts"]],
  ["package boundaries", ["run", "ci:package-boundaries"]],
  ["changeset gate", ["run", "changeset:check"]],
];

runNodeScript("scripts/check-worktree.mjs");

if (!existsSync("node_modules")) {
  console.log("\n==> bootstrap dependencies");
  const bootstrap = spawnSync("npm", ["ci"], { stdio: "inherit" });
  if (bootstrap.status !== 0) {
    process.exit(bootstrap.status ?? 1);
  }
}

for (const [label, npmArgs] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync("npm", npmArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nLocal verification passed.");
