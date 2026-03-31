import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  classifyRepoFile,
  expandOwnershipKeys,
  type FileClassification,
  loadControlPlane,
  resolveRepoRelativePath,
} from "./control-plane.js";
import { type ImpactsReport, impactsReportSchema } from "./proof-artifact-schema.js";

interface Args {
  readonly baseRef: string;
  readonly mode: string;
}

interface BaseRefResolution {
  readonly requestedBaseRef: string;
  readonly resolvedBaseRef: string;
  readonly usedFallbackBaseRef: boolean;
}

const CHANGED_FILE_DIFF_FILTER = "ACDMRTUXB";

function parseArgs(argv: string[]): Args {
  let baseRef = "origin/main";
  let mode = "local-preview";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      baseRef = argv[index + 1] ?? baseRef;
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      mode = argv[index + 1] ?? mode;
      index += 1;
    }
  }

  return { baseRef, mode };
}

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function tryGit(repoRoot: string, ...args: string[]): string | null {
  try {
    return git(repoRoot, ...args);
  } catch {
    return null;
  }
}

function computeBaseRefCandidates(requestedBaseRef: string): string[] {
  const githubBaseRef = process.env.GITHUB_BASE_REF?.trim();
  const baseCandidates = [
    requestedBaseRef,
    githubBaseRef ? `origin/${githubBaseRef}` : null,
    githubBaseRef,
    requestedBaseRef.startsWith("origin/") ? requestedBaseRef.slice("origin/".length) : null,
    "origin/main",
    "main",
  ];

  return [
    ...new Set(baseCandidates.filter((candidate): candidate is string => Boolean(candidate))),
  ];
}

function refExists(repoRoot: string, ref: string): boolean {
  return tryGit(repoRoot, "rev-parse", "--verify", `${ref}^{commit}`) !== null;
}

export function resolveBaseRefFromCandidates(
  requestedBaseRef: string,
  candidates: readonly string[],
  exists: (candidate: string) => boolean,
): BaseRefResolution {
  for (const candidate of candidates) {
    if (!exists(candidate)) continue;
    return {
      requestedBaseRef,
      resolvedBaseRef: candidate,
      usedFallbackBaseRef: candidate !== requestedBaseRef,
    };
  }

  throw new Error(
    `Could not resolve a git base ref for changed-mechanics. Tried: ${candidates.join(", ")}. ` +
      "Ensure the checkout fetched the PR base branch (for GitHub Actions, use actions/checkout with fetch-depth: 0).",
  );
}

export function resolveBaseRef(repoRoot: string, requestedBaseRef: string): BaseRefResolution {
  const candidates = computeBaseRefCandidates(requestedBaseRef);
  return resolveBaseRefFromCandidates(requestedBaseRef, candidates, (candidate) =>
    refExists(repoRoot, candidate),
  );
}

export function listChangedFiles(
  repoRoot: string,
  baseRef: string,
  gitRunner: (repoRoot: string, ...args: string[]) => string = git,
): string[] {
  const files = new Set<string>();
  const branchDiff = gitRunner(
    repoRoot,
    "diff",
    "--name-only",
    `--diff-filter=${CHANGED_FILE_DIFF_FILTER}`,
    `${baseRef}...HEAD`,
  );
  for (const filePath of branchDiff.split("\n")) {
    if (filePath.trim().length > 0) files.add(resolveRepoRelativePath(repoRoot, filePath.trim()));
  }

  const staged = gitRunner(
    repoRoot,
    "diff",
    "--name-only",
    "--cached",
    `--diff-filter=${CHANGED_FILE_DIFF_FILTER}`,
  );
  for (const filePath of staged.split("\n")) {
    if (filePath.trim().length > 0) files.add(resolveRepoRelativePath(repoRoot, filePath.trim()));
  }

  const unstaged = gitRunner(
    repoRoot,
    "diff",
    "--name-only",
    `--diff-filter=${CHANGED_FILE_DIFF_FILTER}`,
  );
  for (const filePath of unstaged.split("\n")) {
    if (filePath.trim().length > 0) files.add(resolveRepoRelativePath(repoRoot, filePath.trim()));
  }

  const untracked = gitRunner(repoRoot, "ls-files", "--others", "--exclude-standard");
  for (const filePath of untracked.split("\n")) {
    if (filePath.trim().length > 0) files.add(resolveRepoRelativePath(repoRoot, filePath.trim()));
  }

  return [...files].sort();
}

function resolveRequiredSuites(
  controlPlane: ReturnType<typeof loadControlPlane>,
  mechanicIds: string[],
): string[] {
  const suites = new Set<string>();
  for (const mechanicId of mechanicIds) {
    const mechanic = controlPlane.mechanicCatalog.mechanics.find(
      (entry) => entry.mechanicId === mechanicId,
    );
    if (!mechanic) continue;
    for (const suite of mechanic.requiredSuites) suites.add(suite);
  }
  if (suites.size === 0) {
    suites.add("proof-preview");
  }
  return [...suites].sort();
}

export function isLowConfidenceClassification(classification: FileClassification): boolean {
  return (
    classification.fileClass === "runtime-owning" &&
    classification.ruleMatches.length > 1 &&
    classification.ruleMatches.some((rule) => !rule.allowSharedFile)
  );
}

function buildImpactsReport(repoRoot: string, args: Args): ImpactsReport {
  const controlPlane = loadControlPlane(repoRoot);
  const baseRefResolution = resolveBaseRef(repoRoot, args.baseRef);
  const changedFiles = listChangedFiles(repoRoot, baseRefResolution.resolvedBaseRef);
  const classifications = changedFiles.map((filePath) => classifyRepoFile(controlPlane, filePath));
  const unmappedRuntimeOwningFiles = classifications
    .filter(
      (classification) =>
        classification.fileClass === "runtime-owning" && classification.ownershipKeys.length === 0,
    )
    .map((classification) => classification.filePath);
  const directOwnershipKeys = [
    ...new Set(classifications.flatMap((classification) => classification.ownershipKeys)),
  ].sort();
  const transitiveOwnershipKeys = expandOwnershipKeys(controlPlane, directOwnershipKeys);
  const ruleByKey = new Map(
    controlPlane.ownershipMap.ownershipRules.map((rule) => [rule.ownershipKey, rule] as const),
  );
  const directMechanicIds = [
    ...new Set(
      directOwnershipKeys.flatMap((ownershipKey) => ruleByKey.get(ownershipKey)?.mechanicIds ?? []),
    ),
  ].sort();
  const transitiveMechanicIds = [
    ...new Set(
      transitiveOwnershipKeys.flatMap(
        (ownershipKey) => ruleByKey.get(ownershipKey)?.mechanicIds ?? [],
      ),
    ),
  ].sort();
  const touchedClusters = [
    ...new Set(
      directMechanicIds.flatMap((mechanicId) => {
        const mechanic = controlPlane.mechanicCatalog.mechanics.find(
          (entry) => entry.mechanicId === mechanicId,
        );
        return mechanic ? [mechanic.cluster] : [];
      }),
    ),
  ].sort();
  const touchedAuthorityKeys = [
    ...new Set(
      transitiveOwnershipKeys.flatMap(
        (ownershipKey) => ruleByKey.get(ownershipKey)?.authorityKeys ?? [],
      ),
    ),
  ].sort();
  const lowConfidenceFiles = classifications
    .filter((classification) => isLowConfidenceClassification(classification))
    .map((classification) => classification.filePath);

  return impactsReportSchema.parse({
    schemaVersion: "impacts.v1",
    gitSha: git(repoRoot, "rev-parse", "HEAD"),
    timestamp: new Date().toISOString(),
    mode: args.mode,
    requestedBaseRef: baseRefResolution.requestedBaseRef,
    resolvedBaseRef: baseRefResolution.resolvedBaseRef,
    usedFallbackBaseRef: baseRefResolution.usedFallbackBaseRef,
    changedFiles,
    unmappedRuntimeOwningFiles,
    directOwnershipKeys,
    transitiveOwnershipKeys,
    directMechanicIds,
    transitiveMechanicIds,
    touchedAuthorityKeys,
    touchedClusters,
    requiredSuites: resolveRequiredSuites(controlPlane, transitiveMechanicIds),
    lowConfidenceFiles,
    fileClassifications: classifications.map((classification) => ({
      filePath: classification.filePath,
      fileClass: classification.fileClass,
      ownershipKeys: [...classification.ownershipKeys],
    })),
  });
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseArgs(process.argv.slice(2));
  const report = buildImpactsReport(repoRoot, args);
  const resultsDir = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "results",
    report.gitSha,
    args.mode,
  );
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "impacts.v1.json"), JSON.stringify(report, null, 2));

  if (report.unmappedRuntimeOwningFiles.length > 0) {
    console.error("Unmapped runtime-owning files detected:");
    for (const filePath of report.unmappedRuntimeOwningFiles) {
      console.error(`- ${filePath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Changed mechanics report written to ${join(resultsDir, "impacts.v1.json")}`);
  if (report.usedFallbackBaseRef) {
    console.log(
      `Requested base ref ${report.requestedBaseRef} was unavailable; using ${report.resolvedBaseRef} instead.`,
    );
  }
  console.log(`Direct ownership keys: ${report.directOwnershipKeys.join(", ") || "(none)"}`);
  console.log(`Required suites: ${report.requiredSuites.join(", ")}`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main();
}

export { buildImpactsReport, computeBaseRefCandidates };
