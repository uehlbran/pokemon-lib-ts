import { CORE_ITEM_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_SPECIES_IDS,
} from "../src";

describe("Gen 7 DataManager -- data loading", () => {
  // ---------------------------------------------------------------------------
  // Pokemon
  // ---------------------------------------------------------------------------

  it("given gen7 data files, when loading DataManager, then loads exactly 807 Pokemon", () => {
    // Source: National Dex #001-#807 (Bulbasaur through Zeraora).
    // Meltan (#808) and Melmetal (#809) are excluded because PokeAPI does not
    // have species data for them (they are cross-game Pokemon from Pokemon GO).
    // Source: @pkmn/data gen7 species iteration (807 base-form species)
    const dm = createGen7DataManager();
    expect(dm.getAllSpecies().length).toBe(807);
  });

  it("given gen7 data files, when loading DataManager, then loads 690 moves", () => {
    // Source: @pkmn/data gen7 move count (690 moves through Gen 7)
    const dm = createGen7DataManager();
    expect(dm.getAllMoves().length).toBe(690);
  });

  it("given gen7 data files, when loading DataManager, then loads 233 abilities", () => {
    // Source: @pkmn/data gen7 ability count (233 abilities through Gen 7)
    // Gen 7 added 42 new abilities (192-233) on top of Gen 6's 191.
    const dm = createGen7DataManager();
    expect(dm.getAllAbilities().length).toBe(233);
  });

  it("given gen7 data files, when loading DataManager, then loads 25 natures", () => {
    // Source: 25 natures introduced in Gen 3, unchanged through all generations
    const dm = createGen7DataManager();
    expect(dm.getAllNatures().length).toBe(25);
  });

  it("given gen7 data files, when loading DataManager, then loads 339 items", () => {
    // Source: @pkmn/data gen7 item count (339 items including Z-Crystals)
    const dm = createGen7DataManager();
    expect(dm.getAllItems().length).toBe(339);
  });

  // ---------------------------------------------------------------------------
  // Type chart
  // ---------------------------------------------------------------------------

  it("given gen7 type chart, when checking type count, then has exactly 18 types", () => {
    // Source: Gen 7 has 18 types (same as Gen 6, no new types added)
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_VII
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(18);
  });

  it("given gen7 type chart, when checking for Fairy, then Fairy exists", () => {
    // Source: Fairy type introduced in Gen 6, present in Gen 7
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(chart).toHaveProperty(CORE_TYPE_IDS.fairy);
  });

  it("given gen7 type chart, when checking Fairy attacking Dragon, then Dragon is weak to Fairy (2x)", () => {
    // Source: Bulbapedia -- Fairy is super effective against Dragon
    // Source: references/pokemon-showdown/data/typechart.ts
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(chart[CORE_TYPE_IDS.fairy]?.[CORE_TYPE_IDS.dragon]).toBe(2);
  });

  it("given gen7 type chart, when checking Dragon attacking Fairy, then Fairy is immune to Dragon (0x)", () => {
    // Source: Bulbapedia -- Fairy is immune to Dragon-type moves
    // Source: references/pokemon-showdown/data/typechart.ts
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(chart[CORE_TYPE_IDS.dragon]?.[CORE_TYPE_IDS.fairy]).toBe(0);
  });

  it("given gen7 type chart, when checking Dark attacking Steel, then Steel is neutral to Dark (1x)", () => {
    // Source: references/pokemon-showdown/data/typechart.ts
    // In Gen 6+, Steel no longer resists Dark (was 0.5x in Gen 2-5)
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(chart[CORE_TYPE_IDS.dark]?.[CORE_TYPE_IDS.steel]).toBe(1);
  });

  it("given gen7 type chart, when checking Ghost attacking Steel, then Steel is neutral to Ghost (1x)", () => {
    // Source: references/pokemon-showdown/data/typechart.ts
    // In Gen 6+, Steel no longer resists Ghost (was 0.5x in Gen 2-5)
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(chart[CORE_TYPE_IDS.ghost]?.[CORE_TYPE_IDS.steel]).toBe(1);
  });

  it("given gen7 type chart, when checking Normal attacking Ghost, then Ghost is immune (0x)", () => {
    // Source: Bulbapedia -- Normal-type moves do not affect Ghost-type Pokemon
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(chart[CORE_TYPE_IDS.normal]?.[CORE_TYPE_IDS.ghost]).toBe(0);
  });

  it("given gen7 type chart, when checking Steel attacking Fairy, then Fairy is weak to Steel (2x)", () => {
    // Source: Bulbapedia -- Steel is super effective against Fairy
    const dm = createGen7DataManager();
    const chart = dm.getTypeChart();
    expect(chart[CORE_TYPE_IDS.steel]?.[CORE_TYPE_IDS.fairy]).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Gen 7 Pokemon species
  // ---------------------------------------------------------------------------

  it("given gen7 data, when looking up Pikachu, then base stats match Bulbapedia", () => {
    // Source: Bulbapedia -- Pikachu (#25) base stats in Gen 7:
    // HP=35, Atk=55, Def=40, SpA=50, SpD=50, Spe=90
    // (Defense was buffed from 30 to 40 in Gen 6)
    const dm = createGen7DataManager();
    const pikachu = dm.getSpecies(GEN7_SPECIES_IDS.pikachu);
    expect(pikachu.baseStats.hp).toBe(35);
    expect(pikachu.baseStats.attack).toBe(55);
    expect(pikachu.baseStats.defense).toBe(40);
    expect(pikachu.baseStats.spAttack).toBe(50);
    expect(pikachu.baseStats.spDefense).toBe(50);
    expect(pikachu.baseStats.speed).toBe(90);
  });

  it("given gen7 data, when looking up Rowlet, then types are Grass/Flying", () => {
    // Source: Bulbapedia -- Rowlet (#722) is Grass/Flying
    // First starter of Gen 7 (Sun/Moon)
    const dm = createGen7DataManager();
    const rowlet = dm.getSpecies(GEN7_SPECIES_IDS.rowlet);
    expect(rowlet.types).toEqual([CORE_TYPE_IDS.grass, CORE_TYPE_IDS.flying]);
  });

  it("given gen7 data, when looking up Decidueye, then types are Grass/Ghost", () => {
    // Source: Bulbapedia -- Decidueye (#724) is Grass/Ghost
    const dm = createGen7DataManager();
    const decidueye = dm.getSpecies(GEN7_SPECIES_IDS.decidueye);
    expect(decidueye.types).toEqual([CORE_TYPE_IDS.grass, CORE_TYPE_IDS.ghost]);
  });

  it("given gen7 data, when looking up Mimikyu, then types are Ghost/Fairy", () => {
    // Source: Bulbapedia -- Mimikyu (#778) is Ghost/Fairy
    const dm = createGen7DataManager();
    const mimikyu = dm.getSpecies(GEN7_SPECIES_IDS.mimikyu);
    expect(mimikyu.types).toEqual([CORE_TYPE_IDS.ghost, CORE_TYPE_IDS.fairy]);
  });

  it("given gen7 data, when looking up Mimikyu, then base stats match Bulbapedia", () => {
    // Source: Bulbapedia -- Mimikyu (#778) base stats:
    // HP=55, Atk=90, Def=80, SpA=50, SpD=105, Spe=96
    const dm = createGen7DataManager();
    const mimikyu = dm.getSpecies(GEN7_SPECIES_IDS.mimikyu);
    expect(mimikyu.baseStats.hp).toBe(55);
    expect(mimikyu.baseStats.attack).toBe(90);
    expect(mimikyu.baseStats.defense).toBe(80);
    expect(mimikyu.baseStats.spAttack).toBe(50);
    expect(mimikyu.baseStats.spDefense).toBe(105);
    expect(mimikyu.baseStats.speed).toBe(96);
  });

  it("given gen7 data, when looking up Solgaleo, then types are Psychic/Steel", () => {
    // Source: Bulbapedia -- Solgaleo (#791) is Psychic/Steel
    const dm = createGen7DataManager();
    const solgaleo = dm.getSpecies(GEN7_SPECIES_IDS.solgaleo);
    expect(solgaleo.types).toEqual([CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.steel]);
  });

  it("given gen7 data, when looking up Lunala, then types are Psychic/Ghost", () => {
    // Source: Bulbapedia -- Lunala (#792) is Psychic/Ghost
    const dm = createGen7DataManager();
    const lunala = dm.getSpecies(GEN7_SPECIES_IDS.lunala);
    expect(lunala.types).toEqual([CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.ghost]);
  });

  it("given gen7 data, when looking up Marshadow, then types are Fighting/Ghost", () => {
    // Source: Bulbapedia -- Marshadow (#802) is Fighting/Ghost
    const dm = createGen7DataManager();
    const marshadow = dm.getSpecies(GEN7_SPECIES_IDS.marshadow);
    expect(marshadow.types).toEqual([CORE_TYPE_IDS.fighting, CORE_TYPE_IDS.ghost]);
  });

  it("given gen7 data, when looking up Zeraora, then type is Electric", () => {
    // Source: Bulbapedia -- Zeraora (#807) is a pure Electric-type
    // Last standard Pokemon in Gen 7 National Dex
    const dm = createGen7DataManager();
    const zeraora = dm.getSpecies(GEN7_SPECIES_IDS.zeraora);
    expect(zeraora.types).toEqual([CORE_TYPE_IDS.electric]);
  });

  // ---------------------------------------------------------------------------
  // Gen 7 moves
  // ---------------------------------------------------------------------------

  it("given gen7 moves, when looking up Spirit Shackle, then power is 80 and type is Ghost", () => {
    // Source: Bulbapedia -- Spirit Shackle: Ghost-type, 80 power, physical
    // Signature move of Decidueye
    const dm = createGen7DataManager();
    const move = dm.getMove(GEN7_MOVE_IDS.spiritShackle);
    expect(move.power).toBe(80);
    expect(move.type).toBe(CORE_TYPE_IDS.ghost);
    expect(move.category).toBe("physical");
  });

  it("given gen7 moves, when looking up First Impression, then power is 90 and priority is 2", () => {
    // Source: Bulbapedia -- First Impression: Bug-type, 90 power, physical, +2 priority
    // Only works on the first turn the user is in battle
    const dm = createGen7DataManager();
    const move = dm.getMove(GEN7_MOVE_IDS.firstImpression);
    expect(move.power).toBe(90);
    expect(move.type).toBe(CORE_TYPE_IDS.bug);
    expect(move.priority).toBe(2);
  });

  it("given gen7 moves, when looking up Aurora Veil, then type is Ice and category is status", () => {
    // Source: Bulbapedia -- Aurora Veil: Ice-type status move, new in Gen 7
    // Reduces damage from physical and special moves for 5 turns (only in hail)
    const dm = createGen7DataManager();
    const move = dm.getMove(GEN7_MOVE_IDS.auroraVeil);
    expect(move.type).toBe(CORE_TYPE_IDS.ice);
    expect(move.category).toBe("status");
  });

  it("given gen7 moves, when looking up Baneful Bunker, then type is Poison and category is status", () => {
    // Source: Bulbapedia -- Baneful Bunker: Poison-type status move, new in Gen 7
    // Protect variant that poisons attackers on contact
    const dm = createGen7DataManager();
    const move = dm.getMove(GEN7_MOVE_IDS.banefulBunker);
    expect(move.type).toBe(CORE_TYPE_IDS.poison);
    expect(move.category).toBe("status");
  });

  it("given gen7 moves, when looking up Psychic Fangs, then power is 85 and type is Psychic", () => {
    // Source: Bulbapedia -- Psychic Fangs: Psychic-type, 85 power, physical
    // Breaks Light Screen and Reflect on hit
    const dm = createGen7DataManager();
    const move = dm.getMove(GEN7_MOVE_IDS.psychicFangs);
    expect(move.power).toBe(85);
    expect(move.type).toBe(CORE_TYPE_IDS.psychic);
    expect(move.category).toBe("physical");
  });

  it("given gen7 moves, when looking up Spectral Thief, then power is 90 and type is Ghost", () => {
    // Source: Bulbapedia -- Spectral Thief: Ghost-type, 90 power, physical
    // Signature move of Marshadow -- steals target's stat boosts before dealing damage
    const dm = createGen7DataManager();
    const move = dm.getMove(GEN7_MOVE_IDS.spectralThief);
    expect(move.power).toBe(90);
    expect(move.type).toBe(CORE_TYPE_IDS.ghost);
  });

  // ---------------------------------------------------------------------------
  // Gen 7 abilities
  // ---------------------------------------------------------------------------

  it("given gen7 abilities, when looking up Disguise, then it exists and is gen 7", () => {
    // Source: Bulbapedia -- Disguise introduced in Gen 7 (Mimikyu's signature ability)
    const dm = createGen7DataManager();
    const ability = dm.getAbility(GEN7_ABILITY_IDS.disguise);
    expect(ability.id).toBe(GEN7_ABILITY_IDS.disguise);
    expect(ability.generation).toBe(7);
  });

  it("given gen7 abilities, when looking up Beast Boost, then it exists and is gen 7", () => {
    // Source: Bulbapedia -- Beast Boost introduced in Gen 7 (Ultra Beasts' signature ability)
    const dm = createGen7DataManager();
    const ability = dm.getAbility(GEN7_ABILITY_IDS.beastBoost);
    expect(ability.id).toBe(GEN7_ABILITY_IDS.beastBoost);
    expect(ability.generation).toBe(7);
  });

  it("given gen7 abilities, when looking up Electric Surge, then it exists and is gen 7", () => {
    // Source: Bulbapedia -- Electric Surge introduced in Gen 7 (sets Electric Terrain on switch-in)
    const dm = createGen7DataManager();
    const ability = dm.getAbility(GEN7_ABILITY_IDS.electricSurge);
    expect(ability.id).toBe(GEN7_ABILITY_IDS.electricSurge);
    expect(ability.generation).toBe(7);
  });

  it("given gen7 abilities, when looking up Schooling, then it exists and is gen 7", () => {
    // Source: Bulbapedia -- Schooling introduced in Gen 7 (Wishiwashi's signature ability)
    const dm = createGen7DataManager();
    const ability = dm.getAbility(GEN7_ABILITY_IDS.schooling);
    expect(ability.id).toBe(GEN7_ABILITY_IDS.schooling);
    expect(ability.generation).toBe(7);
  });

  it("given gen7 abilities, when looking up Soul-Heart, then it exists and is gen 7", () => {
    // Source: Bulbapedia -- Soul-Heart introduced in Gen 7 (Magearna's signature ability)
    const dm = createGen7DataManager();
    const ability = dm.getAbility(GEN7_ABILITY_IDS.soulHeart);
    expect(ability.id).toBe(GEN7_ABILITY_IDS.soulHeart);
    expect(ability.generation).toBe(7);
  });

  it("given gen7 abilities, when looking up Stamina, then it exists and is gen 7", () => {
    // Source: Bulbapedia -- Stamina introduced in Gen 7 (raises Defense when hit)
    const dm = createGen7DataManager();
    const ability = dm.getAbility(GEN7_ABILITY_IDS.stamina);
    expect(ability.id).toBe(GEN7_ABILITY_IDS.stamina);
    expect(ability.generation).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // Gen 7 items (Z-Crystals)
  // ---------------------------------------------------------------------------

  it("given gen7 items, when looking up Normalium Z, then it exists", () => {
    // Source: Bulbapedia -- Normalium Z: Z-Crystal for Normal-type moves, introduced in Gen 7
    const dm = createGen7DataManager();
    const item = dm.getItem(GEN7_ITEM_IDS.normaliumZ);
    expect(item.id).toBe(GEN7_ITEM_IDS.normaliumZ);
  });

  it("given gen7 items, when looking up Electrium Z, then it exists", () => {
    // Source: Bulbapedia -- Electrium Z: Z-Crystal for Electric-type moves, introduced in Gen 7
    const dm = createGen7DataManager();
    const item = dm.getItem(GEN7_ITEM_IDS.electriumZ);
    expect(item.id).toBe(GEN7_ITEM_IDS.electriumZ);
  });

  it("given gen7 items, when looking up Decidium Z, then it exists", () => {
    // Source: Bulbapedia -- Decidium Z: Decidueye's exclusive Z-Crystal, introduced in Gen 7
    const dm = createGen7DataManager();
    const item = dm.getItem(GEN7_ITEM_IDS.decidiumZ);
    expect(item.id).toBe(GEN7_ITEM_IDS.decidiumZ);
  });

  it("given gen7 items, when checking Z-Crystals count, then at least 18 type Z-Crystals exist", () => {
    // Source: Bulbapedia -- 18 type-specific Z-Crystals (one per type), introduced in Gen 7
    const dm = createGen7DataManager();
    const allItems = dm.getAllItems();
    const zCrystals = allItems.filter((i) => i.id.endsWith("-z"));
    // 18 type Z-Crystals + species-specific Z-Crystals
    expect(zCrystals.length).toBeGreaterThanOrEqual(18);
  });

  it("given gen7 items, when loading items, then Leftovers still exists", () => {
    // Source: Leftovers has existed since Gen 2, still present in Gen 7
    const dm = createGen7DataManager();
    const item = dm.getItem(CORE_ITEM_IDS.leftovers);
    expect(item.id).toBe(CORE_ITEM_IDS.leftovers);
  });

  it("given gen7 items, when loading items, then Choice Scarf exists", () => {
    // Source: Choice Scarf introduced in Gen 4, still present in Gen 7
    const dm = createGen7DataManager();
    const item = dm.getItem(GEN7_ITEM_IDS.choiceScarf);
    expect(item.id).toBe(GEN7_ITEM_IDS.choiceScarf);
  });

  // ---------------------------------------------------------------------------
  // Moves with required fields
  // ---------------------------------------------------------------------------

  it("given gen7 moves, when inspecting any move, then required fields are present", () => {
    // All moves must have id, type, category, pp, and priority
    const dm = createGen7DataManager();
    const moves = dm.getAllMoves();
    for (const move of moves) {
      expect(typeof move.id).toBe("string");
      expect(move.id.length).toBeGreaterThan(0);
      expect(typeof move.type).toBe("string");
      expect(move.type.length).toBeGreaterThan(0);
      expect(["physical", "special", "status"]).toContain(move.category);
      expect(move.pp).toBeGreaterThan(0);
      expect(typeof move.priority).toBe("number");
    }
  });

  it("given gen7 pokemon, when inspecting any species, then required fields are present", () => {
    // All species must have id, types, and baseStats with all 6 stats
    const dm = createGen7DataManager();
    const allSpecies = dm.getAllSpecies();
    for (const species of allSpecies) {
      expect(Number.isInteger(species.id)).toBe(true);
      expect(species.id).toBeGreaterThan(0);
      expect(species.types.length).toBeGreaterThanOrEqual(1);
      expect(species.types.length).toBeLessThanOrEqual(2);
      expect(species.baseStats.hp).toBeGreaterThan(0);
      expect(species.baseStats.attack).toBeGreaterThan(0);
      expect(species.baseStats.defense).toBeGreaterThan(0);
      expect(species.baseStats.spAttack).toBeGreaterThan(0);
      expect(species.baseStats.spDefense).toBeGreaterThan(0);
      expect(species.baseStats.speed).toBeGreaterThan(0);
    }
  });
});
