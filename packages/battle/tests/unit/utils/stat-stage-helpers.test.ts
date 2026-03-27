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

  it("given an opponent with Unaware and explicit bypass, when computing offense stages, then the raw stage is preserved", () => {
    const attacker = createOnFieldPokemon(createTestPokemon(6, 50), 0, [
      TYPE_IDS.fire,
      TYPE_IDS.flying,
    ]);
    const defender = createOnFieldPokemon(createTestPokemon(9, 50), 1, [TYPE_IDS.normal]);

    attacker.statStages.attack = 2;
    defender.ability = "unaware";

    expect(getEffectiveStatStage(attacker, "attack", defender, "offense", true)).toBe(2);
  });

  it("given a defender with Simple and explicit bypass, when computing defense stages, then Simple does not double them", () => {
    const defender = createOnFieldPokemon(createTestPokemon(6, 50), 0, [
      TYPE_IDS.fire,
      TYPE_IDS.flying,
    ]);
    const attacker = createOnFieldPokemon(createTestPokemon(9, 50), 1, [TYPE_IDS.normal]);

    defender.statStages.defense = 2;
    defender.ability = "simple";

    expect(getEffectiveStatStage(defender, "defense", attacker, "defense", true)).toBe(2);
  });
});
