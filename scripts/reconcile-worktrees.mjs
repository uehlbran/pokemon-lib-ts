#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  createReconciliationLedger,
  getSharedRepoRoot,
  parseTaskWorktreeEntries,
  validateReconciliationLedger,
} from "./lib/reconciliation-gate.mjs";
import { getWorkflowStatePaths, readJsonFile, writeJsonFile } from "./lib/workflow-state.mjs";

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

function parseArgs(args) {
  const options = {
    write: false,
    classify: null,
    retire: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--write") {
      options.write = true;
      continue;
    }

    if (arg === "--classify") {
      options.classify = args[index + 1] ?? null;
      index += 1;
      options.write = true;
      continue;
    }

    if (arg === "--retire") {
      options.retire = args[index + 1] ?? null;
      index += 1;
      options.write = true;
    }
  }

  return options;
}

function setClassification(ledger, value) {
  const [branch, status] = (value ?? "").split("=");

  if (!branch || !status) {
    throw new Error("Classification must use the form <branch>=<status>.");
  }

  const entry = ledger.entries.find((item) => item.branch === branch);
  if (!entry) {
    throw new Error(`Branch '${branch}' is not present in the reconciliation ledger.`);
  }

  entry.status = status;
  if (status === "still-needed") {
    entry.retired = false;
  }
}

function setRetired(ledger, branch) {
  if (!branch) {
    throw new Error("Retire requires a branch name.");
  }

  const entry = ledger.entries.find((item) => item.branch === branch);
  if (!entry) {
    throw new Error(`Branch '${branch}' is not present in the reconciliation ledger.`);
  }

  entry.retired = true;
}

const options = parseArgs(process.argv.slice(2));
const gitCommonDir = runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
const repoRoot = getSharedRepoRoot(gitCommonDir);
const { reconciliationPath } = getWorkflowStatePaths(gitCommonDir);
const existingLedger = readJsonFile(reconciliationPath);
const currentEntries = parseTaskWorktreeEntries({
  porcelain: runGit(["worktree", "list", "--porcelain"]),
  repoRoot,
  isHeadMergedIntoMain: (head) =>
    spawnSync("git", ["merge-base", "--is-ancestor", head, "origin/main"], {
      encoding: "utf8",
    }).status === 0,
});

const ledger = createReconciliationLedger({
  existingLedger,
  currentEntries,
  generatedAt: new Date().toISOString(),
});

if (options.classify) {
  setClassification(ledger, options.classify);
}

if (options.retire) {
  setRetired(ledger, options.retire);
}

if (options.write) {
  writeJsonFile(reconciliationPath, ledger);
}

const result = validateReconciliationLedger({ ledger, currentEntries });

for (const entry of ledger.entries) {
  console.log(
    `${entry.branch} | ${entry.status} | retired=${entry.retired ? "yes" : "no"} | mergedIntoMain=${entry.mergedIntoMain ? "yes" : "no"}`,
  );
}

if (!result.isValid) {
  console.error("");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("");
console.log("Reconciliation ledger is complete.");
