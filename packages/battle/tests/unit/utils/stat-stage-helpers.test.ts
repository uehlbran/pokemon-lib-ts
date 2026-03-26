import { type BattleStat, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createOnFieldPokemon, createTestPokemon } from "../../../src/utils";
import { getEffectiveStatStage } from "../../../src/utils/statStageHelpers";

const TYPE_IDS = CORE_TYPE_IDS;

describe("getEffectiveStatStage", () => {
  it("given an invalid stat key from an untyped caller, when the helper is invoked, then it throws instead of returning a plausible stage", () => {
    const active = createOnFieldPokemon(createTestPokemon(6, 50), 0, [
      TYPE_IDS.fire,
      TYPE_IDS.flying,
    ]);
    active.statStages.spAttack = 2;

    expect(() => getEffectiveStatStage(active, "spAtk" as BattleStat)).toThrow(
      'Unknown battle stat "spAtk"',
    );
  });

  it("given a valid stat key, when the helper is invoked, then it returns the configured stage", () => {
    const active = createOnFieldPokemon(createTestPokemon(6, 50), 0, [
      TYPE_IDS.fire,
      TYPE_IDS.flying,
    ]);
    active.statStages.spAttack = 2;

    expect(getEffectiveStatStage(active, "spAttack")).toBe(2);
  });
});
