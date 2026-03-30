/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  timeoutMS: 60000,
  concurrency: 2,
  tempDirName: ".stryker-tmp",
  mutate: ["packages/core/src/logic/damage-utils.ts", "packages/core/src/logic/stat-calc.ts"],
  coverageAnalysis: "perTest",
  vitest: {
    configFile: "vitest.stryker-core.config.ts",
  },
  ignoreStatic: true,
};
