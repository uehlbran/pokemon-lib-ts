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

// Check if the reviewed commit is an ancestor of HEAD (allows post-review commits)
const reviewedCommit = markerText.split(/\r?\n/).map((l) => l.trim())[1] || "";
let isAncestor = false;
if (reviewedCommit && reviewedCommit !== currentCommit) {
  try {
    const check = spawnSync("git", ["merge-base", "--is-ancestor", reviewedCommit, "HEAD"]);
    isAncestor = check.status === 0;
  } catch {
    isAncestor = false;
  }
}

const result = validateReviewMarker({ markerText, currentBranch, currentCommit, isAncestor });

if (!result.isValid) {
  console.error(result.error);
  process.exit(1);
}

console.log(`Review marker matches branch '${currentBranch}' at commit '${currentCommit}'.`);
