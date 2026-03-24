import type { BattleStat } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createActivePokemon, createTestPokemon } from "../../../src/utils";
import { getEffectiveStatStage } from "../../../src/utils/statStageHelpers";

describe("getEffectiveStatStage", () => {
  it("given an invalid stat key from an untyped caller, when the helper is invoked, then it throws instead of returning a plausible stage", () => {
    const active = createActivePokemon(createTestPokemon(6, 50), 0, ["fire", "flying"]);
    active.statStages.spAttack = 2;

    expect(() => getEffectiveStatStage(active, "spAtk" as BattleStat)).toThrow(
      'Unknown battle stat "spAtk"',
    );
  });

  it("given a valid stat key, when the helper is invoked, then it returns the configured stage", () => {
    const active = createActivePokemon(createTestPokemon(6, 50), 0, ["fire", "flying"]);
    active.statStages.spAttack = 2;

    expect(getEffectiveStatStage(active, "spAttack")).toBe(2);
  });
});
