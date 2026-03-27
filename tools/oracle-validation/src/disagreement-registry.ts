import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ImplementedGeneration } from "./gen-discovery.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!isoDatePattern.test(value)) {
    return false;
  }

  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(value);
  if (!match?.groups) {
    return false;
  }

  const year = Number.parseInt(match.groups.year!, 10);
  const month = Number.parseInt(match.groups.month!, 10);
  const day = Number.parseInt(match.groups.day!, 10);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

const dateSchema = z
  .string()
  .regex(isoDatePattern, "Expected YYYY-MM-DD date")
  .refine(isValidCalendarDate, "Expected a real calendar date");

export const knownDisagreementResolutionSchema = z.enum([
  "cartridge-accurate",
  "showdown-deviation",
  "enhancement-deferred",
]);

export const knownDisagreementSchema = z.strictObject({
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

export const knownOracleBugSchema = z.strictObject({
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
  let fileContents: string;

  try {
    fileContents = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read registry file at ${path}: ${message}`);
  }

  try {
    return JSON.parse(fileContents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON at ${path}: ${message}`);
  }
}

function loadRegistryFile<T>(path: string, schema: z.ZodType<T>, missingValue: T): T {
  const cached = registryFileCache.get(path);
  if (cached !== undefined) {
    return cached as T;
  }

  let rawRegistry: unknown;
  try {
    rawRegistry = readJsonFile(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      const missingRegistry = schema.parse(missingValue);
      registryFileCache.set(path, missingRegistry);
      return missingRegistry;
    }

    throw error;
  }

  const parsed = schema.safeParse(rawRegistry);
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

  const disagreements = loadRegistryFile(path, knownDisagreementsFileSchema, []);
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
  const bugs = loadRegistryFile(path, knownOracleBugsFileSchema, []);
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
