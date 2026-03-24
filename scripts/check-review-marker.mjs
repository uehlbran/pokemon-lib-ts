#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateReviewMarker } from "./lib/review-gate.mjs";

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

let markerText = "";
try {
  markerText = readFileSync(".claude/.review-passed", "utf8");
} catch {
  markerText = "";
}

const currentBranch = runGit(["branch", "--show-current"]);
const currentCommit = runGit(["rev-parse", "--short", "HEAD"]);
const worktreeCheck = spawnSync(process.execPath, ["scripts/check-worktree.mjs"], {
  stdio: "inherit",
});

if (worktreeCheck.status !== 0) {
  process.exit(worktreeCheck.status ?? 1);
}

const result = validateReviewMarker({ markerText, currentBranch, currentCommit });

if (!result.isValid) {
  console.error(result.error);
  process.exit(1);
}

console.log(`Review marker matches branch '${currentBranch}' at commit '${currentCommit}'.`);
