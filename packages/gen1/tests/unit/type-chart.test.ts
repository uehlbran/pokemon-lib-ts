import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_TYPES } from "../../src";

function getEffectiveness(
  chart: TypeChart,
  attackType: PokemonType,
  defenderType: PokemonType,
): number {
  return chart[attackType]?.[defenderType] ?? 1;
}

describe("Gen 1 Type Chart", () => {
  const dm = createGen1DataManager();
  const chart = dm.getTypeChart();
  const T = CORE_TYPE_IDS;
  const validMultipliers = [0, 0.5, 1, 2] as const;

  it("matches the owned Gen 1 type surface", () => {
    expect(Object.keys(chart) as PokemonType[]).toEqual([...GEN1_TYPES]);
  });

  it("given the Gen 1 type chart, when checking canonical matchups, then the expected multipliers hold", () => {
    const cases = [
      [T.ghost, T.psychic, 0],
      [T.poison, T.bug, 2],
      [T.bug, T.poison, 2],
      [T.normal, T.ghost, 0],
      [T.ghost, T.normal, 0],
      [T.fighting, T.ghost, 0],
      [T.electric, T.ground, 0],
      [T.ground, T.flying, 0],
      [T.fire, T.grass, 2],
      [T.water, T.fire, 2],
      [T.grass, T.water, 2],
      [T.fire, T.water, 0.5],
      [T.water, T.grass, 0.5],
      [T.grass, T.fire, 0.5],
      [T.psychic, T.fighting, 2],
      [T.psychic, T.poison, 2],
      [T.ice, T.dragon, 2],
      [T.ice, T.flying, 2],
      [T.ice, T.grass, 2],
      [T.ice, T.ground, 2],
      [T.dragon, T.dragon, 2],
      [T.ghost, T.ghost, 2],
      [T.ground, T.electric, 2],
      [T.ground, T.fire, 2],
      [T.ground, T.poison, 2],
      [T.ground, T.rock, 2],
      [T.rock, T.fire, 2],
      [T.rock, T.flying, 2],
      [T.rock, T.ice, 2],
      [T.rock, T.bug, 2],
      [T.flying, T.bug, 2],
      [T.flying, T.grass, 2],
      [T.flying, T.fighting, 2],
      [T.normal, T.normal, 1],
      [T.fire, T.fire, 0.5],
      [T.normal, T.rock, 0.5],
      [T.fire, T.rock, 0.5],
      [T.fire, T.bug, 2],
      [T.fire, T.ice, 2],
      [T.electric, T.water, 2],
      [T.electric, T.flying, 2],
      [T.fighting, T.normal, 2],
      [T.fighting, T.ice, 2],
      [T.fighting, T.rock, 2],
      [T.bug, T.grass, 2],
      [T.bug, T.psychic, 2],
      [T.water, T.ground, 2],
      [T.water, T.rock, 2],
      [T.grass, T.fire, 0.5],
      [T.grass, T.ground, 2],
      [T.grass, T.rock, 2],
      [T.poison, T.grass, 2],
      [T.poison, T.rock, 0.5],
    ] as const satisfies readonly (readonly [PokemonType, PokemonType, number])[];

    for (const [attackType, defenderType, expected] of cases) {
      expect(getEffectiveness(chart, attackType, defenderType)).toBe(expected);
    }
  });

  it("keeps every self matchup on a valid multiplier", () => {
    for (const type of GEN1_TYPES) {
      expect(validMultipliers).toContain(getEffectiveness(chart, type, type));
    }
  });

  it("keeps every matchup within the allowed multiplier set", () => {
    for (const attackType of GEN1_TYPES) {
      for (const defenderType of GEN1_TYPES) {
        expect(validMultipliers).toContain(getEffectiveness(chart, attackType, defenderType));
      }
    }
  });
});
