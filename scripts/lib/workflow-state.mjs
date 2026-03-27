import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const WORKFLOW_STATE_DIRNAME = "claude-workflow";
export const ACTIVE_PR_FILENAME = "active-pr.json";
export const RECONCILIATION_FILENAME = "reconciliation.json";

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function getWorkflowStatePaths(gitCommonDir) {
  const stateDir = join(gitCommonDir, WORKFLOW_STATE_DIRNAME);

  return {
    stateDir,
    activePrPath: join(stateDir, ACTIVE_PR_FILENAME),
    reconciliationPath: join(stateDir, RECONCILIATION_FILENAME),
  };
}

export function readJsonFile(path) {
  if (!existsSync(path)) {
    return null;
  }

  return safeParseJson(readFileSync(path, "utf8"));
}

export function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function removeFile(path) {
  rmSync(path, { force: true });
}
