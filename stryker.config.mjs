/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  reporters: ["clear-text"],
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  mutate: ["packages/gen4/src/Gen4MoveEffectsBehavior.ts"],
  timeoutMS: 60000,
  concurrency: 1,
  tempDirName: ".stryker-tmp",
  vitest: {
    dir: "packages/gen4",
  },
};
