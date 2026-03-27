import type { RawDataObjects } from "@pokemon-lib-ts/core";
import { ALL_NATURES, DataManager, normalizeExperienceGroup } from "@pokemon-lib-ts/core";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_SPECIES_IDS,
  GEN8_TYPE_CHART,
} from "@pokemon-lib-ts/gen8/data";
import { describe, expect, it } from "vitest";

const gen8DataManager = createGen8DataManager();

const bulbasaur = gen8DataManager.getSpecies(GEN8_SPECIES_IDS.bulbasaur);
const charmander = gen8DataManager.getSpecies(GEN8_SPECIES_IDS.charmander);
const tackle = gen8DataManager.getMove(GEN8_MOVE_IDS.tackle);
const flamethrower = gen8DataManager.getMove(GEN8_MOVE_IDS.flamethrower);
const overgrow = gen8DataManager.getAbility(GEN8_ABILITY_IDS.overgrow);
const loadedItem = gen8DataManager.getItem(GEN8_ITEM_IDS.eviolite);
const adamant = ALL_NATURES.find((nature) => nature.id === "adamant");

if (!adamant) {
  throw new Error("Expected the canonical Adamant nature fixture to exist");
}

function createFullData(): RawDataObjects {
  return {
    pokemon: [bulbasaur, charmander],
    moves: [tackle, flamethrower],
    abilities: [overgrow],
    items: [loadedItem],
    natures: [adamant],
    typeChart: GEN8_TYPE_CHART,
  };
}

function createMinimalReloadData(): RawDataObjects {
  return {
    pokemon: [bulbasaur],
    moves: [tackle],
    typeChart: {
      ...GEN8_TYPE_CHART,
      fire: {
        ...GEN8_TYPE_CHART.fire,
        grass: 0.5,
      },
    },
  };
}

describe("foundation hardening invariants - core", () => {
  it("replaces loaded registries and type chart snapshots instead of retaining stale data", () => {
    const dataManager = new DataManager();

    dataManager.loadFromObjects(createFullData());
    dataManager.loadFromObjects(createMinimalReloadData());

    expect(dataManager.getAllSpecies().map((species) => species.name)).toEqual([bulbasaur.name]);
    expect(dataManager.getAllMoves().map((move) => move.id)).toEqual([tackle.id]);
    expect(dataManager.getAllAbilities()).toHaveLength(0);
    expect(dataManager.getAllItems()).toHaveLength(0);
    expect(dataManager.getAllNatures()).toHaveLength(0);
    expect(dataManager.getTypeChart().fire.grass).toBe(0.5);
    expect(() => dataManager.getSpecies(charmander.id)).toThrow();
    expect(() => dataManager.getMove(flamethrower.id)).toThrow();
  });

  it("normalizes importer/runtime growth identifiers and rejects unknown values explicitly", () => {
    expect(normalizeExperienceGroup("medium")).toBe("medium-fast");
    expect(normalizeExperienceGroup("slow-then-very-fast")).toBe("erratic");
    expect(normalizeExperienceGroup("fast-then-very-slow")).toBe("fluctuating");
    expect(() => normalizeExperienceGroup("sideways-growth")).toThrow(
      'Unsupported experience growth group "sideways-growth"',
    );
  });
});
