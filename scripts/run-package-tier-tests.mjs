import { spawnSync } from "node:child_process";
import process from "node:process";
import { validateTestTierDirectory } from "./lib/test-tier-gate.mjs";
import { buildVitestRunArgs } from "./lib/vitest-runner.mjs";

const tier = process.argv[2];
const result = validateTestTierDirectory({ cwd: process.cwd(), tier });

if (!result.isValid) {
  console.error(result.error);
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const testRun = spawnSync(npmCommand, buildVitestRunArgs([result.testDir]), {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

if (testRun.error) {
  console.error(`Failed to launch vitest for tests/${tier}: ${testRun.error.message}`);
  process.exit(1);
}

process.exit(testRun.status ?? 1);
