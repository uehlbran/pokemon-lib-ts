import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

describe("@pokemon-lib-ts/gen9 public API barrel", () => {
  it("exports explicit canonical names for low-level helpers and trigger handlers", () => {
    expect(indexSource).toContain("applyGen9IntrepidSwordBoost");
    expect(indexSource).toContain("applyGen9DauntlessShieldBoost");
    expect(indexSource).toContain("applyGen9ProteanTypeChange");
    expect(indexSource).toContain("handleGen9IntrepidSwordTrigger");
    expect(indexSource).toContain("handleGen9DauntlessShieldTrigger");
    expect(indexSource).toContain("handleGen9ProteanTrigger");
  });

  it("keeps compatibility aliases documented in the barrel", () => {
    expect(indexSource).toContain("handleGen9IntrepidSword");
    expect(indexSource).toContain("handleGen9DauntlessShield");
    expect(indexSource).toContain("handleGen9ProteanTypeChange");
    expect(indexSource).toContain("handleIntrepidSwordGen9");
    expect(indexSource).toContain("handleDauntlessShieldGen9");
    expect(indexSource).toContain("handleProteanGen9");
  });

  it("exports both fixed-point and explicitly named floating-point Supreme Overlord helpers", () => {
    expect(indexSource).toContain("getSupremeOverlordModifier");
    expect(indexSource).toContain("getSupremeOverlordFloatMultiplier");
    expect(indexSource).toContain("getSupremeOverlordMultiplier");
  });
});
