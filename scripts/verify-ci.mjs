#!/usr/bin/env node

import { buildTurboOptions, runVerification } from "./lib/verification-runner.mjs";

const turboBuildConcurrency = process.env.VERIFY_CI_TURBO_BUILD_CONCURRENCY ?? "4";
const turboTaskConcurrency = process.env.VERIFY_CI_TURBO_TASK_CONCURRENCY ?? "4";

await runVerification({
  env: {
    VERIFY_LOCAL_VITEST_MAX_WORKERS: process.env.VERIFY_LOCAL_VITEST_MAX_WORKERS ?? "75%",
    VERIFY_LOCAL_VITEST_MAX_CONCURRENCY: process.env.VERIFY_LOCAL_VITEST_MAX_CONCURRENCY ?? "4",
  },
  steps: [
    { label: "workflow validator tests", npmArgs: ["run", "test:workflow"] },
    { label: "lint", npmArgs: ["run", "lint:check"] },
    {
      label: "build",
      npmArgs: ["run", "build", "--", ...buildTurboOptions({ concurrency: turboBuildConcurrency })],
    },
    {
      label: "tests (all declared committed tiers)",
      npmArgs: [
        "run",
        "test:all",
        "--",
        ...buildTurboOptions({ concurrency: turboTaskConcurrency }),
      ],
    },
    { label: "invariant tests", npmArgs: ["run", "test:invariants"] },
    {
      label: "typecheck",
      npmArgs: [
        "run",
        "typecheck",
        "--",
        ...buildTurboOptions({ concurrency: turboTaskConcurrency }),
      ],
    },
    { label: "battle contract typecheck", npmArgs: ["run", "typecheck:contracts"] },
    { label: "package boundaries", npmArgs: ["run", "ci:package-boundaries"] },
    { label: "pret committed-data validation", npmArgs: ["run", "validate:pret"] },
    { label: "fast oracle proof", npmArgs: ["run", "oracle:fast"] },
    { label: "generated completeness status", npmArgs: ["run", "status:generate"] },
    { label: "generated status honesty gate", npmArgs: ["run", "status:check"] },
    { label: "changeset gate", npmArgs: ["run", "changeset:check"] },
  ],
});
