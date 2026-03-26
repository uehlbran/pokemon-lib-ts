import { ALL_CHECKS } from "./checks/index.ts";
import type { AuditReport, AuditSummary, Finding, PackageAudit, Severity } from "./types.ts";
import { discoverAuditTargets, discoverTestFiles, loadFile } from "./utils.ts";

function runChecksOnFile(ctx: ReturnType<typeof loadFile>): Finding[] {
  return ALL_CHECKS.flatMap((check) => check.run(ctx));
}

function auditFiles(targetName: string, files: string[]): PackageAudit {
  const findings: Finding[] = [];

  for (const filePath of files) {
    const ctx = loadFile(filePath);
    findings.push(...runChecksOnFile(ctx));
  }

  return { packageName: targetName, findings };
}

function auditTarget(targetName: string, testDir: string): PackageAudit {
  return auditFiles(targetName, discoverTestFiles(testDir));
}

function buildSummary(packages: PackageAudit[], totalFiles: number): AuditSummary {
  const byCheck: AuditSummary["byCheck"] = {};
  for (const check of ALL_CHECKS) {
    byCheck[check.name] = { error: 0, warning: 0, info: 0 };
  }

  let totalFindings = 0;
  for (const pkg of packages) {
    for (const f of pkg.findings) {
      totalFindings++;
      const entry = byCheck[f.check];
      if (entry) entry[f.severity]++;
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
  for (const [check, counts] of Object.entries(s.byCheck)) {
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
  const failOnFindings = args.includes("--fail-on-findings");
  const pkgIdx = args.indexOf("--package");
  const singlePkg = pkgIdx !== -1 ? (args[pkgIdx + 1] ?? null) : null;
  const filesIdx = args.indexOf("--files");
  const requestedFiles =
    filesIdx !== -1
      ? args
          .slice(filesIdx + 1)
          .filter((arg) => !arg.startsWith("--"))
          .map((arg) => arg.trim())
          .filter(Boolean)
      : [];

  const targets = discoverAuditTargets();
  const audited: PackageAudit[] = [];
  let totalFiles = 0;

  if (requestedFiles.length > 0) {
    const filesByPackage = new Map<string, string[]>();
    for (const filePath of requestedFiles) {
      const match = /(?:^|\/)(?:packages|tools)\/([^/]+)\//.exec(filePath);
      const packageName = match?.[1] ?? "unknown";
      const bucket = filesByPackage.get(packageName) ?? [];
      bucket.push(filePath);
      filesByPackage.set(packageName, bucket);
      totalFiles++;
    }

    for (const [packageName, files] of [...filesByPackage.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      audited.push(auditFiles(packageName, files));
    }
  } else {
    const packagesToAudit = isAll
      ? targets
      : singlePkg
        ? targets.filter((t) => t.name === singlePkg)
        : targets;

    for (const target of packagesToAudit) {
      totalFiles += discoverTestFiles(target.testDir).length;
      audited.push(auditTarget(target.name, target.testDir));
    }
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

  if (failOnFindings && summary.totalFindings > 0) {
    process.exitCode = 1;
  }
}

main();
