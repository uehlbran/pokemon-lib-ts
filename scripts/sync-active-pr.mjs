#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  getWorkflowStatePaths,
  readJsonFile,
  removeFile,
  writeJsonFile,
} from "./lib/workflow-state.mjs";

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

const event = getOptionValue(process.argv.slice(2), "--event");
if (!event || !["create", "finish"].includes(event)) {
  console.error("Usage: node scripts/sync-active-pr.mjs --event <create|finish>");
  process.exit(1);
}

const gitCommonDir = runGit(["rev-parse", "--git-common-dir"]);
const { activePrPath } = getWorkflowStatePaths(gitCommonDir);

if (event === "create") {
  const currentBranch = runGit(["branch", "--show-current"]);
  let pullRequest;

  try {
    pullRequest = JSON.parse(
      runGh(["pr", "view", currentBranch, "--json", "number,state,headRefName,url"]),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not fetch PR for branch '${currentBranch}': ${message}`);
    process.exit(1);
  }

  if (pullRequest.state === "OPEN") {
    writeJsonFile(activePrPath, {
      version: 1,
      prNumber: pullRequest.number,
      branch: pullRequest.headRefName,
      url: pullRequest.url,
      updatedAt: new Date().toISOString(),
    });
  }

  process.exit(0);
}

const marker = readJsonFile(activePrPath);
if (!marker) {
  process.exit(0);
}

try {
  const pullRequest = JSON.parse(
    runGh(["pr", "view", String(marker.prNumber), "--json", "number,state,headRefName,url"]),
  );

  if (pullRequest.state !== "OPEN") {
    removeFile(activePrPath);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Could not verify active PR marker during finish sync: ${message}`);
  console.error("Keeping the existing active PR marker until PR state can be verified.");
  process.exit(1);
}
