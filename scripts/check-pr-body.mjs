#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { validatePullRequestBody } from "./lib/pr-body.mjs";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    body: { type: "string" },
    "body-file": { type: "string" },
  },
});

if (!values.body && !values["body-file"]) {
  console.error("Usage: node scripts/check-pr-body.mjs --body-file <path> | --body <text>");
  process.exit(1);
}

const body = values["body-file"] ? readFileSync(values["body-file"], "utf8") : (values.body ?? "");
const result = validatePullRequestBody(body);

if (!result.isValid) {
  console.error("PR body validation failed:");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  if (result.orphanedLines.length > 0) {
    console.error("");
    console.error("Offending line(s):");
    for (const line of result.orphanedLines) {
      console.error(`  ${line}`);
    }
  }
  process.exit(1);
}

if (result.closingIssues.length > 0) {
  console.log(`PR body validation passed for issue(s): ${result.closingIssues.join(", ")}`);
} else {
  console.log("PR body validation passed with explicit no-issue marker.");
}
