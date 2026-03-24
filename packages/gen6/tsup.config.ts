import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/data/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
});
