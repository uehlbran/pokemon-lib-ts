import { CORE_MOVE_EFFECT_TARGETS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { BATTLE_EFFECT_TARGETS } from "../../../src/constants/effect-protocol";
import { resolveStatChangeTarget } from "../../../src/utils";

describe("resolveStatChangeTarget", () => {
  it('given target "self", when resolving, then returns "attacker"', () => {
    // Arrange / Act
    const result = resolveStatChangeTarget(CORE_MOVE_EFFECT_TARGETS.self);
    // Assert
    expect(result).toBe(BATTLE_EFFECT_TARGETS.attacker);
  });

  it('given target "foe", when resolving, then returns "defender"', () => {
    // Arrange / Act
    const result = resolveStatChangeTarget(CORE_MOVE_EFFECT_TARGETS.foe);
    // Assert
    expect(result).toBe(BATTLE_EFFECT_TARGETS.defender);
  });

  it('given target "ally", when resolving in singles engine, then throws (doubles not implemented)', () => {
    // Ally-targeting stat changes (Aromatic Mist, Coaching) require doubles support.
    // In singles, there is no valid ally target — this is a programming error, not a runtime edge case.
    expect(() => resolveStatChangeTarget(CORE_MOVE_EFFECT_TARGETS.ally)).toThrow("doubles support");
  });
});
