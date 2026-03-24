import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

describe("@pokemon-lib-ts/gen9 public API barrel", () => {
  it("exports the canonical Gen 9 ability handler names", () => {
    expect(indexSource).toContain("handleGen9IntrepidSword");
    expect(indexSource).toContain("handleGen9DauntlessShield");
    expect(indexSource).toContain("handleGen9Protean");
  });

  it("does not re-export the ambiguous legacy root symbols", () => {
    expect(indexSource).not.toContain("handleIntrepidSwordGen9");
    expect(indexSource).not.toContain("handleDauntlessShieldGen9");
    expect(indexSource).not.toContain("handleProteanGen9");
    expect(indexSource).not.toContain("handleGen9ProteanTypeChange");
  });

  it("keeps only the fixed-point Supreme Overlord helper in the root barrel", () => {
    expect(indexSource).toContain("getSupremeOverlordModifier");
    expect(indexSource).not.toContain("getSupremeOverlordMultiplier");
  });
});
