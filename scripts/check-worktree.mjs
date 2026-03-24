#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateWorktreeContext } from "./lib/worktree-gate.mjs";

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

const projectDir = runGit(["rev-parse", "--show-toplevel"]);
const primaryWorktree = runGit(["worktree", "list", "--porcelain"])
  .split(/\r?\n/)
  .find((line) => line.startsWith("worktree "))
  ?.slice("worktree ".length);
const currentBranch = runGit(["branch", "--show-current"]);

let declaredBranch = "";
try {
  declaredBranch = readFileSync(join(projectDir, ".claude/.session-branch"), "utf8")
    .split(/\r?\n/)[0]
    ?.trim();
} catch {
  declaredBranch = "";
}

const result = validateWorktreeContext({
  projectDir,
  primaryWorktree,
  declaredBranch,
  currentBranch,
});

if (!result.isValid) {
  console.error(result.error);
  process.exit(1);
}

console.log(`Worktree check passed for '${currentBranch}'.`);
