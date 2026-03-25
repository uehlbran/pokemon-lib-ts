import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileContext, Finding } from "../types.ts";

const REPO_ROOT = join(import.meta.dirname, "../../../..");
const CORE_REFERENCE_FILE = join(REPO_ROOT, "packages/core/src/constants/reference-ids.ts");
const BATTLE_REFERENCE_FILE = join(REPO_ROOT, "packages/battle/src/constants/reference-ids.ts");
const GEN_REFERENCE_FILES = Array.from({ length: 9 }, (_, index) =>
  join(REPO_ROOT, `packages/gen${index + 1}/src/data/reference-ids.ts`),
);

const PROPERTY_VALUE_RE = /^\s+[A-Za-z0-9_]+:\s*"([^"]+)",?$/gm;
const RAW_STRING_RE = /(['"`])([a-z0-9]+(?:-[a-z0-9]+)*)\1/g;
const IMPORT_LINE_RE = /^\s*import\b/;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;
const IGNORED_CONTEXT_RE =
  /\b(?:displayName|name|category|target|nature|pokeball|type|types|spriteKey|metLocation)\b/;
const IGNORED_VALUES = new Set(["test"]);

function readReferenceValues(filePath: string): Set<string> {
  const values = new Set<string>();
  try {
    const content = readFileSync(filePath, "utf8");
    for (const match of content.matchAll(PROPERTY_VALUE_RE)) {
      const value = match[1];
      if (value) values.add(value);
    }
  } catch {
    // reference surface not present yet
  }
  return values;
}

const CORE_REFERENCE_IDS = readReferenceValues(CORE_REFERENCE_FILE);
const BATTLE_REFERENCE_IDS = readReferenceValues(BATTLE_REFERENCE_FILE);
const GEN_REFERENCE_IDS = new Set<string>(
  GEN_REFERENCE_FILES.flatMap((filePath) => [...readReferenceValues(filePath)]),
);

function getOwningSurface(relativePath: string, value: string): string | null {
  if (CORE_REFERENCE_IDS.has(value)) return "@pokemon-lib-ts/core";
  if (BATTLE_REFERENCE_IDS.has(value)) return "@pokemon-lib-ts/battle";

  const generationMatch = /packages\/(gen\d+)\//.exec(relativePath);
  if (generationMatch && GEN_REFERENCE_IDS.has(value)) {
    return `@pokemon-lib-ts/${generationMatch[1]}`;
  }

  if (GEN_REFERENCE_IDS.has(value)) return "the owning generation package";
  return null;
}

export function checkRawReferenceIds(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let index = 0; index < ctx.lines.length; index++) {
    const line = ctx.lines[index] ?? "";
    if (IMPORT_LINE_RE.test(line) || COMMENT_LINE_RE.test(line)) continue;
    if (IGNORED_CONTEXT_RE.test(line)) continue;

    for (const match of line.matchAll(RAW_STRING_RE)) {
      const value = match[2] ?? "";
      if (!value) continue;
      if (IGNORED_VALUES.has(value)) continue;
      const matchIndex = match.index ?? -1;
      const quote = match[1] ?? "";
      const fullMatch = match[0] ?? "";
      const matchEnd = matchIndex + fullMatch.length;
      const previousChar = matchIndex > 0 ? line[matchIndex - 1] : "";
      const nextChar = matchEnd < line.length ? line[matchEnd] : "";
      if ((previousChar === "[" && nextChar === "]") || (previousChar === "." && quote === "`")) {
        continue;
      }

      const owningSurface = getOwningSurface(ctx.relativePath, value);
      if (!owningSurface) continue;

      findings.push({
        check: "raw-reference-id",
        severity: "warning",
        file: ctx.relativePath,
        line: index + 1,
        message: `Raw canonical identifier "${value}" is used directly in the test`,
        suggestion:
          owningSurface === "the owning generation package"
            ? "Import the appropriate generated GENN_*_IDS reference instead of hardcoding the identifier"
            : `Import the owning reference constant from ${owningSurface} instead of hardcoding the identifier`,
      });
    }
  }

  return findings;
}
