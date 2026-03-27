#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { ALLOWED_ACTIVE_PR_ACTIONS, validateActivePrState } from "./lib/active-pr-gate.mjs";
import { getWorkflowStatePaths, readJsonFile, removeFile } from "./lib/workflow-state.mjs";

function getOptionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `gh ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

const action = getOptionValue(process.argv.slice(2), "--action") ?? "start-task";
if (!ALLOWED_ACTIVE_PR_ACTIONS.has(action)) {
  console.error(
    `Invalid --action '${action}'. Expected one of: ${[...ALLOWED_ACTIVE_PR_ACTIONS].join(", ")}.`,
  );
  process.exit(1);
}

const gitCommonDir = runGit(["rev-parse", "--git-common-dir"]);
const currentBranch = runGit(["branch", "--show-current"]);
const { activePrPath } = getWorkflowStatePaths(gitCommonDir);
const marker = readJsonFile(activePrPath);

if (!marker) {
  const openPullRequests = JSON.parse(
    runGh(["pr", "list", "--state", "open", "--json", "number,headRefName,url"]),
  );

  if (openPullRequests.length === 0) {
    process.exit(0);
  }

  const currentBranchPullRequest = openPullRequests.find(
    (pullRequest) => pullRequest.headRefName === currentBranch,
  );

  if (action === "pr-create") {
    if (currentBranchPullRequest) {
      console.error(
        `An open PR already exists for '${currentBranch}': ${currentBranchPullRequest.url}. Keep working in that PR instead of opening another.`,
      );
      process.exit(1);
    }

    console.error(
      `Another PR is already open and the active PR marker is missing. Reconcile the marker before opening a new PR: ${openPullRequests[0].url}`,
    );
    process.exit(1);
  }

  if (action === "start-task") {
    console.error(
      `A task PR is already open and the active PR marker is missing. Reconcile the marker before starting another task: ${openPullRequests[0].url}`,
    );
    process.exit(1);
  }
}

let pullRequest = null;
try {
  pullRequest = JSON.parse(
    runGh(["pr", "view", String(marker.prNumber), "--json", "number,state,headRefName,url"]),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Could not verify active PR marker: ${message}`);
  console.error("Finish or clear the existing active PR marker before proceeding.");
  process.exit(1);
}

const result = validateActivePrState({
  marker,
  action,
  currentBranch,
  pullRequest,
});

if (result.shouldClearMarker) {
  removeFile(activePrPath);
  process.exit(0);
}

if (!result.isValid) {
  console.error(result.error);
  process.exit(1);
}
