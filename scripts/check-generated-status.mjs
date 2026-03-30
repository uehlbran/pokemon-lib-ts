#!/usr/bin/env node

import {
  findForbiddenStatusClaims,
  validateGeneratedStatusArtifact,
} from "./lib/generated-status-gate.mjs";

const repoRoot = process.cwd();
const artifactCheck = validateGeneratedStatusArtifact(repoRoot);

if (!artifactCheck.isValid) {
  console.error(artifactCheck.error);
  process.exit(1);
}

const violations = findForbiddenStatusClaims(repoRoot);
if (violations.length > 0) {
  console.error("Hand-written completion claims are forbidden outside generated status artifacts.");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.label} -> ${violation.excerpt}`);
  }
  process.exit(1);
}

console.log(
  `Generated status check passed for ${artifactCheck.output.generations.length} generation records.`,
);
