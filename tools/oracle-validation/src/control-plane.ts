import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";

export const fileClassSchema = z.enum(["runtime-owning", "evidence-only"]);
export const ownerKindSchema = z.enum(["leaf-mechanic", "shared-seam", "contract", "tooling"]);

const fileClassRuleSchema = z.strictObject({
  fileClass: fileClassSchema,
  patterns: z.array(z.string().min(1)).min(1),
});

const ownershipRuleSchema = z.strictObject({
  ownershipKey: z.string().min(1),
  ownerKind: ownerKindSchema,
  patterns: z.array(z.string().min(1)).min(1),
  allowSharedFile: z.boolean().default(false),
  mechanicIds: z.array(z.string().min(1)).default([]),
  authorityKeys: z.array(z.string().min(1)).default([]),
  propagatesTo: z.array(z.string().min(1)).default([]),
});

const ownershipMapSchema = z.strictObject({
  version: z.literal(1),
  fileClassRules: z.array(fileClassRuleSchema).min(1),
  ownershipRules: z.array(ownershipRuleSchema).min(1),
});

const mechanicCatalogSchema = z.strictObject({
  version: z.literal(1),
  mechanics: z.array(
    z.strictObject({
      mechanicId: z.string().min(1),
      cluster: z.string().min(1),
      topologies: z.array(z.string().min(1)).min(1),
      orderingSensitive: z.boolean(),
      persistent: z.boolean(),
      proofStatus: z.enum(["legacy-unproven", "legacy-partial", "proved"]),
      authorityKey: z.string().min(1),
      requiredSuites: z.array(z.string().min(1)).min(1),
      obligationSeed: z.string().min(1),
    }),
  ),
});

const authorityManifestSchema = z.strictObject({
  version: z.literal(1),
  authorities: z.array(
    z.strictObject({
      authorityKey: z.string().min(1),
      sourceRepo: z.string().min(1),
      referenceCommit: z.string().min(1),
      sourcePath: z.string().min(1),
      symbolOrRoutine: z.string().min(1),
      sourceRole: z.enum(["authoritative", "fallback", "differential"]),
    }),
  ),
});

const obligationCatalogSchema = z.strictObject({
  version: z.literal(1),
  clusters: z.array(
    z.strictObject({
      cluster: z.string().min(1),
      requiredProofs: z.array(z.enum(["source", "semantic", "runtime", "behavior"])).min(1),
      requiredSuites: z.array(z.string().min(1)).min(1),
    }),
  ),
});

const proofLayerSchema = z.enum(["source", "semantic", "runtime", "behavior"]);
const reasonClassSchema = z.enum([
  "known-bug",
  "deferred-doubles",
  "intentional-deviation",
  "tooling-gap",
]);
const normalizationReasonClassSchema = z.enum([
  "oracle-representation-mismatch",
  "source-authorized-naming-collapse",
  "ignored-nondeterministic-field",
  "proven-structural-mismatch",
]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bootstrapWaiverEntrySchema = z.strictObject({
  waiverId: z.string().min(1),
  mechanicIds: z.array(z.string().min(1)).min(1),
  issueNumber: z.number().int().positive(),
  owner: z.string().min(1),
  approver: z.string().min(1),
  expiresOn: dateSchema,
  missingProofs: z.array(proofLayerSchema).min(1),
});

const waiverSchema = z.strictObject({
  version: z.literal(1),
  waivers: z.array(bootstrapWaiverEntrySchema),
});

const divergenceEntrySchema = z.strictObject({
  divergenceId: z.string().min(1),
  mechanicIds: z.array(z.string().min(1)).min(1),
  reasonClass: reasonClassSchema,
  issueNumber: z.number().int().positive(),
  owner: z.string().min(1),
  approver: z.string().min(1),
  authorityKey: z.string().min(1),
  expiresOn: dateSchema,
});

const divergenceRegistrySchema = z.strictObject({
  version: z.literal(1),
  divergences: z.array(divergenceEntrySchema),
});

const normalizationEntrySchema = z.strictObject({
  normalizationId: z.string().min(1),
  reasonClass: normalizationReasonClassSchema,
  fields: z.array(z.string().min(1)).min(1),
  cluster: z.string().min(1),
  topologies: z.array(z.string().min(1)).min(1),
  generations: z.array(z.number().int().min(1).max(9)).min(1),
  authorityKeys: z.array(z.string().min(1)).min(1),
  owner: z.string().min(1),
  approver: z.string().min(1),
  expiresOn: dateSchema,
});

const normalizationRegistrySchema = z.strictObject({
  version: z.literal(1),
  normalizations: z.array(normalizationEntrySchema),
});

const lineageContractSchema = z.strictObject({
  gen: z.number().int().min(1).max(9),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  triggerPath: z.string().min(1),
  runtimeOwner: z.string().min(1),
  authorityTag: z.enum(["pret", "showdown", "mixed", "manual"]),
  descendantPolicy: z.enum([
    "inherit-unmodified",
    "inherit-with-delta",
    "new-in-gen",
    "removed-in-gen",
    "reintroduced-in-gen",
    "mixed-authority-manual",
  ]),
  proofIds: z.array(z.string().min(1)).default([]),
});

const lineageContractsSchema = z.strictObject({
  version: z.literal(1),
  contracts: z.array(lineageContractSchema),
});

const abilityTriggerSurfaceSchema = z.strictObject({
  runtimeOwner: z.string().min(1),
  authorityKey: z.string().min(1),
  dispatcherPath: z.string().min(1),
  routedTriggers: z.array(z.string().min(1)).min(1),
});

const abilityTriggerSurfaceRegistrySchema = z.strictObject({
  version: z.literal(1),
  surfaces: z.array(abilityTriggerSurfaceSchema),
});

const proofSchemaRegistrySchema = z.strictObject({
  version: z.literal(1),
  checkIdPattern: z.string().min(1),
  suiteIds: z.array(z.string().min(1)).min(1),
  checkStatuses: z.array(z.string().min(1)).min(1),
  suiteStatuses: z.array(z.string().min(1)).min(1),
  runModes: z.array(z.string().min(1)).min(1),
  conclusions: z.array(z.string().min(1)).min(1),
});

const protocolCapabilityMatrixSchema = z.strictObject({
  version: z.literal(1),
  clusters: z.array(
    z.strictObject({
      cluster: z.string().min(1),
      operations: z.array(z.string().min(1)).min(1),
      supportedTopologies: z.array(z.string().min(1)).min(1),
      engineOwners: z.array(z.string().min(1)).min(1),
    }),
  ),
});

export type FileClass = z.infer<typeof fileClassSchema>;
export type OwnerKind = z.infer<typeof ownerKindSchema>;
export type OwnershipRule = z.infer<typeof ownershipRuleSchema>;
export type OwnershipMap = z.infer<typeof ownershipMapSchema>;
export type MechanicCatalog = z.infer<typeof mechanicCatalogSchema>;
export type AuthorityManifest = z.infer<typeof authorityManifestSchema>;
export type ObligationCatalog = z.infer<typeof obligationCatalogSchema>;
export type AbilityTriggerSurfaceRegistry = z.infer<typeof abilityTriggerSurfaceRegistrySchema>;
export type ProofSchemaRegistry = z.infer<typeof proofSchemaRegistrySchema>;

export interface ControlPlane {
  readonly repoRoot: string;
  readonly ownershipMap: OwnershipMap;
  readonly mechanicCatalog: MechanicCatalog;
  readonly authorityManifest: AuthorityManifest;
  readonly obligationCatalog: ObligationCatalog;
  readonly bootstrapWaivers: z.infer<typeof waiverSchema>;
  readonly divergenceRegistry: z.infer<typeof divergenceRegistrySchema>;
  readonly normalizationRegistry: z.infer<typeof normalizationRegistrySchema>;
  readonly lineageContracts: z.infer<typeof lineageContractsSchema>;
  readonly abilityTriggerSurfaces: AbilityTriggerSurfaceRegistry;
  readonly proofSchema: ProofSchemaRegistry;
  readonly protocolCapabilityMatrix: z.infer<typeof protocolCapabilityMatrixSchema>;
}

export interface FileClassification {
  readonly filePath: string;
  readonly fileClass: FileClass | null;
  readonly ownershipKeys: readonly string[];
  readonly ruleMatches: readonly OwnershipRule[];
}

function readJsonFile<T>(path: string, schema: z.ZodType<T>): T {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return schema.parse(raw);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*\*/g, "___DOUBLE_WILDCARD___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DOUBLE_WILDCARD___/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function loadControlPlane(repoRoot: string): ControlPlane {
  const baseDir = join(repoRoot, "tools", "oracle-validation", "control-plane");
  return {
    repoRoot,
    ownershipMap: readJsonFile(join(baseDir, "ownership-map.v1.json"), ownershipMapSchema),
    mechanicCatalog: readJsonFile(join(baseDir, "mechanic-catalog.v1.json"), mechanicCatalogSchema),
    authorityManifest: readJsonFile(
      join(baseDir, "authority-manifest.v1.json"),
      authorityManifestSchema,
    ),
    obligationCatalog: readJsonFile(
      join(baseDir, "obligation-catalog.v1.json"),
      obligationCatalogSchema,
    ),
    bootstrapWaivers: readJsonFile(join(baseDir, "bootstrap-waivers.v1.json"), waiverSchema),
    divergenceRegistry: readJsonFile(
      join(baseDir, "divergence-registry.v1.json"),
      divergenceRegistrySchema,
    ),
    normalizationRegistry: readJsonFile(
      join(baseDir, "normalization-registry.v1.json"),
      normalizationRegistrySchema,
    ),
    lineageContracts: readJsonFile(
      join(baseDir, "lineage-contracts.v1.json"),
      lineageContractsSchema,
    ),
    abilityTriggerSurfaces: readJsonFile(
      join(baseDir, "ability-trigger-surfaces.v1.json"),
      abilityTriggerSurfaceRegistrySchema,
    ),
    proofSchema: readJsonFile(join(baseDir, "proof-schema.v1.json"), proofSchemaRegistrySchema),
    protocolCapabilityMatrix: readJsonFile(
      join(baseDir, "protocol-capability-matrix.v1.json"),
      protocolCapabilityMatrixSchema,
    ),
  };
}

export function classifyRepoFile(controlPlane: ControlPlane, filePath: string): FileClassification {
  const normalizedPath = normalizePath(filePath);

  const fileClass =
    controlPlane.ownershipMap.fileClassRules.find((rule) =>
      rule.patterns.some((pattern) => globToRegExp(pattern).test(normalizedPath)),
    )?.fileClass ?? null;

  const ruleMatches = controlPlane.ownershipMap.ownershipRules.filter((rule) =>
    rule.patterns.some((pattern) => globToRegExp(pattern).test(normalizedPath)),
  );

  return {
    filePath: normalizedPath,
    fileClass,
    ownershipKeys: [...new Set(ruleMatches.map((rule) => rule.ownershipKey))].sort(),
    ruleMatches,
  };
}

export function expandOwnershipKeys(
  controlPlane: ControlPlane,
  directOwnershipKeys: readonly string[],
): string[] {
  const byKey = new Map(
    controlPlane.ownershipMap.ownershipRules.map((rule) => [rule.ownershipKey, rule] as const),
  );
  const queue = [...new Set(directOwnershipKeys)];
  const expanded = new Set(queue);

  while (queue.length > 0) {
    const key = queue.shift();
    if (!key) continue;
    const rule = byKey.get(key);
    if (!rule) continue;
    for (const propagated of rule.propagatesTo) {
      if (expanded.has(propagated)) continue;
      expanded.add(propagated);
      queue.push(propagated);
    }
  }

  return [...expanded].sort();
}

export function resolveRepoRelativePath(repoRoot: string, absoluteOrRelativePath: string): string {
  const absolute = absoluteOrRelativePath.startsWith("/")
    ? absoluteOrRelativePath
    : resolve(repoRoot, absoluteOrRelativePath);
  return normalizePath(relative(repoRoot, absolute));
}
