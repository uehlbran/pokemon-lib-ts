import { z } from "zod";

export const CHECK_STATUS_VALUES = [
  "pass",
  "fail",
  "skip",
  "incomplete",
  "advisory",
  "deferred",
  "interrupted",
] as const;

export const checkStatusSchema = z.enum(CHECK_STATUS_VALUES);

export const SUITE_STATUS_VALUES = [
  "pass",
  "fail",
  "skip",
  "incomplete",
  "deferred",
  "advisory",
  "interrupted",
] as const;

export const suiteStatusSchema = z.enum(SUITE_STATUS_VALUES);

export const enforcementSchema = z.enum(["required", "advisory"]);
export const RUN_MODE_VALUES = ["fast", "full"] as const;
export const runModeSchema = z.enum(RUN_MODE_VALUES);
export const RUN_CONCLUSION_VALUES = [
  "fail",
  "provisional-pass",
  "compliant",
  "interrupted",
] as const;
export const runConclusionSchema = z.enum(RUN_CONCLUSION_VALUES);

export const checkCountSchema = z.strictObject({
  executed: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  incomplete: z.number().int().nonnegative(),
  deferred: z.number().int().nonnegative(),
  advisory: z.number().int().nonnegative(),
  interrupted: z.number().int().nonnegative(),
});

export const proofCheckSchema = z.strictObject({
  checkId: z.string().min(1),
  generation: z.number().int().min(1).max(9),
  suite: z.string().min(1),
  status: checkStatusSchema,
  enforcement: enforcementSchema,
  description: z.string().min(1),
  sourceRole: z.enum(["authoritative", "fallback", "differential"]).default("authoritative"),
  rawOurValue: z.unknown().optional(),
  rawOracleValue: z.unknown().optional(),
  normalizedOurValue: z.unknown().optional(),
  normalizedOracleValue: z.unknown().optional(),
  tolerance: z.number().nonnegative().nullable().optional(),
  normalizationIds: z.array(z.string().min(1)).default([]),
});

export const proofSuiteResultSchema = z.strictObject({
  suite: z.string().min(1),
  status: suiteStatusSchema,
  enforcement: enforcementSchema,
  requiredCounts: checkCountSchema,
  advisoryCounts: checkCountSchema,
  failures: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  matchedKnownDisagreements: z.array(z.string()).default([]),
  staleDisagreements: z.array(z.string()).default([]),
  checkIds: z.array(z.string().min(1)).default([]),
});

export const proofGenerationSummarySchema = z.strictObject({
  gen: z.number().int().min(1).max(9),
  packageName: z.string().min(1),
  conclusion: runConclusionSchema,
  suites: z.record(z.string(), proofSuiteResultSchema),
});

export const proofSummarySchema = z.strictObject({
  schemaVersion: z.literal("proof-summary.v1"),
  gitSha: z.string().min(1),
  timestamp: z.string().datetime(),
  runMode: runModeSchema,
  suitesRequested: z.array(z.string().min(1)).min(1),
  conclusion: runConclusionSchema,
  generations: z.array(proofGenerationSummarySchema),
});

export const impactsReportSchema = z.strictObject({
  schemaVersion: z.literal("impacts.v1"),
  gitSha: z.string().min(1),
  timestamp: z.string().datetime(),
  mode: z.string().min(1),
  requestedBaseRef: z.string().min(1),
  resolvedBaseRef: z.string().min(1),
  usedFallbackBaseRef: z.boolean().default(false),
  changedFiles: z.array(z.string().min(1)),
  unmappedRuntimeOwningFiles: z.array(z.string().min(1)).default([]),
  directOwnershipKeys: z.array(z.string().min(1)).default([]),
  transitiveOwnershipKeys: z.array(z.string().min(1)).default([]),
  directMechanicIds: z.array(z.string().min(1)).default([]),
  transitiveMechanicIds: z.array(z.string().min(1)).default([]),
  touchedAuthorityKeys: z.array(z.string().min(1)).default([]),
  touchedClusters: z.array(z.string().min(1)),
  requiredSuites: z.array(z.string().min(1)).default([]),
  lowConfidenceFiles: z.array(z.string().min(1)).default([]),
  fileClassifications: z.array(
    z.strictObject({
      filePath: z.string().min(1),
      fileClass: z.string().nullable(),
      ownershipKeys: z.array(z.string().min(1)).default([]),
    }),
  ),
});

export const coverageReportSchema = z.strictObject({
  schemaVersion: z.literal("coverage.v1"),
  gitSha: z.string().min(1),
  timestamp: z.string().datetime(),
  runMode: runModeSchema,
  generations: z.array(
    z.strictObject({
      gen: z.number().int().min(1).max(9),
      packageName: z.string().min(1),
      suites: z.record(z.string(), proofSuiteResultSchema),
    }),
  ),
});

export type ProofCheck = z.infer<typeof proofCheckSchema>;
export type ProofSuiteResult = z.infer<typeof proofSuiteResultSchema>;
export type ProofSummary = z.infer<typeof proofSummarySchema>;
export type ImpactsReport = z.infer<typeof impactsReportSchema>;
