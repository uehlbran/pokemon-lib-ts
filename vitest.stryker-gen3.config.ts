import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Stryker-specific vitest config for gen3 mutation testing.
// Does not use workspaceTestAliases — packages resolved directly via absolute paths.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@pokemon-lib-ts/battle/utils",
        replacement: fileURLToPath(new URL("./packages/battle/src/utils/index.ts", import.meta.url)),
      },
      {
        find: "@pokemon-lib-ts/core",
        replacement: fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      },
      {
        find: "@pokemon-lib-ts/battle",
        replacement: fileURLToPath(new URL("./packages/battle/src/index.ts", import.meta.url)),
      },
      {
        find: "@pokemon-lib-ts/gen1",
        replacement: fileURLToPath(new URL("./packages/gen1/src/index.ts", import.meta.url)),
      },
      {
        find: "@pokemon-lib-ts/gen2",
        replacement: fileURLToPath(new URL("./packages/gen2/src/index.ts", import.meta.url)),
      },
      {
        find: "@pokemon-lib-ts/gen3",
        replacement: fileURLToPath(new URL("./packages/gen3/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    root: "packages/gen3",
    // Focus on unit + integration tests for damage calc coverage; smoke/e2e/stress are not needed
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
