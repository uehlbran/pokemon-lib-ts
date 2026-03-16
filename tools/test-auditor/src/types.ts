export type CheckName = "provenance" | "assertion-strength" | "test-naming" | "test-isolation";
export type Severity = "error" | "warning" | "info";

export interface Finding {
  check: CheckName;
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
  byCheck: Record<CheckName, { error: number; warning: number; info: number }>;
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
