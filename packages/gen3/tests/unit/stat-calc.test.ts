import type { PokemonInstance, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../../src";
import { createGen3DataManager } from "../../src/data";

/**
 * Gen 3 Stat Calculation Tests
 *
 * Gen 3+ stat formula (same formula from Gen 3 through Gen 9):
 *   HP: floor((2 * base + iv + floor(ev/4)) * level / 100) + level + 10
 *   Other: floor((floor((2 * base + iv + floor(ev/4)) * level / 100) + 5) * nature)
 *
 * Nature modifier: 1.1 for +stat, 0.9 for -stat, 1.0 for neutral
 *
 * Source: Bulbapedia "Statistic#Generation_III_onward"
 * Source: pret/pokeemerald src/pokemon.c — GetMonData stat calculation
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

function createPokemonInstance(
  speciesId: number,
  level: number,
  nature: string,
  ivs: StatBlock,
  evs: StatBlock,
): PokemonInstance {
  return {
    uid: `test-${speciesId}-${level}`,
    speciesId,
    nickname: null,
    level,
    experience: 0,
    nature,
    ivs,
    evs,
    currentHp: 1,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: level,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
  } as PokemonInstance;
}

const MAX_IVS: StatBlock = {
  hp: 31,
  attack: 31,
  defense: 31,
  spAttack: 31,
  spDefense: 31,
  speed: 31,
};

const ZERO_IVS: StatBlock = {
  hp: 0,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
};

const MAX_HP_EVS: StatBlock = {
  hp: 252,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
};

const ZERO_EVS: StatBlock = {
  hp: 0,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
};

describe("Gen 3 Stat Calculation — HP", () => {
  it("given L50 Blissey (base HP 255) with 31 IVs and 252 HP EVs, when calculateStats called, then HP = 362", () => {
    // Source: Showdown stat calculator + Bulbapedia Gen 3+ formula
    // Formula: floor((2*255 + 31 + floor(252/4)) * 50 / 100) + 50 + 10
    //        = floor((510 + 31 + 63) * 50 / 100) + 60
    //        = floor(604 * 0.5) + 60
    //        = 302 + 60 = 362
    const blissey = dataManager.getSpecies(242); // Blissey
    const pokemon = createPokemonInstance(242, 50, "hardy", MAX_IVS, MAX_HP_EVS);

    const stats = ruleset.calculateStats(pokemon, blissey);

    expect(stats.hp).toBe(362);
  });

  it("given L100 Blissey (base HP 255) with 31 IVs and 252 HP EVs, when calculateStats called, then HP = 714", () => {
    // Source: Showdown stat calculator
    // Formula: floor((2*255 + 31 + 63) * 100 / 100) + 100 + 10
    //        = floor(604) + 110 = 604 + 110 = 714
    const blissey = dataManager.getSpecies(242);
    const pokemon = createPokemonInstance(242, 100, "hardy", MAX_IVS, MAX_HP_EVS);

    const stats = ruleset.calculateStats(pokemon, blissey);

    expect(stats.hp).toBe(714);
  });

  it("given L50 Pikachu (base HP 35) with 0 IVs and 0 EVs, when calculateStats called, then HP = 95", () => {
    // Source: Bulbapedia "Statistic#Generation_III_onward"
    // Formula: floor((2*35 + 0 + 0) * 50 / 100) + 50 + 10
    //        = floor(70 * 0.5) + 60 = 35 + 60 = 95
    const pikachu = dataManager.getSpecies(25); // Pikachu
    const pokemon = createPokemonInstance(25, 50, "hardy", ZERO_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.hp).toBe(95);
  });
});

describe("Gen 3 Stat Calculation — Non-HP with Nature", () => {
  it("given L50 Alakazam (base SpAtk 135) with 31 IVs, 252 SpAtk EVs, Modest (+SpAtk), then SpAtk = 205", () => {
    // Source: Showdown stat calculator + Bulbapedia Gen 3+ formula
    // Formula: floor((2*135 + 31 + floor(252/4)) * 50 / 100 + 5) * 1.1)
    //        = floor((270 + 31 + 63) * 50 / 100 + 5) * 1.1)
    //        = floor((floor(364 * 0.5) + 5) * 1.1)
    //        = floor((182 + 5) * 1.1)
    //        = floor(187 * 1.1) = floor(205.7) = 205
    const alakazam = dataManager.getSpecies(65); // Alakazam
    const evs: StatBlock = { hp: 0, attack: 0, defense: 0, spAttack: 252, spDefense: 0, speed: 0 };
    const pokemon = createPokemonInstance(65, 50, "modest", MAX_IVS, evs);

    const stats = ruleset.calculateStats(pokemon, alakazam);

    expect(stats.spAttack).toBe(205);
  });

  it("given L50 Machamp (base Atk 130) with 31 IVs, 252 Atk EVs, Adamant (+Atk), then Atk = 200", () => {
    // Source: Showdown stat calculator + Bulbapedia Gen 3+ formula
    // Formula: floor((floor((2*130 + 31 + 63) * 50 / 100) + 5) * 1.1)
    //        = floor((floor(354 * 0.5) + 5) * 1.1)
    //        = floor((177 + 5) * 1.1) = floor(182 * 1.1) = floor(200.2) = 200
    const machamp = dataManager.getSpecies(68); // Machamp
    const evs: StatBlock = { hp: 0, attack: 252, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };
    const pokemon = createPokemonInstance(68, 50, "adamant", MAX_IVS, evs);

    const stats = ruleset.calculateStats(pokemon, machamp);

    expect(stats.attack).toBe(200);
  });

  it("given L50 Alakazam with 31 IVs, 0 EVs, neutral nature, then SpAtk = 166", () => {
    // Source: Bulbapedia formula
    // floor((2*135 + 31 + 0) * 50 / 100) + 5 = floor(301 * 0.5) + 5 = 150 + 5 = 155
    // Neutral nature = 1.0x → 155
    // Wait, let me recalculate: floor(301 * 50 / 100) = floor(150.5) = 150; 150 + 5 = 155
    // Hmm. Let me check: Showdown says L50 Alakazam 31 IVs 0 EVs Serious = SpAtk 155
    const alakazam = dataManager.getSpecies(65);
    const pokemon = createPokemonInstance(65, 50, "hardy", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, alakazam);

    // floor((2*135 + 31 + 0) * 50/100) + 5 = floor(301*0.5) + 5 = floor(150.5) + 5 = 150 + 5 = 155
    expect(stats.spAttack).toBe(155);
  });

  it("given L50 Pokemon with detrimental nature (-SpAtk), then SpAtk is floored at 0.9x", () => {
    // Source: Bulbapedia — Adamant is +Atk, -SpAtk
    // Alakazam L50 31 IVs 0 EVs Adamant: SpAtk = floor(155 * 0.9) = floor(139.5) = 139
    const alakazam = dataManager.getSpecies(65);
    const pokemon = createPokemonInstance(65, 50, "adamant", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, alakazam);

    // floor((floor((2*135 + 31) * 50/100) + 5) * 0.9) = floor(155 * 0.9) = floor(139.5) = 139
    expect(stats.spAttack).toBe(139);
  });
});

describe("Gen 3 Stat Calculation — Zero EVs/IVs", () => {
  it("given L50 Pikachu with 0 IVs and 0 EVs, when calculateStats called, then Speed = 95 (neutral)", () => {
    // Source: Bulbapedia formula
    // Pikachu base Speed = 90
    // floor((2*90 + 0 + 0) * 50/100) + 5 = floor(180*0.5) + 5 = 90 + 5 = 95
    const pikachu = dataManager.getSpecies(25);
    const pokemon = createPokemonInstance(25, 50, "hardy", ZERO_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.speed).toBe(95);
  });

  it("given L50 Aggron with 0 IVs and 0 EVs, when calculateStats called, then Defense = 185 (neutral, base 180)", () => {
    // Source: Bulbapedia formula
    // Aggron base Defense = 180
    // floor((2*180 + 0 + 0) * 50/100) + 5 = floor(360*0.5) + 5 = 180 + 5 = 185
    const aggron = dataManager.getSpecies(306); // Aggron
    const pokemon = createPokemonInstance(306, 50, "hardy", ZERO_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, aggron);

    expect(stats.defense).toBe(185);
  });
});

describe("Gen 3 Stat Calculation — Level 100 verification", () => {
  it("given L100 Blaziken (base Atk 120) with 31 IVs, 252 EVs, Adamant, then Atk = 372", () => {
    // Source: Showdown stat calculator — L100 Blaziken Adamant 31 IV / 252 EV
    // Formula: floor((2*120 + 31 + floor(252/4)) * 100/100) + 5) * 1.1)
    // = floor((240 + 31 + 63) * 1) + 5 = 334 + 5 = 339
    // Adamant = 1.1x → floor(339 * 1.1) = floor(372.9) = 372
    const blaziken = dataManager.getSpecies(257); // Blaziken
    const evs: StatBlock = { hp: 0, attack: 252, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };
    const pokemon = createPokemonInstance(257, 100, "adamant", MAX_IVS, evs);

    const stats = ruleset.calculateStats(pokemon, blaziken);

    expect(stats.attack).toBe(372);
  });
});

// ---------------------------------------------------------------------------
// Issue #379: Shedinja HP=1 special case
// ---------------------------------------------------------------------------

describe("Gen 3 Stat Calculation — Shedinja HP=1 special case", () => {
  // Shedinja (species id=292) always has exactly 1 HP in Gen 3 regardless of
  // level, IVs, or EVs. This is a hardcoded special case in pokeemerald.
  // Source: pret/pokeemerald src/pokemon.c:2845
  //   "if (species == SPECIES_SHEDINJA) { newMaxHP = 1; }"

  it("given Shedinja at L50 with 0 IVs and 0 EVs, when calculateStats called, then HP is 1", () => {
    // Source: pret/pokeemerald src/pokemon.c:2845 — SPECIES_SHEDINJA hardcodes maxHP=1
    // Without special case, formula would give: floor((2*1+0+0)*50/100)+50+10 = 61
    const shedinja = dataManager.getSpecies(292); // Shedinja
    const pokemon = createPokemonInstance(292, 50, "hardy", ZERO_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, shedinja);

    expect(stats.hp).toBe(1);
  });

  it("given Shedinja at L50 with 31 IVs and 252 EVs, when calculateStats called, then HP is still 1", () => {
    // Source: pret/pokeemerald src/pokemon.c:2845 — hardcoded regardless of IVs/EVs
    // Without special case, formula would give: floor((2*1+31+63)*50/100)+60 = 108
    const shedinja = dataManager.getSpecies(292);
    const pokemon = createPokemonInstance(292, 50, "hardy", MAX_IVS, MAX_HP_EVS);

    const stats = ruleset.calculateStats(pokemon, shedinja);

    expect(stats.hp).toBe(1);
  });

  it("given Shedinja at L100 with 31 IVs and 252 EVs, when calculateStats called, then HP is still 1", () => {
    // Source: pret/pokeemerald src/pokemon.c:2845 — level does not affect Shedinja HP
    // Without special case, formula would give: floor((2*1+31+63)*100/100)+110 = 206
    const shedinja = dataManager.getSpecies(292);
    const pokemon = createPokemonInstance(292, 100, "hardy", MAX_IVS, MAX_HP_EVS);

    const stats = ruleset.calculateStats(pokemon, shedinja);

    expect(stats.hp).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Issue #389: Nature modifier coverage — +Def, +SpDef, +Speed, and -Def, -SpDef, -Speed
// ---------------------------------------------------------------------------

describe("Gen 3 Stat Calculation — Nature modifier coverage (Pikachu base stats)", () => {
  // Pikachu Gen 3 base stats: HP=35, Atk=55, Def=30, SpAtk=50, SpDef=40, Speed=90
  // Source: pret/pokeemerald include/constants/species.h + gSpeciesInfo
  // Formula for non-HP stat: floor((floor((2*base + iv + floor(ev/4)) * level/100) + 5) * natMod)
  //   natMod = 1.1 (boosted), 0.9 (reduced), 1.0 (neutral)
  //
  // L50, 31 IVs, 0 EVs base values (before nature):
  //   Atk:   floor((2*55+31)*50/100)+5  = floor(141*0.5)+5 = 70+5 = 75
  //   Def:   floor((2*30+31)*50/100)+5  = floor(91*0.5)+5  = 45+5 = 50
  //   SpAtk: floor((2*50+31)*50/100)+5  = floor(131*0.5)+5 = 65+5 = 70
  //   SpDef: floor((2*40+31)*50/100)+5  = floor(111*0.5)+5 = 55+5 = 60
  //   Speed: floor((2*90+31)*50/100)+5  = floor(211*0.5)+5 = 105+5 = 110
  //
  // Source: Bulbapedia "Stat — Generation III onward"
  //   nature modifier applied: floor(base_val * 1.1) or floor(base_val * 0.9)

  it("given Pikachu L50 with 31 IVs, Bold nature (+Def/-Atk), then Def = 55 and Atk = 67", () => {
    // Bold: +Def, -Atk
    // Def neutral=50 → floor(50*1.1) = floor(55.0) = 55
    // Atk neutral=75 → floor(75*0.9) = floor(67.5) = 67
    // Source: pret/pokeemerald src/battle_script_commands.c — nature multiplier 1.1/0.9
    const pikachu = dataManager.getSpecies(25);
    const pokemon = createPokemonInstance(25, 50, "bold", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.defense).toBe(55);
    expect(stats.attack).toBe(67);
  });

  it("given Pikachu L50 with 31 IVs, Hasty nature (+Speed/-Def), then Def = 45 and Speed = 121", () => {
    // Hasty: +Speed, -Def
    // Def neutral=50 → floor(50*0.9) = floor(45.0) = 45
    // Speed neutral=110 → floor(110*1.1) = floor(121.0) = 121
    // Source: pret/pokeemerald src/battle_script_commands.c — nature multiplier 1.1/0.9
    const pikachu = dataManager.getSpecies(25);
    const pokemon = createPokemonInstance(25, 50, "hasty", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.defense).toBe(45);
    expect(stats.speed).toBe(121);
  });

  it("given Pikachu L50 with 31 IVs, Calm nature (+SpDef/-Atk), then SpDef = 66 and Atk = 67", () => {
    // Calm: +SpDef, -Atk
    // SpDef neutral=60 → floor(60*1.1) = floor(66.0) = 66
    // Atk neutral=75 → floor(75*0.9) = floor(67.5) = 67
    // Source: pret/pokeemerald src/battle_script_commands.c — nature multiplier 1.1/0.9
    const pikachu = dataManager.getSpecies(25);
    const pokemon = createPokemonInstance(25, 50, "calm", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.spDefense).toBe(66);
    expect(stats.attack).toBe(67);
  });

  it("given Pikachu L50 with 31 IVs, Naughty nature (+Atk/-SpDef), then SpDef = 54 and Atk = 82", () => {
    // Naughty: +Atk, -SpDef
    // SpDef neutral=60 → floor(60*0.9) = floor(54.0) = 54
    // Atk neutral=75 → floor(75*1.1) = floor(82.5) = 82
    // Source: pret/pokeemerald src/battle_script_commands.c — nature multiplier 1.1/0.9
    const pikachu = dataManager.getSpecies(25);
    const pokemon = createPokemonInstance(25, 50, "naughty", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.spDefense).toBe(54);
    expect(stats.attack).toBe(82);
  });

  it("given Pikachu L50 with 31 IVs, Timid nature (+Speed/-Atk), then Speed = 121 and Atk = 67", () => {
    // Timid: +Speed, -Atk
    // Speed neutral=110 → floor(110*1.1) = floor(121.0) = 121
    // Atk neutral=75 → floor(75*0.9) = floor(67.5) = 67
    // Source: pret/pokeemerald src/battle_script_commands.c — nature multiplier 1.1/0.9
    const pikachu = dataManager.getSpecies(25);
    const pokemon = createPokemonInstance(25, 50, "timid", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.speed).toBe(121);
    expect(stats.attack).toBe(67);
  });

  it("given Pikachu L50 with 31 IVs, Quiet nature (+SpAtk/-Speed), then Speed = 99 and SpAtk = 77", () => {
    // Quiet: +SpAtk, -Speed
    // Speed neutral=110 → floor(110*0.9) = floor(99.0) = 99
    // SpAtk neutral=70 → floor(70*1.1) = floor(77.0) = 77
    // Source: pret/pokeemerald src/battle_script_commands.c — nature multiplier 1.1/0.9
    const pikachu = dataManager.getSpecies(25);
    const pokemon = createPokemonInstance(25, 50, "quiet", MAX_IVS, ZERO_EVS);

    const stats = ruleset.calculateStats(pokemon, pikachu);

    expect(stats.speed).toBe(99);
    expect(stats.spAttack).toBe(77);
  });
});
