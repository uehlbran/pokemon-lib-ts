import { describe, expect, it } from "vitest";
import { Gen4Ruleset } from "../../src/Gen4Ruleset";

describe("Gen4Ruleset smoke", () => {
  it("given Gen4Ruleset, when checking generation, then returns 4", () => {
    const ruleset = new Gen4Ruleset();
    // Source: Gen4Ruleset is the Gen 4 ruleset implementation for this package.
    expect(ruleset.generation).toBe(4);
  });

  it("given Gen4Ruleset, when checking name, then includes Gen 4", () => {
    const ruleset = new Gen4Ruleset();
    expect(ruleset.name).toContain("Gen 4");
  });
});
