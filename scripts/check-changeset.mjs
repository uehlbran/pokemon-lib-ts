#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  findChangesetFiles,
  findPublishablePackageFiles,
  validateChangesetRequirement,
} from "./lib/changeset-gate.mjs";

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

const mergeBase = runGit(["merge-base", "HEAD", "origin/main"]);
const worktreeCheck = spawnSync(process.execPath, ["scripts/check-worktree.mjs"], {
  stdio: "inherit",
});

if (worktreeCheck.status !== 0) {
  process.exit(worktreeCheck.status ?? 1);
}

if (!mergeBase) {
  console.error("Could not determine merge-base against origin/main. Run 'git fetch origin main'.");
  process.exit(1);
}

const committedFiles = runGit(["diff", "--name-only", `${mergeBase}..HEAD`]).split("\n");
const stagedFiles = runGit(["diff", "--name-only", "--cached"]).split("\n");
const unstagedFiles = runGit(["diff", "--name-only"]).split("\n");
const changedFiles = [...new Set([...committedFiles, ...stagedFiles, ...unstagedFiles])];

const committedChangesets = runGit([
  "diff",
  "--name-only",
  `${mergeBase}..HEAD`,
  "--",
  ".changeset/",
]).split("\n");
const stagedChangesets = runGit(["diff", "--name-only", "--cached", "--", ".changeset/"]).split(
  "\n",
);
const untrackedChangesets = runGit([
  "ls-files",
  "--others",
  "--exclude-standard",
  "--",
  ".changeset/*.md",
]).split("\n");

const result = validateChangesetRequirement({
  changedFiles,
  changesetFiles: [...committedChangesets, ...stagedChangesets, ...untrackedChangesets],
});

if (!result.requiresChangeset) {
  console.log("No publishable package source/data changes detected. Changeset not required.");
  process.exit(0);
}

if (!result.isValid) {
  console.error("Changeset required because publishable package files changed.");
  console.error(`Touched packages: ${result.touchedPackages.join(", ")}`);
  console.error("Run /version or add a .changeset/*.md file before opening a PR.");
  process.exit(1);
}

const changedPackageFiles = findPublishablePackageFiles(changedFiles);
const changesetFiles = findChangesetFiles([
  ...committedChangesets,
  ...stagedChangesets,
  ...untrackedChangesets,
]);

console.log(
  `Changeset check passed for ${result.touchedPackages.join(", ")} (${changedPackageFiles.length} publishable files, ${changesetFiles.length} changeset file(s)).`,
);
