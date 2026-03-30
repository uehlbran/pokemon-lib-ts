/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation-gen2.json" },
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  timeoutMS: 60000,
  concurrency: 2,
  tempDirName: ".stryker-tmp",
  mutate: ["packages/gen2/src/Gen2DamageCalc.ts"],
  coverageAnalysis: "perTest",
  vitest: {
    configFile: "vitest.stryker-gen2.config.ts",
  },
  ignoreStatic: true,
};
