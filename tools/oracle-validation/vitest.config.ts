import { defineConfig } from "vitest/config";
import { workspaceTestAliases } from "../../vitest.workspace-aliases";

export default defineConfig({
  resolve: {
    alias: workspaceTestAliases(),
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
