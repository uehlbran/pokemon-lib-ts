import { CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_SPECIES_IDS,
  GEN5_TYPES,
} from "../src";

const dataManager = createGen5DataManager();
const abilityIds = GEN5_ABILITY_IDS;
const itemIds = GEN5_ITEM_IDS;
const moveIds = GEN5_MOVE_IDS;
const speciesIds = GEN5_SPECIES_IDS;

describe("Gen 5 DataManager -- data loading", () => {
  it("given gen5 data files, when loading DataManager, then loads exactly 649 Pokemon", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Generation_V
    // Gen 5 National Dex ends at #649 Genesect (494 from prior gens + 156 new)
    expect(dataManager.getAllSpecies().length).toBe(649);
  });

  it("given gen5 data files, when loading DataManager, then loads 575 moves", () => {
    // Source: @pkmn/data gen5 move count (575 moves through Gen 5)
    expect(dataManager.getAllMoves().length).toBe(575);
  });

  it("given gen5 data files, when loading DataManager, then loads 164 abilities", () => {
    // Source: @pkmn/data gen5 ability count (164 abilities through Gen 5)
    expect(dataManager.getAllAbilities().length).toBe(164);
  });

  it("given gen5 data files, when loading DataManager, then loads 25 natures", () => {
    // Source: 25 natures introduced in Gen 3, unchanged through all generations
    expect(dataManager.getAllNatures().length).toBe(25);
  });

  it("given gen5 data files, when loading DataManager, then loads 239 items", () => {
    // Source: @pkmn/data gen5 item count
    expect(dataManager.getAllItems().length).toBe(239);
  });

  it("given gen5 type chart, when checking type count, then has exactly 17 types (no Fairy)", () => {
    // Source: Fairy type introduced in Gen 6; Gen 5 has 17 types
    expect(GEN5_TYPES).toHaveLength(17);
  });

  it("given gen5 type chart, when checking for Fairy, then Fairy does not exist", () => {
    // Source: Fairy type was not introduced until Gen 6
    const chart = dataManager.getTypeChart();
    expect(chart).not.toHaveProperty(CORE_TYPE_IDS.fairy);
  });

  it("given gen5 type chart, when checking Dark attacking Steel, then Steel resists Dark (0.5x)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts
    // Steel damageTaken Dark: 2 (encoding for resist)
    // In Gen 5, Steel resists Dark (removed in Gen 6)
    const chart = dataManager.getTypeChart();
    expect(chart.dark?.steel).toBe(0.5);
  });

  it("given gen5 type chart, when checking Ghost attacking Steel, then Steel resists Ghost (0.5x)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/typechart.ts
    // Steel damageTaken Ghost: 2 (encoding for resist)
    // In Gen 5, Steel resists Ghost (removed in Gen 6)
    const chart = dataManager.getTypeChart();
    expect(chart.ghost?.steel).toBe(0.5);
  });

  it("given gen5 type chart, when checking Fire attacking Steel, then Fire is super effective (2x)", () => {
    // Source: Bulbapedia -- Fire is super effective against Steel in all gens
    const chart = dataManager.getTypeChart();
    expect(chart.fire?.steel).toBe(2);
  });

  it("given gen5 type chart, when checking Normal attacking Ghost, then Normal is immune (0x)", () => {
    // Source: Bulbapedia -- Normal-type moves do not affect Ghost-type Pokemon
    const chart = dataManager.getTypeChart();
    expect(chart.normal?.ghost).toBe(0);
  });

  it("given gen5 moves.json, when checking Thunderbolt power, then is 95", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- thunderbolt basePower: 95
    // (Thunderbolt was nerfed from 95 to 90 in Gen 6)
    const move = dataManager.getMove(moveIds.thunderbolt);
    expect(move.power).toBe(95);
  });

  it("given gen5 moves.json, when checking Knock Off power, then is 20", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- knockoff basePower: 20
    // (Knock Off was buffed from 20 to 65 in Gen 6)
    const move = dataManager.getMove(moveIds.knockOff);
    expect(move.power).toBe(20);
  });

  it("given gen5 moves.json, when checking Thunder power, then is 120", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- thunder basePower: 120
    // (Thunder was nerfed from 120 to 110 in Gen 6)
    const move = dataManager.getMove(moveIds.thunder);
    expect(move.power).toBe(120);
  });

  it("given gen5 moves.json, when checking Ice Beam power, then is 95", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- icebeam basePower: 95
    // (Ice Beam was nerfed from 95 to 90 in Gen 6)
    const move = dataManager.getMove(moveIds.iceBeam);
    expect(move.power).toBe(95);
  });

  it("given gen5 data, when loading abilities.json, then contains Sheer Force", () => {
    // Source: Bulbapedia -- Sheer Force introduced in Gen 5
    const ability = dataManager.getAbility(abilityIds.sheerForce);
    expect(ability.id).toBe(abilityIds.sheerForce);
  });

  it("given gen5 data, when loading abilities.json, then contains Analytic", () => {
    // Source: Bulbapedia -- Analytic introduced in Gen 5
    const ability = dataManager.getAbility(abilityIds.analytic);
    expect(ability.id).toBe(abilityIds.analytic);
  });

  it("given gen5 data, when loading abilities.json, then contains Multiscale", () => {
    // Source: Bulbapedia -- Multiscale introduced in Gen 5
    const ability = dataManager.getAbility(abilityIds.multiscale);
    expect(ability.id).toBe(abilityIds.multiscale);
  });

  it("given gen5 data, when loading items.json, then contains Fire Gem", () => {
    // Source: Bulbapedia -- Type Gems introduced in Gen 5
    const item = dataManager.getItem(itemIds.fireGem);
    expect(item.id).toBe(itemIds.fireGem);
  });

  it("given gen5 data, when loading items.json, then contains Water Gem", () => {
    // Source: Bulbapedia -- Type Gems introduced in Gen 5
    const item = dataManager.getItem(itemIds.waterGem);
    expect(item.id).toBe(itemIds.waterGem);
  });

  it("given gen5 data, when loading items.json, then contains Eviolite", () => {
    // Source: Bulbapedia -- Eviolite introduced in Gen 5
    const item = dataManager.getItem(itemIds.eviolite);
    expect(item.id).toBe(itemIds.eviolite);
  });

  it("given gen5 data, when loading items.json, then contains Rocky Helmet", () => {
    // Source: Bulbapedia -- Rocky Helmet introduced in Gen 5
    const item = dataManager.getItem(itemIds.rockyHelmet);
    expect(item.id).toBe(itemIds.rockyHelmet);
  });

  it("given gen5 data, when looking up Volcarona, then base SpAtk is 135", () => {
    // Source: Bulbapedia -- Volcarona (#637) base SpAtk = 135
    const volcarona = dataManager.getSpecies(speciesIds.volcarona);
    expect(volcarona.baseStats.spAttack).toBe(135);
  });

  it("given gen5 data, when looking up Excadrill, then has Ground/Steel types", () => {
    // Source: Bulbapedia -- Excadrill (#530) is Ground/Steel
    const excadrill = dataManager.getSpecies(speciesIds.excadrill);
    expect(excadrill.types).toEqual([CORE_TYPE_IDS.ground, CORE_TYPE_IDS.steel]);
  });
});
