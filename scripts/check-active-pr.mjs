#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { validateActivePrState } from "./lib/active-pr-gate.mjs";
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
const gitCommonDir = runGit(["rev-parse", "--git-common-dir"]);
const currentBranch = runGit(["branch", "--show-current"]);
const { activePrPath } = getWorkflowStatePaths(gitCommonDir);
const marker = readJsonFile(activePrPath);

if (!marker) {
  process.exit(0);
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
