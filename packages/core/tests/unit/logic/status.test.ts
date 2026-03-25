import { describe, expect, it } from "vitest";
import {
  CORE_VOLATILE_IDS,
  isSemiInvulnerableVolatile,
  isSwitchBlockingVolatile,
  isVolatileStatusForGeneration,
} from "../../../src";

describe("volatile status generation guards", () => {
  const {
    bound,
    charged,
    charging,
    confusion,
    ingrain,
    noRetreat,
    rage,
    shadowForceCharging,
    silkTrap,
    trapped,
  } = CORE_VOLATILE_IDS;

  it("given volatile ids from multiple generations, when checking generation guards, then only ids introduced by that generation are accepted", () => {
    // Provenance:
    // - packages/core/src/entities/status.ts: GEN1_VOLATILE_STATUSES includes "rage".
    // - packages/gen6/src/Gen6MoveEffects.ts tracks Shadow Force / Phantom Force with "shadow-force-charging".
    // - packages/gen8/src/Gen8MoveEffects.ts introduces the "no-retreat" volatile for No Retreat.
    // - packages/gen9/src/Gen9MoveEffects.ts introduces the "silk-trap" volatile for Silk Trap.
    expect(isVolatileStatusForGeneration(1, rage)).toBe(true);
    expect(isVolatileStatusForGeneration(1, silkTrap)).toBe(false);
    expect(isVolatileStatusForGeneration(4, shadowForceCharging)).toBe(true);
    expect(isVolatileStatusForGeneration(4, noRetreat)).toBe(false);
  });

  it("given volatile ids outside the semi-invulnerable subset, when checking semi-invulnerable guards, then only the supported subset returns true", () => {
    expect(isSemiInvulnerableVolatile(charging)).toBe(false);
    expect(isSemiInvulnerableVolatile(shadowForceCharging)).toBe(true);
    expect(isSemiInvulnerableVolatile(confusion)).toBe(false);
  });

  it("given switch-blocking and non-switch-blocking volatile ids, when checking the switch-blocking guard, then only the owned blocking ids return true", () => {
    // Provenance:
    // - Gen 1/2/3/4 rulesets use the "bound" volatile for partial trapping and immobilization.
    // - packages/gen5/src/Gen5EntryHazards.ts and packages/gen6/src/Gen6EntryHazards.ts treat "ingrain"
    //   as a grounding/switch-preventing volatile.
    // - packages/core/src/entities/status.ts: SWITCH_BLOCKING_VOLATILES includes "trapped".
    // - packages/core/src/entities/status.ts: GEN3_VOLATILE_STATUS_ADDITIONS includes "charged", but it
    //   is intentionally absent from SWITCH_BLOCKING_VOLATILES because it is a move-state marker.
    expect(isSwitchBlockingVolatile(bound)).toBe(true);
    expect(isSwitchBlockingVolatile(ingrain)).toBe(true);
    expect(isSwitchBlockingVolatile(trapped)).toBe(true);
    expect(isSwitchBlockingVolatile(charged)).toBe(false);
  });
});
