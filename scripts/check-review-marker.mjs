#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateReviewMarker } from "./lib/review-gate.mjs";

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

let markerText = "";
try {
  markerText = readFileSync(".claude/.review-passed", "utf8");
} catch {
  markerText = "";
}

const worktreeCheck = spawnSync(process.execPath, ["scripts/check-worktree.mjs"], {
  stdio: "inherit",
});

if (worktreeCheck.status !== 0) {
  process.exit(worktreeCheck.status ?? 1);
}

let currentBranch = "";
let currentCommit = "";

try {
  currentBranch = runGit(["branch", "--show-current"]);
  currentCommit = runGit(["rev-parse", "--short", "HEAD"]);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to read git review marker context: ${message}`);
  process.exit(1);
}

const result = validateReviewMarker({ markerText, currentBranch, currentCommit });

if (!result.isValid) {
  console.error(result.error);
  process.exit(1);
}

console.log(`Review marker matches branch '${currentBranch}' at commit '${currentCommit}'.`);
