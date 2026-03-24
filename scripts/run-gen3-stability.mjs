#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npm",
  [
    "run",
    "test",
    "--workspace",
    "@pokemon-lib-ts/gen3",
    "--",
    "tests/integration/full-battle.test.ts",
    "-t",
    "Gen 3 Battle Stability",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      POKEMON_LIB_TS_SLOW_STABILITY: "1",
    },
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
