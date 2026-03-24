import { describe, expect, it } from "vitest";
import {
  isSemiInvulnerableVolatile,
  isSwitchBlockingVolatile,
  isVolatileStatusForGeneration,
} from "../../../src";

describe("volatile status generation guards", () => {
  it("accepts only statuses introduced by the requested generation", () => {
    // Provenance:
    // - packages/core/src/entities/status.ts: GEN1_VOLATILE_STATUSES includes "rage".
    // - packages/gen6/src/Gen6MoveEffects.ts tracks Shadow Force / Phantom Force with "shadow-force-charging".
    // - packages/gen8/src/Gen8MoveEffects.ts introduces the "no-retreat" volatile for No Retreat.
    // - packages/gen9/src/Gen9MoveEffects.ts introduces the "silk-trap" volatile for Silk Trap.
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
    // Provenance:
    // - Gen 1/2/3/4 rulesets use the "bound" volatile for partial trapping and immobilization.
    // - packages/gen5/src/Gen5EntryHazards.ts and packages/gen6/src/Gen6EntryHazards.ts treat "ingrain"
    //   as a grounding/switch-preventing volatile.
    // - packages/core/src/entities/status.ts: SWITCH_BLOCKING_VOLATILES includes "trapped".
    // - packages/core/src/entities/status.ts: GEN3_VOLATILE_STATUS_ADDITIONS includes "charged", but it
    //   is intentionally absent from SWITCH_BLOCKING_VOLATILES because it is a move-state marker.
    expect(isSwitchBlockingVolatile("bound")).toBe(true);
    expect(isSwitchBlockingVolatile("ingrain")).toBe(true);
    expect(isSwitchBlockingVolatile("trapped")).toBe(true);
    expect(isSwitchBlockingVolatile("charged")).toBe(false);
  });
});
