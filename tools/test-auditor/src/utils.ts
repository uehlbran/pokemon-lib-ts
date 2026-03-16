import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { FileContext } from "./types.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");

const PACKAGE_TEST_DIRS: Record<string, string> = {
  core: "packages/core/tests",
  battle: "packages/battle/tests",
  gen1: "packages/gen1/tests",
  gen2: "packages/gen2/tests",
  gen3: "packages/gen3/tests",
  gen4: "packages/gen4/tests",
  gen5: "packages/gen5/tests",
  gen6: "packages/gen6/tests",
  gen7: "packages/gen7/tests",
  gen8: "packages/gen8/tests",
  gen9: "packages/gen9/tests",
};

export function resolvePackageTestDir(packageName: string): string | null {
  const rel = PACKAGE_TEST_DIRS[packageName];
  if (!rel) return null;
  return join(REPO_ROOT, rel);
}

export function discoverTestFiles(testDir: string): string[] {
  const files: string[] = [];
  try {
    collectFiles(testDir, files);
  } catch {
    // directory doesn't exist
  }
  return files.filter((f) => f.endsWith(".test.ts") || f.endsWith(".spec.ts"));
}

function collectFiles(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else {
      out.push(full);
    }
  }
}

export function loadFile(filePath: string): FileContext {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const relativePath = relative(REPO_ROOT, filePath);
  return { filePath, relativePath, lines, content };
}
