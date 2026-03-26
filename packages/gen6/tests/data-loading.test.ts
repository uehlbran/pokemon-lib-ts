import { CORE_MOVE_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";

const moveIds = { ...CORE_MOVE_IDS, ...GEN6_MOVE_IDS } as const;
const typeIds = CORE_TYPE_IDS;
const abilityIds = GEN6_ABILITY_IDS;
const itemIds = GEN6_ITEM_IDS;
const speciesIds = GEN6_SPECIES_IDS;

describe("Gen 6 DataManager -- data loading", () => {
  it("given gen6 data files, when loading DataManager, then loads exactly 721 Pokemon", () => {
    // Source: https://bulbapedia.bulbagarden.net/wiki/Generation_VI
    // Gen 6 National Dex ends at #721 Volcanion (649 from prior gens + 72 new)
    const dm = createGen6DataManager();
    expect(dm.getAllSpecies().length).toBe(721);
  });

  it("given gen6 data files, when loading DataManager, then loads 636 moves", () => {
    // Source: current committed Gen 6 moves dataset in this repo contains 636 moves
    const dm = createGen6DataManager();
    expect(dm.getAllMoves().length).toBe(636);
  });

  it("given gen6 data files, when loading DataManager, then loads 191 abilities", () => {
    // Source: @pkmn/data gen6 ability count (191 abilities through Gen 6)
    const dm = createGen6DataManager();
    expect(dm.getAllAbilities().length).toBe(191);
  });

  it("given gen6 data files, when loading DataManager, then loads 25 natures", () => {
    // Source: 25 natures introduced in Gen 3, unchanged through all generations
    const dm = createGen6DataManager();
    expect(dm.getAllNatures().length).toBe(25);
  });

  it("given gen6 data files, when loading DataManager, then loads 284 items", () => {
    // Source: @pkmn/data gen6 item count
    const dm = createGen6DataManager();
    expect(dm.getAllItems().length).toBe(284);
  });

  it("given gen6 type chart, when checking type count, then has exactly 18 types (includes Fairy)", () => {
    // Source: Fairy type introduced in Gen 6; Gen 6 has 18 types
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_VI
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(18);
  });

  it("given gen6 type chart, when checking for Fairy, then Fairy exists", () => {
    // Source: Fairy type introduced in Gen 6
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(chart).toHaveProperty(typeIds.fairy);
  });

  it("given gen6 type chart, when checking Dark attacking Steel, then Steel is neutral to Dark (1x)", () => {
    // Source: references/pokemon-showdown/data/typechart.ts
    // In Gen 6+, Steel no longer resists Dark (was 0.5x in Gen 5)
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(chart.dark?.steel).toBe(1);
  });

  it("given gen6 type chart, when checking Ghost attacking Steel, then Steel is neutral to Ghost (1x)", () => {
    // Source: references/pokemon-showdown/data/typechart.ts
    // In Gen 6+, Steel no longer resists Ghost (was 0.5x in Gen 5)
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(chart.ghost?.steel).toBe(1);
  });

  it("given gen6 type chart, when checking Fire attacking Steel, then Fire is super effective (2x)", () => {
    // Source: Bulbapedia -- Fire is super effective against Steel in all gens
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(chart.fire?.steel).toBe(2);
  });

  it("given gen6 type chart, when checking Normal attacking Ghost, then Normal is immune (0x)", () => {
    // Source: Bulbapedia -- Normal-type moves do not affect Ghost-type Pokemon
    const dm = createGen6DataManager();
    const chart = dm.getTypeChart();
    expect(chart.normal?.ghost).toBe(0);
  });

  it("given gen6 moves.json, when checking Thunderbolt power, then is 90", () => {
    // Source: references/pokemon-showdown/data/moves.ts -- thunderbolt basePower: 90
    // Thunderbolt was nerfed from 95 to 90 in Gen 6
    const dm = createGen6DataManager();
    const move = dm.getMove(moveIds.thunderbolt);
    expect(move.power).toBe(90);
  });

  it("given gen6 moves.json, when checking Knock Off power, then is 65", () => {
    // Source: references/pokemon-showdown/data/moves.ts -- knockoff basePower: 65
    // Knock Off was buffed from 20 to 65 in Gen 6
    const dm = createGen6DataManager();
    const move = dm.getMove(moveIds.knockOff);
    expect(move.power).toBe(65);
  });

  it("given gen6 moves.json, when checking Ice Beam power, then is 90", () => {
    // Source: references/pokemon-showdown/data/moves.ts -- icebeam basePower: 90
    // Ice Beam was nerfed from 95 to 90 in Gen 6
    const dm = createGen6DataManager();
    const move = dm.getMove(GEN6_MOVE_IDS.iceBeam);
    expect(move.power).toBe(90);
  });

  it("given gen6 moves.json, when checking Dazzling Gleam power, then is 80", () => {
    // Source: Bulbapedia -- Dazzling Gleam: Fairy-type, 80 power, introduced Gen 6
    const dm = createGen6DataManager();
    const move = dm.getMove(GEN6_MOVE_IDS.dazzlingGleam);
    expect(move.power).toBe(80);
  });

  it("given gen6 moves.json, when checking Moonblast power, then is 95", () => {
    // Source: Bulbapedia -- Moonblast: Fairy-type, 95 power, introduced Gen 6
    const dm = createGen6DataManager();
    const move = dm.getMove(GEN6_MOVE_IDS.moonblast);
    expect(move.power).toBe(95);
  });

  it("given gen6 moves.json, when checking Play Rough power, then is 90", () => {
    // Source: Bulbapedia -- Play Rough: Fairy-type physical, 90 power, introduced Gen 6
    const dm = createGen6DataManager();
    const move = dm.getMove(GEN6_MOVE_IDS.playRough);
    expect(move.power).toBe(90);
  });

  it("given gen6 data, when loading abilities.json, then contains Protean", () => {
    // Source: Bulbapedia -- Protean introduced in Gen 6
    const dm = createGen6DataManager();
    const ability = dm.getAbility(abilityIds.protean);
    expect(ability.id).toBe(abilityIds.protean);
  });

  it("given gen6 data, when loading abilities.json, then contains Gale Wings", () => {
    // Source: Bulbapedia -- Gale Wings introduced in Gen 6
    const dm = createGen6DataManager();
    const ability = dm.getAbility(abilityIds.galeWings);
    expect(ability.id).toBe(abilityIds.galeWings);
  });

  it("given gen6 data, when loading abilities.json, then contains Parental Bond", () => {
    // Source: Bulbapedia -- Parental Bond introduced in Gen 6 (Mega Kangaskhan)
    const dm = createGen6DataManager();
    const ability = dm.getAbility(abilityIds.parentalBond);
    expect(ability.id).toBe(abilityIds.parentalBond);
  });

  it("given gen6 data, when loading abilities.json, then contains Pixilate", () => {
    // Source: Bulbapedia -- Pixilate introduced in Gen 6
    const dm = createGen6DataManager();
    const ability = dm.getAbility(abilityIds.pixilate);
    expect(ability.id).toBe(abilityIds.pixilate);
  });

  it("given gen6 data, when looking up Greninja, then base SpAtk is 103", () => {
    // Source: Bulbapedia -- Greninja (#658) base SpAtk = 103
    const dm = createGen6DataManager();
    const greninja = dm.getSpecies(speciesIds.greninja);
    expect(greninja.baseStats.spAttack).toBe(103);
  });

  it("given gen6 data, when looking up Sylveon, then has Fairy type", () => {
    // Source: Bulbapedia -- Sylveon (#700) is a Fairy-type
    const dm = createGen6DataManager();
    const sylveon = dm.getSpecies(speciesIds.sylveon);
    expect(sylveon.types).toContain(typeIds.fairy);
  });

  it("given gen6 data, when looking up Xerneas, then has Fairy type", () => {
    // Source: Bulbapedia -- Xerneas (#716) is a pure Fairy-type
    const dm = createGen6DataManager();
    const xerneas = dm.getSpecies(speciesIds.xerneas);
    expect(xerneas.types).toEqual([typeIds.fairy]);
  });

  it("given gen6 data, when checking items, then contains Assault Vest", () => {
    // Source: Bulbapedia -- Assault Vest introduced in Gen 6
    const dm = createGen6DataManager();
    const item = dm.getItem(itemIds.assaultVest);
    expect(item.id).toBe(itemIds.assaultVest);
  });

  it("given gen6 data, when checking items, then contains Safety Goggles", () => {
    // Source: Bulbapedia -- Safety Goggles introduced in Gen 6
    const dm = createGen6DataManager();
    const item = dm.getItem(itemIds.safetyGoggles);
    expect(item.id).toBe(itemIds.safetyGoggles);
  });
});
