import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const VALID_TEST_TIERS = ["unit", "integration", "smoke", "e2e", "stress"];
const TEST_FILE_PATTERN = /\.test\.[cm]?[jt]sx?$/;

function collectTierTestFiles(dir) {
  /** @type {string[]} */
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTierTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

export function validateTestTierDirectory({ cwd, tier }) {
  if (!VALID_TEST_TIERS.includes(tier)) {
    return {
      isValid: false,
      testDir: null,
      testFiles: [],
      error: `Unknown test tier '${tier}'. Expected one of: ${VALID_TEST_TIERS.join(", ")}.`,
    };
  }

  const testDir = join(cwd, "tests", tier);
  if (!existsSync(testDir)) {
    return {
      isValid: false,
      testDir,
      testFiles: [],
      error:
        `Missing tests/${tier} directory in ${cwd}. ` +
        "The repo documents tier directories explicitly; create the directory or update the package scripts.",
    };
  }

  if (!statSync(testDir).isDirectory()) {
    return {
      isValid: false,
      testDir,
      testFiles: [],
      error: `Expected tests/${tier} in ${cwd} to be a directory.`,
    };
  }

  const testFiles = collectTierTestFiles(testDir);
  if (testFiles.length === 0) {
    return {
      isValid: false,
      testDir,
      testFiles,
      error:
        `Declared tests/${tier} tier in ${cwd} has no runnable test files. ` +
        "Remove the script or add at least one *.test.* file before advertising this tier.",
    };
  }

  return {
    isValid: true,
    testDir,
    testFiles,
    error: null,
  };
}
