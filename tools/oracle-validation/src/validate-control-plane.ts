import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type ControlPlane,
  classifyRepoFile,
  loadControlPlane,
  type ProofSchemaRegistry,
} from "./control-plane.js";
import {
  CHECK_STATUS_VALUES,
  RUN_CONCLUSION_VALUES,
  RUN_MODE_VALUES,
  SUITE_STATUS_VALUES,
} from "./proof-artifact-schema.js";

export interface ControlPlaneValidationOptions {
  readonly touchedMechanicIds?: readonly string[];
  readonly touchedOwnershipKeys?: readonly string[];
  readonly now?: Date;
}

export interface ControlPlaneValidationResult {
  readonly errors: string[];
}

function duplicateValues(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function currentDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function isExpired(value: string, now: Date): boolean {
  return value < currentDateString(now);
}

function collectKnownSuites(proofSchema: ProofSchemaRegistry): Set<string> {
  return new Set(proofSchema.suiteIds);
}

function sameMembers(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }

  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  return actualSorted.every((value, index) => value === expectedSorted[index]);
}

function missingMembers(actual: readonly string[], expected: readonly string[]): string[] {
  const actualSet = new Set(actual);
  return [...new Set(expected)].filter((value) => !actualSet.has(value)).sort();
}

function activeWaiverMechanicIds(controlPlane: ControlPlane, now: Date): Set<string> {
  const active = new Set<string>();

  for (const waiver of controlPlane.bootstrapWaivers.waivers) {
    if (isExpired(waiver.expiresOn, now)) continue;
    for (const mechanicId of waiver.mechanicIds) {
      active.add(mechanicId);
    }
  }

  return active;
}

function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/.*$/gm, "");
}

function camelizeTriggerId(triggerId: string): string {
  return triggerId.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasRoutedAbilityTrigger(source: string, triggerId: string): boolean {
  const constantName = camelizeTriggerId(triggerId);
  const escapedTrigger = escapeRegExp(triggerId);
  const escapedConstant = escapeRegExp(constantName);
  const routePattern = new RegExp(
    `(?:case\\s+|trigger\\s*[!=]==?\\s*)(?:CORE_ABILITY_TRIGGER_IDS\\.${escapedConstant}|"${escapedTrigger}")`,
  );
  return routePattern.test(stripComments(source));
}

export function validateControlPlane(
  controlPlane: ControlPlane,
  options: ControlPlaneValidationOptions = {},
): ControlPlaneValidationResult {
  const errors: string[] = [];
  const now = options.now ?? new Date();
  const knownSuites = collectKnownSuites(controlPlane.proofSchema);
  const authorityKeys = controlPlane.authorityManifest.authorities.map(
    (entry) => entry.authorityKey,
  );
  const mechanicIds = controlPlane.mechanicCatalog.mechanics.map((entry) => entry.mechanicId);
  const ownershipKeys = controlPlane.ownershipMap.ownershipRules.map((entry) => entry.ownershipKey);
  const obligationClusters = new Set(
    controlPlane.obligationCatalog.clusters.map((entry) => entry.cluster),
  );
  const protocolClusterEntries = controlPlane.protocolCapabilityMatrix.clusters;
  const protocolClusters = new Set(protocolClusterEntries.map((entry) => entry.cluster));
  const authorityKeySet = new Set(authorityKeys);
  const mechanicIdSet = new Set(mechanicIds);
  const ownershipKeySet = new Set(ownershipKeys);
  const activeWaivers = activeWaiverMechanicIds(controlPlane, now);
  const mechanicById = new Map(
    controlPlane.mechanicCatalog.mechanics.map((entry) => [entry.mechanicId, entry] as const),
  );
  const protocolClusterByName = new Map(
    protocolClusterEntries.map((entry) => [entry.cluster, entry] as const),
  );
  const mechanicIdsByCluster = new Map<string, string[]>();
  const ownershipMechanicIdsByKey = new Map(
    controlPlane.ownershipMap.ownershipRules.map((entry) => [
      entry.ownershipKey,
      new Set(entry.mechanicIds),
    ]),
  );
  const ownershipRuleByKey = new Map(
    controlPlane.ownershipMap.ownershipRules.map((entry) => [entry.ownershipKey, entry] as const),
  );

  for (const duplicate of duplicateValues(authorityKeys)) {
    errors.push(`Duplicate authorityKey in authority-manifest.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(mechanicIds)) {
    errors.push(`Duplicate mechanicId in mechanic-catalog.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(ownershipKeys)) {
    errors.push(`Duplicate ownershipKey in ownership-map.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    controlPlane.obligationCatalog.clusters.map((entry) => entry.cluster),
  )) {
    errors.push(`Duplicate cluster in obligation-catalog.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(protocolClusterEntries.map((entry) => entry.cluster))) {
    errors.push(`Duplicate cluster in protocol-capability-matrix.v1.json: ${duplicate}`);
  }
  for (const missing of missingMembers(
    protocolClusterEntries.map((entry) => entry.cluster),
    controlPlane.obligationCatalog.clusters.map((entry) => entry.cluster),
  )) {
    errors.push(
      `Obligation cluster ${missing} is missing from protocol-capability-matrix.v1.json.`,
    );
  }
  for (const extra of missingMembers(
    controlPlane.obligationCatalog.clusters.map((entry) => entry.cluster),
    protocolClusterEntries.map((entry) => entry.cluster),
  )) {
    errors.push(`Protocol cluster ${extra} has no matching obligation cluster.`);
  }
  for (const duplicate of duplicateValues(
    controlPlane.bootstrapWaivers.waivers.map((entry) => entry.waiverId),
  )) {
    errors.push(`Duplicate waiverId in bootstrap-waivers.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    controlPlane.divergenceRegistry.divergences.map((entry) => entry.divergenceId),
  )) {
    errors.push(`Duplicate divergenceId in divergence-registry.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    controlPlane.normalizationRegistry.normalizations.map((entry) => entry.normalizationId),
  )) {
    errors.push(`Duplicate normalizationId in normalization-registry.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    controlPlane.abilityTriggerSurfaces.surfaces.map((entry) => entry.runtimeOwner),
  )) {
    errors.push(`Duplicate runtimeOwner in ability-trigger-surfaces.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(controlPlane.proofSchema.suiteIds)) {
    errors.push(`Duplicate suiteId in proof-schema.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(controlPlane.proofSchema.checkStatuses)) {
    errors.push(`Duplicate check status in proof-schema.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(controlPlane.proofSchema.suiteStatuses)) {
    errors.push(`Duplicate suite status in proof-schema.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(controlPlane.proofSchema.runModes)) {
    errors.push(`Duplicate run mode in proof-schema.v1.json: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(controlPlane.proofSchema.conclusions)) {
    errors.push(`Duplicate conclusion in proof-schema.v1.json: ${duplicate}`);
  }
  for (const protocolCluster of protocolClusterEntries) {
    for (const duplicate of duplicateValues(protocolCluster.operations)) {
      errors.push(
        `Protocol cluster ${protocolCluster.cluster} duplicates operation ${duplicate} in protocol-capability-matrix.v1.json.`,
      );
    }
    for (const duplicate of duplicateValues(protocolCluster.supportedTopologies)) {
      errors.push(
        `Protocol cluster ${protocolCluster.cluster} duplicates supported topology ${duplicate} in protocol-capability-matrix.v1.json.`,
      );
    }
    for (const duplicate of duplicateValues(protocolCluster.engineOwners)) {
      errors.push(
        `Protocol cluster ${protocolCluster.cluster} duplicates engine owner ${duplicate} in protocol-capability-matrix.v1.json.`,
      );
    }
  }
  if (!sameMembers(controlPlane.proofSchema.checkStatuses, CHECK_STATUS_VALUES)) {
    errors.push(
      "proof-schema.v1.json checkStatuses must match proof-artifact-schema.ts checkStatusSchema exactly.",
    );
  }
  if (!sameMembers(controlPlane.proofSchema.suiteStatuses, SUITE_STATUS_VALUES)) {
    errors.push(
      "proof-schema.v1.json suiteStatuses must match proof-artifact-schema.ts suiteStatusSchema exactly.",
    );
  }
  if (!sameMembers(controlPlane.proofSchema.runModes, RUN_MODE_VALUES)) {
    errors.push(
      "proof-schema.v1.json runModes must match proof-artifact-schema.ts runModeSchema exactly.",
    );
  }
  if (!sameMembers(controlPlane.proofSchema.conclusions, RUN_CONCLUSION_VALUES)) {
    errors.push(
      "proof-schema.v1.json conclusions must match proof-artifact-schema.ts runConclusionSchema exactly.",
    );
  }

  for (const mechanic of controlPlane.mechanicCatalog.mechanics) {
    const mechanicsInCluster = mechanicIdsByCluster.get(mechanic.cluster) ?? [];
    mechanicsInCluster.push(mechanic.mechanicId);
    mechanicIdsByCluster.set(mechanic.cluster, mechanicsInCluster);
    if (!authorityKeySet.has(mechanic.authorityKey)) {
      errors.push(
        `Mechanic ${mechanic.mechanicId} references unknown authorityKey ${mechanic.authorityKey}.`,
      );
    }
    if (!obligationClusters.has(mechanic.cluster)) {
      errors.push(
        `Mechanic ${mechanic.mechanicId} references unknown obligation cluster ${mechanic.cluster}.`,
      );
    }
    if (!protocolClusters.has(mechanic.cluster)) {
      errors.push(
        `Mechanic ${mechanic.mechanicId} references unknown protocol cluster ${mechanic.cluster}.`,
      );
    }
    for (const suiteId of mechanic.requiredSuites) {
      if (!knownSuites.has(suiteId)) {
        errors.push(`Mechanic ${mechanic.mechanicId} requires unknown suite ${suiteId}.`);
      }
    }
    const protocolCluster = protocolClusterByName.get(mechanic.cluster);
    if (!protocolCluster) {
      continue;
    }

    for (const topology of mechanic.topologies) {
      if (!protocolCluster.supportedTopologies.includes(topology)) {
        errors.push(
          `Mechanic ${mechanic.mechanicId} topology ${topology} is not covered by protocol cluster ${mechanic.cluster}.`,
        );
      }
    }

    const coveredByOwner = protocolCluster.engineOwners.some((engineOwner) =>
      ownershipMechanicIdsByKey.get(engineOwner)?.has(mechanic.mechanicId),
    );
    if (!coveredByOwner) {
      errors.push(
        `Mechanic ${mechanic.mechanicId} is not covered by any protocol engineOwner declared for cluster ${mechanic.cluster}.`,
      );
    }
  }

  for (const cluster of controlPlane.obligationCatalog.clusters) {
    for (const suiteId of cluster.requiredSuites) {
      if (!knownSuites.has(suiteId)) {
        errors.push(`Obligation cluster ${cluster.cluster} requires unknown suite ${suiteId}.`);
      }
    }
  }

  for (const rule of controlPlane.ownershipMap.ownershipRules) {
    for (const mechanicId of rule.mechanicIds) {
      if (!mechanicIdSet.has(mechanicId)) {
        errors.push(
          `Ownership rule ${rule.ownershipKey} references unknown mechanicId ${mechanicId}.`,
        );
      }
    }
    for (const authorityKey of rule.authorityKeys) {
      if (!authorityKeySet.has(authorityKey)) {
        errors.push(
          `Ownership rule ${rule.ownershipKey} references unknown authorityKey ${authorityKey}.`,
        );
      }
    }
    for (const propagatedKey of rule.propagatesTo) {
      if (!ownershipKeySet.has(propagatedKey)) {
        errors.push(
          `Ownership rule ${rule.ownershipKey} propagates to unknown ownershipKey ${propagatedKey}.`,
        );
      }
    }
  }

  for (const waiver of controlPlane.bootstrapWaivers.waivers) {
    if (isExpired(waiver.expiresOn, now)) {
      errors.push(`Expired bootstrap waiver ${waiver.waiverId} blocks merge.`);
    }
    for (const mechanicId of waiver.mechanicIds) {
      if (!mechanicIdSet.has(mechanicId)) {
        errors.push(
          `Bootstrap waiver ${waiver.waiverId} references unknown mechanicId ${mechanicId}.`,
        );
      }
    }
  }

  for (const divergence of controlPlane.divergenceRegistry.divergences) {
    if (isExpired(divergence.expiresOn, now)) {
      errors.push(`Expired divergence ${divergence.divergenceId} blocks merge.`);
    }
    if (!authorityKeySet.has(divergence.authorityKey)) {
      errors.push(
        `Divergence ${divergence.divergenceId} references unknown authorityKey ${divergence.authorityKey}.`,
      );
    }
    for (const mechanicId of divergence.mechanicIds) {
      if (!mechanicIdSet.has(mechanicId)) {
        errors.push(
          `Divergence ${divergence.divergenceId} references unknown mechanicId ${mechanicId}.`,
        );
      }
    }
  }

  for (const normalization of controlPlane.normalizationRegistry.normalizations) {
    if (isExpired(normalization.expiresOn, now)) {
      errors.push(`Expired normalization ${normalization.normalizationId} blocks merge.`);
    }
    if (!obligationClusters.has(normalization.cluster)) {
      errors.push(
        `Normalization ${normalization.normalizationId} references unknown cluster ${normalization.cluster}.`,
      );
    }
    for (const authorityKey of normalization.authorityKeys) {
      if (!authorityKeySet.has(authorityKey)) {
        errors.push(
          `Normalization ${normalization.normalizationId} references unknown authorityKey ${authorityKey}.`,
        );
      }
    }
  }

  for (const protocolCluster of protocolClusterEntries) {
    for (const engineOwner of protocolCluster.engineOwners) {
      if (!ownershipKeySet.has(engineOwner)) {
        errors.push(
          `Protocol cluster ${protocolCluster.cluster} references unknown engineOwner ${engineOwner}.`,
        );
      }
    }
    if ((mechanicIdsByCluster.get(protocolCluster.cluster) ?? []).length === 0) {
      errors.push(
        `Protocol cluster ${protocolCluster.cluster} has no mechanics assigned in mechanic-catalog.v1.json.`,
      );
    }
  }

  for (const contract of controlPlane.lineageContracts.contracts) {
    if (!ownershipKeySet.has(contract.runtimeOwner)) {
      errors.push(
        `Lineage contract ${contract.entityId}:${contract.triggerPath} references unknown runtimeOwner ${contract.runtimeOwner}.`,
      );
    }
  }

  const abilityTriggerSurfaceByOwner = new Map(
    controlPlane.abilityTriggerSurfaces.surfaces.map(
      (entry) => [entry.runtimeOwner, entry] as const,
    ),
  );

  for (const surface of controlPlane.abilityTriggerSurfaces.surfaces) {
    const runtimeOwner = ownershipRuleByKey.get(surface.runtimeOwner);
    if (!runtimeOwner) {
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} references unknown runtimeOwner in ownership-map.v1.json.`,
      );
      continue;
    }
    if (runtimeOwner.ownerKind !== "leaf-mechanic") {
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} must reference a leaf-mechanic ownership key.`,
      );
    }
    if (!authorityKeySet.has(surface.authorityKey)) {
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} references unknown authorityKey ${surface.authorityKey}.`,
      );
    }
    if (!runtimeOwner.authorityKeys.includes(surface.authorityKey)) {
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} must use one of the ownership rule authority keys.`,
      );
    }

    const dispatcherClassification = classifyRepoFile(controlPlane, surface.dispatcherPath);
    if (dispatcherClassification.fileClass !== "runtime-owning") {
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} dispatcher ${surface.dispatcherPath} must classify as runtime-owning.`,
      );
      continue;
    }
    if (!dispatcherClassification.ownershipKeys.includes(surface.runtimeOwner)) {
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} dispatcher ${surface.dispatcherPath} is not owned by ${surface.runtimeOwner}.`,
      );
    }

    let dispatcherSource = "";
    try {
      dispatcherSource = readFileSync(
        resolve(controlPlane.repoRoot, surface.dispatcherPath),
        "utf8",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} dispatcher ${surface.dispatcherPath} could not be read: ${message}`,
      );
      continue;
    }

    for (const duplicate of duplicateValues(surface.routedTriggers)) {
      errors.push(
        `Ability trigger surface ${surface.runtimeOwner} duplicates routed trigger ${duplicate}.`,
      );
    }
    for (const triggerId of surface.routedTriggers) {
      if (!hasRoutedAbilityTrigger(dispatcherSource, triggerId)) {
        errors.push(
          `Ability trigger surface ${surface.runtimeOwner} dispatcher ${surface.dispatcherPath} is missing routed trigger ${triggerId}.`,
        );
      }
    }
  }

  for (const ownershipKey of [...new Set(options.touchedOwnershipKeys ?? [])].sort()) {
    const rule = ownershipRuleByKey.get(ownershipKey);
    if (!rule) {
      errors.push(`Touched ownership key ${ownershipKey} is missing from ownership-map.v1.json.`);
      continue;
    }
    if (rule.ownerKind !== "leaf-mechanic") {
      continue;
    }

    const hasLineageContract = controlPlane.lineageContracts.contracts.some(
      (contract) => contract.runtimeOwner === ownershipKey,
    );
    if (!hasLineageContract) {
      errors.push(
        `Touched runtime owner ${ownershipKey} has no lineage contracts in lineage-contracts.v1.json.`,
      );
    }
    if (
      ownershipKey.endsWith(":ability-trigger-surface") &&
      !abilityTriggerSurfaceByOwner.has(ownershipKey)
    ) {
      errors.push(
        `Touched ability trigger surface ${ownershipKey} has no entry in ability-trigger-surfaces.v1.json.`,
      );
    }
  }

  for (const mechanicId of [...new Set(options.touchedMechanicIds ?? [])].sort()) {
    const mechanic = mechanicById.get(mechanicId);
    if (!mechanic) {
      errors.push(`Touched mechanic ${mechanicId} is missing from mechanic-catalog.v1.json.`);
      continue;
    }

    if (mechanic.proofStatus !== "proved" && !activeWaivers.has(mechanicId)) {
      errors.push(
        `Touched legacy mechanic ${mechanicId} is ${mechanic.proofStatus} and has no active bootstrap waiver.`,
      );
    }
  }

  return { errors };
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const result = validateControlPlane(loadControlPlane(repoRoot));

  if (result.errors.length > 0) {
    console.error("Control-plane validation failed.");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Control-plane validation passed.");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main();
}
