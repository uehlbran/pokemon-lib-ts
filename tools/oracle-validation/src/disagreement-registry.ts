import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ImplementedGeneration } from "./gen-discovery.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date");

export const knownDisagreementResolutionSchema = z.enum([
  "cartridge-accurate",
  "showdown-deviation",
  "enhancement-deferred",
]);

export const knownDisagreementSchema = z.object({
  id: z.string().min(1),
  gen: z.number().int().min(1).max(9),
  suite: z.string().min(1),
  description: z.string().min(1),
  ourValue: z.unknown(),
  oracleValue: z.unknown(),
  resolution: knownDisagreementResolutionSchema,
  source: z.string().min(1),
  sourceUrl: z.string().url(),
  oracleVersion: z.string().min(1),
  addedDate: dateSchema,
});

export const knownOracleBugSchema = z.object({
  id: z.string().min(1),
  gen: z.number().int().min(1).max(9),
  description: z.string().min(1),
  oracleValue: z.unknown(),
  cartridgeValue: z.unknown(),
  source: z.string().min(1),
  sourceUrl: z.string().url(),
  oraclePackage: z.string().min(1),
  addedDate: dateSchema,
});

export const knownDisagreementsFileSchema = z.array(knownDisagreementSchema);
export const knownOracleBugsFileSchema = z.array(knownOracleBugSchema);

export const disagreementRegistrySummarySchema = z.object({
  knownDisagreements: knownDisagreementsFileSchema,
  knownOracleBugs: knownOracleBugsFileSchema,
});

export type KnownDisagreement = z.infer<typeof knownDisagreementSchema>;
export type KnownOracleBug = z.infer<typeof knownOracleBugSchema>;
export type DisagreementRegistrySummary = z.infer<typeof disagreementRegistrySummarySchema>;

const registryFileCache = new Map<string, unknown>();

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON at ${path}: ${message}`);
  }
}

function loadRegistryFile<T>(path: string, schema: z.ZodType<T>): T {
  const cached = registryFileCache.get(path);
  if (cached !== undefined) {
    return cached as T;
  }

  const parsed = schema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    throw new Error(`Invalid registry schema at ${path}: ${parsed.error.message}`);
  }

  registryFileCache.set(path, parsed.data);
  return parsed.data;
}

export function loadKnownDisagreements(
  generation: ImplementedGeneration,
  repoRoot: string,
): KnownDisagreement[] {
  const path = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "data",
    "known-disagreements",
    `gen${generation.gen}-known-disagreements.json`,
  );

  const disagreements = loadRegistryFile(path, knownDisagreementsFileSchema);
  const mismatchedEntry = disagreements.find((entry) => entry.gen !== generation.gen);
  if (mismatchedEntry) {
    throw new Error(
      `Known-disagreement file for Gen ${generation.gen} contains mismatched entry ${mismatchedEntry.id} with gen=${mismatchedEntry.gen}`,
    );
  }

  return disagreements;
}

export function loadKnownOracleBugs(
  generation: ImplementedGeneration,
  repoRoot: string,
): KnownOracleBug[] {
  const path = join(repoRoot, "tools", "oracle-validation", "data", "known-oracle-bugs.json");
  const bugs = loadRegistryFile(path, knownOracleBugsFileSchema);
  return bugs.filter((entry) => entry.gen === generation.gen);
}

export function loadDisagreementRegistrySummary(
  generation: ImplementedGeneration,
  repoRoot: string,
): DisagreementRegistrySummary {
  return disagreementRegistrySummarySchema.parse({
    knownDisagreements: loadKnownDisagreements(generation, repoRoot),
    knownOracleBugs: loadKnownOracleBugs(generation, repoRoot),
  });
}
