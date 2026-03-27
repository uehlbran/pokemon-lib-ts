import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { ImplementedGeneration } from "./gen-discovery.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const disagreementIdPattern = /^[a-z0-9:-]+$/;

function isValidCalendarDate(value: string): boolean {
  if (!isoDatePattern.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    return false;
  }

  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
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
  id: z
    .string()
    .min(1)
    .regex(disagreementIdPattern, "Expected disagreement id to match [a-z0-9:-]+"),
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
  id: z
    .string()
    .min(1)
    .regex(disagreementIdPattern, "Expected disagreement id to match [a-z0-9:-]+"),
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

export const oracleCheckSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .regex(disagreementIdPattern, "Expected disagreement id to match [a-z0-9:-]+"),
  suite: z.string().min(1),
  description: z.string().min(1),
  ourValue: z.unknown(),
  oracleValue: z.unknown(),
});

export const disagreementRegistrySummarySchema = z.object({
  knownDisagreements: knownDisagreementsFileSchema,
  knownOracleBugs: knownOracleBugsFileSchema,
});

export type KnownDisagreement = z.infer<typeof knownDisagreementSchema>;
export type KnownOracleBug = z.infer<typeof knownOracleBugSchema>;
export type OracleCheck = z.infer<typeof oracleCheckSchema>;
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

  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();
  for (const disagreement of disagreements) {
    if (seenIds.has(disagreement.id)) {
      duplicateIds.add(disagreement.id);
    }
    seenIds.add(disagreement.id);
  }
  if (duplicateIds.size > 0) {
    throw new Error(
      `Known-disagreement file for Gen ${generation.gen} contains duplicate ids: ${[...duplicateIds].sort().join(", ")}`,
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

interface ResolvedOracleChecks {
  readonly failures: string[];
  readonly matchedKnownDisagreements: string[];
  readonly staleDisagreements: string[];
}

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

export function resolveOracleChecks(
  suite: string,
  checks: readonly OracleCheck[],
  knownDisagreements: readonly KnownDisagreement[],
): ResolvedOracleChecks {
  const failures: string[] = [];
  const matchedKnownDisagreements: string[] = [];
  const staleDisagreements: string[] = [];
  const relevantKnownDisagreements = knownDisagreements.filter(
    (disagreement) => disagreement.suite === suite,
  );
  const knownDisagreementsById = new Map(
    relevantKnownDisagreements.map((disagreement) => [disagreement.id, disagreement] as const),
  );
  const exercisedKnownDisagreements = new Set<string>();

  for (const check of checks) {
    const knownDisagreement = knownDisagreementsById.get(check.id);
    const valuesNowMatch = isDeepStrictEqual(check.ourValue, check.oracleValue);

    if (!knownDisagreement) {
      if (!valuesNowMatch) {
        failures.push(
          `NEW DISAGREEMENT DETECTED: ${check.id} — investigate before adding to known-disagreements file (suite=${check.suite}, ours=${formatValue(check.ourValue)}, oracle=${formatValue(check.oracleValue)})`,
        );
      }
      continue;
    }

    exercisedKnownDisagreements.add(check.id);

    if (valuesNowMatch) {
      staleDisagreements.push(check.id);
      failures.push(
        `STALE DISAGREEMENT DETECTED: ${check.id} — oracle now matches our implementation; remove or update the registry entry`,
      );
      continue;
    }

    if (
      knownDisagreement.suite === check.suite &&
      isDeepStrictEqual(knownDisagreement.ourValue, check.ourValue) &&
      isDeepStrictEqual(knownDisagreement.oracleValue, check.oracleValue)
    ) {
      matchedKnownDisagreements.push(check.id);
      continue;
    }

    failures.push(
      `KNOWN DISAGREEMENT CHANGED: ${check.id} — registry suite=${knownDisagreement.suite} ours=${formatValue(knownDisagreement.ourValue)} oracle=${formatValue(knownDisagreement.oracleValue)}; current suite=${check.suite} ours=${formatValue(check.ourValue)} oracle=${formatValue(check.oracleValue)}`,
    );
  }

  for (const knownDisagreement of relevantKnownDisagreements) {
    if (!exercisedKnownDisagreements.has(knownDisagreement.id)) {
      failures.push(
        `KNOWN DISAGREEMENT NOT EXERCISED: ${knownDisagreement.id} — current suite output did not emit this check id`,
      );
    }
  }

  return {
    failures,
    matchedKnownDisagreements,
    staleDisagreements,
  };
}
