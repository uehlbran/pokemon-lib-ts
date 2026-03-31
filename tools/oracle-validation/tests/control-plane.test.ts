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
    expect(expanded).toContain("gen8:leaf-mechanic:ability-trigger-surface");
  });

  it("propagates battle ability-context contract changes into the Gen 4 ability trigger surface", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const expanded = expandOwnershipKeys(controlPlane, ["battle:contract:ability-context-result"]);

    expect(expanded).toContain("gen4:leaf-mechanic:ability-trigger-surface");
  });

  it("propagates engine changes into the Gen 4 ability trigger surface", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const expanded = expandOwnershipKeys(controlPlane, ["battle:shared-seam:engine"]);

    expect(expanded).toContain("gen4:leaf-mechanic:ability-trigger-surface");
  });

  it("maps the data importer workspace manifest into importer tooling ownership", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, "tools/data-importer/package.json");

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toContain("data-importer:tooling:importer-and-overrides");
  });

  it("maps Gen 8 ability files into the dedicated ability trigger ownership key", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, "packages/gen8/src/Gen8AbilitiesStat.ts");

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual(["gen8:leaf-mechanic:ability-trigger-surface"]);
    expect(classification.ruleMatches).toHaveLength(1);
  });

  it("shares Gen 8 ruleset ownership between the coarse runtime owner and ability trigger surface", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, "packages/gen8/src/Gen8Ruleset.ts");

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual([
      "gen8:leaf-mechanic:ability-trigger-surface",
      "gen8:leaf-mechanic:ruleset-and-handlers",
    ]);
    expect(classification.ruleMatches).toHaveLength(2);
    expect(classification.ruleMatches.every((rule) => rule.allowSharedFile)).toBe(true);
  });

  it("maps Gen 4 ability files into the dedicated ability trigger ownership key", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, "packages/gen4/src/Gen4Abilities.ts");

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual(["gen4:leaf-mechanic:ability-trigger-surface"]);
    expect(classification.ruleMatches).toHaveLength(1);
  });

  it("keeps Gen 9 ruleset files in the coarse ruleset owner without low-confidence overlap", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(controlPlane, "packages/gen9/src/Gen9Ruleset.ts");

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual(["gen9:leaf-mechanic:ruleset-and-handlers"]);
    expect(classification.ruleMatches).toHaveLength(1);
  });

  it("maps Gen 8 src/data files into the coarse ruleset owner", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(
      controlPlane,
      "packages/gen8/src/data/reference-ids.ts",
    );

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual(["gen8:leaf-mechanic:ruleset-and-handlers"]);
    expect(classification.ruleMatches).toHaveLength(1);
  });

  it("maps Gen 9 src/data files into the coarse ruleset owner", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(
      controlPlane,
      "packages/gen9/src/data/reference-ids.ts",
    );

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual(["gen9:leaf-mechanic:ruleset-and-handlers"]);
    expect(classification.ruleMatches).toHaveLength(1);
  });

  it("maps Gen 4 src/data files into the coarse ruleset owner", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(
      controlPlane,
      "packages/gen4/src/data/reference-ids.ts",
    );

    expect(classification.fileClass).toBe("runtime-owning");
    expect(classification.ownershipKeys).toEqual(["gen4:leaf-mechanic:ruleset-and-handlers"]);
    expect(classification.ruleMatches).toHaveLength(1);
  });
});
