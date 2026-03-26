import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AuditTarget, FileContext } from "./types.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const WORKSPACE_ROOTS = ["packages", "tools"] as const;

export function discoverAuditTargets(): AuditTarget[] {
  const targets: AuditTarget[] = [];

  for (const workspaceRoot of WORKSPACE_ROOTS) {
    const rootDir = join(REPO_ROOT, workspaceRoot);

    try {
      const entries = readdirSync(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const testDir = join(rootDir, entry.name, "tests");
        if (discoverTestFiles(testDir).length === 0) continue;

        targets.push({ name: entry.name, testDir });
      }
    } catch {
      // workspace root missing in this checkout
    }
  }

  targets.sort((left, right) => left.name.localeCompare(right.name));
  return targets;
}

export function discoverTestFiles(testDir: string): string[] {
  const files: string[] = [];
  try {
    collectFiles(testDir, files);
  } catch {
    // directory doesn't exist
  }
  return files
    .filter((f) => f.endsWith(".test.ts") || f.endsWith(".spec.ts"))
    .sort((left, right) => left.localeCompare(right));
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
