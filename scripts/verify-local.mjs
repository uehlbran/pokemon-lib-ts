#!/usr/bin/env node

import { buildTurboOptions, runVerification } from "./lib/verification-runner.mjs";

const turboBuildConcurrency = process.env.VERIFY_LOCAL_TURBO_BUILD_CONCURRENCY ?? "3";
const turboTaskConcurrency = process.env.VERIFY_LOCAL_TURBO_TASK_CONCURRENCY ?? "2";
await runVerification({
  env: {
    VERIFY_LOCAL: "1",
    VERIFY_LOCAL_VITEST_MAX_CONCURRENCY: process.env.VERIFY_LOCAL_VITEST_MAX_CONCURRENCY ?? "2",
  },
  steps: [
    {
      label: "build",
      npmArgs: ["run", "build", "--", ...buildTurboOptions({ concurrency: turboBuildConcurrency })],
    },
    {
      label: "control-plane validation",
      npmArgs: ["exec", "--", "tsx", "tools/oracle-validation/src/validate-control-plane.ts"],
    },
    { label: "proof preview", npmArgs: ["run", "proof:preview"] },
    { label: "direct mutation audit", npmArgs: ["run", "proof:audit:mutation"] },
    { label: "workflow contract audit", npmArgs: ["run", "proof:audit:workflow"] },
    { label: "workflow validator tests", npmArgs: ["run", "test:workflow"] },
    { label: "lint", npmArgs: ["run", "lint:check"] },
    {
      label: "tests (all declared committed tiers)",
      npmArgs: [
        "run",
        "test:all",
        "--",
        ...buildTurboOptions({ concurrency: turboTaskConcurrency }),
      ],
    },
    {
      label: "typecheck",
      npmArgs: [
        "run",
        "typecheck",
        "--",
        ...buildTurboOptions({ concurrency: turboTaskConcurrency }),
      ],
    },
    { label: "contract typecheck", npmArgs: ["run", "typecheck:contracts"] },
    { label: "invariant tests", npmArgs: ["run", "test:invariants"] },
    { label: "package boundaries", npmArgs: ["run", "ci:package-boundaries"] },
    { label: "pret committed-data validation", npmArgs: ["run", "validate:pret"] },
    { label: "fast oracle proof", npmArgs: ["run", "oracle:fast"] },
    { label: "generated completeness status", npmArgs: ["run", "status:generate"] },
    { label: "generated status honesty gate", npmArgs: ["run", "status:check"] },
    { label: "changeset gate", npmArgs: ["run", "changeset:check"] },
    {
      label: "impacts enforcement",
      npmArgs: [
        "run",
        "proof:enforce",
        "--",
        "--mode",
        "local-preview",
        "--executed-suite",
        "control-plane",
        "--executed-suite",
        "changeset-check",
        "--executed-suite",
        "mutation-audit",
        "--executed-suite",
        "lint",
        "--executed-suite",
        "oracle-fast",
        "--executed-suite",
        "package-boundaries",
        "--executed-suite",
        "pret-validate",
        "--executed-suite",
        "test",
        "--executed-suite",
        "typecheck",
        "--executed-suite",
        "typecheck:contracts",
      ],
    },
  ],
});
