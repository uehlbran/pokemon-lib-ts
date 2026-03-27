import { z } from "zod";

export const suiteStatusSchema = z.enum(["pass", "fail", "skip"]);

export const suiteResultSchema = z.object({
  status: suiteStatusSchema,
  suitePassed: z.boolean(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failures: z.array(z.string()),
  notes: z.array(z.string()).default([]),
  skipReason: z.string().optional(),
});

export const generationResultSchema = z.object({
  gen: z.number().int().min(1).max(9),
  packageName: z.string(),
  suites: z.record(z.string(), suiteResultSchema),
});

export const runnerOutputSchema = z.object({
  timestamp: z.string(),
  suitesRequested: z.array(z.string()),
  generations: z.array(generationResultSchema),
});

export type SuiteResult = z.infer<typeof suiteResultSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type RunnerOutput = z.infer<typeof runnerOutputSchema>;
