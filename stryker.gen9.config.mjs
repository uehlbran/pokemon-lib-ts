/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation-gen9.json" },
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  timeoutMS: 60000,
  concurrency: 2,
  tempDirName: ".stryker-tmp",
  mutate: ["packages/gen9/src/Gen9DamageCalc.ts"],
  coverageAnalysis: "perTest",
  vitest: {
    configFile: "vitest.stryker-gen9.config.ts",
  },
  ignoreStatic: true,
};
