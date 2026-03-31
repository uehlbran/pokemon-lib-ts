#!/usr/bin/env node

import { buildTurboExecArgs, runVerification } from "./lib/verification-runner.mjs";

const turboTaskConcurrency = process.env.VERIFY_QUICK_TURBO_TASK_CONCURRENCY ?? "2";

await runVerification({
  env: {
    VERIFY_LOCAL: "1",
    VERIFY_LOCAL_VITEST_MAX_CONCURRENCY: process.env.VERIFY_LOCAL_VITEST_MAX_CONCURRENCY ?? "2",
  },
  steps: [
    { label: "workflow validator tests", npmArgs: ["run", "test:workflow"] },
    { label: "lint", npmArgs: ["run", "lint:check"] },
    { label: "invariant tests", npmArgs: ["run", "test:invariants"] },
    {
      label: "changed-package unit tests",
      args: buildTurboExecArgs("test:unit", {
        concurrency: turboTaskConcurrency,
        affected: true,
      }),
    },
    {
      label: "changed-package typecheck",
      args: buildTurboExecArgs("typecheck", {
        concurrency: turboTaskConcurrency,
        affected: true,
      }),
    },
  ],
});
