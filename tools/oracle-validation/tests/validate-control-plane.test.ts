import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type ControlPlane, loadControlPlane } from "../src/control-plane.js";
import { validateControlPlane } from "../src/validate-control-plane.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function createControlPlane(overrides: Partial<ControlPlane> = {}): ControlPlane {
  return {
    repoRoot: "/repo",
    ownershipMap: {
      version: 1,
      fileClassRules: [{ fileClass: "runtime-owning", patterns: ["packages/**"] }],
      ownershipRules: [
        {
          ownershipKey: "battle:shared-seam:engine",
          ownerKind: "shared-seam",
          patterns: ["packages/battle/src/**"],
          allowSharedFile: false,
          mechanicIds: ["shared.engine.turn-order"],
          authorityKeys: ["shared.engine-contracts"],
          propagatesTo: [],
        },
      ],
    },
    mechanicCatalog: {
      version: 1,
      mechanics: [
        {
          mechanicId: "shared.engine.turn-order",
          cluster: "effective-speed-order",
          topologies: ["singles"],
          orderingSensitive: true,
          persistent: false,
          proofStatus: "proved",
          authorityKey: "shared.engine-contracts",
          requiredSuites: ["test"],
          obligationSeed: "turn-order",
        },
      ],
    },
    authorityManifest: {
      version: 1,
      authorities: [
        {
          authorityKey: "shared.engine-contracts",
          sourceRepo: "local",
          referenceCommit: "workspace",
          sourcePath: "packages/battle/src/context/types.ts",
          symbolOrRoutine: "engine-contracts",
          sourceRole: "authoritative",
        },
      ],
    },
    obligationCatalog: {
      version: 1,
      clusters: [
        {
          cluster: "effective-speed-order",
          requiredProofs: ["source", "semantic", "runtime", "behavior"],
          requiredSuites: ["test"],
        },
      ],
    },
    bootstrapWaivers: { version: 1, waivers: [] },
    divergenceRegistry: { version: 1, divergences: [] },
    normalizationRegistry: { version: 1, normalizations: [] },
    lineageContracts: { version: 1, contracts: [] },
    abilityTriggerSurfaces: { version: 1, surfaces: [] },
    proofSchema: {
      version: 1,
      checkIdPattern: "gen{n}:{suite}:{kind}:{identifier}",
      suiteIds: [
        "test",
        "proof-preview",
        "typecheck:contracts",
        "workflow-contract",
        "mutation-audit",
      ],
      checkStatuses: ["pass", "fail", "skip", "incomplete", "advisory", "deferred", "interrupted"],
      suiteStatuses: ["pass", "fail", "skip", "incomplete", "deferred", "advisory", "interrupted"],
      runModes: ["fast", "full"],
      conclusions: ["fail", "provisional-pass", "compliant", "interrupted"],
    },
    protocolCapabilityMatrix: {
      version: 1,
      clusters: [
        {
          cluster: "effective-speed-order",
          operations: ["effectiveSpeed"],
          supportedTopologies: ["singles"],
          engineOwners: ["battle:shared-seam:engine"],
        },
      ],
    },
    ...overrides,
  };
}

describe("validateControlPlane", () => {
  it("passes for a structurally valid control plane", () => {
    expect(validateControlPlane(createControlPlane()).errors).toEqual([]);
  });

  it("fails when a touched legacy mechanic has no active bootstrap waiver", () => {
    const controlPlane = createControlPlane({
      mechanicCatalog: {
        version: 1,
        mechanics: [
          {
            mechanicId: "shared.engine.turn-order",
            cluster: "effective-speed-order",
            topologies: ["singles"],
            orderingSensitive: true,
            persistent: false,
            proofStatus: "legacy-unproven",
            authorityKey: "shared.engine-contracts",
            requiredSuites: ["test"],
            obligationSeed: "turn-order",
          },
        ],
      },
    });

    expect(
      validateControlPlane(controlPlane, {
        touchedMechanicIds: ["shared.engine.turn-order"],
      }).errors,
    ).toContain(
      "Touched legacy mechanic shared.engine.turn-order is legacy-unproven and has no active bootstrap waiver.",
    );
  });

  it("accepts a touched legacy mechanic when an active bootstrap waiver exists", () => {
    const controlPlane = createControlPlane({
      mechanicCatalog: {
        version: 1,
        mechanics: [
          {
            mechanicId: "shared.engine.turn-order",
            cluster: "effective-speed-order",
            topologies: ["singles"],
            orderingSensitive: true,
            persistent: false,
            proofStatus: "legacy-partial",
            authorityKey: "shared.engine-contracts",
            requiredSuites: ["test"],
            obligationSeed: "turn-order",
          },
        ],
      },
      bootstrapWaivers: {
        version: 1,
        waivers: [
          {
            waiverId: "waiver.turn-order",
            mechanicIds: ["shared.engine.turn-order"],
            issueNumber: 9999,
            owner: "codex",
            approver: "owner",
            expiresOn: "2099-01-01",
            missingProofs: ["behavior"],
          },
        ],
      },
    });

    expect(
      validateControlPlane(controlPlane, {
        touchedMechanicIds: ["shared.engine.turn-order"],
      }).errors,
    ).toEqual([]);
  });

  it("fails when a touched leaf runtime owner has no lineage contracts", () => {
    const controlPlane = createControlPlane({
      ownershipMap: {
        version: 1,
        fileClassRules: [{ fileClass: "runtime-owning", patterns: ["packages/**"] }],
        ownershipRules: [
          {
            ownershipKey: "gen8:leaf-mechanic:ability-trigger-surface",
            ownerKind: "leaf-mechanic",
            patterns: ["packages/gen8/src/Gen8Abilities*.ts"],
            allowSharedFile: false,
            mechanicIds: ["shared.engine.turn-order"],
            authorityKeys: ["shared.engine-contracts"],
            propagatesTo: [],
          },
        ],
      },
    });

    expect(
      validateControlPlane(controlPlane, {
        touchedOwnershipKeys: ["gen8:leaf-mechanic:ability-trigger-surface"],
      }).errors,
    ).toContain(
      "Touched runtime owner gen8:leaf-mechanic:ability-trigger-surface has no lineage contracts in lineage-contracts.v1.json.",
    );
  });

  it("fails when a touched ability trigger surface has no declared dispatcher surface", () => {
    const controlPlane = createControlPlane({
      ownershipMap: {
        version: 1,
        fileClassRules: [{ fileClass: "runtime-owning", patterns: ["packages/**"] }],
        ownershipRules: [
          {
            ownershipKey: "gen8:leaf-mechanic:ability-trigger-surface",
            ownerKind: "leaf-mechanic",
            patterns: ["packages/gen8/src/Gen8Abilities*.ts"],
            allowSharedFile: false,
            mechanicIds: ["shared.engine.turn-order"],
            authorityKeys: ["shared.engine-contracts"],
            propagatesTo: [],
          },
        ],
      },
      lineageContracts: {
        version: 1,
        contracts: [
          {
            gen: 8,
            entityType: "ability",
            entityId: "dispatch-surface",
            triggerPath: "ability.dispatch.surface",
            runtimeOwner: "gen8:leaf-mechanic:ability-trigger-surface",
            authorityTag: "showdown",
            descendantPolicy: "inherit-with-delta",
            proofIds: [],
          },
        ],
      },
    });

    expect(
      validateControlPlane(controlPlane, {
        touchedOwnershipKeys: ["gen8:leaf-mechanic:ability-trigger-surface"],
      }).errors,
    ).toContain(
      "Touched ability trigger surface gen8:leaf-mechanic:ability-trigger-surface has no entry in ability-trigger-surfaces.v1.json.",
    );
  });

  it("does not require lineage contracts for touched non-leaf ownership keys", () => {
    const controlPlane = createControlPlane();

    expect(
      validateControlPlane(controlPlane, {
        touchedOwnershipKeys: ["battle:shared-seam:engine"],
      }).errors,
    ).toEqual([]);
  });

  it("treats expiresOn as inclusive through the stated day", () => {
    const controlPlane = createControlPlane({
      mechanicCatalog: {
        version: 1,
        mechanics: [
          {
            mechanicId: "shared.engine.turn-order",
            cluster: "effective-speed-order",
            topologies: ["singles"],
            orderingSensitive: true,
            persistent: false,
            proofStatus: "legacy-partial",
            authorityKey: "shared.engine-contracts",
            requiredSuites: ["test"],
            obligationSeed: "turn-order",
          },
        ],
      },
      bootstrapWaivers: {
        version: 1,
        waivers: [
          {
            waiverId: "waiver.same-day",
            mechanicIds: ["shared.engine.turn-order"],
            issueNumber: 9999,
            owner: "codex",
            approver: "owner",
            expiresOn: "2026-03-31",
            missingProofs: ["behavior"],
          },
        ],
      },
    });

    expect(
      validateControlPlane(controlPlane, {
        touchedMechanicIds: ["shared.engine.turn-order"],
        now: new Date("2026-03-31T18:00:00.000Z"),
      }).errors,
    ).toEqual([]);
  });

  it("fails on expired bootstrap waivers and expired normalizations", () => {
    const controlPlane = createControlPlane({
      bootstrapWaivers: {
        version: 1,
        waivers: [
          {
            waiverId: "waiver.expired",
            mechanicIds: ["shared.engine.turn-order"],
            issueNumber: 9999,
            owner: "codex",
            approver: "owner",
            expiresOn: "2000-01-01",
            missingProofs: ["behavior"],
          },
        ],
      },
      normalizationRegistry: {
        version: 1,
        normalizations: [
          {
            normalizationId: "normalization.expired",
            reasonClass: "oracle-representation-mismatch",
            fields: ["damage"],
            cluster: "effective-speed-order",
            topologies: ["singles"],
            generations: [5],
            authorityKeys: ["shared.engine-contracts"],
            owner: "codex",
            approver: "owner",
            expiresOn: "2000-01-01",
          },
        ],
      },
    });

    const errors = validateControlPlane(controlPlane).errors;

    expect(errors).toContain("Expired bootstrap waiver waiver.expired blocks merge.");
    expect(errors).toContain("Expired normalization normalization.expired blocks merge.");
  });

  it("fails when a mechanic requires an unknown suite", () => {
    const controlPlane = createControlPlane({
      mechanicCatalog: {
        version: 1,
        mechanics: [
          {
            mechanicId: "shared.engine.turn-order",
            cluster: "effective-speed-order",
            topologies: ["singles"],
            orderingSensitive: true,
            persistent: false,
            proofStatus: "proved",
            authorityKey: "shared.engine-contracts",
            requiredSuites: ["unknown-suite"],
            obligationSeed: "turn-order",
          },
        ],
      },
    });

    expect(validateControlPlane(controlPlane).errors).toContain(
      "Mechanic shared.engine.turn-order requires unknown suite unknown-suite.",
    );
  });

  it("fails when a protocol cluster references an unknown engine owner", () => {
    const controlPlane = createControlPlane({
      protocolCapabilityMatrix: {
        version: 1,
        clusters: [
          {
            cluster: "effective-speed-order",
            operations: ["effectiveSpeed"],
            supportedTopologies: ["singles"],
            engineOwners: ["battle:shared-seam:missing"],
          },
        ],
      },
    });

    expect(validateControlPlane(controlPlane).errors).toContain(
      "Protocol cluster effective-speed-order references unknown engineOwner battle:shared-seam:missing.",
    );
  });

  it("fails when the proof schema drifts from the runtime artifact schema", () => {
    const controlPlane = createControlPlane({
      proofSchema: {
        version: 1,
        checkIdPattern: "gen{n}:{suite}:{kind}:{identifier}",
        suiteIds: ["test", "proof-preview", "typecheck:contracts", "workflow-contract"],
        checkStatuses: ["pass", "fail"],
        suiteStatuses: ["pass", "fail"],
        runModes: ["fast"],
        conclusions: ["fail"],
      },
    });

    const errors = validateControlPlane(controlPlane).errors;

    expect(errors).toContain(
      "proof-schema.v1.json checkStatuses must match proof-artifact-schema.ts checkStatusSchema exactly.",
    );
    expect(errors).toContain(
      "proof-schema.v1.json suiteStatuses must match proof-artifact-schema.ts suiteStatusSchema exactly.",
    );
    expect(errors).toContain(
      "proof-schema.v1.json runModes must match proof-artifact-schema.ts runModeSchema exactly.",
    );
    expect(errors).toContain(
      "proof-schema.v1.json conclusions must match proof-artifact-schema.ts runConclusionSchema exactly.",
    );
  });

  it("fails when an obligation cluster is missing from the protocol matrix", () => {
    const controlPlane = createControlPlane({
      protocolCapabilityMatrix: {
        version: 1,
        clusters: [],
      },
    });

    expect(validateControlPlane(controlPlane).errors).toContain(
      "Obligation cluster effective-speed-order is missing from protocol-capability-matrix.v1.json.",
    );
  });

  it("fails when protocol topologies do not cover the mechanic topologies", () => {
    const controlPlane = createControlPlane({
      mechanicCatalog: {
        version: 1,
        mechanics: [
          {
            mechanicId: "shared.engine.turn-order",
            cluster: "effective-speed-order",
            topologies: ["singles", "switch-legality"],
            orderingSensitive: true,
            persistent: false,
            proofStatus: "proved",
            authorityKey: "shared.engine-contracts",
            requiredSuites: ["test"],
            obligationSeed: "turn-order",
          },
        ],
      },
    });

    expect(validateControlPlane(controlPlane).errors).toContain(
      "Mechanic shared.engine.turn-order topology switch-legality is not covered by protocol cluster effective-speed-order.",
    );
  });

  it("fails when protocol engine owners do not cover the mechanics in their cluster", () => {
    const controlPlane = createControlPlane({
      protocolCapabilityMatrix: {
        version: 1,
        clusters: [
          {
            cluster: "effective-speed-order",
            operations: ["effectiveSpeed"],
            supportedTopologies: ["singles"],
            engineOwners: ["unknown:owner"],
          },
        ],
      },
    });

    const errors = validateControlPlane(controlPlane).errors;

    expect(errors).toContain(
      "Protocol cluster effective-speed-order references unknown engineOwner unknown:owner.",
    );
    expect(errors).toContain(
      "Mechanic shared.engine.turn-order is not covered by any protocol engineOwner declared for cluster effective-speed-order.",
    );
  });

  it("fails when a protocol cluster duplicates engine owners", () => {
    const controlPlane = createControlPlane({
      protocolCapabilityMatrix: {
        version: 1,
        clusters: [
          {
            cluster: "effective-speed-order",
            operations: ["effectiveSpeed"],
            supportedTopologies: ["singles"],
            engineOwners: ["battle:shared-seam:engine", "battle:shared-seam:engine"],
          },
        ],
      },
    });

    expect(validateControlPlane(controlPlane).errors).toContain(
      "Protocol cluster effective-speed-order duplicates engine owner battle:shared-seam:engine in protocol-capability-matrix.v1.json.",
    );
  });

  it("passes for the checked-in control plane", () => {
    expect(validateControlPlane(loadControlPlane(repoRoot)).errors).toEqual([]);
  });

  it("fails when a checked-in ability trigger surface declares a trigger absent from the dispatcher", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const [firstSurface, ...remainingSurfaces] = controlPlane.abilityTriggerSurfaces.surfaces;
    if (!firstSurface) {
      throw new Error("Expected checked-in ability trigger surfaces to be present.");
    }
    const mutatedControlPlane: ControlPlane = {
      ...controlPlane,
      abilityTriggerSurfaces: {
        version: 1,
        surfaces: [
          {
            ...firstSurface,
            routedTriggers: [...firstSurface.routedTriggers, "on-terrain-change"],
          },
          ...remainingSurfaces,
        ],
      },
    };

    expect(validateControlPlane(mutatedControlPlane).errors).toContain(
      "Ability trigger surface gen4:leaf-mechanic:ability-trigger-surface dispatcher packages/gen4/src/Gen4Abilities.ts is missing routed trigger on-terrain-change.",
    );
  });
});
