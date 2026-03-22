import { describe, expect, it } from "vitest";
import { createGen9DataManager } from "../src/data/index.js";

describe("Gen 9 DataManager -- data loading", () => {
  // ---------------------------------------------------------------------------
  // Pokemon
  // ---------------------------------------------------------------------------

  it("given gen9 data files, when loading DataManager, then loads exactly 733 Pokemon", () => {
    // Source: @pkmn/data Gen 9 iteration yields 733 base-form species
    // (includes all species available in Scarlet/Violet + DLC)
    const dm = createGen9DataManager();
    expect(dm.getAllSpecies().length).toBe(733);
  });

  it("given gen9 data files, when loading DataManager, then loads 685 moves", () => {
    // Source: @pkmn/data gen9 move count (685 moves available in Gen 9)
    const dm = createGen9DataManager();
    expect(dm.getAllMoves().length).toBe(685);
  });

  it("given gen9 data files, when loading DataManager, then loads 310 abilities", () => {
    // Source: @pkmn/data gen9 ability count (310 abilities through Gen 9)
    // Gen 9 added new abilities (Protosynthesis, Quark Drive, etc.)
    const dm = createGen9DataManager();
    expect(dm.getAllAbilities().length).toBe(310);
  });

  it("given gen9 data files, when loading DataManager, then loads 25 natures", () => {
    // Source: 25 natures introduced in Gen 3, unchanged through all generations
    const dm = createGen9DataManager();
    expect(dm.getAllNatures().length).toBe(25);
  });

  it("given gen9 data files, when loading DataManager, then loads 249 items", () => {
    // Source: @pkmn/data gen9 item count (249 items)
    const dm = createGen9DataManager();
    expect(dm.getAllItems().length).toBe(249);
  });

  // ---------------------------------------------------------------------------
  // Type chart
  // ---------------------------------------------------------------------------

  it("given gen9 type chart, when checking type count, then has exactly 18 types", () => {
    // Source: Gen 9 has 18 types (same as Gen 6-8, no new types added)
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_IX
    const dm = createGen9DataManager();
    const chart = dm.getTypeChart();
    expect(Object.keys(chart).length).toBe(18);
  });

  it("given gen9 type chart, when checking for Fairy, then Fairy exists", () => {
    // Source: Fairy type introduced in Gen 6, present in Gen 9
    const dm = createGen9DataManager();
    const chart = dm.getTypeChart();
    expect(chart).toHaveProperty("fairy");
  });

  it("given gen9 type chart, when checking Fairy attacking Dragon, then Dragon is weak to Fairy (2x)", () => {
    // Source: Bulbapedia -- Fairy is super effective against Dragon
    // Source: Showdown data/typechart.ts
    const dm = createGen9DataManager();
    const chart = dm.getTypeChart();
    expect(chart.fairy?.dragon).toBe(2);
  });

  it("given gen9 type chart, when checking Dragon attacking Fairy, then Fairy is immune to Dragon (0x)", () => {
    // Source: Bulbapedia -- Fairy is immune to Dragon-type moves
    // Source: Showdown data/typechart.ts
    const dm = createGen9DataManager();
    const chart = dm.getTypeChart();
    expect(chart.dragon?.fairy).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Gen 9 Pokemon species
  // ---------------------------------------------------------------------------

  it("given gen9 data, when looking up Pikachu, then base stats match Bulbapedia", () => {
    // Source: Bulbapedia -- Pikachu (#25) base stats (unchanged since Gen 6):
    // HP=35, Atk=55, Def=40, SpA=50, SpD=50, Spe=90
    const dm = createGen9DataManager();
    const pikachu = dm.getSpeciesByName("pikachu");
    expect(pikachu.baseStats.hp).toBe(35);
    expect(pikachu.baseStats.attack).toBe(55);
    expect(pikachu.baseStats.defense).toBe(40);
    expect(pikachu.baseStats.spAttack).toBe(50);
    expect(pikachu.baseStats.spDefense).toBe(50);
    expect(pikachu.baseStats.speed).toBe(90);
  });

  it("given gen9 data, when looking up Sprigatito, then types are Grass", () => {
    // Source: Bulbapedia -- Sprigatito (#906) is a pure Grass-type
    // First starter of Gen 9 (Scarlet/Violet)
    const dm = createGen9DataManager();
    const sprigatito = dm.getSpeciesByName("sprigatito");
    expect(sprigatito.types).toEqual(["grass"]);
  });

  it("given gen9 data, when looking up Koraidon, then types are Fighting/Dragon", () => {
    // Source: Bulbapedia -- Koraidon (#1007) is Fighting/Dragon
    // Box legendary of Pokemon Scarlet
    const dm = createGen9DataManager();
    const koraidon = dm.getSpeciesByName("koraidon");
    expect(koraidon.types).toEqual(["fighting", "dragon"]);
  });

  it("given gen9 data, when looking up Koraidon, then base stats match Bulbapedia", () => {
    // Source: Bulbapedia -- Koraidon (#1007) base stats:
    // HP=100, Atk=135, Def=115, SpA=85, SpD=100, Spe=135
    const dm = createGen9DataManager();
    const koraidon = dm.getSpeciesByName("koraidon");
    expect(koraidon.baseStats.hp).toBe(100);
    expect(koraidon.baseStats.attack).toBe(135);
    expect(koraidon.baseStats.defense).toBe(115);
    expect(koraidon.baseStats.spAttack).toBe(85);
    expect(koraidon.baseStats.spDefense).toBe(100);
    expect(koraidon.baseStats.speed).toBe(135);
  });

  it("given gen9 data, when looking up Miraidon, then types are Electric/Dragon", () => {
    // Source: Bulbapedia -- Miraidon (#1008) is Electric/Dragon
    // Box legendary of Pokemon Violet
    const dm = createGen9DataManager();
    const miraidon = dm.getSpeciesByName("miraidon");
    expect(miraidon.types).toEqual(["electric", "dragon"]);
  });

  it("given gen9 data, when looking up Miraidon, then base stats match Bulbapedia", () => {
    // Source: Bulbapedia -- Miraidon (#1008) base stats:
    // HP=100, Atk=85, Def=100, SpA=135, SpD=115, Spe=135
    const dm = createGen9DataManager();
    const miraidon = dm.getSpeciesByName("miraidon");
    expect(miraidon.baseStats.hp).toBe(100);
    expect(miraidon.baseStats.attack).toBe(85);
    expect(miraidon.baseStats.defense).toBe(100);
    expect(miraidon.baseStats.spAttack).toBe(135);
    expect(miraidon.baseStats.spDefense).toBe(115);
    expect(miraidon.baseStats.speed).toBe(135);
  });

  // ---------------------------------------------------------------------------
  // Gen 9 moves
  // ---------------------------------------------------------------------------

  it("given gen9 moves, when looking up Tera Blast, then power is 80 and type is Normal", () => {
    // Source: Bulbapedia -- Tera Blast: Normal-type (changes to Tera type when
    // Terastallized), 80 power, special
    // Note: Base type is Normal; Tera typing is handled by the battle engine
    const dm = createGen9DataManager();
    const move = dm.getMove("tera-blast");
    expect(move.power).toBe(80);
    expect(move.type).toBe("normal");
  });

  it("given gen9 moves, when looking up Make It Rain, then power is 120 and type is Steel", () => {
    // Source: Bulbapedia -- Make It Rain: Steel-type, 120 power, special
    // Signature move of Gholdengo
    const dm = createGen9DataManager();
    const move = dm.getMove("make-it-rain");
    expect(move.power).toBe(120);
    expect(move.type).toBe("steel");
    expect(move.category).toBe("special");
  });

  // ---------------------------------------------------------------------------
  // Gen 9 abilities
  // ---------------------------------------------------------------------------

  it("given gen9 abilities, when looking up Protosynthesis, then it exists and is gen 9", () => {
    // Source: Bulbapedia -- Protosynthesis introduced in Gen 9
    // Boosts highest stat in harsh sunlight (Paradox Pokemon ability)
    const dm = createGen9DataManager();
    const ability = dm.getAbility("protosynthesis");
    expect(ability.id).toBe("protosynthesis");
    expect(ability.generation).toBe(9);
  });

  it("given gen9 abilities, when looking up Quark Drive, then it exists and is gen 9", () => {
    // Source: Bulbapedia -- Quark Drive introduced in Gen 9
    // Boosts highest stat on Electric Terrain (future Paradox Pokemon ability)
    const dm = createGen9DataManager();
    const ability = dm.getAbility("quark-drive");
    expect(ability.id).toBe("quark-drive");
    expect(ability.generation).toBe(9);
  });

  it("given gen9 abilities, when looking up Orichalcum Pulse, then it exists and is gen 9", () => {
    // Source: Bulbapedia -- Orichalcum Pulse introduced in Gen 9
    // Koraidon's signature ability: sets Sun and boosts Attack
    const dm = createGen9DataManager();
    const ability = dm.getAbility("orichalcum-pulse");
    expect(ability.id).toBe("orichalcum-pulse");
    expect(ability.generation).toBe(9);
  });

  it("given gen9 abilities, when looking up Hadron Engine, then it exists and is gen 9", () => {
    // Source: Bulbapedia -- Hadron Engine introduced in Gen 9
    // Miraidon's signature ability: sets Electric Terrain and boosts Sp.Atk
    const dm = createGen9DataManager();
    const ability = dm.getAbility("hadron-engine");
    expect(ability.id).toBe("hadron-engine");
    expect(ability.generation).toBe(9);
  });

  // ---------------------------------------------------------------------------
  // Gen 9 items
  // ---------------------------------------------------------------------------

  it("given gen9 items, when loading items, then Leftovers still exists", () => {
    // Source: Leftovers has existed since Gen 2, still present in Gen 9
    const dm = createGen9DataManager();
    const item = dm.getItem("leftovers");
    expect(item.id).toBe("leftovers");
  });

  it("given gen9 items, when loading items, then Choice Scarf exists", () => {
    // Source: Choice Scarf introduced in Gen 4, still present in Gen 9
    const dm = createGen9DataManager();
    const item = dm.getItem("choice-scarf");
    expect(item.id).toBe("choice-scarf");
  });

  // ---------------------------------------------------------------------------
  // Structural validation
  // ---------------------------------------------------------------------------

  it("given gen9 moves, when inspecting any move, then required fields are present", () => {
    // All moves must have id, type, category, pp, and priority
    const dm = createGen9DataManager();
    const moves = dm.getAllMoves();
    for (const move of moves) {
      expect(move.id.length).toBeGreaterThanOrEqual(1);
      expect(move.type.length).toBeGreaterThanOrEqual(1);
      expect(["physical", "special", "status"]).toContain(move.category);
      expect(move.pp).toBeGreaterThanOrEqual(1);
      expect(typeof move.priority).toBe("number");
    }
  });

  it("given gen9 pokemon, when inspecting any species, then required fields are present", () => {
    // All species must have id, types, and baseStats with all 6 stats
    // species.id is the numeric Pokedex number (e.g. 1 = Bulbasaur)
    const dm = createGen9DataManager();
    const allSpecies = dm.getAllSpecies();
    for (const species of allSpecies) {
      expect(species.id).toBeGreaterThanOrEqual(1);
      expect(species.types.length).toBeGreaterThanOrEqual(1);
      expect(species.types.length).toBeLessThanOrEqual(2);
      expect(species.baseStats.hp).toBeGreaterThanOrEqual(1);
      expect(species.baseStats.attack).toBeGreaterThanOrEqual(1);
      expect(species.baseStats.defense).toBeGreaterThanOrEqual(1);
      expect(species.baseStats.spAttack).toBeGreaterThanOrEqual(1);
      expect(species.baseStats.spDefense).toBeGreaterThanOrEqual(1);
      expect(species.baseStats.speed).toBeGreaterThanOrEqual(1);
    }
  });
});
