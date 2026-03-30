import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Stryker-specific vitest config for gen4 mutation testing.
// Does not use workspaceTestAliases — packages resolved directly via absolute paths.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@pokemon-lib-ts/battle/utils",
        replacement: fileURLToPath(
          new URL("./packages/battle/src/utils/index.ts", import.meta.url),
        ),
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
      {
        find: "@pokemon-lib-ts/gen4",
        replacement: fileURLToPath(new URL("./packages/gen4/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    root: "packages/gen4",
    // Include all unit/integration tests; exclude slow smoke/e2e/stress that don't add damage calc coverage
    include: ["tests/*.test.ts", "tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/smoke/**", "tests/stress/**"],
  },
});
