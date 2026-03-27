import { normalizeExperienceGroup } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { normalizeImportedGrowthRate } from "../src/growth-rate";

describe("foundation hardening invariants - importer/runtime contract", () => {
  it("emits only canonical runtime growth identifiers for known PokeAPI aliases", () => {
    const normalized = [
      normalizeImportedGrowthRate("medium"),
      normalizeImportedGrowthRate("slow-then-very-fast"),
      normalizeImportedGrowthRate("fast-then-very-slow"),
      normalizeImportedGrowthRate("medium-slow"),
    ];

    expect(normalized).toEqual(["medium-fast", "erratic", "fluctuating", "medium-slow"]);
    expect(normalized).not.toContain("medium");
    expect(normalized).not.toContain("slow-then-very-fast");
    expect(normalized).not.toContain("fast-then-very-slow");
  });

  it("composes cleanly with the runtime normalizer and rejects unsupported names", () => {
    const canonical = normalizeImportedGrowthRate("slow-then-very-fast");
    expect(normalizeExperienceGroup(canonical)).toBe("erratic");
    expect(() => normalizeImportedGrowthRate("spiral-growth")).toThrow(
      'Unsupported experience growth group "spiral-growth"',
    );
  });
});
