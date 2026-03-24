#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validatePullRequestBody } from "./lib/pr-body.mjs";

function getOptionValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function runNodeScript(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const args = process.argv.slice(2);
const title = getOptionValue(args, "--title");
const bodyFile = getOptionValue(args, "--body-file");

if (!title || !bodyFile) {
  console.error(
    'Usage: npm run pr:open -- --title "..." --body-file <path> [other gh pr create args]',
  );
  process.exit(1);
}

runNodeScript("scripts/check-worktree.mjs");

const body = readFileSync(bodyFile, "utf8");
const prBodyResult = validatePullRequestBody(body);
if (!prBodyResult.isValid) {
  console.error("PR body validation failed before opening the PR.");
  for (const error of prBodyResult.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

runNodeScript("scripts/check-review-marker.mjs");
runNodeScript("scripts/check-changeset.mjs");

const ghResult = spawnSync("gh", ["pr", "create", ...args], {
  stdio: "inherit",
});

process.exit(ghResult.status ?? 1);
