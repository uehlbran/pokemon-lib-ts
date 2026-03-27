#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  createReconciliationLedger,
  isTaskBranchEntry,
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
const repoRoot = runGit(["rev-parse", "--show-toplevel"]);
const gitCommonDir = runGit(["rev-parse", "--git-common-dir"]);
const { reconciliationPath } = getWorkflowStatePaths(gitCommonDir);
const existingLedger = readJsonFile(reconciliationPath);
const currentEntries = parseWorktrees(runGit(["worktree", "list", "--porcelain"]), repoRoot);

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
