#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  createReconciliationLedger,
  getSharedRepoRoot,
  parseTaskWorktreeEntries,
  validateReconciliationLedger,
} from "./lib/reconciliation-gate.mjs";
import { getWorkflowStatePaths, readJsonFile } from "./lib/workflow-state.mjs";

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}
const gitCommonDir = runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
const repoRoot = getSharedRepoRoot(gitCommonDir);
const { reconciliationPath } = getWorkflowStatePaths(gitCommonDir);
const currentEntries = parseTaskWorktreeEntries({
  porcelain: runGit(["worktree", "list", "--porcelain"]),
  repoRoot,
  isHeadMergedIntoMain: (head) =>
    spawnSync("git", ["merge-base", "--is-ancestor", head, "origin/main"], {
      encoding: "utf8",
    }).status === 0,
});

if (currentEntries.length === 0) {
  process.exit(0);
}

const ledger =
  readJsonFile(reconciliationPath) ??
  createReconciliationLedger({
    existingLedger: null,
    currentEntries,
    generatedAt: new Date().toISOString(),
  });
const result = validateReconciliationLedger({ ledger, currentEntries });

if (!result.isValid) {
  console.error("Workflow reconciliation gate failed.");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  console.error("");
  console.error("Run: node scripts/reconcile-worktrees.mjs --write");
  process.exit(1);
}
