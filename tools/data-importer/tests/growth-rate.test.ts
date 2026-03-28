import { describe, expect, it } from "vitest";
import { normalizeImportedGrowthRate } from "../src/growth-rate";

describe("normalizeImportedGrowthRate", () => {
  it("given the PokeAPI slow-then-very-fast name, when normalizing importer output, then erratic is emitted", () => {
    // Source: PokeAPI growth-rate naming — this legacy label is the erratic curve.
    expect(normalizeImportedGrowthRate("slow-then-very-fast")).toBe("erratic");
  });

  it("given the PokeAPI fast-then-very-slow name, when normalizing importer output, then fluctuating is emitted", () => {
    // Source: PokeAPI growth-rate naming — this legacy label is the fluctuating curve.
    expect(normalizeImportedGrowthRate("fast-then-very-slow")).toBe("fluctuating");
  });

  it("given the PokeAPI medium name, when normalizing importer output, then medium-fast is emitted", () => {
    // Source: PokeAPI growth-rate naming — medium is the medium-fast curve.
    expect(normalizeImportedGrowthRate("medium")).toBe("medium-fast");
  });

  it("given a canonical growth-rate name, when normalizing importer output, then it is preserved", () => {
    // Source: core experience-group contract — medium-slow is one of the 6 canonical runtime groups.
    expect(normalizeImportedGrowthRate("medium-slow")).toBe("medium-slow");
  });

  it("given an unknown growth-rate name, when normalizing importer output, then it throws clearly", () => {
    expect(() => normalizeImportedGrowthRate("spiral-growth")).toThrow(
      'Unsupported experience growth group "spiral-growth"',
    );
  });
});
