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

  it("classifies tests as evidence-only", () => {
    const controlPlane = loadControlPlane(repoRoot);
    const classification = classifyRepoFile(
      controlPlane,
      "tools/oracle-validation/tests/result-schema.test.ts",
    );

    expect(classification.fileClass).toBe("evidence-only");
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
