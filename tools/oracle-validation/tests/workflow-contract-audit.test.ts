import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildWorkflowContractArtifact,
  collectWorkflowValidations,
} from "../src/workflow-contract-audit.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("buildWorkflowContractArtifact", () => {
  it("marks the artifact as pass when all workflow checks pass", () => {
    const artifact = buildWorkflowContractArtifact("abc123", "ci-preview", [
      { workflow: "ci.yml", errors: [] },
      { workflow: "compliance.yml", errors: [] },
    ]);

    expect(artifact.status).toBe("pass");
    expect(artifact.checks).toEqual([
      {
        checkId: "workflow-contract:ci.yml",
        workflow: "ci.yml",
        status: "pass",
        errors: [],
      },
      {
        checkId: "workflow-contract:compliance.yml",
        workflow: "compliance.yml",
        status: "pass",
        errors: [],
      },
    ]);
  });

  it("marks the artifact as fail when any workflow check fails", () => {
    const artifact = buildWorkflowContractArtifact("abc123", "ci-preview", [
      {
        workflow: "ci.yml",
        errors: ["Missing expected CI workflow contract snippet: proof-gate:"],
      },
    ]);

    expect(artifact.status).toBe("fail");
    expect(artifact.checks[0]).toEqual({
      checkId: "workflow-contract:ci.yml",
      workflow: "ci.yml",
      status: "fail",
      errors: ["Missing expected CI workflow contract snippet: proof-gate:"],
    });
  });
});

describe("collectWorkflowValidations", () => {
  it("covers every audited workflow file in the repo", () => {
    const validations = collectWorkflowValidations(repoRoot);

    expect(validations.map((validation) => validation.workflow)).toEqual([
      "compliance.yml",
      "ci.yml",
      "pr-review.yml",
      "check-issue-link.yml",
    ]);
  });
});
