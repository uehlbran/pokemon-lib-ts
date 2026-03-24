import { describe, expect, it } from "vitest";
import {
  isSemiInvulnerableVolatile,
  isSwitchBlockingVolatile,
  isVolatileStatusForGeneration,
} from "../../src";

describe("volatile status generation guards", () => {
  it("accepts only statuses introduced by the requested generation", () => {
    expect(isVolatileStatusForGeneration(1, "rage")).toBe(true);
    expect(isVolatileStatusForGeneration(1, "silk-trap")).toBe(false);
    expect(isVolatileStatusForGeneration(4, "shadow-force-charging")).toBe(true);
    expect(isVolatileStatusForGeneration(4, "no-retreat")).toBe(false);
  });

  it("recognizes semi-invulnerable statuses without widening to the full union", () => {
    expect(isSemiInvulnerableVolatile("charging")).toBe(false);
    expect(isSemiInvulnerableVolatile("shadow-force-charging")).toBe(true);
    expect(isSemiInvulnerableVolatile("confusion")).toBe(false);
  });

  it("treats ingrain as a switch-blocking volatile", () => {
    expect(isSwitchBlockingVolatile("ingrain")).toBe(true);
    expect(isSwitchBlockingVolatile("trapped")).toBe(true);
    expect(isSwitchBlockingVolatile("charged")).toBe(false);
  });
});
