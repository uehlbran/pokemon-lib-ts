import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyRepoFile, expandOwnershipKeys, loadControlPlane } from "../src/control-plane.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("control plane ownership mapping", () => {
  it("classifies workflow files as runtime-owning tooling", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, ".github/workflows/compliance.yml");

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toContain("workflow:tooling:compliance");
  });

  it("classifies control-plane registry files as runtime-owning oracle tooling", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(
      controlPlane,
      "tools/oracle-validation/control-plane/ownership-map.v1.json",
    );

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toContain("oracle:tooling:runner");
  });

  it("classifies tests as evidence-only", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(
      controlPlane,
      "tools/oracle-validation/tests/result-schema.test.ts",
    );

    expect(classification.fileClass).toBe("evidence-only");
  });

  it("allows explicit shared-file ownership for battle contract types", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, "packages/battle/src/context/types.ts");

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual([
      "battle:contract:ability-context-result",
      "battle:contract:damage-context",
      "battle:contract:field-effect-results",
      "battle:contract:hit-check-contexts",
      "battle:contract:item-context-result",
      "battle:contract:move-effect-context",
      "battle:contract:move-effect-result",
    ]);
    expect(classification.ruleMatches).toHaveLength(7);
    expect(classification.ruleMatches.every((rule) => rule.allowSharedFile)).toBe(true);
  });

  it("maps core reference ids into the reference-id contract bucket", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(
      controlPlane,
      "packages/core/src/constants/reference-ids.ts",
    );

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ruleMatches.flatMap((rule) => rule.mechanicIds)).toContain(
      "shared.contract.reference-ids",
    );
  });

  it("expands importer changes into runtime and oracle tooling ownership", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const expanded = expandOwnershipKeys(controlPlane, [
      "data-importer:tooling:importer-and-overrides",
    ]);

    expect(expanded).toContain("oracle:tooling:runner");
    expect(expanded).toContain("gen8:leaf-mechanic:ruleset-and-handlers");
  });
});
