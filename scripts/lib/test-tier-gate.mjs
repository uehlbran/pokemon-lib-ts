import { existsSync } from "node:fs";
import { join } from "node:path";

export const VALID_TEST_TIERS = ["unit", "integration", "smoke", "e2e", "stress"];

export function validateTestTierDirectory({ cwd, tier }) {
  if (!VALID_TEST_TIERS.includes(tier)) {
    return {
      isValid: false,
      testDir: null,
      error: `Unknown test tier '${tier}'. Expected one of: ${VALID_TEST_TIERS.join(", ")}.`,
    };
  }

  const testDir = join(cwd, "tests", tier);
  if (!existsSync(testDir)) {
    return {
      isValid: false,
      testDir,
      error:
        `Missing tests/${tier} directory in ${cwd}. ` +
        "The repo documents tier directories explicitly; create the directory or update the package scripts.",
    };
  }

  return {
    isValid: true,
    testDir,
    error: null,
  };
}
