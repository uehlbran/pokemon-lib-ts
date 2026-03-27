import { z } from "zod";
import { disagreementRegistrySummarySchema } from "./disagreement-registry.js";

export const suiteStatusSchema = z.enum(["pass", "fail", "skip"]);

export const suiteResultSchema = z
  .object({
    status: suiteStatusSchema,
    suitePassed: z.boolean(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failures: z.array(z.string()),
    notes: z.array(z.string()).default([]),
    skipReason: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "pass") {
      if (
        !value.suitePassed ||
        value.failed !== 0 ||
        value.skipped !== 0 ||
        value.failures.length !== 0 ||
        (value.skipReason !== undefined && value.skipReason.trim().length > 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "pass status requires suitePassed=true, failed=0, skipped=0, no failures, and no skipReason",
        });
      }
    }

    if (value.status === "fail") {
      if (
        value.suitePassed ||
        value.failed === 0 ||
        value.failures.length === 0 ||
        value.skipped !== 0 ||
        (value.skipReason !== undefined && value.skipReason.trim().length > 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "fail status requires suitePassed=false, skipped=0, at least one failure, and no skipReason",
        });
      }
    }

    if (value.status === "skip") {
      if (
        value.suitePassed ||
        value.failed !== 0 ||
        value.failures.length !== 0 ||
        value.skipped === 0 ||
        !value.skipReason ||
        value.skipReason.trim().length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "skip status requires suitePassed=false, failed=0, skipped>0, no failures, and a non-empty skipReason",
        });
      }
    }
  });

export const generationResultSchema = z.object({
  gen: z.number().int().min(1).max(9),
  packageName: z.string(),
  suites: z.record(z.string(), suiteResultSchema),
  registry: disagreementRegistrySummarySchema,
});

export const runnerOutputSchema = z.object({
  timestamp: z.string().datetime(),
  suitesRequested: z.array(z.string()),
  generations: z.array(generationResultSchema),
});

export type SuiteResult = z.infer<typeof suiteResultSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type RunnerOutput = z.infer<typeof runnerOutputSchema>;
