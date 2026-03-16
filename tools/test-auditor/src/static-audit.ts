import { checkAssertionStrength } from "./checks/assertion-strength.ts";
import { checkProvenance } from "./checks/provenance.ts";
import { checkTestIsolation } from "./checks/test-isolation.ts";
import { checkTestNaming } from "./checks/test-naming.ts";
import type {
  AuditReport,
  AuditSummary,
  CheckName,
  Finding,
  PackageAudit,
  Severity,
} from "./types.ts";
import { discoverTestFiles, loadFile, resolvePackageTestDir } from "./utils.ts";

const ALL_PACKAGES = ["core", "battle", "gen1", "gen2"];

function runChecksOnFile(ctx: ReturnType<typeof loadFile>): Finding[] {
  return [
    ...checkProvenance(ctx),
    ...checkAssertionStrength(ctx),
    ...checkTestNaming(ctx),
    ...checkTestIsolation(ctx),
  ];
}

function auditPackage(packageName: string): PackageAudit {
  const testDir = resolvePackageTestDir(packageName);
  const findings: Finding[] = [];

  if (!testDir) {
    return { packageName, findings };
  }

  const files = discoverTestFiles(testDir);
  for (const filePath of files) {
    const ctx = loadFile(filePath);
    findings.push(...runChecksOnFile(ctx));
  }

  return { packageName, findings };
}

function buildSummary(packages: PackageAudit[], totalFiles: number): AuditSummary {
  const byCheck: AuditSummary["byCheck"] = {
    provenance: { error: 0, warning: 0, info: 0 },
    "assertion-strength": { error: 0, warning: 0, info: 0 },
    "test-naming": { error: 0, warning: 0, info: 0 },
    "test-isolation": { error: 0, warning: 0, info: 0 },
  };

  let totalFindings = 0;
  for (const pkg of packages) {
    for (const f of pkg.findings) {
      totalFindings++;
      byCheck[f.check][f.severity]++;
    }
  }

  return { totalFiles, totalFindings, byCheck };
}

function colorize(text: string, severity: Severity): string {
  if (!process.stdout.isTTY) return text;
  const codes: Record<Severity, string> = {
    error: "\x1b[31m",
    warning: "\x1b[33m",
    info: "\x1b[36m",
  };
  return `${codes[severity]}${text}\x1b[0m`;
}

function printHuman(report: AuditReport): void {
  for (const pkg of report.packages) {
    if (pkg.findings.length === 0) continue;
    console.log(
      `\n📦 ${pkg.packageName} (${pkg.findings.length} finding${pkg.findings.length === 1 ? "" : "s"})`,
    );
    for (const f of pkg.findings) {
      const sev = colorize(f.severity.toUpperCase().padEnd(7), f.severity);
      console.log(`  ${sev} [${f.check}] ${f.file}:${f.line}`);
      console.log(`         ${f.message}`);
      if (f.suggestion) {
        console.log(`         → ${f.suggestion}`);
      }
    }
  }

  const s = report.summary;
  console.log(`\n── Summary ──────────────────────────────────`);
  console.log(`  Files scanned : ${s.totalFiles}`);
  console.log(`  Total findings: ${s.totalFindings}`);
  console.log("");
  for (const [check, counts] of Object.entries(s.byCheck) as [
    CheckName,
    (typeof s.byCheck)[CheckName],
  ][]) {
    const total = counts.error + counts.warning + counts.info;
    if (total === 0) continue;
    console.log(
      `  ${check.padEnd(20)} errors:${counts.error}  warnings:${counts.warning}  info:${counts.info}`,
    );
  }
  console.log("─────────────────────────────────────────────");
}

function main(): void {
  const args = process.argv.slice(2);
  const isAll = args.includes("--all");
  const isJson = args.includes("--json");
  const pkgIdx = args.indexOf("--package");
  const singlePkg = pkgIdx !== -1 ? (args[pkgIdx + 1] ?? null) : null;

  const packagesToAudit = isAll ? ALL_PACKAGES : singlePkg ? [singlePkg] : ALL_PACKAGES;

  let totalFiles = 0;
  const audited: PackageAudit[] = [];

  for (const pkg of packagesToAudit) {
    const testDir = resolvePackageTestDir(pkg);
    if (testDir) {
      totalFiles += discoverTestFiles(testDir).length;
    }
    audited.push(auditPackage(pkg));
  }

  const summary = buildSummary(audited, totalFiles);
  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    packages: audited,
    summary,
  };

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
}

main();
