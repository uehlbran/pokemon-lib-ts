import { spawnSync } from "node:child_process";
import { buildVitestRunArgs } from "./lib/vitest-runner.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const testRun = spawnSync(npmCommand, buildVitestRunArgs(process.argv.slice(2)), {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

if (testRun.error) {
  console.error(`Failed to launch vitest: ${testRun.error.message}`);
  process.exit(1);
}

process.exit(testRun.status ?? 1);
