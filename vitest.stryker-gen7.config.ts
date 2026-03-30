import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Stryker-specific vitest config for gen7 mutation testing.
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
        find: "@pokemon-lib-ts/gen7",
        replacement: fileURLToPath(new URL("./packages/gen7/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    root: "packages/gen7",
    // Include all unit/integration tests; exclude slow smoke/e2e/stress that don't add damage calc coverage
    include: ["tests/*.test.ts", "tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/smoke/**", "tests/stress/**"],
  },
});
