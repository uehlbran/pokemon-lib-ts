import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Stryker-specific vitest config for core mutation testing.
// Does not use workspace aliases — core source files are resolved directly.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@pokemon-lib-ts/core",
        replacement: fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    root: "packages/core",
    include: ["tests/**/*.test.ts"],
  },
});
