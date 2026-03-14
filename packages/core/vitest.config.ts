import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      exclude: [
        // Barrel re-export files (no logic)
        "src/**/index.ts",
        // Entity files: pure type definitions and static const data (no logic)
        "src/entities/*.ts",
        // Pure const data files (no logic, just data declarations)
        "src/constants/natures.ts",
        "src/constants/type-chart-data.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
