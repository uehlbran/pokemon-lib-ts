/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation-gen6.json" },
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  timeoutMS: 60000,
  concurrency: 2,
  tempDirName: ".stryker-tmp",
  mutate: ["packages/gen6/src/Gen6DamageCalc.ts"],
  coverageAnalysis: "perTest",
  vitest: {
    configFile: "vitest.stryker-gen6.config.ts",
  },
  ignoreStatic: true,
};
