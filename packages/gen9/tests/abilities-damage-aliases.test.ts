import { describe, expect, it } from "vitest";
import {
  applyGen9DauntlessShieldBoost,
  applyGen9IntrepidSwordBoost,
  applyGen9ProteanTypeChange,
  handleGen9DauntlessShield,
  handleGen9IntrepidSword,
  handleGen9ProteanTypeChange,
} from "../src/Gen9AbilitiesDamage";

describe("Gen9AbilitiesDamage canonical helper aliases", () => {
  it("keeps applyGen9ProteanTypeChange as the canonical low-level type-change helper", () => {
    expect(applyGen9ProteanTypeChange).toBe(handleGen9ProteanTypeChange);
  });

  it("keeps applyGen9IntrepidSwordBoost as the canonical low-level boost helper", () => {
    expect(applyGen9IntrepidSwordBoost).toBe(handleGen9IntrepidSword);
  });

  it("keeps applyGen9DauntlessShieldBoost as the canonical low-level boost helper", () => {
    expect(applyGen9DauntlessShieldBoost).toBe(handleGen9DauntlessShield);
  });
});
