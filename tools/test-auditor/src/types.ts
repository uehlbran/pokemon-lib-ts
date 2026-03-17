export type Severity = "error" | "warning" | "info";

export interface Finding {
  check: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  suggestion?: string;
}

export interface PackageAudit {
  packageName: string;
  findings: Finding[];
}

export interface AuditSummary {
  totalFiles: number;
  totalFindings: number;
  byCheck: Record<string, { error: number; warning: number; info: number }>;
}

export interface AuditReport {
  timestamp: string;
  packages: PackageAudit[];
  summary: AuditSummary;
}

export interface FileContext {
  filePath: string;
  relativePath: string;
  lines: string[];
  content: string;
}

export interface Check {
  name: string;
  run(ctx: FileContext): Finding[];
}
