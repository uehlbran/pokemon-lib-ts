#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  createReconciliationLedger,
  isTaskBranchEntry,
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

function parseWorktrees(porcelain, repoRoot) {
  const records = [];
  let current = {};

  for (const line of porcelain.split(/\r?\n/)) {
    if (line.length === 0) {
      if (current.path) {
        records.push(current);
      }
      current = {};
      continue;
    }

    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");

    if (key === "worktree") {
      current.path = value;
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "branch") {
      current.branch = value.replace("refs/heads/", "");
    }
  }

  if (current.path) {
    records.push(current);
  }

  const primaryWorktree = records[0]?.path ?? repoRoot;

  return records
    .filter((entry) =>
      isTaskBranchEntry({
        path: entry.path,
        branch: entry.branch,
        primaryWorktree,
        repoRoot,
      }),
    )
    .map((entry) => {
      const mergedResult = spawnSync(
        "git",
        ["merge-base", "--is-ancestor", entry.head, "origin/main"],
        {
          encoding: "utf8",
        },
      );

      return {
        branch: entry.branch,
        path: entry.path,
        head: entry.head,
        mergedIntoMain: mergedResult.status === 0,
      };
    });
}

const repoRoot = runGit(["rev-parse", "--show-toplevel"]);
const gitCommonDir = runGit(["rev-parse", "--git-common-dir"]);
const { reconciliationPath } = getWorkflowStatePaths(gitCommonDir);
const currentEntries = parseWorktrees(runGit(["worktree", "list", "--porcelain"]), repoRoot);

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
