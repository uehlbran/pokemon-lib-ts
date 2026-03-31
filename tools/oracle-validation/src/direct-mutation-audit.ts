import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { buildImpactsReport } from "./changed-mechanics.js";

const directMutationFindingSchema = z.strictObject({
  filePath: z.string().min(1),
  line: z.number().int().positive(),
  pattern: z.string().min(1),
  excerpt: z.string().min(1),
});

const directMutationAuditSchema = z.strictObject({
  schemaVersion: z.literal("direct-mutation-audit.v1"),
  gitSha: z.string().min(1),
  timestamp: z.string().datetime(),
  mode: z.string().min(1),
  findings: z.array(directMutationFindingSchema),
});

const suspiciousPatterns: Array<{ name: string; regex: RegExp }> = [
  {
    name: "ctx-state-mutation",
    regex: /\bctx\.state\.[^;\n]*=/,
  },
  {
    name: "active-pokemon-mutation",
    regex:
      /\bctx\.(attacker|defender)(?:\.pokemon)?\.(status|item|ability|suppressedAbility|types|speciesId|currentHp|maxHp)\s*=/,
  },
];

function parseArgs(argv: string[]): { mode: string } {
  let mode = "local-preview";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--mode") {
      mode = argv[index + 1] ?? mode;
      index += 1;
    }
  }
  return { mode };
}

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function shouldInspect(filePath: string): boolean {
  return (
    /^packages\/gen\d+\/src\/Gen\d+(MoveEffects|Abilities|Items)/.test(filePath) ||
    /^packages\/gen\d+\/src\/Gen\d+Ruleset/.test(filePath)
  );
}

function inspectFile(repoRoot: string, filePath: string) {
  const contents = readFileSync(join(repoRoot, filePath), "utf8");
  const findings: Array<z.infer<typeof directMutationFindingSchema>> = [];
  const lines = contents.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const pattern of suspiciousPatterns) {
      if (!pattern.regex.test(line)) continue;
      findings.push({
        filePath,
        line: index + 1,
        pattern: pattern.name,
        excerpt: line.trim(),
      });
    }
  }
  return findings;
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseArgs(process.argv.slice(2));
  const impacts = buildImpactsReport(repoRoot, { baseRef: "origin/main", mode: args.mode });
  const findings = impacts.changedFiles
    .filter((filePath) => shouldInspect(filePath))
    .flatMap((filePath) => inspectFile(repoRoot, filePath));
  const gitSha = git(repoRoot, "rev-parse", "HEAD");
  const resultsDir = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "results",
    gitSha,
    args.mode,
  );
  mkdirSync(resultsDir, { recursive: true });
  const report = directMutationAuditSchema.parse({
    schemaVersion: "direct-mutation-audit.v1",
    gitSha,
    timestamp: new Date().toISOString(),
    mode: args.mode,
    findings,
  });
  const outputPath = join(resultsDir, "direct-mutation-audit.v1.json");
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  if (findings.length > 0) {
    console.error(`Direct mutation audit findings written to ${outputPath}`);
    for (const finding of findings) {
      console.error(`- ${finding.filePath}:${finding.line} [${finding.pattern}] ${finding.excerpt}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Direct mutation audit written to ${outputPath}`);
}

main();
