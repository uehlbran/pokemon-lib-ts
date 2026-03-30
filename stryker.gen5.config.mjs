/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation-gen5.json" },
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  timeoutMS: 60000,
  concurrency: 2,
  tempDirName: ".stryker-tmp",
  mutate: ["packages/gen5/src/Gen5DamageCalc.ts"],
  coverageAnalysis: "perTest",
  vitest: {
    configFile: "vitest.stryker-gen5.config.ts",
  },
  ignoreStatic: true,
};
