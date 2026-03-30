import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const STATUS_ARTIFACT = "tools/oracle-validation/results/completeness-status.json";

export const STATUS_CLAIM_PATTERNS = [
  {
    label: "root generation status table claims 100%",
    regex: /^\|\s*(core|battle|gen\d)\s*\|\s*100%/im,
  },
  {
    label: "historical status page claims 100% complete",
    regex: /^\*\*Overall estimate:\*\*.*(?:~\s*)?100%\s+complete/im,
  },
];

export const STATUS_DOCS = [
  "CLAUDE.md",
  "specs/reference/battle-status.md",
  "specs/reference/core-status.md",
  "specs/reference/gen1-status.md",
  "specs/reference/gen2-status.md",
  "specs/reference/gen3-status.md",
  "specs/reference/gen4-status.md",
  "specs/reference/gen5-status.md",
  "specs/reference/gen6-status.md",
  "specs/reference/gen7-status.md",
  "specs/reference/gen8-status.md",
  "specs/reference/gen9-status.md",
];

export function validateGeneratedStatusArtifact(repoRoot) {
  const artifactPath = join(repoRoot, STATUS_ARTIFACT);
  if (!existsSync(artifactPath)) {
    return {
      isValid: false,
      error: `Missing generated completeness artifact at ${STATUS_ARTIFACT}. Run npm run status:generate first.`,
      output: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch (error) {
    return {
      isValid: false,
      error: `Generated completeness artifact is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      output: null,
    };
  }

  if (!Array.isArray(parsed.generations) || parsed.generations.length === 0) {
    return {
      isValid: false,
      error: "Generated completeness artifact does not contain any generation records.",
      output: null,
    };
  }

  const invalidStatuses = parsed.generations.filter(
    (generation) => !["incomplete", "verified", "compliant"].includes(generation.status),
  );
  if (invalidStatuses.length > 0) {
    return {
      isValid: false,
      error: `Generated completeness artifact contains invalid statuses for: ${invalidStatuses
        .map((generation) => generation.packageName ?? `gen${generation.gen}`)
        .join(", ")}`,
      output: null,
    };
  }

  return {
    isValid: true,
    error: null,
    output: parsed,
  };
}

export function findForbiddenStatusClaims(repoRoot, files = STATUS_DOCS) {
  const violations = [];

  for (const relativePath of files) {
    const absolutePath = join(repoRoot, relativePath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const pattern of STATUS_CLAIM_PATTERNS) {
      const match = source.match(pattern.regex);
      if (!match) {
        continue;
      }

      violations.push({
        file: relative(repoRoot, absolutePath),
        label: pattern.label,
        excerpt: match[0],
      });
    }
  }

  return violations;
}
